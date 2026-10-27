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
import { UUID } from '../utils/materiaPrima';
import { calcularBalance } from '../utils/balance';
import { resumirDesviaciones, validarRango } from '../utils/desviaciones';
import { autorizarRoles } from '../middleware/autenticacion';
import { aplicarPesos, avisoRendimiento, desviacionPct, rendimientoPct, validarFinalizacion, validarPesos, type LineaPesaje } from '../utils/pesaje';
import type { LoteVista } from '../utils/inventario';

type Db = Prisma.TransactionClient;

const LIMITE_LISTA = 50;
const ESTADOS = ['planificada', 'en_curso', 'finalizada', 'cancelada'] as const;
const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

const fechaTexto = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// Resultado de preparar una producción: o un plan listo, o un motivo por el que no se puede
type Preparada =
  | { ok: true; formulacion: { id: string; producto_id: string; producto: string; version: number; rendimiento: number | null }; plan: Plan; pesaje: Map<string, LineaPesaje>; sin_control: Map<string, number>; materias: Map<string, { codigo: string; nombre: string; unidad: string }>; lotes: Map<string, LoteVista> }
  | { ok: false; estado: number; error: string };

// Calcula lo que pide producir `lotes` veces una receta y de qué lotes saldría cada insumo
async function preparar(db: Db, panaderiaId: string, formulacionId: string, lotes: number, pesos: ReadonlyMap<string, number>): Promise<Preparada> {
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

  // Lo que se usará de cada insumo: el peso real si se pesó y, si no, el estándar de la receta
  const aplicado = aplicarPesos(need.materias, pesos);
  if (aplicado.ajenos.length > 0) {
    return { ok: false, estado: 400, error: 'Hay pesos de insumos que no están en la receta.' };
  }
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
  const { controladas, no_controladas } = separarControlados(aplicado.efectivas, sinControl);
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
    pesaje: new Map(aplicado.lineas.map((l) => [l.materia_prima_id, l])),
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
        const ps = p.pesaje.get(i.materia_prima_id)!;
        return {
          materia_prima_id: i.materia_prima_id,
          codigo: m.codigo,
          nombre: m.nombre,
          unidad: m.unidad,
          controla_inventario: i.controla_inventario,
          peso_estandar: ps.peso_estandar,
          pesado: ps.pesado,
          desviacion_pct: desviacionPct(ps.peso_real, ps.peso_estandar),
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
    const pesos = validarPesos((req.body as Record<string, unknown> | null)?.pesos_reales);
    const errores = [...(validado.ok ? [] : validado.errores), ...(pesos.ok ? [] : pesos.errores)];
    if (!validado.ok || !pesos.ok) return res.status(400).json({ error: errores.join(' '), errores });
    const { formulacion_id, lotes } = validado.datos;
    try {
      const r = await preparar(prisma, req.panaderiaId!, formulacion_id, lotes, pesos.datos);
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
    const pesos = validarPesos((req.body as Record<string, unknown> | null)?.pesos_reales);
    const errores = [...(validado.ok ? [] : validado.errores), ...(pesos.ok ? [] : pesos.errores)];
    if (!validado.ok || !pesos.ok) return res.status(400).json({ error: errores.join(' '), errores });
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

        const r = await preparar(tx, panaderiaId, formulacion_id, lotes, pesos.datos);
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
        // Peso estándar, peso real y si se pesó, por insumo (base de la desviación de pesaje)
        await tx.pesaje_produccion.createMany({
          data: [...r.pesaje.values()].map((l) => ({
            panaderia_id: panaderiaId,
            produccion_id: produccion.id,
            materia_prima_id: l.materia_prima_id,
            peso_estandar: l.peso_estandar,
            peso_real: l.peso_real,
            pesado: l.pesado,
          })),
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

  // Desviación de pesaje por insumo (HU-11): solo gestión. Va antes de «/:id» para que no se lea como un id.
  router.get('/desviaciones', autorizarRoles('administrador', 'superadministrador'), async (req, res) => {
    const rango = validarRango(req.query.desde, req.query.hasta);
    if (!rango.ok) return res.status(400).json({ error: rango.errores.join(' '), errores: rango.errores });
    const panaderiaId = req.panaderiaId!;
    const { desde, hasta } = rango.datos;
    try {
      const pesajes = await prisma.pesaje_produccion.findMany({
        where: {
          panaderia_id: panaderiaId,
          produccion: { estado: { not: 'cancelada' }, ...(desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } } : {}) },
        },
      });
      const materias = await prisma.materia_prima.findMany({
        where: { id: { in: [...new Set(pesajes.map((x) => x.materia_prima_id))] }, panaderia_id: panaderiaId },
      });
      const nombre = new Map(materias.map((m) => [m.id, m.nombre]));
      const resumen = resumirDesviaciones(
        pesajes.map((x) => ({
          produccion_id: x.produccion_id,
          materia_prima_id: x.materia_prima_id,
          nombre: nombre.get(x.materia_prima_id) ?? 'Insumo desconocido',
          peso_estandar: Number(x.peso_estandar),
          peso_real: Number(x.peso_real),
          pesado: x.pesado,
        })),
      );
      res.json({
        desde: typeof req.query.desde === 'string' ? req.query.desde : null,
        hasta: typeof req.query.hasta === 'string' ? req.query.hasta : null,
        ...resumen,
      });
    } catch (error) {
      console.error('Error al calcular la desviación de pesaje:', error);
      res.status(500).json({ error: 'Error al calcular la desviación de pesaje' });
    }
  });

  // Historial de producciones, de la más reciente a la más antigua
  router.get('/', async (req, res) => {
    const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
    if (estado !== undefined && !(ESTADOS as readonly string[]).includes(estado)) {
      return res.status(400).json({ error: 'El estado no es válido.' });
    }
    try {
      const filas = await prisma.produccion.findMany({
        where: { panaderia_id: req.panaderiaId!, ...(estado ? { estado: estado as (typeof ESTADOS)[number] } : {}) },
        orderBy: { fecha: 'desc' },
        take: LIMITE_LISTA,
        include: {
          producto: { select: { nombre: true } },
          formulacion: { select: { version: true, rendimiento_esperado: true } },
          pesaje_produccion: { select: { pesado: true } },
          usuario_panaderia: { select: { usuario: { select: { nombre: true } } } },
        },
      });
      res.json(
        filas.map((f) => {
          const planificada = num(f.cantidad_planificada);
          const producida = num(f.cantidad_producida);
          const rend = num(f.formulacion.rendimiento_esperado);
          return {
            id: f.id,
            fecha: f.fecha.toISOString(),
            estado: f.estado,
            producto: f.producto.nombre,
            version: f.formulacion.version,
            usuario: f.usuario_panaderia.usuario.nombre,
            lotes: planificada !== null && rend ? Math.round((planificada / rend) * 1000) / 1000 : null,
            cantidad_planificada: planificada,
            cantidad_producida: producida,
            rendimiento_pct: rendimientoPct(producida, planificada),
            insumos_total: f.pesaje_produccion.length,
            insumos_pesados: f.pesaje_produccion.filter((x) => x.pesado).length,
          };
        }),
      );
    } catch (error) {
      console.error('Error al listar las producciones:', error);
      res.status(500).json({ error: 'Error al consultar las producciones' });
    }
  });

  // Detalle: qué se usó de cada insumo (estándar, real y lotes) y cómo cerró
  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    if (!UUID.test(id)) return res.status(404).json({ error: 'Producción no encontrada.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const f = await prisma.produccion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: {
          producto: { select: { nombre: true } },
          formulacion: { select: { version: true, rendimiento_esperado: true } },
          usuario_panaderia: { select: { usuario: { select: { nombre: true } } } },
        },
      });
      if (!f) return res.status(404).json({ error: 'Producción no encontrada.' });
      const pesajes = await prisma.pesaje_produccion.findMany({ where: { produccion_id: id, panaderia_id: panaderiaId } });
      const consumos = await prisma.consumo_produccion.findMany({
        where: { produccion_id: id, panaderia_id: panaderiaId },
        include: { lote: { select: { materia_prima_id: true, codigo_lote: true, fecha_vencimiento: true } } },
      });
      const materiaIds = [...new Set([...pesajes.map((x) => x.materia_prima_id), ...consumos.map((c) => c.lote.materia_prima_id!)])];
      const materias = await prisma.materia_prima.findMany({
        where: { id: { in: materiaIds }, panaderia_id: panaderiaId },
        include: { unidad_medida: true },
      });
      const porMateria = new Map(materias.map((m) => [m.id, m]));
      const lotesDe = (mid: string) =>
        consumos
          .filter((c) => c.lote.materia_prima_id === mid)
          .map((c) => ({ codigo_lote: c.lote.codigo_lote ?? null, fecha_vencimiento: fechaTexto(c.lote.fecha_vencimiento), cantidad: Number(c.cantidad_consumida) }));
      // Producciones anteriores a HU-16 no tienen pesajes: se muestran solo con lo consumido
      const pesajePorMateria = new Map(pesajes.map((x) => [x.materia_prima_id, x]));
      const insumos = materiaIds
        .map((mid) => {
          const m = porMateria.get(mid);
          const ps = pesajePorMateria.get(mid);
          const est = ps ? Number(ps.peso_estandar) : null;
          const real = ps ? Number(ps.peso_real) : null;
          return {
            materia_prima_id: mid,
            codigo: m?.codigo ?? null,
            nombre: m?.nombre ?? 'Insumo desconocido',
            unidad: m?.unidad_medida.codigo ?? null,
            controla_inventario: m ? m.controla_inventario !== false : true,
            peso_estandar: est,
            peso_real: real,
            pesado: ps ? ps.pesado : null,
            desviacion_pct: est !== null && real !== null ? desviacionPct(real, est) : null,
            lotes: lotesDe(mid),
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const planificada = num(f.cantidad_planificada);
      const producida = num(f.cantidad_producida);
      res.json({
        id: f.id,
        fecha: f.fecha.toISOString(),
        estado: f.estado,
        producto: f.producto.nombre,
        version: f.formulacion.version,
        usuario: f.usuario_panaderia.usuario.nombre,
        cantidad_planificada: planificada,
        cantidad_producida: producida,
        rendimiento_pct: rendimientoPct(producida, planificada),
        insumos,
      });
    } catch (error) {
      console.error('Error al consultar la producción:', error);
      res.status(500).json({ error: 'Error al consultar la producción' });
    }
  });

  // Balance de masas de una producción (HU-18): insumos usados (con agua), merma registrada y rendimiento.
  // No incluye dinero. La masa del producto terminado queda pendiente: el catálogo no tiene peso por unidad.
  router.get('/:id/balance', async (req, res) => {
    const id = req.params.id;
    if (!UUID.test(id)) return res.status(404).json({ error: 'Producción no encontrada.' });
    const panaderiaId = req.panaderiaId!;
    try {
      const f = await prisma.produccion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { producto: { select: { nombre: true } } },
      });
      if (!f) return res.status(404).json({ error: 'Producción no encontrada.' });
      const pesajes = await prisma.pesaje_produccion.findMany({ where: { produccion_id: id, panaderia_id: panaderiaId } });
      const consumos = await prisma.consumo_produccion.findMany({
        where: { produccion_id: id, panaderia_id: panaderiaId },
        include: { lote: { select: { materia_prima_id: true } } },
      });
      const mermas = await prisma.desperdicio.findMany({
        where: { produccion_id: id, panaderia_id: panaderiaId },
        include: {
          causa_desperdicio: { select: { nombre: true } },
          lote: { select: { materia_prima_id: true } },
        },
      });

      // Producciones anteriores a HU-16 no tienen pesajes: se arman con lo consumido de cada lote
      const conPesaje = pesajes.length > 0;
      const usado = new Map<string, number>();
      if (conPesaje) for (const x of pesajes) usado.set(x.materia_prima_id, Number(x.peso_real));
      else for (const c of consumos) {
        const mid = c.lote.materia_prima_id;
        if (mid) usado.set(mid, (usado.get(mid) ?? 0) + Number(c.cantidad_consumida));
      }
      const materiaIds = [...new Set([...usado.keys(), ...mermas.flatMap((m) => (m.lote?.materia_prima_id ? [m.lote.materia_prima_id] : []))])];
      const materias = await prisma.materia_prima.findMany({
        where: { id: { in: materiaIds }, panaderia_id: panaderiaId },
        include: { unidad_medida: true },
      });
      const porId = new Map(materias.map((m) => [m.id, m]));

      const planificada = num(f.cantidad_planificada);
      const producida = num(f.cantidad_producida);
      const balance = calcularBalance({
        insumos: [...usado].map(([mid, peso]) => ({
          materia_prima_id: mid,
          nombre: porId.get(mid)?.nombre ?? 'Insumo desconocido',
          unidad: porId.get(mid)?.unidad_medida.codigo ?? null,
          peso_real: peso,
        })),
        mermas: mermas.map((m) => {
          const mid = m.lote?.materia_prima_id ?? null;
          return {
            cantidad: Number(m.cantidad),
            unidad: mid ? (porId.get(mid)?.unidad_medida.codigo ?? null) : 'g',
            con_lote: m.lote_id !== null,
            causa: m.causa_desperdicio.nombre,
          };
        }),
        producida,
        planificada,
      });
      res.json({
        produccion_id: f.id,
        producto: f.producto.nombre,
        estado: f.estado,
        con_pesaje: conPesaje,
        cantidad_planificada: planificada,
        cantidad_producida: producida,
        masa_producto_terminado_g: null, // pendiente de campo: pesar una unidad de cada producto
        ...balance,
      });
    } catch (error) {
      console.error('Error al calcular el balance de masas:', error);
      res.status(500).json({ error: 'Error al calcular el balance de masas' });
    }
  });

  // Cerrar la producción con lo que realmente salió. Una vez finalizada ya no se modifica (lo exige la base).
  router.post('/:id/finalizar', async (req, res) => {
    const id = req.params.id;
    if (!UUID.test(id)) return res.status(404).json({ error: 'Producción no encontrada.' });
    const validado = validarFinalizacion(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const { cantidad_producida } = validado.datos;
    const panaderiaId = req.panaderiaId!;
    try {
      const salida = await prisma.$transaction(async (tx) => {
        // Bloquea la fila: dos personas cerrando a la vez no se pisan
        await tx.$queryRaw`SELECT id FROM produccion WHERE id = ${id}::uuid AND panaderia_id = ${panaderiaId}::uuid FOR UPDATE`;
        const p = await tx.produccion.findFirst({ where: { id, panaderia_id: panaderiaId } });
        if (!p) return { ok: false, estado: 404, error: 'Producción no encontrada.' } as const;
        if (p.estado !== 'en_curso') {
          const ya = p.estado === 'finalizada' ? 'finalizada' : p.estado === 'cancelada' ? 'cancelada' : 'sin iniciar';
          return { ok: false, estado: 409, error: `Esta producción está ${ya}; solo se cierra una producción en curso.` } as const;
        }
        const cerrada = await tx.produccion.update({ where: { id }, data: { estado: 'finalizada', cantidad_producida } });
        return { ok: true, cerrada, planificada: num(p.cantidad_planificada) } as const;
      });
      if (!salida.ok) return res.status(salida.estado).json({ error: salida.error });
      res.json({
        id,
        estado: 'finalizada',
        cantidad_planificada: salida.planificada,
        cantidad_producida,
        rendimiento_pct: rendimientoPct(cantidad_producida, salida.planificada),
        aviso: avisoRendimiento(cantidad_producida, salida.planificada),
      });
    } catch (error) {
      console.error('Error al finalizar la producción:', error);
      res.status(500).json({ error: 'Error al finalizar la producción' });
    }
  });

  return router;
}
