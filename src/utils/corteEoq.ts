// Corte del análisis EOQ: convierte las recomendaciones del día en filas para `analisis_eoq`,
// la evidencia con fecha que se compara entre el antes y el después del piloto.
// Función pura: no toca la base de datos. Regla del proyecto: no se guarda nada que no se haya podido calcular.
import type { ItemRecomendacion } from './recomendaciones';

const SEMANAS_AL_ANIO = 52;

export interface FilaCorte {
  materia_prima_id: string;
  demanda_anual_d: number;
  costo_pedido_s: number | null;
  costo_mantenimiento_h: number | null;
  eoq_calculado: number | null;
  lead_time_dias: number | null;
  stock_seguridad: number | null;
  punto_reorden: number | null;
  estado: 'calculado' | 'datos_insuficientes';
  advertencias: string | null;
}

export interface ResultadoCorte {
  filas: FilaCorte[];
  /** Insumos que no se guardan porque no tienen demanda (la tabla la exige y no se inventa). */
  omitidos: { materia_prima_id: string; codigo: string; nombre: string; motivo: 'sin_demanda' }[];
}

export function armarFilasCorte(items: readonly ItemRecomendacion[]): ResultadoCorte {
  const filas: FilaCorte[] = [];
  const omitidos: ResultadoCorte['omitidos'] = [];

  for (const i of items) {
    const demandaAnual = i.modelo?.demanda_anual ?? (i.demanda_semanal === null ? null : i.demanda_semanal * SEMANAS_AL_ANIO);
    if (demandaAnual === null || !(demandaAnual > 0)) {
      omitidos.push({ materia_prima_id: i.materia_prima_id, codigo: i.codigo, nombre: i.nombre, motivo: 'sin_demanda' });
      continue;
    }

    const calculado = i.eoq !== null && i.modelo !== null;
    // Para poder rastrear la cifra: de dónde salió la demanda, qué faltaba y qué se advirtió
    const notas = [
      i.demanda_origen ? `demanda:${i.demanda_origen}` : null,
      ...i.faltantes.map((f) => `falta:${f}`),
      ...i.advertencias,
    ].filter((n): n is string => n !== null);

    filas.push({
      materia_prima_id: i.materia_prima_id,
      demanda_anual_d: Math.round(demandaAnual * 1000) / 1000,
      costo_pedido_s: calculado ? i.modelo!.costo_pedido : null,
      costo_mantenimiento_h: calculado ? i.modelo!.costo_mantener : null,
      eoq_calculado: calculado ? i.eoq : null,
      lead_time_dias: i.plazo_dias,
      stock_seguridad: i.stock_seguridad,
      punto_reorden: i.punto_reorden_calendario,
      estado: calculado ? 'calculado' : 'datos_insuficientes',
      advertencias: notas.length > 0 ? notas.join(', ') : null,
    });
  }
  return { filas, omitidos };
}
