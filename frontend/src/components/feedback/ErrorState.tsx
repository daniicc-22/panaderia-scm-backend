import { OctagonAlert } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorStateProps {
  mensaje?: string;
  onReintentar?: () => void;
}

export function ErrorState({
  mensaje = 'Ocurrió un error al cargar la información.',
  onReintentar,
}: ErrorStateProps) {
  return (
    <div className="flex animate-entra flex-col items-center justify-center gap-3 py-12 text-center" role="alert">
      <span className="flex size-12 items-center justify-center rounded-full bg-critico-fondo text-critico-texto">
        <OctagonAlert size={22} aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-critico-texto">{mensaje}</span>
      {onReintentar && (
        <Button variant="secondary" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
