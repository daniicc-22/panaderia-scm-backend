import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/useAuth';
import type { RolCodigo } from '../../types/auth.types';

interface ItemMenu {
  etiqueta: string;
  ruta: string;
  rolesPermitidos?: RolCodigo[];
}

const ITEMS_MENU: ItemMenu[] = [
  { etiqueta: 'Inicio', ruta: '/inicio' },
  { etiqueta: 'Materias primas', ruta: '/materias-primas' },
  { etiqueta: 'Proveedores', ruta: '/proveedores', rolesPermitidos: ['administrador', 'superadministrador'] },
  { etiqueta: 'Formulaciones', ruta: '/formulaciones' },
  { etiqueta: 'Clasificación ABC', ruta: '/clasificacion-abc', rolesPermitidos: ['administrador', 'superadministrador'] },
];

interface SidebarProps {
  abierto: boolean;
  onCerrar: () => void;
}

// IMPORTANTE: Ocultar/mostrar ítems por rol aquí es solo una mejora de UX.
// NO es un mecanismo de seguridad. La autorización real debe validarse
// siempre en el backend.
export function Sidebar({ abierto, onCerrar }: SidebarProps) {
  const { usuario } = useAuth();

  const itemsVisibles = ITEMS_MENU.filter(
    (item) => !item.rolesPermitidos || (usuario && item.rolesPermitidos.includes(usuario.rol)),
  );

  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCerrar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-white border-r border-gray-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-gray-200 px-4">
          <span className="text-lg font-semibold text-gray-900">Panadería SCM</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {itemsVisibles.map((item) => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              onClick={onCerrar}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}