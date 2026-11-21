import { useEffect, useState, type ReactNode } from 'react';
import { EVENTO_SESION_EXPIRADA } from '../../services/httpClient';
import { setPanaderiaActivaId } from '../../services/panaderiaActiva';
import { login as loginService } from './authService';
import type { Credenciales, Usuario } from '../../types/auth.types';
import { AuthContext } from './useAuth';

// IMPORTANTE: esta persistencia en localStorage es una solución de
// DESARROLLO para el modo mock. Cuando exista autenticación real, el
// manejo del token (dónde se guarda, cómo se renueva/expira) debe
// revisarse con criterios de seguridad de producción.
const CLAVE_TOKEN = 'panaderia_token';
const CLAVE_USUARIO = 'panaderia_usuario';

// Sesión guardada en el navegador; si está dañada se descarta
function leerSesionGuardada(): Usuario | null {
  const usuarioGuardado = localStorage.getItem(CLAVE_USUARIO);
  const tokenGuardado = localStorage.getItem(CLAVE_TOKEN);
  if (!usuarioGuardado || !tokenGuardado) return null;
  try {
    return JSON.parse(usuarioGuardado) as Usuario;
  } catch {
    localStorage.removeItem(CLAVE_USUARIO);
    localStorage.removeItem(CLAVE_TOKEN);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Se lee la sesión al crear el estado, así la primera pantalla ya sabe si hay usuario
  const [usuario, setUsuario] = useState<Usuario | null>(leerSesionGuardada);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciarSesion(credenciales: Credenciales) {
    setError(null);
    setCargando(true);
    try {
      const sesion = await loginService(credenciales);
      setPanaderiaActivaId(null); // cada sesión empieza en su panadería predeterminada
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
    setPanaderiaActivaId(null);
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    setUsuario(null);
  }

  // Si el servidor rechaza el token (venció o el usuario se desactivó), la pantalla vuelve al inicio de sesión
  useEffect(() => {
    const alExpirar = () => {
      localStorage.removeItem(CLAVE_USUARIO);
      setUsuario(null);
    };
    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
  }, []);

  function actualizarUsuario(cambios: Partial<Usuario>) {
    setUsuario((actual) => {
      if (!actual) return actual;
      const nuevo = { ...actual, ...cambios };
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(nuevo));
      return nuevo;
    });
  }

  return (
    <AuthContext.Provider
      value={{ usuario, estaAutenticado: usuario !== null, cargando, error, iniciarSesion, cerrarSesion, actualizarUsuario }}
    >
      {children}
    </AuthContext.Provider>
  );
}
