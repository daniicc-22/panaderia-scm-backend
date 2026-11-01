import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

interface NumeroAnimadoProps {
  valor: number;
  /** Cómo mostrar el número mientras cuenta (por ejemplo, con " %" o separador de miles). */
  formato?: (n: number) => string;
  /** Duración en segundos. */
  duracion?: number;
}

const porDefecto = (n: number) => Math.round(n).toLocaleString('es-CO');

// Cuenta desde 0 hasta el valor al aparecer y cuando el valor cambia.
// Con "reducir movimiento" activo muestra el valor final de inmediato.
export function NumeroAnimado({ valor, formato = porDefecto, duracion = 0.9 }: NumeroAnimadoProps) {
  const reducido = useReducedMotion();
  const [actual, setActual] = useState(reducido ? valor : 0);

  useEffect(() => {
    if (reducido) {
      setActual(valor);
      return;
    }
    const control = animate(0, valor, {
      duration: duracion,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setActual(v),
    });
    return () => control.stop();
  }, [valor, duracion, reducido]);

  return <span className="cifras">{formato(actual)}</span>;
}
