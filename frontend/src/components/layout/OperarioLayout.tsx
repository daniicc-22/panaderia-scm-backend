import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MotionConfig, motion } from 'motion/react';
import { BookOpen, ChefHat, ClipboardCheck, House, KeyRound, LogOut, Package, Trash2, Wheat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { getMiPanaderia } from '../../services/panaderiaService';
import { Logo } from '../brand/Logo';

interface Pestana {
  etiqueta: string;
  ruta: string;
  icono: LucideIcon;
}

// Ordenadas por frecuencia de uso en la planta
const PESTANAS: Pestana[] = [
  { etiqueta: 'Inicio', ruta: '/inicio', icono: House },
  { etiqueta: 'Producir', ruta: '/produccion', icono: ChefHat },
  { etiqueta: 'Mermas', ruta: '/mermas', icono: Trash2 },
  { etiqueta: 'Existencias', ruta: '/inventario', icono: Package },
  { etiqueta: 'Conteo', ruta: '/conteos', icono: ClipboardCheck },
  { etiqueta: 'Recetas', ruta: '/formulaciones', icono: BookOpen },
  { etiqueta: 'Insumos', ruta: '/materias-primas', icono: Wheat },
];

// Interfaz del operario: fondo claro con tarjetas trigo (clase tema-operario), barra superior azul noche, pestañas grandes
// arriba y sin menú lateral. Nunca muestra dinero (lo garantiza también el backend).
export function OperarioLayout() {
  const { usuario, cerrarSesion } = useAuth();
  const queryClient = useQueryClient();
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

  return (
    <MotionConfig reducedMotion="user">
      <div className="tema-operario min-h-screen bg-hueso text-grafito">
        <header className="sticky top-0 z-20 border-b border-[#34495b] bg-[#22374a] shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Logo size={34} />
              <span className="font-display text-lg font-semibold">Panadería SCM</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold">{usuario?.nombre}</p>
                <p className="text-xs text-niebla">Operario{panaderia?.nombre ? ` · ${panaderia.nombre}` : ''}</p>
              </div>
              <NavLink
                to="/cambiar-contrasena"
                className="inline-flex size-11 items-center justify-center rounded-lg border border-[#5e7488] text-niebla transition-colors hover:bg-[#34495b] hover:text-white"
                aria-label="Cambiar contraseña"
                title="Cambiar contraseña"
              >
                <KeyRound size={20} />
              </NavLink>
              <button
                type="button"
                onClick={salir}
                className="inline-flex size-11 items-center justify-center rounded-lg border border-[#5e7488] text-niebla transition-colors hover:bg-[#34495b] hover:text-white"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>

          <nav aria-label="Secciones" className="mx-auto max-w-7xl overflow-x-auto px-2 pb-3 sm:px-4">
            <ul className="flex min-w-max gap-1">
              {PESTANAS.map((p) => (
                <li key={p.ruta}>
                  <NavLink to={p.ruta} end className="relative block rounded-xl">
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="pestana-activa"
                            className="absolute inset-0 rounded-xl bg-trigo"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <span
                          className={`relative flex min-h-12 items-center gap-2 px-4 text-[15px] transition-colors ${
                            isActive ? 'font-semibold text-grafito' : 'text-niebla hover:text-white'
                          }`}
                        >
                          <p.icono size={20} aria-hidden="true" />
                          {p.etiqueta}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </MotionConfig>
  );
}
