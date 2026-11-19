import { useId } from 'react';
import { NOMBRE_APP } from './marca';

interface LogoProps {
  /** Tamaño en píxeles del símbolo (cuadrado). */
  size?: number;
  /** Fondo sobre el que va el logo: cambia el color de la silueta. */
  fondo?: 'oscuro' | 'claro';
  /** El gorro «leva» suavemente, como la masa madre (pantalla de inicio de sesión). */
  animado?: boolean;
  className?: string;
}

const TRIGO = '#E2AE45';
const TERRACOTA = '#A85C3E';

// Marca de Levain: panadero de brazos cruzados formando una X (un brazo trigo y otro terracota).
// Los brazos se separan del cuerpo con un corte transparente (máscara), así el logo
// se ve bien sobre cualquier fondo: azul noche, la foto del operario o el inicio de sesión.
export function Logo({ size = 32, fondo = 'oscuro', animado = false, className = '' }: LogoProps) {
  const id = useId().replace(/:/g, '');
  const silueta = fondo === 'oscuro' ? '#F5F3EE' : '#22374A';
  const brazoA = 'M11 42 L35 33';
  const brazoB = 'M37 42 L13 33';

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`Logo de ${NOMBRE_APP}`} className={className}>
      <defs>
        {/* Corte alrededor de los dos brazos sobre el cuerpo */}
        <mask id={`${id}-cuerpo`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          <path d={`${brazoA} ${brazoB}`} stroke="black" strokeWidth="9" strokeLinecap="round" />
        </mask>
        {/* Corte del brazo de atrás donde lo cruza el de adelante */}
        <mask id={`${id}-brazo`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="white" />
          <path d={brazoB} stroke="black" strokeWidth="9" strokeLinecap="round" />
        </mask>
      </defs>

      {/* Gorro de panadero */}
      <g className={animado ? 'origin-bottom animate-leva [transform-box:fill-box]' : undefined} fill={TRIGO}>
        <circle cx="19" cy="8" r="5" />
        <circle cx="24" cy="6" r="6" />
        <circle cx="29" cy="8" r="5" />
        <rect x="17.5" y="9" width="13" height="5.5" rx="1.5" />
      </g>

      {/* Cabeza y torso */}
      <circle cx="24" cy="20" r="6.3" fill={silueta} />
      <path d="M7 47 Q7 30 24 29 Q41 30 41 47 Z" fill={silueta} mask={`url(#${id}-cuerpo)`} />

      {/* Brazos cruzados en X */}
      <path d={brazoA} stroke={TRIGO} strokeWidth="5.5" strokeLinecap="round" mask={`url(#${id}-brazo)`} />
      <path d={brazoB} stroke={TERRACOTA} strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}
