import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/feedback/EmptyState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { formatoCantidad, formatoDinero, formatoFechaIso } from '../inventario/formatos';
import { getMermas } from '../../services/mermasService';
import { ETIQUETA_ETAPA } from './etiquetas';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Historial de mermas. El costo estimado solo llega al servidor para administradores.
export function MermasRecientes() {
  const lista = useQuery({ queryKey: ['mermas', 'lista'], queryFn: () => getMermas() });

  return (
    <section className="flex flex-col gap-3" aria-label="Mermas recientes">
      <h2 className="text-lg font-semibold text-gray-900">Mermas recientes</h2>
      {lista.isLoading ? (
        <LoadingState mensaje="Cargando mermas..." />
      ) : lista.isError ? (
        <ErrorState onReintentar={() => lista.refetch()} />
      ) : (lista.data ?? []).length === 0 ? (
        <EmptyState mensaje="Todavía no hay mermas registradas." />
      ) : (
        <ul className="flex flex-col gap-2">
          {(lista.data ?? []).map((m) => (
            <li key={m.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-gray-900">
                    {m.insumo ?? m.producto ?? 'Merma'}
                    {m.insumo === null && m.producto ? ' (producción)' : ''}
                  </span>
                  <p className="text-xs text-gray-500">
                    {formatoFechaIso(m.fecha)} · {hora(m.fecha)} · {m.usuario}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.etapa && <Badge color="gray">{ETIQUETA_ETAPA[m.etapa]}</Badge>}
                  <Badge color="yellow">{m.causa}</Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-gray-700">
                {formatoCantidad(m.cantidad, m.unidad)}
                {m.codigo_lote ? ` · lote ${m.codigo_lote}` : ''}
                {m.costo_estimado != null ? ` · ${formatoDinero(m.costo_estimado)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
