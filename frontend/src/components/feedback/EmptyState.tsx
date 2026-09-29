interface EmptyStateProps {
  titulo?: string;
  mensaje?: string;
}

export function EmptyState({
  titulo = 'Sin datos',
  mensaje = 'No hay información para mostrar todavía.',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center text-gray-500">
      <span className="text-base font-medium text-gray-700">{titulo}</span>
      <span className="text-sm">{mensaje}</span>
    </div>
  );
}