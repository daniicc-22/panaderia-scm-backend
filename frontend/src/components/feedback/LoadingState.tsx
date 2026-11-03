import { Esqueleto } from './Esqueleto';

interface LoadingStateProps {
  mensaje?: string;
}

// Esqueletos que laten en lugar de un círculo girando: reservan el espacio del contenido
export function LoadingState({ mensaje = 'Cargando...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col gap-3 py-2" role="status" aria-label={mensaje}>
      <Esqueleto className="h-11" />
      <Esqueleto className="h-11" />
      <Esqueleto className="h-11 w-2/3" />
      <span className="sr-only">{mensaje}</span>
    </div>
  );
}
