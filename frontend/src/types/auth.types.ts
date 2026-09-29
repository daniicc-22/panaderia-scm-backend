export type RolCodigo = 'superadministrador' | 'administrador' | 'operario';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolCodigo;
}

export interface Credenciales {
  email: string;
  password: string;
}

export interface SesionIniciada {
  usuario: Usuario;
  // En modo mock es un valor ficticio. En modo real será el JWT que emita
  // POST /login cuando ese endpoint exista en el backend.
  token: string;
}