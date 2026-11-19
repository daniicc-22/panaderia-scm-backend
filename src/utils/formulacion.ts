// Validación y comparación de versiones de formulaciones, sin acceso a base de datos (se prueban solas).
import { UUID, normalizarNombre } from './materiaPrima';

// Límites de las columnas decimales de la base: cantidad y rendimiento Decimal(12,3), tolerancia Decimal(5,2)
export const CANTIDAD_MAX = 999_999_999;
export const RENDIMIENTO_MAX = 999_999_999;
export const TOLERANCIA_MAX = 100;
export const INGREDIENTES_MIN = 1;
export const INGREDIENTES_MAX = 100;
export const NOMBRE_PRODUCTO_MIN = 2;
export const NOMBRE_PRODUCTO_MAX = 100;
export const MOTIVO_MAX = 300;
export const PROCEDIMIENTO_MAX = 3000;
export const TIEMPO_MAX_MIN = 1440;
export const TEMPERATURA_MAX_C = 400;
export const MERMA_HORNEADO_MAX = 60;
export const PRECIO_VENTA_MAX = 99_999_999;

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

export interface LineaVersion {
  // Exactamente uno de los dos identificadores
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  cantidad: number;
  tolerancia_porcentaje: number | null;
}

// Ficha técnica de una versión. Cada campo es opcional: si el cuerpo no lo trae, no aparece aquí;
// si lo trae como null, se borra. (La API lo guarda como null cuando falta.)
export interface FichaVersion {
  motivo_cambio?: string | null;
  procedimiento?: string | null;
  tiempo_preparacion_min?: number | null;
  tiempo_horneado_min?: number | null;
  temperatura_horneado_c?: number | null;
  merma_horneado_pct?: number | null;
}

export interface DatosVersion extends FichaVersion {
  rendimiento: number;
  ingredientes: LineaVersion[];
}

const CAMPOS_FICHA = [
  'motivo_cambio',
  'procedimiento',
  'tiempo_preparacion_min',
  'tiempo_horneado_min',
  'temperatura_horneado_c',
  'merma_horneado_pct',
] as const;

// Texto opcional: sin espacios sobrantes; vacío = null. `unaLinea` junta los espacios y saltos.
function leerTexto(valor: unknown, max: number, unaLinea: boolean, etiqueta: string, errores: string[]): string | null | undefined {
  if (valor === null) return null;
  if (typeof valor !== 'string') {
    errores.push(`${etiqueta} debe ser texto.`);
    return undefined;
  }
  const limpio = unaLinea ? valor.replace(/\s+/g, ' ').trim() : valor.replace(/\r\n?/g, '\n').trim();
  if (limpio === '') return null;
  if (limpio.length > max) {
    errores.push(`${etiqueta} no puede superar ${max} caracteres.`);
    return undefined;
  }
  return limpio;
}

// Número opcional dentro de un rango; `entero` para minutos y grados
function leerNumeroOpcional(valor: unknown, min: number, max: number, entero: boolean, etiqueta: string, errores: string[]): number | null | undefined {
  if (valor === null) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max || (entero && !Number.isInteger(valor))) {
    errores.push(`${etiqueta} debe ser un ${entero ? 'número entero' : 'número'} entre ${min} y ${max}.`);
    return undefined;
  }
  return entero ? valor : redondear(valor, 2);
}

// Lee solo los campos de la ficha que el cuerpo trae
export function leerFicha(cuerpo: Record<string, unknown>, errores: string[]): FichaVersion {
  const ficha: FichaVersion = {};
  if (cuerpo.motivo_cambio !== undefined) {
    const v = leerTexto(cuerpo.motivo_cambio, MOTIVO_MAX, true, 'El motivo del cambio', errores);
    if (v !== undefined) ficha.motivo_cambio = v;
  }
  if (cuerpo.procedimiento !== undefined) {
    const v = leerTexto(cuerpo.procedimiento, PROCEDIMIENTO_MAX, false, 'El procedimiento', errores);
    if (v !== undefined) ficha.procedimiento = v;
  }
  if (cuerpo.tiempo_preparacion_min !== undefined) {
    const v = leerNumeroOpcional(cuerpo.tiempo_preparacion_min, 0, TIEMPO_MAX_MIN, true, 'El tiempo de preparación (minutos)', errores);
    if (v !== undefined) ficha.tiempo_preparacion_min = v;
  }
  if (cuerpo.tiempo_horneado_min !== undefined) {
    const v = leerNumeroOpcional(cuerpo.tiempo_horneado_min, 0, TIEMPO_MAX_MIN, true, 'El tiempo de horneado (minutos)', errores);
    if (v !== undefined) ficha.tiempo_horneado_min = v;
  }
  if (cuerpo.temperatura_horneado_c !== undefined) {
    const v = leerNumeroOpcional(cuerpo.temperatura_horneado_c, 0, TEMPERATURA_MAX_C, true, 'La temperatura de horneado (°C)', errores);
    if (v !== undefined) ficha.temperatura_horneado_c = v;
  }
  if (cuerpo.merma_horneado_pct !== undefined) {
    const v = leerNumeroOpcional(cuerpo.merma_horneado_pct, 0, MERMA_HORNEADO_MAX, false, 'La merma de horneado (%)', errores);
    if (v !== undefined) ficha.merma_horneado_pct = v;
  }
  return ficha;
}

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

const claveLinea = (l: Pick<LineaVersion, 'materia_prima_id' | 'producto_intermedio_id'>) =>
  l.materia_prima_id ? `m:${l.materia_prima_id}` : `i:${l.producto_intermedio_id}`;

// Cuerpo de POST /formulaciones/:id/versiones
export function validarVersion(cuerpo: unknown): Resultado<DatosVersion> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  for (const campo of Object.keys(cuerpo)) {
    if (!['rendimiento', 'ingredientes', ...CAMPOS_FICHA].includes(campo)) errores.push(`El campo ${campo} no se puede enviar aquí.`);
  }

  let rendimiento = 0;
  const r = cuerpo.rendimiento;
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0 || r > RENDIMIENTO_MAX || redondear(r, 3) <= 0) {
    errores.push(`El rendimiento debe ser un número mayor que 0 y no superar ${RENDIMIENTO_MAX.toLocaleString('es-CO')}.`);
  } else {
    rendimiento = redondear(r, 3);
  }

  const ingredientes: LineaVersion[] = [];
  const lista = cuerpo.ingredientes;
  if (!Array.isArray(lista) || lista.length < INGREDIENTES_MIN || lista.length > INGREDIENTES_MAX) {
    errores.push(`La formulación debe tener entre ${INGREDIENTES_MIN} y ${INGREDIENTES_MAX} ingredientes.`);
  } else {
    const vistos = new Set<string>();
    lista.forEach((raw, i) => {
      const n = i + 1;
      if (!esObjeto(raw)) {
        errores.push(`El ingrediente ${n} no es válido.`);
        return;
      }
      for (const campo of Object.keys(raw)) {
        if (!['materia_prima_id', 'producto_intermedio_id', 'cantidad', 'tolerancia_porcentaje'].includes(campo)) {
          errores.push(`El ingrediente ${n} trae un campo no permitido: ${campo}.`);
        }
      }

      const mp = raw.materia_prima_id ?? null;
      const inter = raw.producto_intermedio_id ?? null;
      if ((mp === null) === (inter === null)) {
        errores.push(`El ingrediente ${n} debe indicar una materia prima o un producto intermedio, no ambos ni ninguno.`);
        return;
      }
      const id = (mp ?? inter) as unknown;
      if (typeof id !== 'string' || !UUID.test(id)) {
        errores.push(`El ingrediente ${n} tiene un identificador no válido.`);
        return;
      }

      const c = raw.cantidad;
      if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || c > CANTIDAD_MAX || redondear(c, 3) <= 0) {
        errores.push(`La cantidad del ingrediente ${n} debe ser un número mayor que 0 y no superar ${CANTIDAD_MAX.toLocaleString('es-CO')}.`);
        return;
      }

      let tolerancia: number | null = null;
      if (raw.tolerancia_porcentaje !== undefined && raw.tolerancia_porcentaje !== null) {
        const t = raw.tolerancia_porcentaje;
        if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > TOLERANCIA_MAX) {
          errores.push(`La tolerancia del ingrediente ${n} debe estar entre 0 y ${TOLERANCIA_MAX}.`);
          return;
        }
        tolerancia = redondear(t, 2);
      }

      const linea: LineaVersion = {
        materia_prima_id: mp === null ? null : (mp as string),
        producto_intermedio_id: inter === null ? null : (inter as string),
        cantidad: redondear(c, 3),
        tolerancia_porcentaje: tolerancia,
      };
      const clave = claveLinea(linea);
      if (vistos.has(clave)) {
        errores.push(`El ingrediente ${n} está repetido.`);
        return;
      }
      vistos.add(clave);
      ingredientes.push(linea);
    });
  }

  const ficha = leerFicha(cuerpo, errores);

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { rendimiento, ingredientes, ...ficha } };
}

export interface DatosProductoNuevo extends DatosVersion {
  nombre: string;
  es_intermedio: boolean;
  precio_venta?: number | null;
}

// Precio de venta por unidad: null lo borra
function leerPrecioVenta(valor: unknown, errores: string[]): number | null | undefined {
  return leerNumeroOpcional(valor, 0, PRECIO_VENTA_MAX, false, 'El precio de venta', errores);
}

// Cuerpo de POST /formulaciones: un producto final nuevo con su primera versión.
// Puede ser un producto final o un intermedio (es_intermedio), y llevar intermedios como ingredientes.
export function validarProductoNuevo(cuerpo: unknown): Resultado<DatosProductoNuevo> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  let nombre = '';
  if (typeof cuerpo.nombre !== 'string') {
    errores.push('El nombre del producto es obligatorio.');
  } else {
    nombre = normalizarNombre(cuerpo.nombre);
    if (nombre.length < NOMBRE_PRODUCTO_MIN || nombre.length > NOMBRE_PRODUCTO_MAX) {
      errores.push(`El nombre debe tener entre ${NOMBRE_PRODUCTO_MIN} y ${NOMBRE_PRODUCTO_MAX} caracteres.`);
    }
  }

  let esIntermedio = false;
  if (cuerpo.es_intermedio !== undefined) {
    if (typeof cuerpo.es_intermedio !== 'boolean') errores.push('es_intermedio debe ser verdadero o falso.');
    else esIntermedio = cuerpo.es_intermedio;
  }

  let precioVenta: number | null | undefined;
  if (cuerpo.precio_venta !== undefined) precioVenta = leerPrecioVenta(cuerpo.precio_venta, errores);

  const { nombre: _nombre, es_intermedio: _es, precio_venta: _precio, ...resto } = cuerpo;
  const version = validarVersion(resto);
  if (!version.ok) errores.push(...version.errores);

  if (errores.length > 0 || !version.ok) return { ok: false, errores };
  return {
    ok: true,
    datos: { nombre, es_intermedio: esIntermedio, ...(precioVenta !== undefined ? { precio_venta: precioVenta } : {}), ...version.datos },
  };
}

// Cambios que se pueden hacer a un producto desde su formulación (PATCH /formulaciones/:id/producto):
// darlo de baja o reactivarlo, cambiarle el nombre o fijarle el precio de venta (null lo borra).
export interface CambiosProducto {
  activo?: boolean;
  nombre?: string;
  precio_venta?: number | null;
}

export function validarCambiosProducto(cuerpo: unknown): Resultado<CambiosProducto> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  for (const campo of Object.keys(cuerpo)) {
    if (!['activo', 'nombre', 'precio_venta'].includes(campo)) errores.push(`El campo ${campo} no se puede enviar aquí.`);
  }
  const datos: CambiosProducto = {};

  if (cuerpo.activo !== undefined) {
    if (typeof cuerpo.activo !== 'boolean') errores.push('El estado activo debe ser verdadero o falso.');
    else datos.activo = cuerpo.activo;
  }
  if (cuerpo.nombre !== undefined) {
    if (typeof cuerpo.nombre !== 'string') {
      errores.push('El nombre del producto debe ser texto.');
    } else {
      const nombre = normalizarNombre(cuerpo.nombre);
      if (nombre.length < NOMBRE_PRODUCTO_MIN || nombre.length > NOMBRE_PRODUCTO_MAX) {
        errores.push(`El nombre debe tener entre ${NOMBRE_PRODUCTO_MIN} y ${NOMBRE_PRODUCTO_MAX} caracteres.`);
      } else {
        datos.nombre = nombre;
      }
    }
  }
  if (cuerpo.precio_venta !== undefined) {
    const v = leerPrecioVenta(cuerpo.precio_venta, errores);
    if (v !== undefined) datos.precio_venta = v;
  }

  if (errores.length === 0 && Object.keys(datos).length === 0) errores.push('No se envió ningún cambio.');
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos };
}

// ¿La nueva versión difiere de la vigente? Evita crear versiones idénticas por error.
// Cuenta la receta y la ficha técnica (procedimiento, tiempos, temperatura, merma); el motivo del cambio no cuenta,
// porque describe el cambio y no la versión. Un campo de la ficha que `nueva` no trae se ignora.
export function hayCambios(
  actual: { rendimiento: number | null; ingredientes: LineaVersion[] } & FichaVersion,
  nueva: DatosVersion,
): boolean {
  if (actual.rendimiento !== nueva.rendimiento) return true;
  if (actual.ingredientes.length !== nueva.ingredientes.length) return true;
  const previas = new Map(actual.ingredientes.map((l) => [claveLinea(l), l]));
  for (const l of nueva.ingredientes) {
    const previa = previas.get(claveLinea(l));
    if (!previa) return true;
    if (previa.cantidad !== l.cantidad) return true;
    if ((previa.tolerancia_porcentaje ?? null) !== (l.tolerancia_porcentaje ?? null)) return true;
  }
  for (const campo of CAMPOS_FICHA) {
    if (campo === 'motivo_cambio') continue;
    const n = nueva[campo];
    if (n !== undefined && (actual[campo] ?? null) !== n) return true;
  }
  return false;
}

// Fecha de hoy en Colombia (AAAA-MM-DD). La base guarda solo la fecha, sin hora.
export function fechaHoyColombia(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
}
