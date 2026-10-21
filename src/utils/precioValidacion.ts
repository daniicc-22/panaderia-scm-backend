// Validación de presentaciones y ofertas de precio, sin acceso a base de datos (se prueban solas).
import { normalizarNombre, UUID } from './materiaPrima';

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 100;
// Límites de las columnas decimales de la base: contenido Decimal(12,4) y precio Decimal(12,2)
export const CONTENIDO_MAX = 99_999_999;
export const PRECIO_MAX = 9_999_999_999;
export const ENTREGA_MAX = 365;

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function nombre(valor: unknown, errores: string[]): string | undefined {
  if (typeof valor !== 'string') {
    errores.push('El nombre es obligatorio.');
    return undefined;
  }
  const n = normalizarNombre(valor);
  if (n.length < NOMBRE_MIN || n.length > NOMBRE_MAX) {
    errores.push(`El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`);
    return undefined;
  }
  return n;
}

function contenido(valor: unknown, errores: string[]): number | undefined {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > CONTENIDO_MAX) {
    errores.push(`El contenido debe ser un número mayor que 0 y no superar ${CONTENIDO_MAX.toLocaleString('es-CO')}.`);
    return undefined;
  }
  const r = redondear(valor, 4);
  if (r <= 0) {
    errores.push('El contenido es demasiado pequeño.');
    return undefined;
  }
  return r;
}

function precio(valor: unknown, errores: string[]): number | undefined {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > PRECIO_MAX) {
    errores.push(`El precio debe ser un número mayor que 0 y no superar ${PRECIO_MAX.toLocaleString('es-CO')}.`);
    return undefined;
  }
  const r = redondear(valor, 2);
  if (r <= 0) {
    errores.push('El precio es demasiado pequeño.');
    return undefined;
  }
  return r;
}

function entrega(valor: unknown, errores: string[]): number | null | undefined {
  if (valor === null) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > ENTREGA_MAX) {
    errores.push(`El tiempo de entrega debe ser un número de días entre 0 y ${ENTREGA_MAX}.`);
    return undefined;
  }
  return redondear(valor, 2);
}

function soloCamposPermitidos(cuerpo: Record<string, unknown>, permitidos: string[], errores: string[]) {
  for (const campo of Object.keys(cuerpo)) {
    if (!permitidos.includes(campo)) errores.push(`El campo ${campo} no se puede enviar aquí.`);
  }
}

// ---- Presentaciones ----
// La unidad del contenido no se envía: siempre es la unidad base de la materia prima

export interface DatosPresentacion {
  nombre: string;
  contenido: number;
}

export function validarPresentacionCrear(cuerpo: unknown): Resultado<DatosPresentacion> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  soloCamposPermitidos(cuerpo, ['nombre', 'contenido'], errores);
  const n = nombre(cuerpo.nombre, errores);
  const c = contenido(cuerpo.contenido, errores);
  if (errores.length > 0 || n === undefined || c === undefined) return { ok: false, errores };
  return { ok: true, datos: { nombre: n, contenido: c } };
}

export type CambiosPresentacion = Partial<DatosPresentacion> & { activa?: boolean };

export function validarPresentacionEditar(cuerpo: unknown): Resultado<CambiosPresentacion> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  soloCamposPermitidos(cuerpo, ['nombre', 'contenido', 'activa'], errores);
  const cambios: CambiosPresentacion = {};
  if ('nombre' in cuerpo) {
    const n = nombre(cuerpo.nombre, errores);
    if (n !== undefined) cambios.nombre = n;
  }
  if ('contenido' in cuerpo) {
    const c = contenido(cuerpo.contenido, errores);
    if (c !== undefined) cambios.contenido = c;
  }
  if ('activa' in cuerpo) {
    if (typeof cuerpo.activa !== 'boolean') errores.push('El estado activa debe ser verdadero o falso.');
    else cambios.activa = cuerpo.activa;
  }
  if (errores.length === 0 && Object.keys(cambios).length === 0) errores.push('No hay cambios para guardar.');
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: cambios };
}

// ---- Ofertas (precio de un proveedor para una presentación) ----

export interface DatosOferta {
  proveedor_id: string;
  precio_referencia: number;
  tiempo_entrega_dias: number | null;
}

export function validarOfertaCrear(cuerpo: unknown): Resultado<DatosOferta> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  soloCamposPermitidos(cuerpo, ['proveedor_id', 'precio_referencia', 'tiempo_entrega_dias'], errores);

  let proveedor = '';
  if (typeof cuerpo.proveedor_id !== 'string' || !UUID.test(cuerpo.proveedor_id)) {
    errores.push('Elige un proveedor válido.');
  } else {
    proveedor = cuerpo.proveedor_id;
  }
  const p = precio(cuerpo.precio_referencia, errores);
  let e: number | null = null;
  if (cuerpo.tiempo_entrega_dias !== undefined) {
    const r = entrega(cuerpo.tiempo_entrega_dias, errores);
    if (r !== undefined) e = r;
  }
  if (errores.length > 0 || p === undefined) return { ok: false, errores };
  return { ok: true, datos: { proveedor_id: proveedor, precio_referencia: p, tiempo_entrega_dias: e } };
}

export interface CambiosOferta {
  precio_referencia?: number;
  tiempo_entrega_dias?: number | null;
  vigente?: boolean;
}

export function validarOfertaEditar(cuerpo: unknown): Resultado<CambiosOferta> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  soloCamposPermitidos(cuerpo, ['precio_referencia', 'tiempo_entrega_dias', 'vigente'], errores);
  const cambios: CambiosOferta = {};
  if ('precio_referencia' in cuerpo) {
    const p = precio(cuerpo.precio_referencia, errores);
    if (p !== undefined) cambios.precio_referencia = p;
  }
  if ('tiempo_entrega_dias' in cuerpo) {
    const e = entrega(cuerpo.tiempo_entrega_dias, errores);
    if (e !== undefined) cambios.tiempo_entrega_dias = e;
  }
  if ('vigente' in cuerpo) {
    if (typeof cuerpo.vigente !== 'boolean') errores.push('El estado vigente debe ser verdadero o falso.');
    else cambios.vigente = cuerpo.vigente;
  }
  if (errores.length === 0 && Object.keys(cambios).length === 0) errores.push('No hay cambios para guardar.');
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: cambios };
}
