import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import type { RolCodigo } from '../types/auth.types';
import { Spinner } from '../components/ui/Spinner';

const RUTA_CAMBIAR_CLAVE = '/cambiar-contrasena';

interface ProtectedRouteProps {
  rolesPermitidos?: RolCodigo[];
}

// IMPORTANTE: Este guard es solo control de UX (evita que el usuario
// vea pantallas que no le corresponden). NO es un mecanismo de seguridad.
// La autorización real debe hacerse en el backend (middleware), que
// todavía no existe en este proyecto.
export function ProtectedRoute({ rolesPermitidos }: ProtectedRouteProps) {
  const { usuario, estaAutenticado, cargando } = useAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!estaAutenticado || !usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si otra persona fijó su contraseña, primero debe cambiarla
  if (usuario.debe_cambiar_password && location.pathname !== RUTA_CAMBIAR_CLAVE) {
    return <Navigate to={RUTA_CAMBIAR_CLAVE} replace />;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}