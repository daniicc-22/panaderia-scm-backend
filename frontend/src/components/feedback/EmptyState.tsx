import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  titulo?: string;
  mensaje?: string;
}

export function EmptyState({
  titulo = 'Sin datos',
  mensaje = 'No hay información para mostrar todavía.',
}: EmptyStateProps) {
  return (
    <div className="flex animate-entra flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-arena text-pizarra">
        <Inbox size={22} aria-hidden="true" />
      </span>
      <span className="text-base font-semibold text-azul-noche">{titulo}</span>
      <span className="text-sm text-gris-texto">{mensaje}</span>
    </div>
  );
}
