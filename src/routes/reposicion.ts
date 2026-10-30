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
  type ClaseAbc,
  type DatosInsumo,
  type DatosProveedor,
  type OfertaAplicada,
  type ParametrosInsumo,
} from '../utils/recomendaciones';
import { cargarConsumoReal } from '../datos/consumoReal';
import { calcularAbc } from './abc';

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

export async function cargarRecomendaciones(prisma: PrismaClient, panaderiaId: string, ahora: Date = new Date()) {
  const datos = await cargarDatosReposicion(prisma, panaderiaId, ahora);
  return armarRecomendaciones(datos);
}

export function crearRouterReposicion(prisma: PrismaClient, ahora: () => Date = () => new Date()) {
  const router = Router();
  // Compras, costos y proveedores son de gestión: el operario no entra aquí
  router.use(autorizarRoles(...ROLES_GESTION));

  // Qué pedir, cuándo y cuánto, insumo por insumo y agrupado por proveedor
  router.get('/recomendaciones', async (req, res) => {
    try {
      res.json(await cargarRecomendaciones(prisma, req.panaderiaId!, ahora()));
    } catch (error) {
      console.error('Error al calcular las recomendaciones de reposición:', error);
      res.status(500).json({ error: 'Error al calcular las recomendaciones de reposición' });
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
      });
    } catch (error) {
      console.error('Error al guardar los parámetros de reposición:', error);
      res.status(500).json({ error: 'Error al guardar los parámetros de reposición' });
    }
  });

  return router;
}
