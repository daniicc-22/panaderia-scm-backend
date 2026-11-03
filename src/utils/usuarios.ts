// Reglas de las cuentas de usuario: nombre de usuario, contraseña y quién puede crear a quién.
// Son funciones puras: no tocan la base de datos, por eso se prueban solas.

export const ROL_SUPERADMIN = 'superadministrador';
export const ROL_ADMIN = 'administrador';
export const ROL_OPERARIO = 'operario';

// Roles que cada rol puede crear y administrar
export function rolesQuePuedeCrear(rolActor: string): string[] {
  if (rolActor === ROL_SUPERADMIN) return [ROL_ADMIN, ROL_OPERARIO];
  if (rolActor === ROL_ADMIN) return [ROL_OPERARIO];
  return [];
}

// 3 a 30 caracteres: minúsculas, números, punto, guion y guion bajo; empieza con letra o número
const FORMATO_USUARIO = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizarNombreUsuario(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

export function validarNombreUsuario(valor: unknown): string | null {
  const nombre = normalizarNombreUsuario(valor);
  if (!nombre) return 'El nombre de usuario es obligatorio.';
  if (!FORMATO_USUARIO.test(nombre)) {
    return 'El nombre de usuario debe tener de 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo.';
  }
  return null;
}

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarCorreoOpcional(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || valor.trim().length > 254 || !FORMATO_CORREO.test(valor.trim())) {
    return 'El correo no es válido.';
  }
  return null;
}

const CLAVES_COMUNES = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  'contrasena1',
  'contrasena12',
  'contrasena123',
  'password123',
  'password1234',
  'panaderia123',
  'panaderia1234',
  'qwerty12345',
]);

// bcrypt solo usa los primeros 72 bytes: se pide un máximo para no aceptar claves que se cortan en silencio
export const LARGO_MINIMO_CLAVE = 10;
export const LARGO_MAXIMO_CLAVE = 64;

export function validarContrasena(valor: unknown, opciones: { nombreUsuario?: string | null } = {}): string | null {
  if (typeof valor !== 'string' || valor.length === 0) return 'La contraseña es obligatoria.';
  if (valor.length < LARGO_MINIMO_CLAVE) return `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  if (valor.length > LARGO_MAXIMO_CLAVE) return `La contraseña no puede tener más de ${LARGO_MAXIMO_CLAVE} caracteres.`;
  if (!/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) return 'La contraseña debe combinar letras y números.';
  if (new Set(valor).size < 4) return 'La contraseña es demasiado repetitiva.';
  const minuscula = valor.toLowerCase();
  if (CLAVES_COMUNES.has(minuscula)) return 'La contraseña es demasiado común.';
  if (opciones.nombreUsuario && minuscula.includes(opciones.nombreUsuario.toLowerCase())) {
    return 'La contraseña no debe contener el nombre de usuario.';
  }
  return null;
}

export interface DatosNuevoUsuario {
  nombre: string;
  nombre_usuario: string;
  email: string | null;
  password: string;
  rol: string;
}

// Valida el cuerpo de «crear usuario» según quién lo pide
export function validarCrearUsuario(
  cuerpo: any,
  rolActor: string,
): { error: string } | { datos: DatosNuevoUsuario } {
  const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : '';
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  if (nombre.length > 100) return { error: 'El nombre no puede tener más de 100 caracteres.' };

  const errorUsuario = validarNombreUsuario(cuerpo?.nombre_usuario);
  if (errorUsuario) return { error: errorUsuario };
  const nombreUsuario = normalizarNombreUsuario(cuerpo.nombre_usuario);

  const errorCorreo = validarCorreoOpcional(cuerpo?.email);
  if (errorCorreo) return { error: errorCorreo };
  const email = typeof cuerpo?.email === 'string' && cuerpo.email.trim() !== '' ? cuerpo.email.trim().toLowerCase() : null;

  const rol = typeof cuerpo?.rol === 'string' ? cuerpo.rol : ROL_OPERARIO;
  if (!rolesQuePuedeCrear(rolActor).includes(rol)) {
    return { error: 'No tienes permiso para crear usuarios con ese rol.' };
  }

  const errorClave = validarContrasena(cuerpo?.password, { nombreUsuario });
  if (errorClave) return { error: errorClave };

  return { datos: { nombre, nombre_usuario: nombreUsuario, email, password: cuerpo.password, rol } };
}

// Un usuario ya creado se puede administrar si su rol está entre los que el actor puede crear
export function puedeAdministrar(rolActor: string, rolObjetivo: string): boolean {
  return rolesQuePuedeCrear(rolActor).includes(rolObjetivo);
}

// Interpreta lo escrito en el campo de ingreso: con arroba es un correo; si no, un nombre de usuario
export function interpretarIdentificador(valor: unknown): { campo: 'email' | 'nombre_usuario'; valor: string } | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  return limpio.includes('@')
    ? { campo: 'email', valor: limpio }
    : { campo: 'nombre_usuario', valor: limpio.toLowerCase() };
}
