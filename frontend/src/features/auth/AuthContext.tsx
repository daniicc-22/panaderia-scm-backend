import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { login as loginService } from './authService';
import type { Credenciales, Usuario } from '../../types/auth.types';

interface AuthContextValue {
  usuario: Usuario | null;
  estaAutenticado: boolean;
  cargando: boolean;
  error: string | null;
  iniciarSesion: (credenciales: Credenciales) => Promise<void>;
  cerrarSesion: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// IMPORTANTE: esta persistencia en localStorage es una solución de
// DESARROLLO para el modo mock. Cuando exista autenticación real, el
// manejo del token (dónde se guarda, cómo se renueva/expira) debe
// revisarse con criterios de seguridad de producción.
const CLAVE_TOKEN = 'panaderia_token';
const CLAVE_USUARIO = 'panaderia_usuario';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem(CLAVE_USUARIO);
    const tokenGuardado = localStorage.getItem(CLAVE_TOKEN);

    if (usuarioGuardado && tokenGuardado) {
      try {
        setUsuario(JSON.parse(usuarioGuardado) as Usuario);
      } catch {
        localStorage.removeItem(CLAVE_USUARIO);
        localStorage.removeItem(CLAVE_TOKEN);
      }
    }
    setCargando(false);
  }, []);

  async function iniciarSesion(credenciales: Credenciales) {
    setError(null);
    setCargando(true);
    try {
      const sesion = await loginService(credenciales);
      localStorage.setItem(CLAVE_TOKEN, sesion.token);
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(sesion.usuario));
      setUsuario(sesion.usuario);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
      setError(mensaje);
      throw err;
    } finally {
      setCargando(false);
    }
  }

  function cerrarSesion() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider
      value={{ usuario, estaAutenticado: usuario !== null, cargando, error, iniciarSesion, cerrarSesion }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  }
  return context;
}