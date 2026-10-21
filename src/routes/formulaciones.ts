import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { puedeVerCostos } from '../utils/permisos';
import { calcularCostoFormulacion } from '../utils/costeo';
import { elegirPrecio } from '../utils/precios';

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


export function crearRouterFormulaciones(prisma: PrismaClient) {
  const router = Router();

  // Lista de formulaciones activas con peso y costo por lote y por unidad
  router.get('/', async (req, res) => {
    try {
      const panaderiaId = req.panaderiaId!;
      const verCostos = puedeVerCostos(req.usuario?.rol);
      const [formulaciones, costos] = await Promise.all([
        prisma.formulacion.findMany({
          where: { panaderia_id: panaderiaId, activa: true },
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
            producto: f.producto.nombre,
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
        producto: f.producto.nombre,
        version: f.version,
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

  return router;
}
