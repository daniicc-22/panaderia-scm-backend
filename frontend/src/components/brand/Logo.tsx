interface LogoProps {
  /** Tamaño en píxeles del símbolo (cuadrado). */
  size?: number;
  /** Fondo sobre el que va el logo: cambia el color de la hogaza y de la base. */
  fondo?: 'oscuro' | 'claro';
  className?: string;
}

// Marca "hogaza con datos": tres barras que crecen sobre la tabla del pan.
export function Logo({ size = 32, fondo = 'oscuro', className = '' }: LogoProps) {
  const hogaza = fondo === 'oscuro' ? '#F5F3EE' : '#22374A';
  const base = fondo === 'oscuro' ? '#E2AE45' : '#A85C3E';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Logo Panadería SCM"
      className={className}
    >
      <path d="M5 35 C5 20 13 13 24 13 C35 13 43 20 43 35 Z" fill={hogaza} />
      <rect x="14" y="26" width="5" height="7" rx="1.5" fill="#E2AE45" />
      <rect x="21.5" y="22" width="5" height="11" rx="1.5" fill="#E2AE45" />
      <rect x="29" y="18" width="5" height="15" rx="1.5" fill="#A85C3E" />
      <rect x="3" y="35" width="42" height="3.5" rx="1.75" fill={base} />
    </svg>
  );
}
