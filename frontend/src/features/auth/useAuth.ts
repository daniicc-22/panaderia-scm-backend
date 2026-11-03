import { createContext, useContext } from 'react';
import type { Credenciales, Usuario } from '../../types/auth.types';

export interface AuthContextValue {
  usuario: Usuario | null;
  estaAutenticado: boolean;
  cargando: boolean;
  error: string | null;
  iniciarSesion: (credenciales: Credenciales) => Promise<void>;
  cerrarSesion: () => void;
  // Actualiza datos de la sesión guardada (p. ej. al cambiar la contraseña)
  actualizarUsuario: (cambios: Partial<Usuario>) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  }
  return context;
}
