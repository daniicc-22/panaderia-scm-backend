import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { getConteos } from '../../services/conteosService';
import { Panel } from '../inicio/Panel';
import { colorEri, formatoPorcentaje } from './etiquetas';

const BARRA = { green: 'bg-verde-bosque', yellow: 'bg-trigo', red: 'bg-terracota', gray: 'bg-grafico-neutro' } as const;

// Exactitud de cada conteo enviado, uno junto a otro, con la meta marcada. Muestra si el inventario mejora con el tiempo.
export function TendenciaExactitud() {
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const datos = conteos.data;
  if (!datos) return null;

  const puntos = datos.items
    .filter((c) => (c.estado === 'enviado' || c.estado === 'aplicado') && c.resumen.eri !== null)
    .sort((a, b) => a.numero - b.numero)
    .slice(-8);
  if (puntos.length === 0) return null;

  return (
    <Panel titulo="Exactitud conteo a conteo" subtitulo={`La línea punteada es la meta (${datos.meta_eri} %). Cada barra es un conteo enviado.`}>
      <div className="relative mt-4 flex h-36 items-end gap-2 border-b border-linea sm:gap-4" role="list" aria-label="Exactitud por conteo">
        <div
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-grafito/60"
          style={{ bottom: `${Math.min(datos.meta_eri, 100)}%` }}
          aria-hidden="true"
        />
        {puntos.map((c) => {
          const eri = c.resumen.eri as number;
          return (
            <div key={c.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" role="listitem" aria-label={`Conteo n.º ${c.numero}: ${formatoPorcentaje(eri)}`}>
              <span className="cifras mb-1 text-xs font-semibold text-grafito">{formatoPorcentaje(eri)}</span>
              <motion.div
                className={`w-full max-w-12 rounded-t ${BARRA[colorEri(eri, datos.meta_eri)]}`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.min(Math.max(eri, 0), 100) * 0.78}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 sm:gap-4">
        {puntos.map((c) => (
          <span key={c.id} className="min-w-0 flex-1 text-center text-xs text-gris-texto">
            n.º {c.numero}
          </span>
        ))}
      </div>
    </Panel>
  );
}
