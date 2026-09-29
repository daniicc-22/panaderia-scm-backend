import { Spinner } from '../ui/Spinner';

interface LoadingStateProps {
  mensaje?: string;
}

export function LoadingState({ mensaje = 'Cargando...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500">
      <Spinner />
      <span className="text-sm">{mensaje}</span>
    </div>
  );
}