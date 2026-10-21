// Validación y comparación de versiones de formulaciones, sin acceso a base de datos (se prueban solas).
import { UUID } from './materiaPrima';

// Límites de las columnas decimales de la base: cantidad y rendimiento Decimal(12,3), tolerancia Decimal(5,2)
export const CANTIDAD_MAX = 999_999_999;
export const RENDIMIENTO_MAX = 999_999_999;
export const TOLERANCIA_MAX = 100;
export const INGREDIENTES_MIN = 1;
export const INGREDIENTES_MAX = 100;

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

export interface LineaVersion {
  // Exactamente uno de los dos identificadores
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  cantidad: number;
  tolerancia_porcentaje: number | null;
}

export interface DatosVersion {
  rendimiento: number;
  ingredientes: LineaVersion[];
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
    if (!['rendimiento', 'ingredientes'].includes(campo)) errores.push(`El campo ${campo} no se puede enviar aquí.`);
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

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { rendimiento, ingredientes } };
}

// ¿La nueva versión difiere de la vigente? Evita crear versiones idénticas por error.
export function hayCambios(
  actual: { rendimiento: number | null; ingredientes: LineaVersion[] },
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
  return false;
}

// Fecha de hoy en Colombia (AAAA-MM-DD). La base guarda solo la fecha, sin hora.
export function fechaHoyColombia(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
}
