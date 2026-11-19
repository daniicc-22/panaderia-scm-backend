import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { autorizarRoles } from '../middleware/autenticacion';
import { alcanceProveedores } from '../utils/alcance';
import { estadoLote } from '../utils/inventario';
import { horaColombia, hoyColombia } from '../utils/entradas';
import { UUID } from '../utils/materiaPrima';
import { elegirPrecio } from '../utils/precios';
import { revisarCoherencia, validarParametros } from '../utils/parametrosInventario';
import {
  armarRecomendaciones,
  type ModoCostoPedido,
  type ClaseAbc,
  type DatosInsumo,
  type DatosProveedor,
  type OfertaAplicada,
  type ParametrosInsumo,
} from '../utils/recomendaciones';
import { cargarConsumoReal } from '../datos/consumoReal';
import { calcularAbc } from './abc';
import { armarFilasCorte } from '../utils/corteEoq';

const ROLES_GESTION = ['administrador', 'superadministrador'];
const SEMANAS_AL_ANIO = 52;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Todo lo que necesita el cálculo de reposición, leído de la base de datos en una sola pasada. */
export async function cargarDatosReposicion(prisma: PrismaClient, panaderiaId: string, ahora: Date = new Date()) {
  const hoy = hoyColombia(ahora);
  const hora = horaColombia(ahora);

  const [materias, lotes, parametros, proveedores, abc, consumo] = await Promise.all([
    prisma.materia_prima.findMany({
      where: { panaderia_id: panaderiaId, activa: true, controla_inventario: true },
      include: {
        unidad_medida: true,
        presentacion: {
          include: { presentacion_proveedor: { include: { proveedor: { select: { activo: true } } } } },
        },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.lote.findMany({
      where: { panaderia_id: panaderiaId, materia_prima_id: { not: null }, cantidad_disponible: { gt: 0 } },
    }),
    prisma.parametro_inventario.findMany({ where: { panaderia_id: panaderiaId, activo: true } }),
    alcanceProveedores(prisma, panaderiaId).then((alcance) =>
      prisma.proveedor.findMany({ where: { OR: alcance } }),
    ),
    calcularAbc(prisma, panaderiaId, 'estimada', hoy),
    cargarConsumoReal(prisma, panaderiaId, hoy),
  ]);

  const clasePorCodigo = new Map<string, ClaseAbc>(abc.cuerpo.items.map((i) => [i.codigo, i.clase]));
  const paramPorMateria = new Map(parametros.map((p) => [p.materia_prima_id, p]));

  const existencia = new Map<string, { usable: number; vencida: number }>();
  for (const l of lotes) {
    const id = l.materia_prima_id!;
    const e = existencia.get(id) ?? { usable: 0, vencida: 0 };
    const fecha = l.fecha_vencimiento ? l.fecha_vencimiento.toISOString().slice(0, 10) : null;
    if (estadoLote(fecha, hoy) === 'vencido') e.vencida += Number(l.cantidad_disponible);
    else e.usable += Number(l.cantidad_disponible);
    existencia.set(id, e);
  }

  const insumos: DatosInsumo[] = materias.map((m) => {
    const presentaciones = m.presentacion.map((p) => ({
      id: p.id,
      contenido: Number(p.contenido),
      activa: p.activa,
      ofertas: p.presentacion_proveedor.map((o) => ({
        id: o.id,
        precio: Number(o.precio_referencia),
        vigente: o.vigente,
        proveedor_activo: o.proveedor.activo,
      })),
    }));
    const elegido = elegirPrecio(presentaciones);
    let oferta: OfertaAplicada | null = null;
    if (elegido) {
      const pres = m.presentacion.find((p) => p.id === elegido.presentacion_id)!;
      const fila = pres.presentacion_proveedor.find((o) => o.id === elegido.oferta_id)!;
      oferta = {
        proveedor_id: fila.proveedor_id,
        presentacion: pres.nombre,
        contenido: elegido.contenido,
        precio: elegido.precio,
        costo_unitario: elegido.costo_por_unidad_base,
        plazo_dias: num(fila.tiempo_entrega_dias),
      };
    }

    const p = paramPorMateria.get(m.id);
    const parametrosInsumo: ParametrosInsumo | null = p
      ? {
          costo_pedido: num(p.costo_ordenar_s),
          costo_mantener_h: num(p.costo_mantener_h),
          tasa_mantenimiento_anual: num(p.tasa_mantenimiento_anual),
          dias_seguridad: num(p.dias_seguridad),
          stock_minimo: num(p.stock_minimo),
          stock_maximo: num(p.stock_maximo),
          vida_util_dias: num(p.vida_util_dias),
          plazo_dias: num(p.lead_time_dias),
          porcentaje_perdida_tolerable: num(p.porcentaje_perdida_tolerable),
          modo_reposicion: p.modo_reposicion === 'al_uso' ? 'al_uso' : 'periodica',
        }
      : null;

    const estimadaAnual = abc.demandaAnualG.get(m.id);
    const stock = existencia.get(m.id) ?? { usable: 0, vencida: 0 };
    return {
      materia_prima_id: m.id,
      codigo: m.codigo,
      nombre: m.nombre,
      unidad: m.unidad_medida.codigo,
      clase_abc: clasePorCodigo.get(m.codigo) ?? null,
      existencia: Math.round(stock.usable * 1000) / 1000,
      existencia_vencida: Math.round(stock.vencida * 1000) / 1000,
      consumo_real: consumo.get(m.id) ?? null,
      consumo_declarado_semanal: num(p?.consumo_semanal_declarado),
      consumo_estimado_semanal: estimadaAnual === undefined ? null : estimadaAnual / SEMANAS_AL_ANIO,
      parametros: parametrosInsumo,
      plazo_materia_dias: num(m.lead_time_dias),
      oferta,
    };
  });

  const datosProveedores: DatosProveedor[] = proveedores.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    dias_entrega: p.dias_entrega ?? [],
    hora_limite_pedido: p.hora_limite_pedido ?? null,
    pedido_minimo: num(p.pedido_minimo),
  }));

  return { hoy, hora, insumos, proveedores: datosProveedores };
}

// Por defecto el costo de pedir se reparte entre los insumos del mismo proveedor: un pedido cubre varios insumos.
// `?costo_pedido=por_insumo` da el EOQ clásico (cada insumo con el costo completo) para comparar.
export const modoCostoPedido = (valor: unknown): ModoCostoPedido => (valor === 'por_insumo' ? 'por_insumo' : 'compartido');

export async function cargarRecomendaciones(
  prisma: PrismaClient,
  panaderiaId: string,
  ahora: Date = new Date(),
  costoPedido: ModoCostoPedido = 'compartido',
) {
  const datos = await cargarDatosReposicion(prisma, panaderiaId, ahora);
  return armarRecomendaciones(datos, { costoPedido });
}

export function crearRouterReposicion(prisma: PrismaClient, ahora: () => Date = () => new Date()) {
  const router = Router();
  // Compras, costos y proveedores son de gestión: el operario no entra aquí
  router.use(autorizarRoles(...ROLES_GESTION));

  // Qué pedir, cuándo y cuánto, insumo por insumo y agrupado por proveedor
  router.get('/recomendaciones', async (req, res) => {
    try {
      res.json(await cargarRecomendaciones(prisma, req.panaderiaId!, ahora(), modoCostoPedido(req.query.costo_pedido)));
    } catch (error) {
      console.error('Error al calcular las recomendaciones de reposición:', error);
      res.status(500).json({ error: 'Error al calcular las recomendaciones de reposición' });
    }
  });

  // Guarda el corte del día en analisis_eoq: una fila por insumo con demanda. Si ya había un corte de hoy lo reemplaza.
  router.post('/calcular', async (req, res) => {
    const panaderiaId = req.panaderiaId!;
    try {
      const momento = ahora();
      const recomendaciones = await cargarRecomendaciones(prisma, panaderiaId, momento, modoCostoPedido(req.query.costo_pedido));
      const { filas, omitidos } = armarFilasCorte(recomendaciones.items);
      if (filas.length === 0) {
        return res.status(422).json({
          error: 'Ningún insumo tiene demanda todavía, así que no hay nada que guardar. Registra el consumo declarado o produce para tener consumo real.',
          omitidos,
        });
      }
      const fecha = new Date(`${recomendaciones.fecha}T00:00:00.000Z`);
      const reemplazadas = await prisma.$transaction(async (tx) => {
        const borradas = await tx.analisis_eoq.deleteMany({ where: { panaderia_id: panaderiaId, fecha_corte: fecha } });
        await tx.analisis_eoq.createMany({
          data: filas.map((f) => ({ panaderia_id: panaderiaId, fecha_corte: fecha, ...f })),
        });
        return borradas.count;
      });
      res.status(201).json({
        fecha: recomendaciones.fecha,
        guardados: filas.length,
        calculados: filas.filter((f) => f.estado === 'calculado').length,
        datos_insuficientes: filas.filter((f) => f.estado === 'datos_insuficientes').length,
        reemplazados: reemplazadas,
        omitidos,
      });
    } catch (error) {
      console.error('Error al guardar el corte del análisis EOQ:', error);
      res.status(500).json({ error: 'Error al guardar el corte del análisis EOQ' });
    }
  });

  // Cortes guardados (uno por día), del más reciente al más antiguo
  router.get('/cortes', async (req, res) => {
    try {
      const filas = await prisma.analisis_eoq.findMany({
        where: { panaderia_id: req.panaderiaId! },
        select: { fecha_corte: true, estado: true },
        orderBy: { fecha_corte: 'desc' },
      });
      const porFecha = new Map<string, { fecha: string; insumos: number; calculados: number; datos_insuficientes: number }>();
      for (const f of filas) {
        const fecha = f.fecha_corte.toISOString().slice(0, 10);
        const c = porFecha.get(fecha) ?? { fecha, insumos: 0, calculados: 0, datos_insuficientes: 0 };
        c.insumos++;
        if (f.estado === 'calculado') c.calculados++;
        else c.datos_insuficientes++;
        porFecha.set(fecha, c);
      }
      // Del más reciente al más antiguo, sin depender del orden en que devuelva las filas la base de datos
      res.json({ cortes: [...porFecha.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)) });
    } catch (error) {
      console.error('Error al consultar los cortes del análisis EOQ:', error);
      res.status(500).json({ error: 'Error al consultar los cortes del análisis EOQ' });
    }
  });

  // Detalle de un corte, para exportarlo a la tesis
  router.get('/cortes/:fecha', async (req, res) => {
    const fecha = String(req.params.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
      return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD.' });
    }
    try {
      const filas = await prisma.analisis_eoq.findMany({
        where: { panaderia_id: req.panaderiaId!, fecha_corte: new Date(`${fecha}T00:00:00.000Z`) },
        include: { materia_prima: { select: { codigo: true, nombre: true } } },
      });
      if (filas.length === 0) return res.status(404).json({ error: 'No hay un corte guardado en esa fecha.' });
      res.json({
        fecha,
        items: filas
          .map((f) => ({
            materia_prima_id: f.materia_prima_id,
            codigo: f.materia_prima.codigo,
            nombre: f.materia_prima.nombre,
            estado: f.estado,
            demanda_anual: num(f.demanda_anual_d),
            costo_pedido: num(f.costo_pedido_s),
            costo_mantener: num(f.costo_mantenimiento_h),
            eoq: num(f.eoq_calculado),
            plazo_dias: num(f.lead_time_dias),
            stock_seguridad: num(f.stock_seguridad),
            punto_reorden: num(f.punto_reorden),
            advertencias: f.advertencias,
          }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      });
    } catch (error) {
      console.error('Error al consultar el corte del análisis EOQ:', error);
      res.status(500).json({ error: 'Error al consultar el corte del análisis EOQ' });
    }
  });

  // Parámetros de cada insumo y las tres fuentes de demanda lado a lado, para decidir con datos
  router.get('/parametros', async (req, res) => {
    try {
      const { hoy, insumos, proveedores } = await cargarDatosReposicion(prisma, req.panaderiaId!, ahora());
      const nombreProveedor = new Map(proveedores.map((p) => [p.id, p.nombre]));
      res.json({
        fecha: hoy,
        items: insumos.map((i) => ({
          materia_prima_id: i.materia_prima_id,
          codigo: i.codigo,
          nombre: i.nombre,
          unidad: i.unidad,
          clase_abc: i.clase_abc,
          parametros: i.parametros,
          consumo_semanal: {
            declarado: i.consumo_declarado_semanal,
            estimado_recetas: i.consumo_estimado_semanal === null ? null : Math.round(i.consumo_estimado_semanal * 1000) / 1000,
            real: i.consumo_real
              ? { semanal: Math.round(i.consumo_real.semanal * 1000) / 1000, semanas_observadas: i.consumo_real.semanasObservadas }
              : null,
          },
          oferta: i.oferta
            ? {
                proveedor: { id: i.oferta.proveedor_id, nombre: nombreProveedor.get(i.oferta.proveedor_id) ?? null },
                presentacion: i.oferta.presentacion,
                contenido: i.oferta.contenido,
                precio: i.oferta.precio,
                plazo_dias: i.oferta.plazo_dias,
              }
            : null,
        })),
      });
    } catch (error) {
      console.error('Error al consultar los parámetros de reposición:', error);
      res.status(500).json({ error: 'Error al consultar los parámetros de reposición' });
    }
  });

  // Cambia solo los campos enviados (null borra el valor); el resto queda como estaba
  router.put('/parametros/:materiaPrimaId', async (req, res) => {
    const materiaId = String(req.params.materiaPrimaId);
    if (!UUID.test(materiaId)) return res.status(400).json({ error: 'Identificador no válido.' });
    const validado = validarParametros(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const cambios = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const materia = await prisma.materia_prima.findFirst({ where: { id: materiaId, panaderia_id: panaderiaId } });
      if (!materia) return res.status(404).json({ error: 'Materia prima no encontrada.' });

      const actual = await prisma.parametro_inventario.findFirst({
        where: { panaderia_id: panaderiaId, materia_prima_id: materiaId, activo: true },
      });
      const final = {
        stock_minimo: cambios.stock_minimo !== undefined ? cambios.stock_minimo : num(actual?.stock_minimo),
        stock_maximo: cambios.stock_maximo !== undefined ? cambios.stock_maximo : num(actual?.stock_maximo),
      };
      const incoherencias = revisarCoherencia(final);
      if (incoherencias.length > 0) return res.status(400).json({ error: incoherencias.join(' '), errores: incoherencias });

      const guardado = actual
        ? await prisma.parametro_inventario.update({ where: { id: actual.id }, data: cambios })
        : await prisma.parametro_inventario.create({
            data: { panaderia_id: panaderiaId, materia_prima_id: materiaId, ...cambios },
          });

      res.json({
        materia_prima_id: materiaId,
        costo_ordenar_s: num(guardado.costo_ordenar_s),
        costo_mantener_h: num(guardado.costo_mantener_h),
        tasa_mantenimiento_anual: num(guardado.tasa_mantenimiento_anual),
        dias_seguridad: num(guardado.dias_seguridad),
        stock_minimo: num(guardado.stock_minimo),
        stock_maximo: num(guardado.stock_maximo),
        vida_util_dias: num(guardado.vida_util_dias),
        consumo_semanal_declarado: num(guardado.consumo_semanal_declarado),
        lead_time_dias: num(guardado.lead_time_dias),
        porcentaje_perdida_tolerable: num(guardado.porcentaje_perdida_tolerable),
        modo_reposicion: guardado.modo_reposicion === 'al_uso' ? 'al_uso' : 'periodica',
      });
    } catch (error) {
      console.error('Error al guardar los parámetros de reposición:', error);
      res.status(500).json({ error: 'Error al guardar los parámetros de reposición' });
    }
  });

  return router;
}
