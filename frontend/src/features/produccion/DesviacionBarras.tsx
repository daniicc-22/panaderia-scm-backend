import { motion } from 'motion/react';
import { Panel } from '../inicio/Panel';
import { techoRedondo } from '../inicio/ProduccionDiaria';
import type { DesviacionInsumo } from '../../types/produccion.types';
import { colorDesviacion, textoDesviacion } from './pesos';

const COLOR = {
  green: 'bg-verde-bosque',
  yellow: 'bg-trigo',
  red: 'bg-terracota',
  gray: 'bg-grafico-neutro',
} as const;

// Barras hacia los dos lados: a la derecha el insumo se pasa de la receta, a la izquierda se queda corto.
// La banda clara marca la tolerancia (±5 %, la misma que usan las etiquetas de abajo).
export function DesviacionBarras({ insumos }: { insumos: DesviacionInsumo[] }) {
  const medidos = insumos
    .filter((i) => i.desviacion_media_pct !== null)
    .sort((a, b) => Math.abs(b.desviacion_media_pct ?? 0) - Math.abs(a.desviacion_media_pct ?? 0))
    .slice(0, 10);
  if (medidos.length === 0) return null;

  const maxAbs = Math.max(...medidos.map((i) => Math.abs(i.desviacion_media_pct ?? 0)), 5);
  const techo = techoRedondo(maxAbs);
  const mitad = (v: number) => (Math.abs(v) / techo) * 50; // % del ancho a cada lado del centro
  const tol = mitad(5);

  return (
    <Panel
      titulo="Qué insumos se alejan más de la receta"
      subtitulo="Desvío medio por insumo (los 10 mayores). Derecha: se pasa. Izquierda: se queda corto."
    >
      <div className="mb-1 grid grid-cols-[7rem_1fr_4.5rem] items-end gap-3 text-xs text-gris-texto sm:grid-cols-[11rem_1fr_5rem]" aria-hidden="true">
        <span />
        <div className="flex justify-between">
          <span>← Se queda corto</span>
          <span>Se pasa →</span>
        </div>
        <span />
      </div>
      <ul className="flex flex-col gap-2">
        {medidos.map((i, idx) => {
          const v = i.desviacion_media_pct ?? 0;
          const ancho = mitad(v);
          const color = COLOR[colorDesviacion(v)];
          return (
            <li
              key={i.materia_prima_id}
              className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 sm:grid-cols-[11rem_1fr_5rem]"
              title={`${i.nombre}: ${textoDesviacion(v)} en promedio frente a la receta${v > 0 ? ' (tiende a pasarse)' : v < 0 ? ' (tiende a quedarse corto)' : ''}`}
            >
              <span className="truncate text-sm text-grafito">{i.nombre}</span>
              <div className="relative h-5 rounded-xs bg-arena" role="img" aria-label={`${i.nombre}: ${textoDesviacion(v)}`}>
                <span
                  className="absolute inset-y-0 rounded-xs bg-exito-fondo"
                  style={{ left: `${50 - tol}%`, width: `${tol * 2}%` }}
                  aria-hidden="true"
                />
                <span className="absolute inset-y-0 left-1/2 w-px bg-grafico-neutro" aria-hidden="true" />
                <motion.span
                  className={`absolute inset-y-1 ${color} ${v >= 0 ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${ancho}%` }}
                  transition={{ duration: 0.7, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="cifras text-right text-sm font-semibold text-grafito">{textoDesviacion(v)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-gris-texto">
        Escala: ±{techo} %. La banda verde clara es la tolerancia de ±5 %; el color pasa a trigo hasta ±10 % y a terracota por fuera.
      </p>
    </Panel>
  );
}
