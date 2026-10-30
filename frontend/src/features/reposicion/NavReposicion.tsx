import { NavLink } from 'react-router-dom';

const ENLACES = [
  { ruta: '/reposicion', etiqueta: 'Qué pedir', end: true },
  { ruta: '/reposicion/eoq', etiqueta: 'Análisis EOQ', end: false },
  { ruta: '/reposicion/parametros', etiqueta: 'Parámetros', end: false },
];

// Pestañas comunes de las tres pantallas de reposición
export function NavReposicion() {
  return (
    <nav aria-label="Reposición" className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {ENLACES.map((e) => (
        <NavLink
          key={e.ruta}
          to={e.ruta}
          end={e.end}
          className={({ isActive }) =>
            `inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium ${isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`
          }
        >
          {e.etiqueta}
        </NavLink>
      ))}
    </nav>
  );
}
