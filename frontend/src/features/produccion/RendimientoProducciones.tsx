import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { getProducciones } from '../../services/produccionService';
import { Panel } from '../inicio/Panel';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '');

// Lo que salió frente a lo planificado en las últimas producciones cerradas. 100 % = salió justo lo planificado.
export function RendimientoProducciones() {
  const lista = useQuery({ queryKey: ['produccion', 'lista'], queryFn: () => getProducciones() });
  const puntos = (lista.data ?? [])
    .filter((p) => p.estado === 'finalizada' && p.rendimiento_pct !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(-8);
  if (puntos.length === 0) return null;

  const techo = Math.max(120, Math.ceil(Math.max(...puntos.map((p) => p.rendimiento_pct as number)) / 10) * 10);
  const color = (r: number) => (Math.abs(r - 100) <= 5 ? 'bg-verde-bosque' : Math.abs(r - 100) <= 10 ? 'bg-trigo' : 'bg-terracota');

  return (
    <Panel titulo="Rendimiento de las últimas producciones" subtitulo="Lo que salió frente a lo planificado. La línea punteada es el 100 %.">
      <div className="relative mt-4 flex h-36 items-end gap-2 border-b border-linea sm:gap-4" role="list" aria-label="Rendimiento por producción">
        <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-grafito/60" style={{ bottom: `${(100 / techo) * 100}%` }} aria-hidden="true" />
        {puntos.map((p) => {
          const r = p.rendimiento_pct as number;
          return (
            <div key={p.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" role="listitem" aria-label={`${p.producto}, ${fecha(p.fecha)}: ${r.toLocaleString('es-CO')} %`}>
              <span className="cifras mb-1 text-xs font-semibold text-grafito">{Math.round(r)} %</span>
              <motion.div
                className={`w-full max-w-12 rounded-t ${color(r)}`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.min((r / techo) * 100, 100) * 0.82}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 sm:gap-4">
        {puntos.map((p) => (
          <span key={p.id} className="min-w-0 flex-1 text-center text-xs leading-tight text-gris-texto">
            <span className="block truncate" title={p.producto}>
              {p.producto}
            </span>
            {fecha(p.fecha)}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-gris-texto">Verde: dentro de ±5 % de lo planificado. Trigo: hasta ±10 %. Terracota: más lejos.</p>
    </Panel>
  );
}
