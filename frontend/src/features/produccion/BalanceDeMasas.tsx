import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { formatoCantidad } from '../inventario/formatos';
import { getBalanceMasas } from '../../services/produccionService';

const porcentaje = (n: number) => `${n.toLocaleString('es-CO')} %`;

// Resumen de masas de una producción: lo que entró, lo que se perdió y cuánto salió frente al plan
export function BalanceDeMasas({ id }: { id: string }) {
  const balance = useQuery({ queryKey: ['produccion', 'balance', id], queryFn: () => getBalanceMasas(id) });

  if (balance.isLoading) return <LoadingState mensaje="Calculando el balance..." />;
  if (balance.isError || !balance.data) return <ErrorState onReintentar={() => balance.refetch()} />;
  const b = balance.data;

  return (
    <section className="rounded-md border border-[#c6d3de] bg-info-fondo p-3" aria-label="Balance de masas">
      <h3 className="text-sm font-semibold text-grafito">Balance de masas</h3>
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-gris-texto">Insumos usados (con agua)</dt>
          <dd className="text-base font-semibold text-grafito">{formatoCantidad(b.insumos_g, 'g')}</dd>
        </div>
        <div>
          <dt className="text-xs text-gris-texto">Merma registrada</dt>
          <dd className="text-base font-semibold text-grafito">
            {formatoCantidad(b.merma_total_g, 'g')}
            {b.merma_pct !== null && <span className="ml-1 text-sm font-normal text-gris-texto">({porcentaje(b.merma_pct)})</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gris-texto">Rendimiento</dt>
          <dd className="text-base font-semibold text-grafito">
            {b.rendimiento_pct === null ? 'Sin cerrar' : porcentaje(b.rendimiento_pct)}
            {b.cantidad_producida !== null && b.cantidad_planificada !== null && (
              <span className="ml-1 text-sm font-normal text-gris-texto">
                ({b.cantidad_producida.toLocaleString('es-CO')} de {b.cantidad_planificada.toLocaleString('es-CO')})
              </span>
            )}
          </dd>
        </div>
      </dl>

      {b.merma_total_g > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gris-texto">
            Masa perdida ya mezclada: {formatoCantidad(b.merma_masa_g, 'g')} · Insumo perdido antes de usarse: {formatoCantidad(b.merma_insumo_g, 'g')}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {b.por_causa.map((c) => (
              <Badge key={c.causa} color="yellow">
                {c.causa}: {formatoCantidad(c.gramos, 'g')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {b.insumos.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {b.insumos.map((i) => (
            <li key={i.materia_prima_id} className="flex items-center gap-2 text-sm text-grafito">
              <span className="w-32 shrink-0 truncate sm:w-40">{i.nombre}</span>
              <span
                className="h-2 rounded-sm bg-pizarra"
                style={{ width: `${Math.max(2, Math.min(100, i.porcentaje))}%`, maxWidth: '55%' }}
                aria-hidden="true"
              />
              <span className="shrink-0 text-xs text-gris-texto">
                {formatoCantidad(i.gramos, 'g')} · {porcentaje(i.porcentaje)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {b.sin_masa.length > 0 && (
        <p className="mt-2 text-xs text-gris-texto">No suman al total porque no se miden en gramos: {b.sin_masa.join(', ')}.</p>
      )}
      {!b.con_pesaje && (
        <p className="mt-2 text-xs text-gris-texto">Producción anterior al peso real: se usó lo descontado de los lotes.</p>
      )}
      <p className="mt-2 text-xs text-gris-texto">La masa del producto terminado se calculará cuando se pese una unidad de cada producto.</p>
    </section>
  );
}
