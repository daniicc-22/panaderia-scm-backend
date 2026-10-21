import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { costosPorUnidadBase } from './formulaciones';
import { clasificarAbc, LIMITE_A, LIMITE_B, redondear } from '../utils/abc';

const SEMANAS_AL_ANIO = 52;
const LOTES_POR_DEFECTO = 6;

// Insumos que no se compran ni se almacenan (no entran al ABC)
const CODIGOS_EXCLUIDOS = new Set(['MP-008']); // Agua

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

      const [formulaciones, costos] = await Promise.all([
        prisma.formulacion.findMany({
          where: { panaderia_id: panaderiaId, activa: true },
          include: { producto: true, detalle_formulacion: true },
        }),
        costosPorUnidadBase(prisma, panaderiaId),
      ]);

      // Demanda anual (g) = cantidad por lote x lotes por semana x 52
      const demanda = new Map<string, number>();
      for (const f of formulaciones) {
        const lotes = frecuencias[f.producto.nombre] ?? LOTES_POR_DEFECTO;
        for (const d of f.detalle_formulacion) {
          if (!d.materia_prima_id) continue;
          const anual = Number(d.cantidad_estandar) * lotes * SEMANAS_AL_ANIO;
          demanda.set(d.materia_prima_id, (demanda.get(d.materia_prima_id) ?? 0) + anual);
        }
      }

      const filas = [...demanda.entries()]
        .map(([id, demandaG]) => {
          const mp = costos.get(id);
          const costoG = mp?.costo ?? 0;
          return {
            codigo: mp?.codigo ?? '',
            nombre: mp?.nombre ?? 'Sin identificar',
            demanda_anual_g: demandaG,
            costo_por_g: costoG,
            valor_anual: demandaG * costoG,
          };
        })
        .filter((f) => !CODIGOS_EXCLUIDOS.has(f.codigo));

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
        items,
      });
    } catch (error) {
      console.error('Error al calcular la clasificación ABC:', error);
      res.status(500).json({ error: 'Error al calcular la clasificación ABC' });
    }
  });

  return router;
}