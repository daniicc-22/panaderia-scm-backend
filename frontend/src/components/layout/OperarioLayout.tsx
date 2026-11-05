import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { getMiPanaderia } from '../../services/panaderiaService';
import { Logo } from '../brand/Logo';

// Interfaz del operario: sin menú ni pestañas. El inicio es un tablero de botones grandes
// y cada pantalla tiene su botón para volver. Nunca muestra dinero (lo garantiza también el backend).
export function OperarioLayout() {
  const { usuario, cerrarSesion } = useAuth();
  const queryClient = useQueryClient();
  // En el inicio la barra es de vidrio sobre la foto y el contenido ocupa todo el ancho
  const enInicio = useLocation().pathname === '/inicio';
  const { data: panaderia } = useQuery({
    queryKey: ['mi-panaderia', usuario?.id],
    queryFn: getMiPanaderia,
    enabled: !!usuario,
    staleTime: 5 * 60 * 1000,
  });

  const salir = () => {
    queryClient.clear();
    cerrarSesion();
  };

  const botonBarra =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#5e7488] px-3 text-base font-semibold text-niebla transition-colors hover:bg-[#34495b] hover:text-white';

  return (
    <MotionConfig reducedMotion="user">
      <div className="tema-operario min-h-screen bg-hueso text-grafito">
        <header
          className={`sticky top-0 z-20 text-white transition-colors ${
            enInicio
              ? 'border-b border-white/15 bg-[#1b120c]/30 backdrop-blur-md'
              : 'border-b border-[#34495b] bg-[#22374a] shadow-[0_2px_10px_rgba(0,0,0,0.25)]'
          }`}
        >
          <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link to="/inicio" className="flex min-w-0 items-center gap-3" aria-label="Ir al inicio">
              <Logo size={38} />
              <span className="min-w-0">
                <span className="block truncate text-lg font-semibold">{usuario?.nombre}</span>
                <span className="block truncate text-sm text-niebla">{panaderia?.nombre ?? 'Operario'}</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <NavLink to="/cambiar-contrasena" className={botonBarra} aria-label="Cambiar contraseña" title="Cambiar contraseña">
                <KeyRound size={22} />
              </NavLink>
              <button type="button" onClick={salir} className={botonBarra}>
                <LogOut size={22} aria-hidden="true" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        <main className={enInicio ? '-mt-[76px]' : 'mx-auto max-w-7xl p-4 sm:p-6'}>
          <Outlet />
        </main>
      </div>
    </MotionConfig>
  );
}
