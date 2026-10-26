import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { autorizarRoles } from '../middleware/autenticacion';
import { ETIQUETA_MOTIVO, diferencia, revisarMotivo, validarCorreccion } from '../utils/conteo';
import { puedeVerCostos } from '../utils/permisos';
import { UUID, type CriterioRotacion } from '../utils/materiaPrima';
import { mejorOferta } from '../utils/precios';
import {
  cantidadBase,
  codigoGenerado,
  costoUnitario,
  hoyColombia,
  validarEntrada,
  validarNuevoVencimiento,
  verificarVencimiento,
} from '../utils/entradas';
import { alertasDeLotes, ordenarLotes, resumirStock, validarDiasAlerta, type LoteVista } from '../utils/inventario';

const fechaTexto = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Fila de lote de la base → forma que usan las utilidades puras
const aVista = (l: any): LoteVista => ({
  id: l.id,
  codigo_lote: l.codigo_lote ?? null,
  cantidad_inicial: Number(l.cantidad_inicial),
  cantidad_disponible: Number(l.cantidad_disponible),
  costo_unitario: Number(l.costo_unitario),
  fecha_vencimiento: fechaTexto(l.fecha_vencimiento),
  created_at: l.created_at.toISOString(),
});

export function crearRouterInventario(prisma: PrismaClient) {
  const router = Router();

  // Lo que necesita el formulario de entrada: insumos con sus presentaciones y proveedores (sin precios,
  // para que el operario también pueda registrar entradas)
  router.get('/opciones-entrada', async (req, res) => {
    const panaderiaId = req.panaderiaId!;
    try {
      const materias = await prisma.materia_prima.findMany({
        where: { panaderia_id: panaderiaId, activa: true, controla_inventario: true },
        include: {
          unidad_medida: true,
          presentacion: {
            where: { activa: true },
            include: {
              presentacion_proveedor: {
                where: { vigente: true, proveedor: { activo: true } },
                include: { proveedor: { select: { id: true, nombre: true, activo: true } } },
              },
            },
          },
        },
        orderBy: { nombre: 'asc' },
      });
      res.json({
        fecha: hoyColombia(),
        materias: materias.map((m) => ({
          id: m.id,
          codigo: m.codigo,
          nombre: m.nombre,
          unidad: m.unidad_medida.codigo,
          criterio_rotacion: m.criterio_rotacion,
          presentaciones: m.presentacion
            .filter((p) => p.activa)
            .sort((a, b) => Number(b.contenido) - Number(a.contenido))
            .map((p) => ({
              id: p.id,
              nombre: p.nombre,
              contenido: Number(p.contenido),
              proveedores: p.presentacion_proveedor
                .filter((o) => o.vigente && o.proveedor.activo)
                .map((o) => ({ id: o.proveedor.id, nombre: o.proveedor.nombre }))
                .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
            })),
        })),
      });
    } catch (error) {
      console.error('Error al consultar las opciones de entrada:', error);
      res.status(500).json({ error: 'Error al consultar las opciones de entrada' });
    }
  });

  // Existencias por insumo (todos los roles; el dinero solo lo ve gestión)
  router.get('/', async (req, res) => {
    const panaderiaId = req.panaderiaId!;
    const conCostos = puedeVerCostos(req.usuario?.rol);
    try {
      const [materias, lotes] = await Promise.all([
        prisma.materia_prima.findMany({
          where: { panaderia_id: panaderiaId, activa: true, controla_inventario: true },
          include: { unidad_medida: true },
          orderBy: { nombre: 'asc' },
        }),
        prisma.lote.findMany({
          where: { panaderia_id: panaderiaId, materia_prima_id: { not: null }, cantidad_disponible: { gt: 0 } },
        }),
      ]);
      const hoy = hoyColombia();
      const lotesPorMateria = new Map<string, LoteVista[]>();
      for (const l of lotes) {
        const lista = lotesPorMateria.get(l.materia_prima_id!) ?? [];
        lista.push(aVista(l));
        lotesPorMateria.set(l.materia_prima_id!, lista);
      }
      res.json({
        fecha: hoy,
        items: materias.map((m) => {
          const r = resumirStock(lotesPorMateria.get(m.id) ?? [], hoy);
          return {
            materia_prima_id: m.id,
            codigo: m.codigo,
            nombre: m.nombre,
            unidad: m.unidad_medida.codigo,
            criterio_rotacion: m.criterio_rotacion,
            stock: r.stock,
            lotes_activos: r.lotes_activos,
            proximo_vencimiento: r.proximo_vencimiento,
            estado: r.estado,
            ...(conCostos ? { valor: r.valor } : {}),
          };
        }),
      });
    } catch (error) {
      console.error('Error al consultar el inventario:', error);
      res.status(500).json({ error: 'Error al consultar el inventario' });
    }
  });

  // Alertas de vencimiento: lotes con existencias vencidos o por vencer (todos los roles; el dinero solo gestión)
  router.get('/alertas', async (req, res) => {
    const dias = validarDiasAlerta(req.query.dias);
    if (!dias.ok) return res.status(400).json({ error: dias.error });
    const panaderiaId = req.panaderiaId!;
    const conCostos = puedeVerCostos(req.usuario?.rol);
    try {
      const [materias, filas] = await Promise.all([
        prisma.materia_prima.findMany({
          where: { panaderia_id: panaderiaId, activa: true, controla_inventario: true },
          include: { unidad_medida: true },
        }),
        prisma.lote.findMany({
          where: { panaderia_id: panaderiaId, materia_prima_id: { not: null }, cantidad_disponible: { gt: 0 } },
        }),
      ]);
      const porMateria = new Map(materias.map((m) => [m.id, m]));
      const hoy = hoyColombia();
      const alertas = alertasDeLotes(
        filas.filter((l) => porMateria.has(l.materia_prima_id!)).map((l) => ({ ...aVista(l), materia_prima_id: l.materia_prima_id! })),
        hoy,
        dias.dias,
      );
      const items = alertas.map((a) => {
        const m = porMateria.get(a.materia_prima_id)!;
        const { valor, ...resto } = a;
        return { ...resto, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad_medida.codigo, ...(conCostos ? { valor } : {}) };
      });
      const vencidos = items.filter((i) => i.estado === 'vencido');
      res.json({
        fecha: hoy,
        dias_alerta: dias.dias,
        resumen: {
          vencidos: vencidos.length,
          por_vencer: items.length - vencidos.length,
          ...(conCostos
            ? {
                valor_vencido: Math.round(alertas.filter((a) => a.estado === 'vencido').reduce((s, a) => s + a.valor, 0) * 100) / 100,
                valor_por_vencer: Math.round(alertas.filter((a) => a.estado === 'por_vencer').reduce((s, a) => s + a.valor, 0) * 100) / 100,
              }
            : {}),
        },
        items,
      });
    } catch (error) {
      console.error('Error al consultar las alertas de vencimiento:', error);
      res.status(500).json({ error: 'Error al consultar las alertas de vencimiento' });
    }
  });

  // Lotes con existencias de un insumo, en el orden en que deben consumirse
  router.get('/materias-primas/:id/lotes', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    const conCostos = puedeVerCostos(req.usuario?.rol);
    try {
      const materia = await prisma.materia_prima.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { unidad_medida: true },
      });
      if (!materia) return res.status(404).json({ error: 'Materia prima no encontrada.' });
      const filas = await prisma.lote.findMany({
        where: { panaderia_id: panaderiaId, materia_prima_id: id, cantidad_disponible: { gt: 0 } },
      });
      const hoy = hoyColombia();
      const lotes = ordenarLotes(filas.map(aVista), materia.criterio_rotacion as CriterioRotacion | null);
      res.json({
        materia: { id: materia.id, codigo: materia.codigo, nombre: materia.nombre, unidad: materia.unidad_medida.codigo },
        criterio_rotacion: materia.criterio_rotacion,
        resumen: (({ valor, ...resto }) => (conCostos ? { ...resto, valor } : resto))(resumirStock(lotes, hoy)),
        lotes: lotes.map((l) => ({
          id: l.id,
          codigo_lote: l.codigo_lote,
          cantidad_inicial: l.cantidad_inicial,
          cantidad_disponible: l.cantidad_disponible,
          fecha_vencimiento: l.fecha_vencimiento,
          created_at: l.created_at,
          ...(conCostos ? { costo_unitario: l.costo_unitario } : {}),
        })),
      });
    } catch (error) {
      console.error('Error al consultar los lotes:', error);
      res.status(500).json({ error: 'Error al consultar los lotes' });
    }
  });

  // Registrar una entrada: crea compra, detalle, recepción y lote en una sola transacción
  // Corregir las existencias de un lote cuando el registro quedó mal (p. ej. se digitó un peso equivocado).
  // No se sobrescribe la cantidad: se registra un ajuste con su motivo, para que el historial lo explique.
  router.post('/lotes/:id/correccion', autorizarRoles('administrador', 'superadministrador'), async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarCorreccion(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;

    try {
      const salida = await prisma.$transaction(async (tx) => {
        const asignado = await tx.usuario_panaderia.findFirst({ where: { usuario_id: usuarioId, panaderia_id: panaderiaId, activo: true } });
        if (!asignado) return { estado: 403, error: 'Tu usuario no está asignado a esta panadería.' };

        // Bloquea el lote: una producción o un conteo que lo toquen al mismo tiempo esperan a que termine
        await tx.$queryRaw`SELECT id FROM lote WHERE id = ${id}::uuid AND panaderia_id = ${panaderiaId}::uuid FOR UPDATE`;
        const lote = await tx.lote.findFirst({ where: { id, panaderia_id: panaderiaId, materia_prima_id: { not: null } } });
        if (!lote || !lote.materia_prima_id) return { estado: 404, error: 'Lote no encontrado.' };
        const materia = await tx.materia_prima.findFirst({
          where: { id: lote.materia_prima_id, panaderia_id: panaderiaId },
          include: { unidad_medida: true },
        });
        if (!materia) return { estado: 404, error: 'Lote no encontrado.' };
        if (materia.controla_inventario === false) return { estado: 409, error: `${materia.nombre} no se controla en inventario.` };

        // Un conteo abierto guardó lo que decía el sistema: corregir aparte lo dejaría desfasado
        const enConteo = await tx.detalle_conteo.findFirst({
          where: { lote_id: id, panaderia_id: panaderiaId, conteo: { estado: { in: ['en_curso', 'enviado'] } } },
          include: { conteo: true },
        });
        if (enConteo) {
          return {
            estado: 409,
            error: `Este lote ya está en el conteo n.º ${enConteo.conteo.numero}. Quítalo de ese conteo (o termínalo) antes de corregirlo.`,
          };
        }

        const anterior = Number(lote.cantidad_disponible);
        const dif = diferencia(anterior, d.cantidad_nueva);
        if (dif === 0) return { estado: 409, error: 'La cantidad es la misma que ya tiene el sistema: no hay nada que corregir.' };
        const revisado = revisarMotivo(dif, d.motivo, d.observaciones);
        if (!revisado.ok) return { estado: 400, error: revisado.errores.join(' ') };

        const tipo = await tx.tipo_movimiento_inventario.findFirst({ where: { codigo: dif > 0 ? 'ajuste_entrada' : 'ajuste_salida' } });
        if (!tipo) throw new Error('Falta el tipo de movimiento de ajuste en el catálogo');
        const nota = `Corrección de existencias: ${ETIQUETA_MOTIVO[d.motivo]}${d.observaciones ? ` (${d.observaciones})` : ''}`;
        await tx.movimiento_inventario.create({
          data: {
            panaderia_id: panaderiaId,
            lote_id: id,
            tipo_movimiento_id: tipo.id,
            cantidad: Math.abs(dif),
            usuario_id: usuarioId,
            observaciones: nota,
          },
        });
        return {
          estado: 200,
          cuerpo: {
            lote_id: id,
            codigo_lote: lote.codigo_lote ?? null,
            nombre: materia.nombre,
            unidad: materia.unidad_medida.codigo,
            cantidad_anterior: anterior,
            cantidad_nueva: d.cantidad_nueva,
            diferencia: dif,
          },
        };
      });
      if ('error' in salida) return res.status(salida.estado).json({ error: salida.error });
      res.json(salida.cuerpo);
    } catch (error) {
      console.error('Error al corregir el lote:', error);
      res.status(500).json({ error: 'Error al corregir las existencias del lote' });
    }
  });

  // Corregir la fecha de vencimiento de un lote (p. ej. se digitó mal al registrar la entrada)
  router.patch('/lotes/:id/vencimiento', autorizarRoles('administrador', 'superadministrador'), async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const lote = await prisma.lote.findFirst({ where: { id, panaderia_id: panaderiaId, materia_prima_id: { not: null } } });
      if (!lote || !lote.materia_prima_id) return res.status(404).json({ error: 'Lote no encontrado.' });
      const materia = await prisma.materia_prima.findFirst({ where: { id: lote.materia_prima_id, panaderia_id: panaderiaId } });
      if (!materia) return res.status(404).json({ error: 'Lote no encontrado.' });

      const validado = validarNuevoVencimiento(req.body, hoyColombia(), materia.criterio_rotacion as CriterioRotacion | null);
      if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });

      const anterior = fechaTexto(lote.fecha_vencimiento);
      if (validado.fecha === anterior) return res.status(409).json({ error: 'Esa ya es la fecha de vencimiento del lote.' });

      const cambiados = await prisma.lote.updateMany({
        where: { id, panaderia_id: panaderiaId },
        data: { fecha_vencimiento: validado.fecha === null ? null : new Date(`${validado.fecha}T00:00:00Z`) },
      });
      if (cambiados.count === 0) return res.status(404).json({ error: 'Lote no encontrado.' });
      res.json({ lote_id: id, codigo_lote: lote.codigo_lote ?? null, nombre: materia.nombre, fecha_anterior: anterior, fecha_nueva: validado.fecha });
    } catch (error) {
      console.error('Error al corregir el vencimiento del lote:', error);
      res.status(500).json({ error: 'Error al corregir el vencimiento del lote' });
    }
  });

  router.post('/entradas', async (req, res) => {
    const validado = validarEntrada(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const d = validado.datos;
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;
    const conCostos = puedeVerCostos(req.usuario?.rol);

    try {
      const materia = await prisma.materia_prima.findFirst({
        where: { id: d.materia_prima_id, panaderia_id: panaderiaId, activa: true },
        include: { unidad_medida: true },
      });
      if (!materia) return res.status(404).json({ error: 'Materia prima no encontrada.' });
      if (materia.controla_inventario === false) {
        return res.status(409).json({ error: `${materia.nombre} no se controla en inventario: no se registran entradas.` });
      }

      const presentacion = await prisma.presentacion.findFirst({
        where: { id: d.presentacion_id, materia_prima_id: materia.id, panaderia_id: panaderiaId, activa: true },
      });
      if (!presentacion) return res.status(404).json({ error: 'Presentación no encontrada para este insumo.' });
      const contenido = Number(presentacion.contenido);

      const hoy = hoyColombia();
      const erroresFecha = verificarVencimiento(d.fecha_vencimiento, hoy, materia.criterio_rotacion as CriterioRotacion | null);
      if (erroresFecha.length > 0) return res.status(400).json({ error: erroresFecha.join(' '), errores: erroresFecha });

      // Quien recibe debe estar asignado a la panadería (la base lo exige en compra y recepción)
      const asignado = await prisma.usuario_panaderia.findFirst({
        where: { usuario_id: usuarioId, panaderia_id: panaderiaId, activo: true },
      });
      if (!asignado) return res.status(403).json({ error: 'Tu usuario no está asignado a esta panadería.' });

      // Oferta que respalda la compra: la del proveedor indicado o, si no, la mejor vigente
      const ofertas = await prisma.presentacion_proveedor.findMany({
        where: {
          presentacion_id: presentacion.id,
          panaderia_id: panaderiaId,
          vigente: true,
          proveedor: { activo: true },
          ...(d.proveedor_id ? { proveedor_id: d.proveedor_id } : {}),
        },
      });
      const elegida = mejorOferta(
        ofertas.map((o) => ({ id: o.id, precio: Number(o.precio_referencia), vigente: o.vigente, proveedor_activo: true })),
      );
      if (!elegida) {
        return res.status(409).json({
          error: d.proveedor_id
            ? 'Ese proveedor no tiene un precio vigente para esta presentación.'
            : 'Esta presentación no tiene un proveedor con precio vigente. Pida a un administrador registrar la oferta.',
        });
      }
      const oferta = ofertas.find((o) => o.id === elegida.id)!;

      if (d.codigo_lote) {
        const repetido = await prisma.lote.findFirst({
          where: {
            panaderia_id: panaderiaId,
            materia_prima_id: materia.id,
            codigo_lote: { equals: d.codigo_lote, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (repetido) return res.status(409).json({ error: 'Ya existe un lote de este insumo con ese código.' });
      }

      const creado = await prisma.$transaction(async (tx) => {
        let codigo = d.codigo_lote;
        if (!codigo) {
          const prefijo = codigoGenerado(hoy, 0).slice(0, -3);
          const previos = await tx.lote.count({
            where: { panaderia_id: panaderiaId, codigo_lote: { startsWith: prefijo } },
          });
          codigo = codigoGenerado(hoy, previos + 1);
        }
        const compra = await tx.compra.create({
          data: { panaderia_id: panaderiaId, proveedor_id: oferta.proveedor_id, usuario_id: usuarioId, estado: 'completa' },
        });
        const detalle = await tx.detalle_compra.create({
          data: {
            compra_id: compra.id,
            panaderia_id: panaderiaId,
            presentacion_proveedor_id: oferta.id,
            cantidad_pedida: d.cantidad,
            precio_unitario_pactado: oferta.precio_referencia,
          },
        });
        const recepcion = await tx.detalle_recepcion.create({
          data: {
            detalle_compra_id: detalle.id,
            usuario_id: usuarioId,
            panaderia_id: panaderiaId,
            cantidad_recibida: d.cantidad,
          },
        });
        const cantidad = cantidadBase(d.cantidad, contenido);
        const lote = await tx.lote.create({
          data: {
            panaderia_id: panaderiaId,
            materia_prima_id: materia.id,
            detalle_recepcion_id: recepcion.id,
            cantidad_inicial: cantidad,
            cantidad_disponible: cantidad,
            costo_unitario: costoUnitario(Number(oferta.precio_referencia), contenido),
            fecha_vencimiento: d.fecha_vencimiento ? new Date(`${d.fecha_vencimiento}T00:00:00.000Z`) : null,
            codigo_lote: codigo,
          },
        });
        return { lote, cantidad, codigo };
      });

      res.status(201).json({
        lote: {
          id: creado.lote.id,
          codigo_lote: creado.codigo,
          materia_prima_id: materia.id,
          nombre: materia.nombre,
          unidad: materia.unidad_medida.codigo,
          cantidad: creado.cantidad,
          fecha_vencimiento: d.fecha_vencimiento,
          ...(conCostos ? { costo_unitario: costoUnitario(Number(oferta.precio_referencia), contenido) } : {}),
        },
      });
    } catch (error) {
      console.error('Error al registrar la entrada:', error);
      res.status(500).json({ error: 'Error al registrar la entrada' });
    }
  });

  return router;
}
