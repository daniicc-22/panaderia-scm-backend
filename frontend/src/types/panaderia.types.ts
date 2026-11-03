// Panadería como la devuelve GET /panaderias (solo superadministrador)
export interface PanaderiaResumen {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
  usuarios_activos: number;
}

export interface UsuarioInicial {
  nombre: string;
  nombre_usuario: string;
  email?: string;
  password: string;
}

export interface NuevaPanaderia {
  nombre: string;
  ciudad?: string;
  direccion?: string;
  telefono?: string;
  administrador: UsuarioInicial;
  operario?: UsuarioInicial;
}

export interface PanaderiaCreada {
  id: string;
  nombre: string;
  ciudad: string;
  usuarios: { nombre: string; nombre_usuario: string; rol: string }[];
}
