// Validación del calendario de entrega de un proveedor (Sprint 7), sin acceso a base de datos.
import { normalizarDiasEntrega } from './calendarioEntrega';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

export interface DatosEntrega {
  /** 0 = domingo ... 6 = sábado. Vacío = sin definir. */
  dias_entrega: number[];
  hora_limite_pedido: string | null;
  pedido_minimo: number | null;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** Reemplaza el calendario completo: todos los campos se envían (null / [] para dejar sin definir). */
export function validarEntrega(cuerpo: unknown): Resultado<DatosEntrega> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  let dias: number[] = [];
  if (!Array.isArray(cuerpo.dias_entrega)) {
    errores.push('Los días de entrega deben ser una lista (puede estar vacía).');
  } else if (cuerpo.dias_entrega.length > 0) {
    try {
      dias = normalizarDiasEntrega(cuerpo.dias_entrega as number[]);
    } catch {
      errores.push('Los días de entrega van de 0 (domingo) a 6 (sábado).');
    }
  }

  let hora: string | null = null;
  const h = cuerpo.hora_limite_pedido;
  if (h !== null && h !== undefined) {
    if (typeof h !== 'string' || !HORA.test(h)) errores.push('La hora límite debe tener el formato HH:MM, de 00:00 a 23:59.');
    else hora = h;
  }

  let minimo: number | null = null;
  const m = cuerpo.pedido_minimo;
  if (m !== null && m !== undefined) {
    if (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m >= 1e10) {
      errores.push('El pedido mínimo debe ser un número mayor o igual que 0.');
    } else if (Math.round(m * 100) / 100 !== m) {
      errores.push('El pedido mínimo admite hasta 2 decimales.');
    } else {
      minimo = m;
    }
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { dias_entrega: dias, hora_limite_pedido: hora, pedido_minimo: minimo } };
}
