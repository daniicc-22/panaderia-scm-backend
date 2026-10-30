import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { costosPorUnidadBase, recetasVigentes } from './formulaciones';
import { aLineasReceta, demandaAnualPorMateria } from '../utils/intermedios';
import { clasificarAbc, LIMITE_A, LIMITE_B, redondear } from '../utils/abc';
import { cargarConsumoReal } from '../datos/consumoReal';
import { hoyColombia } from '../utils/entradas';

const SEMANAS_AL_ANIO = 52;
const LOTES_POR_DEFECTO = 6;
// Semanas de consumo real que se piden antes de fiarse de él (igual que la reposición)
export const SEMANAS_MINIMAS_REAL = 4;

export type FuenteAbc = 'estimada' | 'real';

// Se lee en cada petición para que los cambios al JSON apliquen sin reiniciar
function leerFrecuencias(): Record<string, number> {
  try {
    const ruta = path.join(process.cwd(), 'prisma', 'frecuencia_lotes.json');
    return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Clasificación ABC. Con `fuente = 'estimada'` la demanda sale de las recetas y de los lotes por semana;
 * con `'real'`, de lo que se gastó al producir (solo insumos con al menos 4 semanas de consumo).
 * Devuelve también la demanda anual por insumo (en gramos) con la que se calculó.
 */
export async function calcularAbc(
  prisma: PrismaClient,
  panaderiaId: string,
  fuente: FuenteAbc = 'estimada',
  hoy: string = hoyColombia(),
) {
  const costos = await costosPorUnidadBase(prisma, panaderiaId);

  let demanda = new Map<string, number>();
  let intermediosSinReceta: { id: string; nombre: string }[] = [];
  let sinConsumoReal: { codigo: string; nombre: string; semanas_observadas: number }[] = [];

  if (fuente === 'estimada') {
    const frecuencias = leerFrecuencias();
    const [formulaciones, recetas] = await Promise.all([
      prisma.formulacion.findMany({
        // Los productos dados de baja no generan demanda
        where: { panaderia_id: panaderiaId, activa: true, producto: { activo: true } },
        include: { producto: true, detalle_formulacion: true },
      }),
      recetasVigentes(prisma, panaderiaId),
    ]);

    // Demanda anual (g) = cantidad por lote x lotes por semana x 52. Un producto intermedio (masa base,
    // galleta) reparte su demanda en las materias primas de su receta según lo que lleva cada producto.
    const calculo = demandaAnualPorMateria(
      formulaciones.map((f) => ({
        producto_id: f.producto_id,
        es_intermedio: f.producto.es_intermedio,
        lotes_por_semana: frecuencias[f.producto.nombre] ?? LOTES_POR_DEFECTO,
        lineas: aLineasReceta(f.detalle_formulacion),
      })),
      recetas,
      SEMANAS_AL_ANIO,
    );
    demanda = calculo.demanda;
    // Intermedios que se usan pero no tienen receta: la demanda de sus insumos queda por debajo de la real
    intermediosSinReceta = calculo.sin_receta.size
      ? (
          await prisma.producto.findMany({
            where: { id: { in: [...calculo.sin_receta] }, panaderia_id: panaderiaId },
            select: { id: true, nombre: true },
          })
        )
          .map((p) => ({ id: p.id, nombre: p.nombre }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      : [];
  } else {
    const consumo = await cargarConsumoReal(prisma, panaderiaId, hoy);
    for (const [id, c] of consumo) {
      if (c.semanasObservadas >= SEMANAS_MINIMAS_REAL) demanda.set(id, c.semanal * SEMANAS_AL_ANIO);
    }
    // Insumos que se controlan pero aún no tienen consumo real suficiente: se avisan, no se estiman
    sinConsumoReal = [...costos]
      .filter(([id, mp]) => mp.controla_inventario && !demanda.has(id))
      .map(([id, mp]) => ({ codigo: mp.codigo, nombre: mp.nombre, semanas_observadas: consumo.get(id)?.semanasObservadas ?? 0 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

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

  const cuerpo = {
    fuente,
    supuestos: {
      semanas_al_anio: SEMANAS_AL_ANIO,
      lotes_por_semana_por_defecto: LOTES_POR_DEFECTO,
      limites: { A: LIMITE_A, B: LIMITE_B },
      ...(fuente === 'real' ? { semanas_minimas_consumo_real: SEMANAS_MINIMAS_REAL } : {}),
    },
    total_valor_anual: redondear(total),
    resumen,
    insumos_sin_costo: insumosSinCosto,
    intermedios_sin_receta: intermediosSinReceta,
    ...(fuente === 'real' ? { insumos_sin_consumo_real: sinConsumoReal, datos_insuficientes: items.length === 0 } : {}),
    items,
  };
  return { cuerpo, demandaAnualG: demanda };
}

export function crearRouterAbc(prisma: PrismaClient, ahora: () => Date = () => new Date()) {
  const router = Router();

  router.get('/', async (req, res) => {
    const f = req.query.fuente;
    if (f !== undefined && f !== 'estimada' && f !== 'real') {
      return res.status(400).json({ error: 'La fuente debe ser "estimada" o "real".' });
    }
    try {
      const { cuerpo } = await calcularAbc(prisma, req.panaderiaId!, f ?? 'estimada', hoyColombia(ahora()));
      res.json(cuerpo);
    } catch (error) {
      console.error('Error al calcular la clasificación ABC:', error);
      res.status(500).json({ error: 'Error al calcular la clasificación ABC' });
    }
  });

  return router;
}
