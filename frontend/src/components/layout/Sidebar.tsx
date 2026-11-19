import { NavLink } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  BookOpen,
  Building2,
  ChartLine,
  ChartPie,
  ChefHat,
  ClipboardCheck,
  House,
  KeyRound,
  LogOut,
  Package,
  Scale,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Target,
  Trash2,
  Truck,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { getMiPanaderia } from '../../services/panaderiaService';
import type { RolCodigo } from '../../types/auth.types';
import { Logo } from '../brand/Logo';
import { LEMA_APP, NOMBRE_APP } from '../brand/marca';

interface ItemMenu {
  etiqueta: string;
  ruta: string;
  icono: LucideIcon;
  rolesPermitidos?: RolCodigo[];
}

interface GrupoMenu {
  titulo?: string;
  items: ItemMenu[];
}

const GESTION: RolCodigo[] = ['administrador', 'superadministrador'];

const GRUPOS_MENU: GrupoMenu[] = [
  { items: [{ etiqueta: 'Inicio', ruta: '/inicio', icono: House }] },
  {
    titulo: 'Catálogos',
    items: [
      { etiqueta: 'Materias primas', ruta: '/materias-primas', icono: Wheat },
      { etiqueta: 'Proveedores', ruta: '/proveedores', icono: Truck, rolesPermitidos: GESTION },
      { etiqueta: 'Formulaciones', ruta: '/formulaciones', icono: BookOpen },
    ],
  },
  {
    titulo: 'Inventario',
    items: [
      { etiqueta: 'Existencias', ruta: '/inventario', icono: Package },
      { etiqueta: 'Conteo físico', ruta: '/conteos', icono: ClipboardCheck },
    ],
  },
  {
    titulo: 'Producción',
    items: [
      { etiqueta: 'Producir', ruta: '/produccion', icono: ChefHat },
      { etiqueta: 'Mermas', ruta: '/mermas', icono: Trash2 },
      { etiqueta: 'Desviación de pesaje', ruta: '/desviacion-pesaje', icono: Scale, rolesPermitidos: GESTION },
    ],
  },
  {
    titulo: 'Análisis',
    items: [
      { etiqueta: 'Reposición', ruta: '/reposicion', icono: ShoppingCart, rolesPermitidos: GESTION },
      { etiqueta: 'Análisis EOQ', ruta: '/reposicion/eoq', icono: ChartLine, rolesPermitidos: GESTION },
      { etiqueta: 'Parámetros de reposición', ruta: '/reposicion/parametros', icono: SlidersHorizontal, rolesPermitidos: GESTION },
      { etiqueta: 'Clasificación ABC', ruta: '/clasificacion-abc', icono: ChartPie, rolesPermitidos: GESTION },
      { etiqueta: 'Indicadores del proyecto', ruta: '/indicadores', icono: Target, rolesPermitidos: GESTION },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { etiqueta: 'Usuarios', ruta: '/usuarios', icono: Users, rolesPermitidos: GESTION },
      { etiqueta: 'Panaderías', ruta: '/panaderias', icono: Building2, rolesPermitidos: ['superadministrador'] },
    ],
  },
];

const NOMBRE_ROL: Record<RolCodigo, string> = {
  superadministrador: 'Superadministrador',
  administrador: 'Administrador',
  operario: 'Operario',
};

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

interface SidebarProps {
  abierto: boolean;
  onCerrar: () => void;
}

// IMPORTANTE: Ocultar/mostrar ítems por rol aquí es solo una mejora de UX.
// NO es un mecanismo de seguridad. La autorización real se valida en el backend.
export function Sidebar({ abierto, onCerrar }: SidebarProps) {
  const { usuario, cerrarSesion } = useAuth();
  const queryClient = useQueryClient();

  // La clave incluye al usuario para no mostrar la panadería de otra sesión
  const { data: panaderia } = useQuery({
    queryKey: ['mi-panaderia', usuario?.id],
    queryFn: getMiPanaderia,
    enabled: !!usuario,
    staleTime: 5 * 60 * 1000,
  });

  const salir = () => {
    queryClient.clear(); // evita que la siguiente sesión vea datos en caché de la anterior
    cerrarSesion();
  };

  const puedeVer = (item: ItemMenu) =>
    !item.rolesPermitidos || (usuario !== null && item.rolesPermitidos.includes(usuario.rol));

  const grupos = GRUPOS_MENU.map((g) => ({ ...g, items: g.items.filter(puedeVer) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      {abierto && (
        <div className="fixed inset-0 z-30 bg-grafito/50 lg:hidden" onClick={onCerrar} aria-hidden="true" />
      )}

      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col bg-azul-noche text-niebla transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <Logo size={34} />
            <span className="min-w-0">
              <span className="block font-display text-lg leading-tight font-semibold text-white">{NOMBRE_APP}</span>
              <span className="block text-[11px] leading-tight text-trigo">{LEMA_APP}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md p-1.5 text-niebla hover:bg-noche-tarjeta lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        {panaderia?.nombre && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-noche-tarjeta px-3 py-2 text-sm text-trigo">
            <Store size={16} aria-hidden="true" />
            <span className="truncate">{panaderia.nombre}</span>
          </div>
        )}

        <nav aria-label="Menú principal" className="flex-1 overflow-y-auto px-3 pb-4">
          {grupos.map((grupo, i) => (
            <div key={grupo.titulo ?? `grupo-${i}`} className="mt-3 first:mt-1">
              {grupo.titulo && <p className="mb-1 px-3 text-xs font-medium text-[#9fb0be]">{grupo.titulo}</p>}
              <ul className="flex flex-col gap-0.5">
                {grupo.items.map((item) => (
                  <li key={item.ruta}>
                    <NavLink to={item.ruta} end onClick={onCerrar} className="relative block rounded-lg">
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId="menu-activo"
                              className="absolute inset-0 rounded-lg bg-trigo"
                              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                            />
                          )}
                          <span
                            className={`relative flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                              isActive ? 'font-semibold text-azul-noche' : 'text-niebla hover:text-white'
                            }`}
                          >
                            <item.icono size={18} aria-hidden="true" />
                            {item.etiqueta}
                          </span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {usuario && (
          <div className="flex items-center gap-3 border-t border-noche-borde px-4 py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-trigo text-sm font-semibold text-azul-noche">
              {iniciales(usuario.nombre)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{usuario.nombre}</p>
              <p className="text-xs text-[#9fb0be]">{NOMBRE_ROL[usuario.rol]}</p>
            </div>
            <NavLink
              to="/cambiar-contrasena"
              onClick={onCerrar}
              className="rounded-md p-2 text-niebla transition-colors hover:bg-noche-tarjeta hover:text-white"
              aria-label="Cambiar contraseña"
              title="Cambiar contraseña"
            >
              <KeyRound size={18} />
            </NavLink>
            <button
              type="button"
              onClick={salir}
              className="rounded-md p-2 text-niebla transition-colors hover:bg-noche-tarjeta hover:text-white"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
