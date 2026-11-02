export type RolCodigo = 'superadministrador' | 'administrador' | 'operario';

export interface Usuario {
  id: string;
  nombre: string;
  // Nombre con el que entra a la aplicación; el correo es opcional
  nombre_usuario?: string | null;
  email?: string | null;
  rol: RolCodigo;
  // Verdadero cuando otra persona fijó la contraseña: se pide cambiarla al entrar
  debe_cambiar_password?: boolean;
}

export interface Credenciales {
  // Nombre de usuario o correo
  usuario: string;
  password: string;
}

export interface SesionIniciada {
  usuario: Usuario;
  // En modo mock es un valor ficticio. En modo real será el JWT que emita
  // POST /login cuando ese endpoint exista en el backend.
  token: string;
}