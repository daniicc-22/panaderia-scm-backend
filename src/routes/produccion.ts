import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import type { CriterioRotacion } from '../utils/materiaPrima';
import { aLineasReceta, type LineaReceta } from '../utils/intermedios';
import {
  intermediosAlcanzados,
  necesidadesDeProduccion,
  planificarConsumo,
  separarControlados,
  validarProduccion,
  type Plan,
} from '../utils/consumo';
import { hoyColombia } from '../utils/entradas';
import { resumirNombres } from '../utils/texto';
import type { LoteVista } from '../utils/inventario';

type Db = Prisma.TransactionClient;

const fechaTexto = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Resultado de preparar una producción: o un plan listo, o un motivo por el que no se puede
type Preparada =
  | { ok: true; formulacion: { id: string; producto_id: string; producto: string; version: number; rendimiento: number | null }; plan: Plan; sin_control: Map<string, number>; materias: Map<string, { codigo: string; nombre: string; unidad: string }>; lotes: Map<string, LoteVista> }
  | { ok: false; estado: number; error: string };

// Calcula lo que pide producir `lotes` veces una receta y de qué lotes saldría cada insumo
async function preparar(db: Db, panaderiaId: string, formulacionId: string, lotes: number): Promise<Preparada> {
  const f = await db.formulacion.findFirst({
    where: { id: formulacionId, panaderia_id: panaderiaId, activa: true, producto: { activo: true } },
    include: { producto: true, detalle_formulacion: true },
  });
  if (!f) return { ok: false, estado: 404, error: 'Formulación no encontrada.' };

  // Recetas vigentes de toda la panadería (un intermedio puede ser ingrediente de otro)
  const activas = await db.formulacion.findMany({
    where: { panaderia_id: panaderiaId, activa: true },
    select: {
      producto_id: true,
      detalle_formulacion: {
        select: { materia_prima_id: true, producto_intermedio_id: true, cantidad_estandar: true, unidad_id: true },
      },
    },
  });
  const recetas = new Map<string, LineaReceta[]>(activas.map((a) => [a.producto_id, aLineasReceta(a.detalle_formulacion)]));
  const need = necesidadesDeProduccion(aLineasReceta(f.detalle_formulacion), recetas, f.producto_id, lotes);
  if (need.sin_receta.size > 0 || need.ciclos.size > 0) {
    const ids = [...need.sin_receta, ...need.ciclos];
    const productos = await db.producto.findMany({ where: { id: { in: ids }, panaderia_id: panaderiaId }, select: { nombre: true } });
    return {
      ok: false,
      estado: 409,
      error: `La receta usa productos intermedios sin receta vigente o con referencia circular (${resumirNombres(productos.map((p) => p.nombre))}). Pide a un administrador corregirla.`,
    };
  }
  if (need.materias.size === 0) return { ok: false, estado: 409, error: 'La receta no tiene insumos para descontar.' };

  const ids = [...need.materias.keys()];
  const materias = await db.materia_prima.findMany({
    where: { id: { in: ids }, panaderia_id: panaderiaId },
    include: { unidad_medida: true },
  });
  const porId = new Map(materias.map((m) => [m.id, m]));
  const inactivos = ids.filter((id) => !porId.get(id)?.activa);
  if (inactivos.length > 0) {
    const nombres = inactivos.map((id) => porId.get(id)?.nombre ?? 'insumo desconocido');
    return { ok: false, estado: 409, error: `Hay insumos desactivados en la receta: ${resumirNombres(nombres)}.` };
  }
  // Las líneas de la receta deben venir en la unidad base del insumo; si no, el descuento sería erróneo
  // (se revisan también las recetas de los intermedios que hay detrás)
  const alcanzados = intermediosAlcanzados(aLineasReceta(f.detalle_formulacion), recetas);
  const lineasRevisadas = [
    ...f.detalle_formulacion,
    ...activas.filter((a) => alcanzados.has(a.producto_id)).flatMap((a) => a.detalle_formulacion),
  ];
  const distintas = lineasRevisadas.filter(
    (d) => d.materia_prima_id && porId.get(d.materia_prima_id)?.unidad_base_id !== d.unidad_id,
  );
  if (distintas.length > 0) {
    const nombres = distintas.map((d) => porId.get(d.materia_prima_id!)?.nombre ?? 'insumo');
    return {
      ok: false,
      estado: 409,
      error: `La receta usa una unidad distinta a la del inventario en: ${resumirNombres(nombres)}. Pide a un administrador corregirla.`,
    };
  }

  // Insumos que no se compran ni se guardan (agua): se muestran en el plan pero no se descuentan
  const sinControl = new Set(materias.filter((m) => m.controla_inventario === false).map((m) => m.id));
  const { controladas, no_controladas } = separarControlados(need.materias, sinControl);
  if (controladas.size === 0) {
    return { ok: false, estado: 409, error: 'La receta no tiene insumos con inventario para descontar.' };
  }

  const filas = await db.lote.findMany({
    where: { panaderia_id: panaderiaId, materia_prima_id: { in: [...controladas.keys()] }, cantidad_disponible: { gt: 0 } },
  });
  const lotesPorMateria = new Map<string, LoteVista[]>();
  const lotesPorId = new Map<string, LoteVista>();
  for (const l of filas) {
    const v: LoteVista = {
      id: l.id,
      codigo_lote: l.codigo_lote ?? null,
      cantidad_inicial: Number(l.cantidad_inicial),
      cantidad_disponible: Number(l.cantidad_disponible),
      costo_unitario: 0, // el consumo no maneja dinero
      fecha_vencimiento: fechaTexto(l.fecha_vencimiento),
      created_at: l.created_at.toISOString(),
    };
    lotesPorId.set(v.id, v);
    lotesPorMateria.set(l.materia_prima_id!, [...(lotesPorMateria.get(l.materia_prima_id!) ?? []), v]);
  }
  const criterios = new Map<string, CriterioRotacion | null>(
    materias.map((m) => [m.id, m.criterio_rotacion as CriterioRotacion | null]),
  );
  const plan = planificarConsumo(controladas, lotesPorMateria, criterios, hoyColombia());

  return {
    ok: true,
    formulacion: {
      id: f.id,
      producto_id: f.producto_id,
      producto: f.producto.nombre,
      version: f.version,
      rendimiento: f.rendimiento_esperado == null ? null : Number(f.rendimiento_esperado),
    },
    plan,
    sin_control: no_controladas,
    materias: new Map(materias.map((m) => [m.id, { codigo: m.codigo, nombre: m.nombre, unidad: m.unidad_medida.codigo }])),
    lotes: lotesPorId,
  };
}

// Plan listo para mostrar: por insumo, lo necesario, lo que falta y de qué lotes saldría
function presentarPlan(p: Extract<Preparada, { ok: true }>, lotes: number) {
  return {
    formulacion: { id: p.formulacion.id, producto: p.formulacion.producto, version: p.formulacion.version },
    lotes,
    completo: p.plan.completo,
    items: [
      ...p.plan.items.map((i) => ({ ...i, controla_inventario: true })),
      ...[...p.sin_control].map(([id, necesario]) => ({
        materia_prima_id: id,
        necesario,
        asignaciones: [],
        faltante: 0,
        vencido_omitido: 0,
        controla_inventario: false,
      })),
    ]
      .map((i) => {
        const m = p.materias.get(i.materia_prima_id)!;
        return {
          materia_prima_id: i.materia_prima_id,
          codigo: m.codigo,
          nombre: m.nombre,
          unidad: m.unidad,
          controla_inventario: i.controla_inventario,
          necesario: i.necesario,
          faltante: i.faltante,
          vencido_omitido: i.vencido_omitido,
          lotes: i.asignaciones.map((a) => ({
            lote_id: a.lote_id,
            codigo_lote: p.lotes.get(a.lote_id)?.codigo_lote ?? null,
            fecha_vencimiento: p.lotes.get(a.lote_id)?.fecha_vencimiento ?? null,
            cantidad: a.cantidad,
          })),
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  };
}

interface Fallo {
  estado: number;
  error: string;
  plan?: ReturnType<typeof presentarPlan>;
}

const textoFaltantes = (p: ReturnType<typeof presentarPlan>) =>
  `No hay existencias suficientes de: ${resumirNombres(p.items.filter((i) => i.faltante > 0).map((i) => i.nombre))}.`;

export function crearRouterProduccion(prisma: PrismaClient) {
  const router = Router();

  // Vista previa: de qué lotes saldría cada insumo, sin escribir nada
  router.post('/simular', async (req, res) => {
    const validado = validarProduccion(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const { formulacion_id, lotes } = validado.datos;
    try {
      const r = await preparar(prisma, req.panaderiaId!, formulacion_id, lotes);
      if (!r.ok) return res.status(r.estado).json({ error: r.error });
      res.json(presentarPlan(r, lotes));
    } catch (error) {
      console.error('Error al simular la producción:', error);
      res.status(500).json({ error: 'Error al calcular el consumo' });
    }
  });

  // Registrar la producción: descuenta los insumos de sus lotes, todo o nada
  router.post('/', async (req, res) => {
    const validado = validarProduccion(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const { formulacion_id, lotes } = validado.datos;
    const panaderiaId = req.panaderiaId!;
    const usuarioId = req.usuario!.id;

    try {
      // Quien produce debe estar asignado a la panadería (la base lo exige)
      const asignado = await prisma.usuario_panaderia.findFirst({
        where: { usuario_id: usuarioId, panaderia_id: panaderiaId, activo: true },
      });
      if (!asignado) return res.status(403).json({ error: 'Tu usuario no está asignado a esta panadería.' });

      const salida: { fallo: Fallo } | { produccion_id: string; plan: ReturnType<typeof presentarPlan> } = await prisma.$transaction(async (tx) => {
        // Bloquea los lotes con existencias para que dos producciones simultáneas no gasten lo mismo
        await tx.$queryRaw`SELECT id FROM lote WHERE panaderia_id = ${panaderiaId}::uuid AND cantidad_disponible > 0 FOR UPDATE`;

        const r = await preparar(tx, panaderiaId, formulacion_id, lotes);
        if (!r.ok) return { fallo: { estado: r.estado, error: r.error } };
        const plan = presentarPlan(r, lotes);
        if (!r.plan.completo) return { fallo: { estado: 409, error: textoFaltantes(plan), plan } };

        const tipo = await tx.tipo_movimiento_inventario.findUnique({ where: { codigo: 'salida_produccion' } });
        if (!tipo) throw new Error("Falta el tipo de movimiento 'salida_produccion' en el catálogo");

        const produccion = await tx.produccion.create({
          data: {
            panaderia_id: panaderiaId,
            producto_id: r.formulacion.producto_id,
            formulacion_id: r.formulacion.id,
            usuario_id: usuarioId,
            estado: 'en_curso',
            origen_planificacion: 'sin_registro',
            cantidad_planificada: r.formulacion.rendimiento == null ? null : Math.round(r.formulacion.rendimiento * lotes * 1000) / 1000,
          },
        });
        for (const item of r.plan.items) {
          for (const a of item.asignaciones) {
            const consumo = await tx.consumo_produccion.create({
              data: { panaderia_id: panaderiaId, produccion_id: produccion.id, lote_id: a.lote_id, cantidad_consumida: a.cantidad },
            });
            await tx.movimiento_inventario.create({
              data: {
                panaderia_id: panaderiaId,
                lote_id: a.lote_id,
                tipo_movimiento_id: tipo.id,
                cantidad: a.cantidad,
                consumo_produccion_id: consumo.id,
                usuario_id: usuarioId,
              },
            });
          }
        }
        return { produccion_id: produccion.id, plan };
      });

      if ('fallo' in salida) {
        const { estado, error, plan } = salida.fallo;
        return res.status(estado).json({ error, ...(plan ? { plan } : {}) });
      }
      res.status(201).json(salida);
    } catch (error) {
      // La base impide dejar un lote en negativo: si alguien más gastó el insumo a la vez, se pide reintentar
      if (error instanceof Error && error.message.includes('negativa')) {
        return res.status(409).json({ error: 'Las existencias cambiaron mientras se registraba. Vuelve a intentarlo.' });
      }
      console.error('Error al registrar la producción:', error);
      res.status(500).json({ error: 'Error al registrar la producción' });
    }
  });

  return router;
}
