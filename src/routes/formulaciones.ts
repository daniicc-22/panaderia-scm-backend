import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { puedeVerCostos } from '../utils/permisos';
import { expandirLineas } from '../utils/intermedios';
import { aLineasReceta, costearLineas, creaCiclo, pesoReceta, type LineaReceta } from '../utils/intermedios';
import { elegirPrecio } from '../utils/precios';
import { autorizarRoles } from '../middleware/autenticacion';
import { resumirNombres } from '../utils/texto';
import {
  fechaHoyColombia,
  hayCambios,
  validarCambiosProducto,
  type FichaVersion,
  validarProductoNuevo,
  validarVersion,
  type LineaVersion,
} from '../utils/formulacion';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Costo por unidad base de cada materia prima según la regla de utils/precios.ts
export async function costosPorUnidadBase(prisma: PrismaClient, panaderiaId: string) {
  const materias = await prisma.materia_prima.findMany({
    where: { panaderia_id: panaderiaId },
    include: {
      presentacion: {
        include: { presentacion_proveedor: { include: { proveedor: { select: { activo: true } } } } },
      },
    },
  });

  const mapa = new Map<string, { codigo: string; nombre: string; costo: number | null; controla_inventario: boolean }>();
  for (const m of materias) {
    const elegido = elegirPrecio(
      m.presentacion.map((p) => ({
        id: p.id,
        contenido: Number(p.contenido),
        activa: p.activa,
        ofertas: p.presentacion_proveedor.map((o) => ({
          id: o.id,
          precio: Number(o.precio_referencia),
          vigente: o.vigente,
          proveedor_activo: o.proveedor.activo,
        })),
      })),
    );
    mapa.set(m.id, {
      codigo: m.codigo,
      nombre: m.nombre,
      costo: elegido ? elegido.costo_por_unidad_base : null,
      controla_inventario: m.controla_inventario,
    });
  }
  return mapa;
}

// Receta vigente de cada producto de la panadería (clave: id del producto). Incluye los productos
// dados de baja: uno inactivo puede seguir siendo ingrediente de otro.
export async function recetasVigentes(prisma: PrismaClient, panaderiaId: string) {
  const filas = await prisma.formulacion.findMany({
    where: { panaderia_id: panaderiaId, activa: true },
    select: {
      producto_id: true,
      detalle_formulacion: { select: { materia_prima_id: true, producto_intermedio_id: true, cantidad_estandar: true } },
    },
  });
  return new Map<string, LineaReceta[]>(filas.map((f) => [f.producto_id, aLineasReceta(f.detalle_formulacion)]));
}

// Costo por gramo de cada materia prima, listo para el cálculo de costos
export const costosPorGramo = (costos: Map<string, { costo: number | null }>) =>
  new Map<string, number | null>([...costos].map(([id, c]) => [id, c.costo]));

const redondear = (n: number) => Math.round(n * 100) / 100;

const ROLES_GESTION = ['administrador', 'superadministrador'];
const esErrorUnico = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

// Otra persona cambió la formulación entre la lectura y la escritura
class ConflictoVersion extends Error {}
const MENSAJE_CONFLICTO =
  'Otra persona guardó un cambio de esta formulación al mismo tiempo. Recarga la página e inténtalo de nuevo.';

const aLinea = (d: {
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  cantidad_estandar: unknown;
  tolerancia_porcentaje: unknown;
}): LineaVersion => ({
  materia_prima_id: d.materia_prima_id,
  producto_intermedio_id: d.producto_intermedio_id,
  cantidad: Number(d.cantidad_estandar),
  tolerancia_porcentaje: d.tolerancia_porcentaje == null ? null : Number(d.tolerancia_porcentaje),
});


// Ficha técnica tal como se guarda: lo que no llega se guarda vacío
const datosFicha = (d: FichaVersion) => ({
  motivo_cambio: d.motivo_cambio ?? null,
  procedimiento: d.procedimiento ?? null,
  tiempo_preparacion_min: d.tiempo_preparacion_min ?? null,
  tiempo_horneado_min: d.tiempo_horneado_min ?? null,
  temperatura_horneado_c: d.temperatura_horneado_c ?? null,
  merma_horneado_pct: d.merma_horneado_pct ?? null,
});

// Ficha técnica de una versión tal como la lee el cliente
const fichaDe = (f: {
  motivo_cambio: string | null;
  procedimiento: string | null;
  tiempo_preparacion_min: number | null;
  tiempo_horneado_min: number | null;
  temperatura_horneado_c: number | null;
  merma_horneado_pct: unknown;
}) => ({
  motivo_cambio: f.motivo_cambio,
  procedimiento: f.procedimiento,
  tiempo_preparacion_min: f.tiempo_preparacion_min,
  tiempo_horneado_min: f.tiempo_horneado_min,
  temperatura_horneado_c: f.temperatura_horneado_c,
  merma_horneado_pct: f.merma_horneado_pct == null ? null : Number(f.merma_horneado_pct),
});

// Margen de un producto: precio de venta menos costo por unidad (null si falta alguno)
function margen(precio: unknown, costoUnidad: number | null) {
  const p = precio == null ? null : Number(precio);
  if (p == null || p <= 0 || costoUnidad == null) return { margen_unidad: null, margen_pct: null };
  return { margen_unidad: redondear(p - costoUnidad), margen_pct: redondear(((p - costoUnidad) / p) * 100) };
}

export function crearRouterFormulaciones(prisma: PrismaClient) {
  const router = Router();
  const soloGestion = autorizarRoles(...ROLES_GESTION);

  // Materias primas activas de la panadería con su unidad base; null si alguna no existe, está inactiva o es ajena
  async function unidadesDeMaterias(panaderiaId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const materias = await prisma.materia_prima.findMany({
      where: { id: { in: ids }, panaderia_id: panaderiaId, activa: true },
      select: { id: true, unidad_base_id: true },
    });
    const mapa = new Map(materias.map((m) => [m.id, m.unidad_base_id]));
    return mapa.size === ids.length ? mapa : null;
  }

  // Revisa los productos intermedios que lleva una formulación. `conservados` son los que ya tenía
  // (no se vuelven a exigir activos); los nuevos deben existir, estar activos y tener receta.
  // `productoId` es el dueño de la formulación (null si el producto aún no existe).
  // Devuelve el mensaje de error, o null si todo está bien.
  async function revisarIntermedios(
    panaderiaId: string,
    productoId: string | null,
    lineas: readonly { materia_prima_id: string | null; producto_intermedio_id: string | null; cantidad: number }[],
    conservados: ReadonlySet<string>,
  ): Promise<string | null> {
    const ids = lineas.map((l) => l.producto_intermedio_id).filter((x): x is string => !!x);
    if (ids.length === 0) return null;

    const nuevos = ids.filter((x) => !conservados.has(x));
    const nombres = new Map<string, string>();
    if (nuevos.length > 0) {
      const filas = await prisma.producto.findMany({
        where: { id: { in: nuevos }, panaderia_id: panaderiaId, es_intermedio: true, activo: true },
        select: { id: true, nombre: true },
      });
      if (filas.length !== nuevos.length) {
        return 'Algún producto intermedio no existe, está dado de baja o no pertenece a tu panadería.';
      }
      filas.forEach((f) => nombres.set(f.id, f.nombre));
    }

    const recetas = await recetasVigentes(prisma, panaderiaId);
    if (productoId && creaCiclo(productoId, lineas, recetas)) {
      return 'Ese cambio haría que un producto intermedio se contenga a sí mismo (por ejemplo, la masa A usa la masa B y la masa B usa la masa A).';
    }
    for (const id of nuevos) {
      const receta = recetas.get(id);
      if (!receta || pesoReceta(receta) <= 0) {
        return `El producto intermedio «${nombres.get(id)}» todavía no tiene receta; créala antes de usarlo como ingrediente.`;
      }
    }
    return null;
  }

  // Los gramos de un intermedio se registran en la unidad 'g'
  async function unidadGramo() {
    const u = await prisma.unidad_medida.findUnique({ where: { codigo: 'g' } });
    return u ? u.id : null;
  }

  // Lista de formulaciones activas con peso y costo por lote y por unidad
  router.get('/', async (req, res) => {
    try {
      const panaderiaId = req.panaderiaId!;
      const verCostos = puedeVerCostos(req.usuario?.rol);
      // Los productos dados de baja no salen, salvo que la gestión pida verlos
      const incluirInactivos = req.query.incluir_inactivos === 'true' && ROLES_GESTION.includes(req.usuario?.rol ?? '');
      const [formulaciones, costos, recetas] = await Promise.all([
        prisma.formulacion.findMany({
          where: {
            panaderia_id: panaderiaId,
            activa: true,
            ...(incluirInactivos ? {} : { producto: { activo: true } }),
          },
          include: { producto: true, detalle_formulacion: true },
          orderBy: { producto: { nombre: 'asc' } },
        }),
        costosPorUnidadBase(prisma, panaderiaId),
        recetasVigentes(prisma, panaderiaId),
      ]);
      const costosG = costosPorGramo(costos);

      res.json(
        formulaciones.map((f) => {
          const { peso, costo, incompleto } = costearLineas(
            aLineasReceta(f.detalle_formulacion),
            recetas,
            f.producto_id,
            costosG,
          );
          const rendimiento = f.rendimiento_esperado == null ? null : Number(f.rendimiento_esperado);
          return {
            id: f.id,
            producto_id: f.producto_id,
            producto: f.producto.nombre,
            producto_activo: f.producto.activo,
            es_intermedio: f.producto.es_intermedio,
            version: f.version,
            vigente_desde: f.vigente_desde.toISOString().slice(0, 10),
            rendimiento,
            ingredientes: f.detalle_formulacion.length,
            peso_lote_g: redondear(peso),
            costo_lote: verCostos ? redondear(costo) : null,
            costo_unidad: verCostos && rendimiento ? redondear(costo / rendimiento) : null,
            costo_incompleto: verCostos ? incompleto : false,
            precio_venta: verCostos && f.producto.precio_venta != null ? Number(f.producto.precio_venta) : null,
            margen_pct: verCostos && rendimiento ? margen(f.producto.precio_venta, costo / rendimiento).margen_pct : null,
          };
        }),
      );
    } catch (error) {
      console.error('Error al consultar formulaciones:', error);
      res.status(500).json({ error: 'Error al consultar las formulaciones' });
    }
  });

  // Detalle de una formulación con el costo de cada ingrediente
  router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });

    try {
      const panaderiaId = req.panaderiaId!;
      const verCostos = puedeVerCostos(req.usuario?.rol);
      const f = await prisma.formulacion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { producto: true, detalle_formulacion: { include: { unidad_medida: true } } },
      });
      if (!f) return res.status(404).json({ error: 'Formulación no encontrada' });

      const [costos, recetas] = await Promise.all([costosPorUnidadBase(prisma, panaderiaId), recetasVigentes(prisma, panaderiaId)]);
      const costosG = costosPorGramo(costos);
      const idsIntermedios = f.detalle_formulacion
        .map((d) => d.producto_intermedio_id)
        .filter((x): x is string => !!x);
      const intermedios = idsIntermedios.length
        ? await prisma.producto.findMany({ where: { id: { in: idsIntermedios } } })
        : [];
      const nombreIntermedio = new Map(intermedios.map((p) => [p.id, p.nombre]));

      const { peso: pesoTotal, costo: costoTotal, incompleto } = costearLineas(
        aLineasReceta(f.detalle_formulacion),
        recetas,
        f.producto_id,
        costosG,
      );

      const ingredientes = f.detalle_formulacion
        .map((d) => {
          const cantidad = Number(d.cantidad_estandar);
          const mp = d.materia_prima_id ? costos.get(d.materia_prima_id) : undefined;
          // Un intermedio cuesta lo que cuestan sus materias primas repartidas; sin receta o sin precio, no hay costo
          const deIntermedio = d.producto_intermedio_id
            ? costearLineas(aLineasReceta([d]), recetas, f.producto_id, costosG)
            : null;
          const costo = deIntermedio
            ? deIntermedio.incompleto
              ? null
              : deIntermedio.costo
            : mp?.costo == null
              ? null
              : mp.costo * cantidad;
          const costoUnidad = deIntermedio ? (costo == null || cantidad <= 0 ? null : costo / cantidad) : (mp?.costo ?? null);
          return {
            tipo: d.materia_prima_id ? 'materia_prima' : 'producto_intermedio',
            materia_prima_id: d.materia_prima_id,
            producto_intermedio_id: d.producto_intermedio_id,
            tolerancia_porcentaje: d.tolerancia_porcentaje == null ? null : Number(d.tolerancia_porcentaje),
            codigo: mp?.codigo ?? null,
            nombre: mp?.nombre ?? nombreIntermedio.get(d.producto_intermedio_id ?? '') ?? 'Sin identificar',
            cantidad,
            unidad: d.unidad_medida.codigo,
            costo_por_unidad: verCostos && costoUnidad != null ? Math.round(costoUnidad * 10000) / 10000 : null,
            costo: verCostos && costo != null ? redondear(costo) : null,
          };
        })
        .sort((a, b) => b.cantidad - a.cantidad);

      const rendimiento = f.rendimiento_esperado == null ? null : Number(f.rendimiento_esperado);
      res.json({
        id: f.id,
        producto_id: f.producto_id,
        producto: f.producto.nombre,
        producto_activo: f.producto.activo,
        es_intermedio: f.producto.es_intermedio,
        version: f.version,
        activa: f.activa,
        vigente_desde: f.vigente_desde.toISOString().slice(0, 10),
        vigente_hasta: f.vigente_hasta ? f.vigente_hasta.toISOString().slice(0, 10) : null,
        rendimiento,
        peso_lote_g: redondear(pesoTotal),
        costo_lote: verCostos ? redondear(costoTotal) : null,
        costo_unidad: verCostos && rendimiento ? redondear(costoTotal / rendimiento) : null,
        costo_incompleto: verCostos ? incompleto : false,
        precio_venta: verCostos && f.producto.precio_venta != null ? Number(f.producto.precio_venta) : null,
        ...(verCostos && rendimiento ? margen(f.producto.precio_venta, costoTotal / rendimiento) : { margen_unidad: null, margen_pct: null }),
        ...fichaDe(f),
        ingredientes,
      });
    } catch (error) {
      console.error('Error al consultar la formulación:', error);
      res.status(500).json({ error: 'Error al consultar la formulación' });
    }
  });


  // Crea un producto final nuevo con su primera versión (1), ya vigente.
  router.post('/', soloGestion, async (req, res) => {
    const validado = validarProductoNuevo(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const datos = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const repetido = await prisma.producto.findFirst({
        where: { panaderia_id: panaderiaId, nombre: { equals: datos.nombre, mode: 'insensitive' } },
        select: { id: true },
      });
      if (repetido) return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });

      const idsMaterias = datos.ingredientes.map((l) => l.materia_prima_id).filter((x): x is string => !!x);
      const unidadDeMateria = await unidadesDeMaterias(panaderiaId, idsMaterias);
      if (!unidadDeMateria) {
        return res.status(400).json({
          error: 'Algún ingrediente no existe, está inactivo o no pertenece a tu panadería.',
        });
      }

      const errorIntermedios = await revisarIntermedios(panaderiaId, null, datos.ingredientes, new Set());
      if (errorIntermedios) return res.status(400).json({ error: errorIntermedios });
      let gramo: string | null = null;
      if (datos.ingredientes.some((l) => l.producto_intermedio_id)) {
        gramo = await unidadGramo();
        if (!gramo) {
          console.error("Falta la unidad de medida 'g' en el catálogo");
          return res.status(500).json({ error: 'Falta la unidad de gramos en el catálogo.' });
        }
      }

      // Todos los productos del piloto se producen por unidad ('un')
      const unidadProduccion = await prisma.unidad_medida.findUnique({ where: { codigo: 'un' } });
      if (!unidadProduccion) {
        console.error("Falta la unidad de medida 'un' en el catálogo");
        return res.status(500).json({ error: 'Falta la unidad de producción en el catálogo.' });
      }

      const hoy = new Date(fechaHoyColombia());
      const { producto, formulacion } = await prisma.$transaction(async (tx) => {
        const producto = await tx.producto.create({
          data: {
            panaderia_id: panaderiaId,
            nombre: datos.nombre,
            unidad_produccion_id: unidadProduccion.id,
            es_intermedio: datos.es_intermedio,
            precio_venta: datos.precio_venta ?? null,
          },
        });
        const formulacion = await tx.formulacion.create({
          data: {
            panaderia_id: panaderiaId,
            producto_id: producto.id,
            version: 1,
            activa: true,
            vigente_desde: hoy,
            rendimiento_esperado: datos.rendimiento,
            aprobado_por: req.usuario!.id,
            ...datosFicha(datos),
            detalle_formulacion: {
              create: datos.ingredientes.map((l) => ({
                materia_prima_id: l.materia_prima_id,
                producto_intermedio_id: l.producto_intermedio_id,
                cantidad_estandar: l.cantidad,
                unidad_id: (l.materia_prima_id ? unidadDeMateria.get(l.materia_prima_id) : gramo)!,
                tolerancia_porcentaje: l.tolerancia_porcentaje,
              })),
            },
          },
        });
        return { producto, formulacion };
      });

      res.status(201).json({ id: formulacion.id, producto_id: producto.id, version: formulacion.version });
    } catch (error) {
      if (esErrorUnico(error)) return res.status(409).json({ error: MENSAJE_CONFLICTO });
      console.error('Error al crear el producto con su formulación:', error);
      res.status(500).json({ error: 'Error al crear la formulación' });
    }
  });

  // Cambia el producto de una formulación: darlo de baja o reactivarlo, renombrarlo o fijar su precio de venta.
  // Un producto inactivo deja de salir en la lista, en los costos y en el ABC; sus versiones se conservan.
  router.patch('/:id/producto', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });
    const validado = validarCambiosProducto(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const cambios = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const base = await prisma.formulacion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { producto: true },
      });
      if (!base) return res.status(404).json({ error: 'Formulación no encontrada' });

      // No se da de baja un intermedio que otros productos vigentes usan como ingrediente
      if (cambios.activo === false && base.producto.activo) {
        const usos = await prisma.detalle_formulacion.findMany({
          where: {
            producto_intermedio_id: base.producto_id,
            formulacion: { panaderia_id: panaderiaId, activa: true, producto: { activo: true } },
          },
          include: { formulacion: { include: { producto: true } } },
        });
        if (usos.length > 0) {
          const productos = [...new Set(usos.map((u) => u.formulacion.producto.nombre))].sort();
          return res.status(409).json({
            error: `No se puede dar de baja: lo usan como ingrediente ${resumirNombres(productos)}.`,
            productos,
          });
        }
      }

      // El nombre no se repite en la panadería (sin distinguir mayúsculas), ni siquiera con productos dados de baja
      if (cambios.nombre !== undefined && cambios.nombre.toLowerCase() !== base.producto.nombre.toLowerCase()) {
        const repetido = await prisma.producto.findFirst({
          where: { panaderia_id: panaderiaId, id: { not: base.producto_id }, nombre: { equals: cambios.nombre, mode: 'insensitive' } },
          select: { id: true },
        });
        if (repetido) return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });
      }

      const actualizado = await prisma.producto.update({ where: { id: base.producto_id }, data: cambios });
      res.json({
        id: base.id,
        producto_id: base.producto_id,
        producto: actualizado.nombre,
        activo: actualizado.activo,
        precio_venta: actualizado.precio_venta == null ? null : Number(actualizado.precio_venta),
      });
    } catch (error) {
      console.error('Error al cambiar el producto:', error);
      res.status(500).json({ error: 'Error al cambiar el producto' });
    }
  });

  // Dónde se usa un producto como ingrediente: los productos vigentes cuya receta lo lleva (solo gestión).
  // Sirve para saber qué se afecta antes de cambiar o dar de baja un intermedio.
  router.get('/:id/usado-en', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });
    try {
      const panaderiaId = req.panaderiaId!;
      const base = await prisma.formulacion.findFirst({ where: { id, panaderia_id: panaderiaId }, include: { producto: true } });
      if (!base) return res.status(404).json({ error: 'Formulación no encontrada' });

      const usos = await prisma.detalle_formulacion.findMany({
        where: { producto_intermedio_id: base.producto_id, formulacion: { panaderia_id: panaderiaId, activa: true } },
        include: { formulacion: { include: { producto: true } } },
      });
      const items = usos
        .map((u) => ({
          formulacion_id: u.formulacion.id,
          producto_id: u.formulacion.producto_id,
          producto: u.formulacion.producto.nombre,
          activo: u.formulacion.producto.activo,
          cantidad_g: Number(u.cantidad_estandar),
        }))
        .sort((a, b) => a.producto.localeCompare(b.producto, 'es'));
      res.json({ producto_id: base.producto_id, producto: base.producto.nombre, es_intermedio: base.producto.es_intermedio, items });
    } catch (error) {
      console.error('Error al consultar dónde se usa el producto:', error);
      res.status(500).json({ error: 'Error al consultar dónde se usa el producto' });
    }
  });

  // Costo del lote mes a mes con lo que realmente se pagó por cada insumo (promedio ponderado de las entradas
  // del mes). Si un mes no hubo compra, rige el último precio conocido; el insumo que nunca se compró usa el
  // precio de hoy. Responde a "¿cuánto subió el costo de esta receta y por culpa de qué insumos?" (solo gestión).
  router.get('/:id/costo-historico', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });
    const pedidos = Number(req.query.meses);
    const meses = Number.isInteger(pedidos) && pedidos >= 1 && pedidos <= 36 ? pedidos : 12;

    try {
      const panaderiaId = req.panaderiaId!;
      const f = await prisma.formulacion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { detalle_formulacion: true },
      });
      if (!f) return res.status(404).json({ error: 'Formulación no encontrada' });

      const [costosHoy, recetas] = await Promise.all([costosPorUnidadBase(prisma, panaderiaId), recetasVigentes(prisma, panaderiaId)]);
      const lineas = aLineasReceta(f.detalle_formulacion);
      const rendimiento = f.rendimiento_esperado == null ? null : Number(f.rendimiento_esperado);
      const expansion = expandirLineas(lineas, recetas, f.producto_id);
      const ids = [...expansion.materias.keys()];

      const desde = new Date();
      desde.setUTCDate(1);
      desde.setUTCHours(0, 0, 0, 0);
      desde.setUTCMonth(desde.getUTCMonth() - (meses - 1));

      const [lotes, previos] = await Promise.all([
        prisma.lote.findMany({
          where: { panaderia_id: panaderiaId, materia_prima_id: { in: ids }, created_at: { gte: desde } },
          select: { materia_prima_id: true, cantidad_inicial: true, costo_unitario: true, created_at: true },
        }),
        // La última compra anterior a la ventana de cada insumo: precio de partida del primer mes
        prisma.lote.findMany({
          where: { panaderia_id: panaderiaId, materia_prima_id: { in: ids }, created_at: { lt: desde } },
          orderBy: { created_at: 'desc' },
          distinct: ['materia_prima_id'],
          select: { materia_prima_id: true, costo_unitario: true },
        }),
      ]);

      // Compras por mes y por insumo
      const compras = new Map<string, Map<string, { valor: number; cantidad: number }>>();
      for (const l of lotes) {
        const cantidad = Number(l.cantidad_inicial);
        const costo = Number(l.costo_unitario);
        if (!l.materia_prima_id || cantidad <= 0 || costo <= 0) continue;
        const mes = l.created_at.toISOString().slice(0, 7);
        const porMes = compras.get(l.materia_prima_id) ?? new Map();
        const celda = porMes.get(mes) ?? { valor: 0, cantidad: 0 };
        celda.valor += cantidad * costo;
        celda.cantidad += cantidad;
        porMes.set(mes, celda);
        compras.set(l.materia_prima_id, porMes);
      }
      const ultimo = new Map<string, number>(
        previos.filter((p) => p.materia_prima_id && Number(p.costo_unitario) > 0).map((p) => [p.materia_prima_id as string, Number(p.costo_unitario)]),
      );

      const listaMeses: string[] = [];
      for (let i = 0; i < meses; i++) {
        const d = new Date(desde);
        d.setUTCMonth(d.getUTCMonth() + i);
        listaMeses.push(d.toISOString().slice(0, 7));
      }

      const primerPrecio = new Map<string, number>();
      const puntos = listaMeses.map((mes) => {
        const costosG = new Map<string, number | null>();
        for (const idMateria of ids) {
          const celda = compras.get(idMateria)?.get(mes);
          if (celda) ultimo.set(idMateria, celda.valor / celda.cantidad);
          const precio = ultimo.get(idMateria) ?? costosHoy.get(idMateria)?.costo ?? null;
          costosG.set(idMateria, precio);
          if (precio != null && !primerPrecio.has(idMateria)) primerPrecio.set(idMateria, precio);
        }
        const { costo, incompleto } = costearLineas(lineas, recetas, f.producto_id, costosG);
        return {
          mes,
          costo_lote: redondear(costo),
          costo_unidad: rendimiento ? redondear(costo / rendimiento) : null,
          costo_incompleto: incompleto,
          con_compras: ids.filter((i) => compras.get(i)?.has(mes)).length,
        };
      });

      // Qué insumos explican el cambio: variación del precio entre el primer y el último mes, y cuánto pesa en el lote
      const nombres = new Map(
        (await prisma.materia_prima.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((m) => [m.id, m.nombre]),
      );
      const insumos = ids
        .map((idMateria) => {
          const inicial = primerPrecio.get(idMateria) ?? null;
          const final = ultimo.get(idMateria) ?? costosHoy.get(idMateria)?.costo ?? null;
          const gramos = expansion.materias.get(idMateria) ?? 0;
          return {
            materia_prima_id: idMateria,
            materia: nombres.get(idMateria) ?? 'Sin identificar',
            tiene_compras: ultimo.has(idMateria),
            costo_inicial: inicial,
            costo_final: final,
            variacion_pct: inicial != null && final != null && inicial > 0 ? redondear(((final - inicial) / inicial) * 100) : null,
            efecto_lote: inicial != null && final != null ? redondear((final - inicial) * gramos) : null,
          };
        })
        .sort((a, b) => Math.abs(b.efecto_lote ?? 0) - Math.abs(a.efecto_lote ?? 0));

      res.json({
        formulacion_id: f.id,
        meses,
        desde: desde.toISOString().slice(0, 7),
        insumos_total: ids.length,
        insumos_con_compras: insumos.filter((i) => i.tiene_compras).length,
        puntos,
        insumos,
      });
    } catch (error) {
      console.error('Error al consultar el costo histórico de la formulación:', error);
      res.status(500).json({ error: 'Error al consultar el costo histórico' });
    }
  });

  // Historial de versiones del producto de una formulación (solo gestión).
  // Los costos se calculan con los precios de hoy, no con los de la fecha de cada versión.
  router.get('/:id/versiones', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });

    try {
      const panaderiaId = req.panaderiaId!;
      const base = await prisma.formulacion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { producto: true },
      });
      if (!base) return res.status(404).json({ error: 'Formulación no encontrada' });

      const [versiones, costos, recetas] = await Promise.all([
        prisma.formulacion.findMany({
          where: { producto_id: base.producto_id, panaderia_id: panaderiaId },
          include: { detalle_formulacion: true, usuario: { select: { nombre: true } } },
          orderBy: { version: 'desc' },
        }),
        costosPorUnidadBase(prisma, panaderiaId),
        recetasVigentes(prisma, panaderiaId),
      ]);
      const costosG = costosPorGramo(costos);

      res.json({
        producto_id: base.producto_id,
        producto: base.producto.nombre,
        versiones: versiones.map((v) => {
          const { costo, incompleto } = costearLineas(
            aLineasReceta(v.detalle_formulacion),
            recetas,
            base.producto_id,
            costosG,
          );
          const rendimiento = v.rendimiento_esperado == null ? null : Number(v.rendimiento_esperado);
          return {
            id: v.id,
            version: v.version,
            activa: v.activa,
            vigente_desde: v.vigente_desde.toISOString().slice(0, 10),
            vigente_hasta: v.vigente_hasta ? v.vigente_hasta.toISOString().slice(0, 10) : null,
            rendimiento,
            ingredientes: v.detalle_formulacion.length,
            costo_lote: redondear(costo),
            costo_unidad: rendimiento ? redondear(costo / rendimiento) : null,
            costo_incompleto: incompleto,
            aprobado_por: v.usuario?.nombre ?? null,
            motivo_cambio: v.motivo_cambio,
          };
        }),
      });
    } catch (error) {
      console.error('Error al consultar las versiones:', error);
      res.status(500).json({ error: 'Error al consultar las versiones de la formulación' });
    }
  });

  // Crea la versión siguiente de la formulación de un producto. Las versiones anteriores no se modifican:
  // la vigente se cierra y la nueva pasa a ser la única activa.
  router.post('/:id/versiones', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });
    const validado = validarVersion(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const datos = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const base = await prisma.formulacion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { detalle_formulacion: true },
      });
      if (!base) return res.status(404).json({ error: 'Formulación no encontrada' });

      const vigente = await prisma.formulacion.findFirst({
        where: { producto_id: base.producto_id, panaderia_id: panaderiaId, activa: true },
        include: { detalle_formulacion: true },
      });

      if (
        vigente &&
        !hayCambios(
          {
            rendimiento: vigente.rendimiento_esperado == null ? null : Number(vigente.rendimiento_esperado),
            ingredientes: vigente.detalle_formulacion.map(aLinea),
            ...fichaDe(vigente),
          },
          datos,
        )
      ) {
        return res.status(400).json({ error: 'No hay cambios respecto a la versión vigente.' });
      }

      // Las materias primas deben ser de esta panadería y estar activas
      const idsMaterias = datos.ingredientes.map((l) => l.materia_prima_id).filter((x): x is string => !!x);
      const unidadDeMateria = await unidadesDeMaterias(panaderiaId, idsMaterias);
      if (!unidadDeMateria) {
        return res.status(400).json({
          error: 'Algún ingrediente no existe, está inactivo o no pertenece a tu panadería.',
        });
      }

      // Los intermedios que ya tenía conservan su unidad; los nuevos se revisan y van en gramos
      const unidadDeIntermedio = new Map<string, string>();
      for (const d of [...base.detalle_formulacion, ...(vigente?.detalle_formulacion ?? [])]) {
        if (d.producto_intermedio_id) unidadDeIntermedio.set(d.producto_intermedio_id, d.unidad_id);
      }
      const errorIntermedios = await revisarIntermedios(
        panaderiaId,
        base.producto_id,
        datos.ingredientes,
        new Set(unidadDeIntermedio.keys()),
      );
      if (errorIntermedios) return res.status(400).json({ error: errorIntermedios });
      let gramo: string | null = null;
      if (datos.ingredientes.some((l) => l.producto_intermedio_id && !unidadDeIntermedio.has(l.producto_intermedio_id))) {
        gramo = await unidadGramo();
        if (!gramo) {
          console.error("Falta la unidad de medida 'g' en el catálogo");
          return res.status(500).json({ error: 'Falta la unidad de gramos en el catálogo.' });
        }
      }

      const hoy = new Date(fechaHoyColombia());
      const creada = await prisma.$transaction(async (tx) => {
        const maxima = await tx.formulacion.aggregate({
          where: { producto_id: base.producto_id },
          _max: { version: true },
        });
        // Primero se cierra la vigente: la base permite una sola versión activa por producto
        if (vigente) {
          const cerradas = await tx.formulacion.updateMany({
            where: { id: vigente.id, activa: true },
            data: { activa: false, vigente_hasta: hoy },
          });
          if (cerradas.count === 0) throw new ConflictoVersion();
        }
        return tx.formulacion.create({
          data: {
            panaderia_id: panaderiaId,
            producto_id: base.producto_id,
            version: (maxima._max.version ?? 0) + 1,
            activa: true,
            vigente_desde: hoy,
            rendimiento_esperado: datos.rendimiento,
            aprobado_por: req.usuario!.id,
            ...datosFicha(datos),
            detalle_formulacion: {
              create: datos.ingredientes.map((l) => ({
                materia_prima_id: l.materia_prima_id,
                producto_intermedio_id: l.producto_intermedio_id,
                cantidad_estandar: l.cantidad,
                unidad_id: (l.materia_prima_id
                  ? unidadDeMateria.get(l.materia_prima_id)
                  : (unidadDeIntermedio.get(l.producto_intermedio_id!) ?? gramo))!,
                tolerancia_porcentaje: l.tolerancia_porcentaje,
              })),
            },
          },
        });
      });

      res.status(201).json({
        id: creada.id,
        version: creada.version,
        version_anterior: vigente ? vigente.version : null,
      });
    } catch (error) {
      if (error instanceof ConflictoVersion || esErrorUnico(error)) {
        return res.status(409).json({ error: MENSAJE_CONFLICTO });
      }
      console.error('Error al crear la versión de la formulación:', error);
      res.status(500).json({ error: 'Error al crear la versión de la formulación' });
    }
  });

  return router;
}
