import { Menu } from 'lucide-react';
import { Logo } from '../brand/Logo';

interface HeaderProps {
  onAbrirMenu: () => void;
}

// Barra superior solo para pantallas pequeñas. En PC el menú lateral queda siempre visible
// y ya muestra la panadería, el usuario y el botón de cerrar sesión.
export function Header({ onAbrirMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-azul-noche px-4 text-white lg:hidden">
      <button
        type="button"
        onClick={onAbrirMenu}
        className="rounded-md p-2 text-niebla hover:bg-noche-tarjeta"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>
      <Logo size={28} />
      <span className="font-display text-base font-semibold">Panadería SCM</span>
    </header>
  );
}
