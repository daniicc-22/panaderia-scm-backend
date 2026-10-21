// Reglas de validación de proveedores, sin acceso a base de datos (se prueban solas).
import { normalizarNombre } from './materiaPrima';

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 100;
export const CONTACTO_MAX = 100;
export const TELEFONO_MAX = 30;
export const DIRECCION_MAX = 200;

export interface DatosProveedor {
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
}

export type CambiosProveedor = Partial<DatosProveedor> & { activo?: boolean };

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const SOLO_TELEFONO = /^[0-9+()\-\s.]+$/;

function validarNombre(valor: unknown, errores: string[]): string | undefined {
  if (typeof valor !== 'string') {
    errores.push('El nombre es obligatorio.');
    return undefined;
  }
  const nombre = normalizarNombre(valor);
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    errores.push(`El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`);
    return undefined;
  }
  return nombre;
}

// Texto opcional: vacío o ausente se guarda como null
function validarTextoOpcional(valor: unknown, etiqueta: string, max: number, errores: string[]): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') {
    errores.push(`${etiqueta} debe ser texto.`);
    return null;
  }
  const texto = valor.trim().replace(/\s+/g, ' ');
  if (texto === '') return null;
  if (texto.length > max) {
    errores.push(`${etiqueta} no puede superar los ${max} caracteres.`);
    return null;
  }
  return texto;
}

function validarTelefono(valor: unknown, errores: string[]): string | null {
  const telefono = validarTextoOpcional(valor, 'El teléfono', TELEFONO_MAX, errores);
  if (telefono !== null && !SOLO_TELEFONO.test(telefono)) {
    errores.push('El teléfono solo puede tener números, espacios y los signos + - ( ) .');
    return null;
  }
  return telefono;
}

export function validarProveedorCrear(cuerpo: unknown): Resultado<DatosProveedor> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  const nombre = validarNombre(cuerpo.nombre, errores);
  const contacto = validarTextoOpcional(cuerpo.contacto, 'El contacto', CONTACTO_MAX, errores);
  const telefono = validarTelefono(cuerpo.telefono, errores);
  const direccion = validarTextoOpcional(cuerpo.direccion, 'La dirección', DIRECCION_MAX, errores);
  if (errores.length > 0 || nombre === undefined) return { ok: false, errores };
  return { ok: true, datos: { nombre, contacto, telefono, direccion } };
}

const CAMPOS_EDITABLES = ['nombre', 'contacto', 'telefono', 'direccion', 'activo'] as const;

export function validarProveedorEditar(cuerpo: unknown): Resultado<CambiosProveedor> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  for (const campo of Object.keys(cuerpo)) {
    if (!(CAMPOS_EDITABLES as readonly string[]).includes(campo)) {
      errores.push(`El campo ${campo} no se puede modificar.`);
    }
  }

  const cambios: CambiosProveedor = {};
  if ('nombre' in cuerpo) {
    const nombre = validarNombre(cuerpo.nombre, errores);
    if (nombre !== undefined) cambios.nombre = nombre;
  }
  if ('contacto' in cuerpo) cambios.contacto = validarTextoOpcional(cuerpo.contacto, 'El contacto', CONTACTO_MAX, errores);
  if ('telefono' in cuerpo) cambios.telefono = validarTelefono(cuerpo.telefono, errores);
  if ('direccion' in cuerpo) cambios.direccion = validarTextoOpcional(cuerpo.direccion, 'La dirección', DIRECCION_MAX, errores);
  if ('activo' in cuerpo) {
    if (typeof cuerpo.activo !== 'boolean') errores.push('El estado activo debe ser verdadero o falso.');
    else cambios.activo = cuerpo.activo;
  }

  if (errores.length === 0 && Object.keys(cambios).length === 0) errores.push('No hay cambios para guardar.');
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: cambios };
}
