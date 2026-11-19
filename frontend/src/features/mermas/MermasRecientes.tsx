import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/feedback/EmptyState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { formatoCantidad, formatoDinero, formatoFechaIso } from '../inventario/formatos';
import { getMermas } from '../../services/mermasService';
import { ETIQUETA_ETAPA } from './etiquetas';

type FiltroEtapa = 'todas' | 'recepcion' | 'almacenamiento' | 'produccion';
const INICIAL = 8;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Historial de mermas. El costo estimado solo llega al servidor para administradores.
export function MermasRecientes() {
  const lista = useQuery({ queryKey: ['mermas', 'lista'], queryFn: () => getMermas() });
  const [filtro, setFiltro] = useState<FiltroEtapa>('todas');
  const [verTodas, setVerTodas] = useState(false);
  const todas = lista.data ?? [];
  const filtradas = todas.filter((m) => filtro === 'todas' || m.etapa === filtro);
  const visibles = verTodas ? filtradas : filtradas.slice(0, INICIAL);
  const cuenta = (f: FiltroEtapa) => (f === 'todas' ? todas.length : todas.filter((m) => m.etapa === f).length);

  return (
    <section className="flex flex-col gap-3" aria-label="Mermas recientes">
      <h2 className="font-display text-lg font-semibold text-azul-noche">Mermas recientes</h2>
      {todas.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por etapa">
          {(['todas', 'recepcion', 'almacenamiento', 'produccion'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => { setFiltro(f); setVerTodas(false); }}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${filtro === f ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
            >
              {f === 'todas' ? 'Todas' : ETIQUETA_ETAPA[f]}
              <span className="cifras text-xs opacity-80">{cuenta(f)}</span>
            </button>
          ))}
        </div>
      )}
      {lista.isLoading ? (
        <LoadingState mensaje="Cargando mermas..." />
      ) : lista.isError ? (
        <ErrorState onReintentar={() => lista.refetch()} />
      ) : todas.length === 0 ? (
        <EmptyState mensaje="Todavía no hay mermas registradas." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((m) => (
            <li key={m.id} className="rounded-tarjeta border border-l-4 border-linea border-l-trigo bg-tabla p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-grafito">
                    {m.insumo ?? m.producto ?? 'Merma'}
                    {m.insumo === null && m.producto ? ' (producción)' : ''}
                  </span>
                  <p className="text-xs text-gris-texto">
                    {formatoFechaIso(m.fecha)} · {hora(m.fecha)} · {m.usuario}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.etapa && <Badge color="gray">{ETIQUETA_ETAPA[m.etapa]}</Badge>}
                  <Badge color="yellow">{m.causa}</Badge>
                </div>
              </div>
              <p className="cifras mt-1 text-sm font-semibold text-grafito">
                {formatoCantidad(m.cantidad, m.unidad)}
                {m.codigo_lote ? ` · lote ${m.codigo_lote}` : ''}
                {m.costo_estimado != null ? ` · ${formatoDinero(m.costo_estimado)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {filtradas.length > INICIAL && (
        <button type="button" onClick={() => setVerTodas((v) => !v)} className="min-h-11 w-fit text-sm font-semibold text-pizarra hover:underline">
          {verTodas ? 'Ver menos' : `Ver las ${filtradas.length} mermas`}
        </button>
      )}
    </section>
  );
}
