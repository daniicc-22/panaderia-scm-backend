import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { getMermas } from '../../services/mermasService';
import { formatoDinero } from '../inventario/formatos';
import { Panel } from '../inicio/Panel';

// Dónde se va el desperdicio: las mermas registradas, agrupadas por causa. Si el rol puede ver costos, se ordena por plata;
// si no, por número de registros (las cantidades están en unidades distintas y no se pueden sumar).
export function MermasPorCausa() {
  const lista = useQuery({ queryKey: ['mermas', 'lista'], queryFn: () => getMermas() });

  const resumen = useMemo(() => {
    const items = lista.data ?? [];
    if (items.length === 0) return null;
    const conCosto = items.some((m) => m.costo_estimado != null);
    const mapa = new Map<string, number>();
    for (const m of items) mapa.set(m.causa, (mapa.get(m.causa) ?? 0) + (conCosto ? (m.costo_estimado ?? 0) : 1));
    const filas = [...mapa.entries()].map(([causa, valor]) => ({ causa, valor })).sort((a, b) => b.valor - a.valor);
    const total = filas.reduce((s, f) => s + f.valor, 0);
    return { conCosto, filas: filas.slice(0, 6), total, otras: filas.length - 6 };
  }, [lista.data]);

  if (!resumen || resumen.total <= 0) return null;
  const maximo = Math.max(...resumen.filas.map((f) => f.valor), 1);
  const principal = resumen.filas[0];
  const pctPrincipal = Math.round((principal.valor / resumen.total) * 100);
  const texto = (v: number) => (resumen.conCosto ? formatoDinero(v) : `${v} ${v === 1 ? 'registro' : 'registros'}`);

  return (
    <Panel
      titulo="Dónde se va el desperdicio"
      subtitulo={resumen.conCosto ? 'Costo estimado de las mermas registradas, por causa' : 'Mermas registradas, por causa'}
    >
      <p className="mb-3 font-display text-lg font-semibold text-azul-noche">
        {resumen.filas.length === 1 ? (
          <>
            Todas las mermas registradas son por <span className="text-terracota">{principal.causa}</span>
          </>
        ) : (
          <>
            <span className="text-terracota">{principal.causa}</span> explica el {pctPrincipal} % de {resumen.conCosto ? 'lo perdido' : 'las mermas'}
          </>
        )}
      </p>
      <ul className="flex flex-col gap-2" aria-label="Mermas por causa">
        {resumen.filas.map((f) => (
          <li key={f.causa} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_6.5rem]">
            <span className="truncate text-grafito" title={f.causa}>
              {f.causa}
            </span>
            <span className="h-3 overflow-hidden rounded-r bg-arena" aria-hidden="true">
              <motion.span
                className="block h-full rounded-r bg-terracota"
                initial={{ width: 0 }}
                animate={{ width: `${(f.valor / maximo) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </span>
            <span className="cifras text-right text-xs font-medium text-grafito">{texto(f.valor)}</span>
          </li>
        ))}
      </ul>
      {resumen.otras > 0 && <p className="mt-2 text-xs text-gris-texto">Y {resumen.otras} {resumen.otras === 1 ? 'causa más' : 'causas más'} con valores menores.</p>}
    </Panel>
  );
}
