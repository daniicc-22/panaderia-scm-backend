import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { costosPorUnidadBase, recetasVigentes } from './formulaciones';
import { aLineasReceta, demandaAnualPorMateria } from '../utils/intermedios';
import { clasificarAbc, LIMITE_A, LIMITE_B, redondear } from '../utils/abc';

const SEMANAS_AL_ANIO = 52;
const LOTES_POR_DEFECTO = 6;

// Se lee en cada petición para que los cambios al JSON apliquen sin reiniciar
function leerFrecuencias(): Record<string, number> {
  try {
    const ruta = path.join(process.cwd(), 'prisma', 'frecuencia_lotes.json');
    return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
  } catch {
    return {};
  }
}

export function crearRouterAbc(prisma: PrismaClient) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const panaderiaId = req.panaderiaId!;
      const frecuencias = leerFrecuencias();

      const [formulaciones, costos, recetas] = await Promise.all([
        prisma.formulacion.findMany({
          // Los productos dados de baja no generan demanda
          where: { panaderia_id: panaderiaId, activa: true, producto: { activo: true } },
          include: { producto: true, detalle_formulacion: true },
        }),
        costosPorUnidadBase(prisma, panaderiaId),
        recetasVigentes(prisma, panaderiaId),
      ]);

      // Demanda anual (g) = cantidad por lote x lotes por semana x 52. Un producto intermedio (masa base,
      // galleta) reparte su demanda en las materias primas de su receta según lo que lleva cada producto.
      const { demanda, sin_receta } = demandaAnualPorMateria(
        formulaciones.map((f) => ({
          producto_id: f.producto_id,
          es_intermedio: f.producto.es_intermedio,
          lotes_por_semana: frecuencias[f.producto.nombre] ?? LOTES_POR_DEFECTO,
          lineas: aLineasReceta(f.detalle_formulacion),
        })),
        recetas,
        SEMANAS_AL_ANIO,
      );
      // Intermedios que se usan pero no tienen receta: la demanda de sus insumos queda por debajo de la real
      const intermediosSinReceta = sin_receta.size
        ? (
            await prisma.producto.findMany({
              where: { id: { in: [...sin_receta] }, panaderia_id: panaderiaId },
              select: { id: true, nombre: true },
            })
          )
            .map((p) => ({ id: p.id, nombre: p.nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        : [];

      const filas = [...demanda.entries()]
        .map(([id, demandaG]) => {
          const mp = costos.get(id);
          const costoG = mp?.costo ?? 0;
          return {
            controla: mp?.controla_inventario !== false,
            codigo: mp?.codigo ?? '',
            nombre: mp?.nombre ?? 'Sin identificar',
            demanda_anual_g: demandaG,
            costo_por_g: costoG,
            valor_anual: demandaG * costoG,
          };
        })
        // Los insumos que no se compran ni se guardan (agua) no entran al ABC
        .filter((f) => f.controla);

      const { total, items, resumen } = clasificarAbc(filas);

      // Un insumo sin precio vigente entra con valor 0 (clase C): se avisa para no leerlo como dato real
      const insumosSinCosto = filas
        .filter((f) => f.costo_por_g === 0)
        .map((f) => ({ codigo: f.codigo, nombre: f.nombre }));

      res.json({
        supuestos: {
          semanas_al_anio: SEMANAS_AL_ANIO,
          lotes_por_semana_por_defecto: LOTES_POR_DEFECTO,
          limites: { A: LIMITE_A, B: LIMITE_B },
        },
        total_valor_anual: redondear(total),
        resumen,
        insumos_sin_costo: insumosSinCosto,
        intermedios_sin_receta: intermediosSinReceta,
        items,
      });
    } catch (error) {
      console.error('Error al calcular la clasificación ABC:', error);
      res.status(500).json({ error: 'Error al calcular la clasificación ABC' });
    }
  });

  return router;
}