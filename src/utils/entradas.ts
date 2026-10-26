// Reglas de las entradas de inventario (recepción de mercancía con lote), sin acceso a base de datos.
import { UUID } from './materiaPrima';
import type { CriterioRotacion } from './materiaPrima';

export const CANTIDAD_MAX = 1_000_000;
export const CODIGO_LOTE_MAX = 60;
export const VENCIMIENTO_ANIOS_MAX = 10;

export interface DatosEntrada {
  materia_prima_id: string;
  presentacion_id: string;
  proveedor_id: string | null; // si no se indica, se usa la mejor oferta vigente
  cantidad: number; // en presentaciones (p. ej. 2 bultos)
  fecha_vencimiento: string | null; // AAAA-MM-DD
  codigo_lote: string | null;
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Verifica que el texto sea una fecha real del calendario (rechaza 2026-02-30). */
export function fechaValida(texto: string): boolean {
  const m = FECHA.exec(texto);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(y, mo - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d;
}

/** Fecha de hoy en Colombia (UTC-5, sin horario de verano) como AAAA-MM-DD. */
export function hoyColombia(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

function texto(valor: unknown, max: number, nombre: string, errores: string[]): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') {
    errores.push(`${nombre} no es válido.`);
    return null;
  }
  const t = valor.trim().replace(/\s+/g, ' ');
  if (t === '') return null;
  if (t.length > max) {
    errores.push(`${nombre} no puede superar ${max} caracteres.`);
    return null;
  }
  return t;
}

export function validarEntrada(body: unknown): Resultado<DatosEntrada> {
  if (!esObjeto(body)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  const mp = body.materia_prima_id;
  if (typeof mp !== 'string' || !UUID.test(mp)) errores.push('El insumo no es válido.');
  const pr = body.presentacion_id;
  if (typeof pr !== 'string' || !UUID.test(pr)) errores.push('La presentación no es válida.');

  let proveedor: string | null = null;
  const pv = body.proveedor_id;
  if (pv !== null && pv !== undefined && pv !== '') {
    if (typeof pv !== 'string' || !UUID.test(pv)) errores.push('El proveedor no es válido.');
    else proveedor = pv;
  }

  let cantidad = 0;
  const c = body.cantidad;
  if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || c > CANTIDAD_MAX) {
    errores.push(`La cantidad debe ser un número mayor que 0 y no superar ${CANTIDAD_MAX.toLocaleString('es-CO')}.`);
  } else {
    cantidad = redondear(c, 3);
    if (cantidad <= 0) errores.push('La cantidad es demasiado pequeña.');
  }

  let fecha: string | null = null;
  const f = body.fecha_vencimiento;
  if (f !== null && f !== undefined && f !== '') {
    if (typeof f !== 'string' || !fechaValida(f)) errores.push('La fecha de vencimiento no es válida (use AAAA-MM-DD).');
    else fecha = f;
  }

  const codigo = texto(body.codigo_lote, CODIGO_LOTE_MAX, 'El código de lote', errores);

  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      materia_prima_id: mp as string,
      presentacion_id: pr as string,
      proveedor_id: proveedor,
      cantidad,
      fecha_vencimiento: fecha,
      codigo_lote: codigo,
    },
  };
}

/** Reglas que dependen del día y del insumo: FEFO exige vencimiento; no se recibe vencido ni a más de 10 años. */
export function verificarVencimiento(fecha: string | null, hoy: string, criterio: CriterioRotacion | null): string[] {
  const errores: string[] = [];
  if (fecha === null) {
    if (criterio === 'FEFO') errores.push('Este insumo se maneja por vencimiento (FEFO): indique la fecha de vencimiento.');
    return errores;
  }
  if (fecha < hoy) errores.push('No se puede recibir mercancía ya vencida.');
  const limite = `${Number(hoy.slice(0, 4)) + VENCIMIENTO_ANIOS_MAX}${hoy.slice(4)}`;
  if (fecha > limite) errores.push(`La fecha de vencimiento no puede superar ${VENCIMIENTO_ANIOS_MAX} años.`);
  return errores;
}

/** Cantidad recibida en unidad base (p. ej. 2 bultos × 50 000 g = 100 000 g). */
export const cantidadBase = (cantidad: number, contenido: number): number => redondear(cantidad * contenido, 3);

/** Costo por unidad base: precio de la presentación / contenido. */
export const costoUnitario = (precio: number, contenido: number): number => redondear(precio / contenido, 4);

/** Código de lote generado cuando el operario no escribe uno: L-AAAAMMDD-NNN. */
export const codigoGenerado = (hoy: string, secuencia: number): string =>
  `L-${hoy.replace(/-/g, '')}-${String(secuencia).padStart(3, '0')}`;

export const VENCIMIENTO_DESDE_MIN = '2020-01-01';

/**
 * Corrección de la fecha de vencimiento de un lote ya registrado. A diferencia de una entrada, admite una fecha
 * pasada (el lote pudo vencerse de verdad), pero no una absurda; FEFO sigue exigiendo fecha.
 */
export function validarNuevoVencimiento(
  body: unknown,
  hoy: string,
  criterio: CriterioRotacion | null,
): { ok: true; fecha: string | null } | { ok: false; errores: string[] } {
  if (!esObjeto(body)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const f = body.fecha_vencimiento;
  if (f === undefined) return { ok: false, errores: ['Indica la fecha de vencimiento.'] };
  if (f === null || f === '') {
    return criterio === 'FEFO'
      ? { ok: false, errores: ['Este insumo se maneja por vencimiento (FEFO): indique la fecha de vencimiento.'] }
      : { ok: true, fecha: null };
  }
  if (typeof f !== 'string' || !fechaValida(f)) return { ok: false, errores: ['La fecha de vencimiento no es válida (use AAAA-MM-DD).'] };
  const errores: string[] = [];
  if (f < VENCIMIENTO_DESDE_MIN) errores.push('La fecha de vencimiento es demasiado antigua.');
  const limite = `${Number(hoy.slice(0, 4)) + VENCIMIENTO_ANIOS_MAX}${hoy.slice(4)}`;
  if (f > limite) errores.push(`La fecha de vencimiento no puede superar ${VENCIMIENTO_ANIOS_MAX} años.`);
  return errores.length > 0 ? { ok: false, errores } : { ok: true, fecha: f };
}
