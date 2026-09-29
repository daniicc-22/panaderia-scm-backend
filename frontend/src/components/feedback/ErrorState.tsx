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
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="text-sm text-red-600">{mensaje}</span>
      {onReintentar && (
        <Button variant="secondary" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}