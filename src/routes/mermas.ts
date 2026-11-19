import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { UUID } from '../utils/materiaPrima';
import { ETAPAS, costoMerma, validarMerma } from '../utils/mermas';
import { puedeVerCostos } from '../utils/permisos';
import { autorizarRoles } from '../middleware/autenticacion';

const LIMITE_LISTA = 50;
const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

export function crearRouterMermas(prisma: PrismaClient) {
  const router = Router();

  // Causas disponibles para registrar una merma («Otra» siempre al final)
  router.get('/causas', async (req, res) => {
    try {
      const filas = await prisma.causa_desperdicio.findMany({
        where: { panaderia_id: req.panaderiaId!, activo: true },
        orderBy: { nombre: 'asc' },
      });
      const causas = filas.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, descripcion: c.descripcion ?? null }));
      res.json([...causas.filter((c) => c.codigo !== 'otra'), ...causas.filter((c) => c.codigo === 'otra')]);
    } catch (error) {
      console.error('Error al listar las causas de merma:', error);
      res.status(500).json({ error: 'Error al consultar las causas' });
    }
  });

  // Historial de mermas, de la más reciente a la más antigua. El costo solo lo ve gestión.
  router.get('/', async (req, res) => {
    const etapa = typeof req.query.etapa === 'string' ? req.query.etapa : undefined;
    const produccionId = typeof req.query.produccion_id === 'string' ? req.query.produccion_id : undefined;
    if (etapa !== undefined && !(ETAPAS as readonly string[]).includes(etapa)) return res.status(400).json({ error: 'La etapa no es válida.' });
    if (produccionId !== undefined && !UUID.test(produccionId)) return res.status(400).json({ error: 'La producción no es válida.' });
    const conCostos = puedeVerCostos(req.usuario?.rol);
    const panaderiaId = req.panaderiaId!;
    try {
      const filas = await prisma.desperdicio.findMany({
        where: {
          panaderia_id: panaderiaId,
          ...(etapa ? { etapa: etapa as (typeof ETAPAS)[number] } : {}),
          ...(produccionId ? { produccion_id: produccionId } : {}),
        },
        orderBy: { fecha: 'desc' },
        take: LIMITE_LISTA,
        include: {
          causa_desperdicio: { select: { codigo: true, nombre: true } },
          lote: { select: { codigo_lote: true, materia_prima_id: true } },
          produccion: { select: { producto: { select: { nombre: true } } } },
          usuario_panaderia: { select: { usuario: { select: { nombre: true } } } },
        },
      });
      const materiaIds = [...new Set(filas.flatMap((f) => (f.lote?.materia_prima_id ? [f.lote.materia_prima_id] : [])))];
      const materias = await prisma.materia_prima.findMany({
        where: { id: { in: materiaIds }, panaderia_id: panaderiaId },
        include: { unidad_medida: true },
      });
      const porId = new Map(materias.map((m) => [m.id, m]));
      res.json(
        filas.map((f) => {
          const m = f.lote?.materia_prima_id ? porId.get(f.lote.materia_prima_id) : undefined;
          return {
            id: f.id,
            fecha: f.fecha.toISOString(),
            causa: f.causa_desperdicio.nombre,
            causa_codigo: f.causa_desperdicio.codigo,
            etapa: f.etapa,
            cantidad: Number(f.cantidad),
            unidad: m?.unidad_medida.codigo ?? 'g',
            insumo: m?.nombre ?? null,
            codigo_lote: f.lote?.codigo_lote ?? null,
            produccion_id: f.produccion_id ?? null,
            producto: f.produccion?.producto.nombre ?? null,
            usuario: f.usuario_panaderia.usuario.nombre,
            ...(conCostos ? { costo_estimado: num(f.costo_estimado) } : {}),
          };
        }),
      );
    } catch (error) {
      console.error('Error al listar las mermas:', error);
      res.status(500).json({ error: 'Error al consultar las mermas' });
    }
  });

  // Registrar una merma. Si es de un lote, se descuenta del lote (movimiento «salida_merma»); si es solo de
  // una producción (masa quemada, masa pasada), se registra sin tocar lotes porque los insumos ya se descontaron.
  router.post('/', async (req, res) => {
    const validado = validarMerma(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const { causa_id, etapa, cantidad, lote_id, produccion_id } = validado.datos;
    if (lote_id === null && etapa !== 'produccion') {
      return res.status(400).json({ error: 'Una merma de producción se registra en la etapa «Producción».' });
    }
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    const conCostos = puedeVerCostos(req.usuario?.rol);

    try {
      const asignado = await prisma.usuario_panaderia.findFirst({
        where: { usuario_id: usuarioId, panaderia_id: panaderiaId, activo: true },
      });
      if (!asignado) return res.status(403).json({ error: 'Tu usuario no está asignado a esta panadería.' });

      const salida = await prisma.$transaction(async (tx) => {
        if (lote_id) await tx.$queryRaw`SELECT id FROM lote WHERE id = ${lote_id}::uuid AND panaderia_id = ${panaderiaId}::uuid FOR UPDATE`;

        const causa = await tx.causa_desperdicio.findFirst({ where: { id: causa_id, panaderia_id: panaderiaId, activo: true } });
        if (!causa) return { ok: false, estado: 400, error: 'La causa no existe o está desactivada.' } as const;

        const lote = lote_id ? await tx.lote.findFirst({ where: { id: lote_id, panaderia_id: panaderiaId } }) : null;
        if (lote_id && !lote) return { ok: false, estado: 404, error: 'Lote no encontrado.' } as const;
        if (lote && !lote.materia_prima_id) return { ok: false, estado: 409, error: 'Solo se registran mermas de lotes de insumos.' } as const;

        if (produccion_id) {
          const p = await tx.produccion.findFirst({ where: { id: produccion_id, panaderia_id: panaderiaId } });
          if (!p) return { ok: false, estado: 404, error: 'Producción no encontrada.' } as const;
          if (p.estado !== 'en_curso' && p.estado !== 'finalizada') {
            return { ok: false, estado: 409, error: 'No se registran mermas en una producción que no está en curso ni finalizada.' } as const;
          }
          if (lote_id) {
            const uso = await tx.consumo_produccion.findFirst({ where: { produccion_id, lote_id, panaderia_id: panaderiaId } });
            if (!uso) return { ok: false, estado: 409, error: 'Ese lote no se usó en esa producción.' } as const;
          }
        }

        if (lote && cantidad > Number(lote.cantidad_disponible)) {
          return { ok: false, estado: 409, error: `La cantidad supera lo que hay en el lote (disponible: ${Number(lote.cantidad_disponible)}).` } as const;
        }

        const costo = lote ? costoMerma(Number(lote.costo_unitario), cantidad) : null;
        const d = await tx.desperdicio.create({
          data: { panaderia_id: panaderiaId, lote_id, produccion_id, causa_id, usuario_id: usuarioId, cantidad, etapa, costo_estimado: costo },
        });
        if (lote) {
          const tipo = await tx.tipo_movimiento_inventario.findUnique({ where: { codigo: 'salida_merma' } });
          if (!tipo) throw new Error("Falta el tipo de movimiento 'salida_merma' en el catálogo");
          await tx.movimiento_inventario.create({
            data: { panaderia_id: panaderiaId, lote_id: lote.id, tipo_movimiento_id: tipo.id, cantidad, desperdicio_id: d.id, usuario_id: usuarioId },
          });
        }
        return { ok: true, id: d.id, costo } as const;
      });

      if (!salida.ok) return res.status(salida.estado).json({ error: salida.error });
      res.status(201).json({ id: salida.id, causa_id, etapa, cantidad, lote_id, produccion_id, ...(conCostos ? { costo_estimado: salida.costo } : {}) });
    } catch (error) {
      // La base impide dejar un lote en negativo: si alguien más gastó el insumo a la vez, se pide reintentar
      if (error instanceof Error && error.message.includes('negativa')) {
        return res.status(409).json({ error: 'Las existencias cambiaron mientras se registraba. Vuelve a intentarlo.' });
      }
      console.error('Error al registrar la merma:', error);
      res.status(500).json({ error: 'Error al registrar la merma' });
    }
  });

  // Elimina una merma registrada por error o de prueba: si descontó de un lote, se lo devuelve. Solo gestión.
  router.delete('/:id', autorizarRoles('administrador', 'superadministrador'), async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(404).json({ error: 'Merma no encontrada.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const salida = await prisma.$transaction(async (tx) => {
        const d = await tx.desperdicio.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!d) return { ok: false, estado: 404, error: 'Merma no encontrada.' } as const;
        const movs = await tx.movimiento_inventario.findMany({ where: { desperdicio_id: id, panaderia_id: panaderiaId }, select: { id: true, lote_id: true, cantidad: true } });
        if (movs.length > 0) {
          const enConteo = await tx.detalle_conteo.count({ where: { movimiento_id: { in: movs.map((m) => m.id) } } });
          if (enConteo > 0) return { ok: false, estado: 409, error: 'Un conteo físico usa el movimiento de esta merma; no se puede eliminar.' } as const;
          for (const m of movs) await tx.lote.update({ where: { id: m.lote_id }, data: { cantidad_disponible: { increment: Number(m.cantidad) } } });
          await tx.movimiento_inventario.deleteMany({ where: { id: { in: movs.map((m) => m.id) } } });
        }
        await tx.desperdicio.delete({ where: { id } });
        return { ok: true, repuesto: movs.length > 0 } as const;
      });
      if (!salida.ok) return res.status(salida.estado).json({ error: salida.error });
      res.json({ id, eliminada: true, repuesto: salida.repuesto });
    } catch (error) {
      console.error('Error al eliminar la merma:', error);
      res.status(500).json({ error: 'Error al eliminar la merma' });
    }
  });

  return router;
}
