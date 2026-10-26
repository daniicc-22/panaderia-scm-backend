// Peso real de los insumos y cierre de la producción (HU-16 y HU-11), sin acceso a base de datos.
import { UUID } from './materiaPrima';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

export const PESO_MAX = 1_000_000; // en la unidad base del insumo (gramos)
export const PESOS_MAX_ITEMS = 200;
export const PRODUCIDA_MAX = 10_000_000;
// Fuera de este rango frente a lo planificado se muestra un aviso (no bloquea: una tanda puede salir distinta)
export const RENDIMIENTO_AVISO_MIN = 50;
export const RENDIMIENTO_AVISO_MAX = 150;

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Pesos reales que el operario escribió, por insumo y para toda la producción. Un insumo sin peso
 * (null o ausente) es un insumo «al ojo»: se usará el estándar. Sin lista, nada se pesó.
 */
export function validarPesos(raw: unknown): Resultado<Map<string, number>> {
  const pesos = new Map<string, number>();
  if (raw === undefined || raw === null) return { ok: true, datos: pesos };
  if (!Array.isArray(raw)) return { ok: false, errores: ['Los pesos reales deben enviarse como una lista.'] };
  if (raw.length > PESOS_MAX_ITEMS) return { ok: false, errores: [`Hay demasiados pesos (máximo ${PESOS_MAX_ITEMS}).`] };
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errores.push('Un peso real no tiene el formato esperado.');
      continue;
    }
    const { materia_prima_id: id, peso_real: peso } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !UUID.test(id)) {
      errores.push('Un peso real trae un insumo no válido.');
      continue;
    }
    if (vistos.has(id)) {
      errores.push('Hay un insumo repetido en los pesos reales.');
      continue;
    }
    vistos.add(id);
    if (peso === null || peso === undefined) continue; // al ojo
    if (typeof peso !== 'number' || !Number.isFinite(peso) || peso <= 0 || peso > PESO_MAX) {
      errores.push(`El peso real debe ser un número mayor que 0 y no superar ${PESO_MAX.toLocaleString('es-CO')}.`);
      continue;
    }
    const r = redondear(peso);
    if (r <= 0) {
      errores.push('Un peso real es demasiado pequeño.');
      continue;
    }
    pesos.set(id, r);
  }
  if (errores.length > 0) return { ok: false, errores: [...new Set(errores)] };
  return { ok: true, datos: pesos };
}

export interface LineaPesaje {
  materia_prima_id: string;
  peso_estandar: number;
  peso_real: number;
  pesado: boolean;
}

/** Cantidad que se usará de cada insumo: el peso real si se pesó y, si no, el estándar de la receta. */
export function aplicarPesos(
  estandar: ReadonlyMap<string, number>,
  pesos: ReadonlyMap<string, number>,
): { efectivas: Map<string, number>; lineas: LineaPesaje[]; ajenos: string[] } {
  const efectivas = new Map<string, number>();
  const lineas: LineaPesaje[] = [];
  for (const [id, est] of estandar) {
    const real = pesos.get(id);
    const pesado = real !== undefined;
    const usado = pesado ? real : est;
    efectivas.set(id, usado);
    lineas.push({ materia_prima_id: id, peso_estandar: est, peso_real: usado, pesado });
  }
  const ajenos = [...pesos.keys()].filter((id) => !estandar.has(id));
  return { efectivas, lineas, ajenos };
}

/** (real − estándar) / estándar × 100, con dos decimales. Nulo si no hay estándar. */
export function desviacionPct(real: number, estandar: number): number | null {
  if (!(estandar > 0)) return null;
  return Math.round(((real - estandar) / estandar) * 10000) / 100;
}

/** Producido frente a lo planificado, en porcentaje con un decimal. Nulo si no había plan. */
export function rendimientoPct(producida: number | null, planificada: number | null): number | null {
  if (producida === null || planificada === null || !(planificada > 0)) return null;
  return Math.round((producida / planificada) * 1000) / 10;
}

export interface DatosFinalizacion {
  cantidad_producida: number;
}

export function validarFinalizacion(body: unknown): Resultado<DatosFinalizacion> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  }
  const c = (body as Record<string, unknown>).cantidad_producida;
  if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || c > PRODUCIDA_MAX) {
    return { ok: false, errores: [`La cantidad producida debe ser un número mayor que 0 y no superar ${PRODUCIDA_MAX.toLocaleString('es-CO')}.`] };
  }
  const r = redondear(c);
  if (r <= 0) return { ok: false, errores: ['La cantidad producida es demasiado pequeña.'] };
  return { ok: true, datos: { cantidad_producida: r } };
}

/** Aviso (no bloqueo) cuando lo producido se aleja mucho de lo planificado. */
export function avisoRendimiento(producida: number, planificada: number | null): string | null {
  const pct = rendimientoPct(producida, planificada);
  if (pct === null) return null;
  if (pct < RENDIMIENTO_AVISO_MIN || pct > RENDIMIENTO_AVISO_MAX) {
    return `Lo producido es el ${pct.toLocaleString('es-CO')} % de lo planificado. Revisa que la cantidad esté bien escrita.`;
  }
  return null;
}
