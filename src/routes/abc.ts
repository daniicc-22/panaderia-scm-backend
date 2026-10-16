import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { costosPorUnidadBase } from './formulaciones';

const SEMANAS_AL_ANIO = 52;
const LOTES_POR_DEFECTO = 6;
const LIMITE_A = 80;
const LIMITE_B = 95;

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

const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

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

      filas.sort((a, b) => b.valor_anual - a.valor_anual);
      const total = filas.reduce((s, f) => s + f.valor_anual, 0);

      // Clase según el acumulado ANTES de sumar el insumo:
      // el que cruza el 80 % sigue siendo A.
      let acumulado = 0;
      const items = filas.map((f) => {
        const clase = acumulado < LIMITE_A ? 'A' : acumulado < LIMITE_B ? 'B' : 'C';
        const porcentaje = total > 0 ? (f.valor_anual / total) * 100 : 0;
        acumulado += porcentaje;
        return {
          codigo: f.codigo,
          nombre: f.nombre,
          demanda_anual_kg: redondear(f.demanda_anual_g / 1000),
          costo_por_kg: redondear(f.costo_por_g * 1000),
          valor_anual: redondear(f.valor_anual),
          porcentaje: redondear(porcentaje),
          porcentaje_acumulado: redondear(acumulado),
          clase,
        };
      });

      const resumen = (['A', 'B', 'C'] as const).map((clase) => {
        const grupo = items.filter((i) => i.clase === clase);
        const valor = grupo.reduce((s, i) => s + i.valor_anual, 0);
        return {
          clase,
          insumos: grupo.length,
          valor_anual: redondear(valor),
          porcentaje: total > 0 ? redondear((valor / total) * 100) : 0,
        };
      });

      res.json({
        supuestos: {
          semanas_al_anio: SEMANAS_AL_ANIO,
          lotes_por_semana_por_defecto: LOTES_POR_DEFECTO,
          limites: { A: LIMITE_A, B: LIMITE_B },
        },
        total_valor_anual: redondear(total),
        resumen,
        items,
      });
    } catch (error) {
      console.error('Error al calcular la clasificación ABC:', error);
      res.status(500).json({ error: 'Error al calcular la clasificación ABC' });
    }
  });

  return router;
}