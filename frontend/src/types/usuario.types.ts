import type { RolCodigo } from './auth.types';

// Usuario de una panadería, como lo devuelve GET /usuarios (nunca incluye la contraseña)
export interface UsuarioPanaderia {
  id: string;
  nombre: string;
  nombre_usuario: string | null;
  email: string | null;
  rol: RolCodigo;
  activo: boolean;
  debe_cambiar_password: boolean;
}

export interface NuevoUsuario {
  nombre: string;
  nombre_usuario: string;
  email?: string;
  password: string;
  rol: 'administrador' | 'operario';
}

export interface PanaderiaOpcion {
  id: string;
  nombre: string;
}
