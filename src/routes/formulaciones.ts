import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { puedeVerCostos } from '../utils/permisos';
import { calcularCostoFormulacion } from '../utils/costeo';
import { elegirPrecio } from '../utils/precios';
import { autorizarRoles } from '../middleware/autenticacion';
import { resumirNombres } from '../utils/texto';
import {
  fechaHoyColombia,
  hayCambios,
  validarEstadoProducto,
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

  const mapa = new Map<string, { codigo: string; nombre: string; costo: number | null }>();
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
    mapa.set(m.id, { codigo: m.codigo, nombre: m.nombre, costo: elegido ? elegido.costo_por_unidad_base : null });
  }
  return mapa;
}

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

  // Lista de formulaciones activas con peso y costo por lote y por unidad
  router.get('/', async (req, res) => {
    try {
      const panaderiaId = req.panaderiaId!;
      const verCostos = puedeVerCostos(req.usuario?.rol);
      // Los productos dados de baja no salen, salvo que la gestión pida verlos
      const incluirInactivos = req.query.incluir_inactivos === 'true' && ROLES_GESTION.includes(req.usuario?.rol ?? '');
      const [formulaciones, costos] = await Promise.all([
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
      ]);

      res.json(
        formulaciones.map((f) => {
          const { peso, costo, incompleto } = calcularCostoFormulacion(
            f.detalle_formulacion.map((d) => ({
              cantidad: Number(d.cantidad_estandar),
              costo_por_unidad: d.materia_prima_id ? (costos.get(d.materia_prima_id)?.costo ?? null) : null,
            })),
          );
          const rendimiento = f.rendimiento_esperado == null ? null : Number(f.rendimiento_esperado);
          return {
            id: f.id,
            producto_id: f.producto_id,
            producto: f.producto.nombre,
            producto_activo: f.producto.activo,
            es_intermedio: f.producto.es_intermedio,
            version: f.version,
            rendimiento,
            ingredientes: f.detalle_formulacion.length,
            peso_lote_g: redondear(peso),
            costo_lote: verCostos ? redondear(costo) : null,
            costo_unidad: verCostos && rendimiento ? redondear(costo / rendimiento) : null,
            costo_incompleto: verCostos ? incompleto : false,
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

      const costos = await costosPorUnidadBase(prisma, panaderiaId);
      const idsIntermedios = f.detalle_formulacion
        .map((d) => d.producto_intermedio_id)
        .filter((x): x is string => !!x);
      const intermedios = idsIntermedios.length
        ? await prisma.producto.findMany({ where: { id: { in: idsIntermedios } } })
        : [];
      const nombreIntermedio = new Map(intermedios.map((p) => [p.id, p.nombre]));

      const { peso: pesoTotal, costo: costoTotal, incompleto } = calcularCostoFormulacion(
        f.detalle_formulacion.map((d) => ({
          cantidad: Number(d.cantidad_estandar),
          costo_por_unidad: d.materia_prima_id ? (costos.get(d.materia_prima_id)?.costo ?? null) : null,
        })),
      );

      const ingredientes = f.detalle_formulacion
        .map((d) => {
          const cantidad = Number(d.cantidad_estandar);
          const mp = d.materia_prima_id ? costos.get(d.materia_prima_id) : undefined;
          const costoUnidad = mp?.costo ?? null;
          const costo = costoUnidad == null ? null : costoUnidad * cantidad;
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
        version: f.version,
        activa: f.activa,
        vigente_desde: f.vigente_desde.toISOString().slice(0, 10),
        vigente_hasta: f.vigente_hasta ? f.vigente_hasta.toISOString().slice(0, 10) : null,
        rendimiento,
        peso_lote_g: redondear(pesoTotal),
        costo_lote: verCostos ? redondear(costoTotal) : null,
        costo_unidad: verCostos && rendimiento ? redondear(costoTotal / rendimiento) : null,
        costo_incompleto: verCostos ? incompleto : false,
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

      const idsMaterias = datos.ingredientes.map((l) => l.materia_prima_id!);
      const unidadDeMateria = await unidadesDeMaterias(panaderiaId, idsMaterias);
      if (!unidadDeMateria) {
        return res.status(400).json({
          error: 'Algún ingrediente no existe, está inactivo o no pertenece a tu panadería.',
        });
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
            es_intermedio: false,
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
            detalle_formulacion: {
              create: datos.ingredientes.map((l) => ({
                materia_prima_id: l.materia_prima_id,
                cantidad_estandar: l.cantidad,
                unidad_id: unidadDeMateria.get(l.materia_prima_id!)!,
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

  // Da de baja o reactiva el producto de una formulación. Un producto inactivo deja de salir en la lista,
  // en los costos y en el ABC; sus versiones se conservan.
  router.patch('/:id/producto', soloGestion, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Identificador no válido' });
    const validado = validarEstadoProducto(req.body);
    if (!validado.ok) return res.status(400).json({ error: validado.errores.join(' '), errores: validado.errores });
    const { activo } = validado.datos;
    const panaderiaId = req.panaderiaId!;

    try {
      const base = await prisma.formulacion.findFirst({
        where: { id, panaderia_id: panaderiaId },
        include: { producto: true },
      });
      if (!base) return res.status(404).json({ error: 'Formulación no encontrada' });

      // No se da de baja un intermedio que otros productos vigentes usan como ingrediente
      if (!activo && base.producto.activo) {
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

      await prisma.producto.update({ where: { id: base.producto_id }, data: { activo } });
      res.json({ id: base.id, producto_id: base.producto_id, producto: base.producto.nombre, activo });
    } catch (error) {
      console.error('Error al cambiar el estado del producto:', error);
      res.status(500).json({ error: 'Error al cambiar el estado del producto' });
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

      const [versiones, costos] = await Promise.all([
        prisma.formulacion.findMany({
          where: { producto_id: base.producto_id, panaderia_id: panaderiaId },
          include: { detalle_formulacion: true, usuario: { select: { nombre: true } } },
          orderBy: { version: 'desc' },
        }),
        costosPorUnidadBase(prisma, panaderiaId),
      ]);

      res.json({
        producto_id: base.producto_id,
        producto: base.producto.nombre,
        versiones: versiones.map((v) => {
          const { costo, incompleto } = calcularCostoFormulacion(
            v.detalle_formulacion.map((d) => ({
              cantidad: Number(d.cantidad_estandar),
              costo_por_unidad: d.materia_prima_id ? (costos.get(d.materia_prima_id)?.costo ?? null) : null,
            })),
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

      // Los productos intermedios solo se conservan: sumar nuevos llega con HU-10
      const unidadDeIntermedio = new Map<string, string>();
      for (const d of [...base.detalle_formulacion, ...(vigente?.detalle_formulacion ?? [])]) {
        if (d.producto_intermedio_id) unidadDeIntermedio.set(d.producto_intermedio_id, d.unidad_id);
      }
      for (const l of datos.ingredientes) {
        if (l.producto_intermedio_id && !unidadDeIntermedio.has(l.producto_intermedio_id)) {
          return res.status(400).json({
            error: 'Solo se pueden conservar los productos intermedios que ya tiene la formulación.',
          });
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
            detalle_formulacion: {
              create: datos.ingredientes.map((l) => ({
                materia_prima_id: l.materia_prima_id,
                producto_intermedio_id: l.producto_intermedio_id,
                cantidad_estandar: l.cantidad,
                unidad_id: (l.materia_prima_id
                  ? unidadDeMateria.get(l.materia_prima_id)
                  : unidadDeIntermedio.get(l.producto_intermedio_id!))!,
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
