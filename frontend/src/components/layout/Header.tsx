import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthContext';
import { getMiPanaderia } from '../../services/panaderiaService';
import { Button } from '../ui/Button';

interface HeaderProps {
  onAbrirMenu: () => void;
}

export function Header({ onAbrirMenu }: HeaderProps) {
  const { usuario, cerrarSesion } = useAuth();

  // La clave incluye al usuario para no mostrar la panadería de otra sesión
  const { data: panaderia } = useQuery({
    queryKey: ['mi-panaderia', usuario?.id],
    queryFn: getMiPanaderia,
    enabled: !!usuario,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onAbrirMenu}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <span className="text-sm font-medium text-gray-700">{panaderia?.nombre ?? ''}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-gray-900">{usuario?.nombre}</p>
          <p className="text-xs text-gray-500">{usuario?.rol}</p>
        </div>
        <Button variant="secondary" onClick={cerrarSesion}>
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}