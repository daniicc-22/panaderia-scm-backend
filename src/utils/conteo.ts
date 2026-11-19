// Reglas del conteo físico de inventario (HU-14), sin acceso a base de datos (se prueban solas).
import { UUID } from './materiaPrima';

export const MOTIVOS = ['error_registro', 'error_produccion', 'vencimiento', 'perdida_dano', 'otro'] as const;
export type Motivo = (typeof MOTIVOS)[number];

export const ETIQUETA_MOTIVO: Record<Motivo, string> = {
  error_registro: 'Error de registro (entrada o salida mal anotada)',
  error_produccion: 'Error en una producción',
  vencimiento: 'Baja por vencimiento',
  perdida_dano: 'Pérdida o daño',
  otro: 'Otro',
};

export const CANTIDAD_MAX = 1_000_000;
export const OBSERVACIONES_MAX = 300;
export const OBSERVACION_OTRO_MIN = 3;

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function validarTextoOpcional(valor: unknown, etiqueta: string, errores: string[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    errores.push(`${etiqueta} no es válido.`);
    return null;
  }
  const t = valor.trim().replace(/\s+/g, ' ');
  if (t === '') return null;
  if (t.length > OBSERVACIONES_MAX) {
    errores.push(`${etiqueta} no puede superar los ${OBSERVACIONES_MAX} caracteres.`);
    return null;
  }
  return t;
}

/** Datos para abrir un conteo. */
export function validarNuevoConteo(body: unknown): Resultado<{ observaciones: string | null }> {
  if (body === undefined || body === null) return { ok: true, datos: { observaciones: null } };
  if (!esObjeto(body)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  const observaciones = validarTextoOpcional(body.observaciones, 'Las observaciones', errores);
  return errores.length > 0 ? { ok: false, errores } : { ok: true, datos: { observaciones } };
}

export interface DatosLinea {
  lote_id: string;
  cantidad_contada: number;
  motivo: Motivo | null;
  observaciones: string | null;
}

/** Una línea del conteo: lo que se contó de un lote. El motivo se revisa aparte, con la diferencia. */
export function validarLinea(body: unknown): Resultado<DatosLinea> {
  if (!esObjeto(body)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  if (typeof body.lote_id !== 'string' || !UUID.test(body.lote_id)) errores.push('El lote no es válido.');

  let cantidad = 0;
  if (typeof body.cantidad_contada !== 'number' || !Number.isFinite(body.cantidad_contada)) {
    errores.push('La cantidad contada debe ser un número.');
  } else if (body.cantidad_contada < 0 || body.cantidad_contada > CANTIDAD_MAX) {
    errores.push(`La cantidad contada debe estar entre 0 y ${CANTIDAD_MAX.toLocaleString('es-CO')}.`);
  } else {
    cantidad = redondear(body.cantidad_contada);
  }

  let motivo: Motivo | null = null;
  if (body.motivo !== undefined && body.motivo !== null && body.motivo !== '') {
    if (typeof body.motivo !== 'string' || !(MOTIVOS as readonly string[]).includes(body.motivo)) {
      errores.push('El motivo no es válido.');
    } else {
      motivo = body.motivo as Motivo;
    }
  }
  const observaciones = validarTextoOpcional(body.observaciones, 'Las observaciones', errores);

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { lote_id: body.lote_id as string, cantidad_contada: cantidad, motivo, observaciones } };
}

/** Contada menos sistema: positiva si sobra, negativa si falta. */
export const diferencia = (sistema: number, contada: number): number => redondear(contada - sistema);

/**
 * Motivo y observaciones que se guardan según la diferencia. Sin diferencia no hay nada que explicar
 * (se descartan); con diferencia el motivo es obligatorio, "vencimiento" solo sirve para dar de baja
 * (faltante) y "otro" exige una observación.
 */
export function revisarMotivo(
  dif: number,
  motivo: Motivo | null,
  observaciones: string | null,
): Resultado<{ motivo: Motivo | null; observaciones: string | null }> {
  if (dif === 0) return { ok: true, datos: { motivo: null, observaciones: null } };
  if (motivo === null) return { ok: false, errores: ['Indica el motivo de la diferencia.'] };
  if (motivo === 'vencimiento' && dif > 0) {
    return { ok: false, errores: ['La baja por vencimiento solo aplica cuando falta producto, no cuando sobra.'] };
  }
  if (motivo === 'otro' && (observaciones ?? '').length < OBSERVACION_OTRO_MIN) {
    return { ok: false, errores: ['Con el motivo "Otro" explica qué pasó en las observaciones.'] };
  }
  return { ok: true, datos: { motivo, observaciones } };
}

export interface LineaConteo {
  cantidad_sistema: number;
  cantidad_contada: number;
}

/** Exactitud de un lote entre 0 y 1: lo menor entre lo contado y lo del sistema, sobre lo mayor. */
export function exactitudLinea(sistema: number, contada: number): number {
  const mayor = Math.max(sistema, contada);
  if (mayor === 0) return 1;
  return Math.min(sistema, contada) / mayor;
}

export interface ResumenConteo {
  lotes: number;
  exactos: number; // lotes sin diferencia
  faltantes: number; // lotes donde se contó menos de lo que dice el sistema
  sobrantes: number; // lotes donde se contó más
  // Exactitud de inventario (ERI) en %, con 2 decimales; null si no hay lotes contados
  eri: number | null;
}

/**
 * ERI de un conteo: promedio de la exactitud de cada lote contado, en %. Con un faltante equivale a
 * (inventario físico / inventario en sistema) × 100; un sobrante se trata igual de grave que un faltante.
 * No suma gramos con unidades distintas porque promedia razones.
 */
export function resumirConteo(lineas: readonly LineaConteo[]): ResumenConteo {
  let exactos = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let suma = 0;
  for (const l of lineas) {
    const d = diferencia(l.cantidad_sistema, l.cantidad_contada);
    if (d === 0) exactos += 1;
    else if (d < 0) faltantes += 1;
    else sobrantes += 1;
    suma += d === 0 ? 1 : exactitudLinea(l.cantidad_sistema, l.cantidad_contada);
  }
  return {
    lotes: lineas.length,
    exactos,
    faltantes,
    sobrantes,
    eri: lineas.length === 0 ? null : redondear((suma / lineas.length) * 100, 2),
  };
}

/** Meta del documento del proyecto para la exactitud de inventario. */
export const META_ERI = 95;

export interface DatosCorreccion {
  cantidad_nueva: number;
  motivo: Motivo;
  observaciones: string | null;
}

/**
 * Corrección manual de las existencias de un lote (cuando el registro quedó mal). La cantidad nueva es lo que
 * realmente hay; el motivo es obligatorio porque queda como un ajuste en el historial del inventario.
 */
export function validarCorreccion(body: unknown): Resultado<DatosCorreccion> {
  if (!esObjeto(body)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  let cantidad = 0;
  if (typeof body.cantidad_nueva !== 'number' || !Number.isFinite(body.cantidad_nueva)) {
    errores.push('La cantidad debe ser un número.');
  } else if (body.cantidad_nueva < 0 || body.cantidad_nueva > CANTIDAD_MAX) {
    errores.push(`La cantidad debe estar entre 0 y ${CANTIDAD_MAX.toLocaleString('es-CO')}.`);
  } else {
    cantidad = redondear(body.cantidad_nueva);
  }

  let motivo: Motivo | null = null;
  if (typeof body.motivo !== 'string' || !(MOTIVOS as readonly string[]).includes(body.motivo)) {
    errores.push('Elige el motivo de la corrección.');
  } else {
    motivo = body.motivo as Motivo;
  }
  const observaciones = validarTextoOpcional(body.observaciones, 'Las observaciones', errores);

  if (errores.length > 0 || motivo === null) return { ok: false, errores };
  return { ok: true, datos: { cantidad_nueva: cantidad, motivo, observaciones } };
}

// Orden del conteo cíclico: primero la clase A (lo que más pesa en el costo), luego B, C y lo que no tiene clase
export function rangoClaseAbc(clase: string | null | undefined): number {
  return clase === 'A' ? 0 : clase === 'B' ? 1 : clase === 'C' ? 2 : 3;
}
