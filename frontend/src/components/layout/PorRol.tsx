import type { ReactNode } from 'react';
import { useAuth } from '../../features/auth/useAuth';

// Muestra una pantalla distinta al operario en la misma ruta. Es solo presentación:
// los permisos reales los sigue validando el backend.
export function PorRol({ operario, gestion }: { operario: ReactNode; gestion: ReactNode }) {
  const { usuario } = useAuth();
  return <>{usuario?.rol === 'operario' ? operario : gestion}</>;
}
