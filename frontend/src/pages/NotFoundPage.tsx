import { Link } from 'react-router-dom';
import { Logo } from '../components/brand/Logo';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-azul-noche px-4 text-center text-white">
      <Logo size={72} />
      <h1 className="font-display text-6xl font-semibold text-trigo">404</h1>
      <p className="text-niebla">La página que buscas no existe.</p>
      <Link
        to="/inicio"
        className="inline-flex min-h-11 items-center rounded-lg bg-terracota px-5 text-sm font-semibold text-white transition-colors hover:bg-[#93502f]"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
