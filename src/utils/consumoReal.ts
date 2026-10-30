// Consumo real de un insumo a partir de lo que se gastó al producir (Sprint 7: HU-20 y HU-21).
// Función pura: recibe "hoy" y las fechas, no lee el reloj.
import { diasEntre, sumarDias, type FechaCivil } from './calendarioEntrega';

export const VENTANA_SEMANAS = 12;

export interface SalidaConsumo {
  fecha: FechaCivil;
  cantidad: number;
}

export interface ConsumoReal {
  /** Consumo promedio por semana, en la unidad base. */
  semanal: number;
  /** Semanas completas que cubre la observación (para decidir si ya es confiable). */
  semanasObservadas: number;
  total: number;
}

/**
 * Consumo semanal promedio dentro de la ventana de observación.
 *
 * `inicioObservacion` es el primer día en que el sistema registró producción: antes de esa fecha
 * no se sabe si el insumo se usó, así que no se cuenta como "semana sin consumo". Devuelve null si no
 * hay período observado o no hubo consumo (no se inventa un cero).
 */
export function consumoReal(
  salidas: readonly SalidaConsumo[],
  hoy: FechaCivil,
  inicioObservacion: FechaCivil | null,
  ventanaSemanas = VENTANA_SEMANAS,
): ConsumoReal | null {
  if (inicioObservacion === null) return null;
  if (!Number.isInteger(ventanaSemanas) || ventanaSemanas < 1) {
    throw new RangeError('La ventana debe ser un número entero de semanas, 1 o más');
  }
  const inicioVentana = sumarDias(hoy, -(ventanaSemanas * 7 - 1));
  const desde = inicioObservacion > inicioVentana ? inicioObservacion : inicioVentana;
  const dias = diasEntre(desde, hoy) + 1;
  if (dias < 1) return null;

  let total = 0;
  for (const s of salidas) {
    if (!(s.cantidad > 0) || !Number.isFinite(s.cantidad)) continue;
    if (s.fecha < desde || s.fecha > hoy) continue;
    total += s.cantidad;
  }
  if (total <= 0) return null;
  return { semanal: total / (dias / 7), semanasObservadas: Math.floor(dias / 7), total };
}
