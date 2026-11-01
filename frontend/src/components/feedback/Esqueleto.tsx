interface EsqueletoProps {
  className?: string;
}

// Bloque gris que late mientras llegan los datos: reserva el espacio y evita saltos.
export function Esqueleto({ className = 'h-24' }: EsqueletoProps) {
  return <div className={`animate-late rounded-tarjeta bg-arena ${className}`} aria-hidden="true" />;
}

// Fila de indicadores en carga
export function EsqueletoIndicadores({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Cargando indicadores">
      {Array.from({ length: cantidad }, (_, i) => (
        <Esqueleto key={i} className="h-28" />
      ))}
    </div>
  );
}
