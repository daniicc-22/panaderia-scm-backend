import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { formatoCantidad } from '../inventario/formatos';
import { getQueProducir } from '../../services/reposicionService';
import type { ItemProducible } from '../../types/reposicion.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

function Fila({ i }: { i: ItemProducible }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{i.producto}</p>
        {i.estado === 'puede' && <Badge color="green">Alcanza para {i.lotes_posibles} {i.lotes_posibles === 1 ? 'lote' : 'lotes'}</Badge>}
        {i.estado === 'no_alcanza' && <Badge color="red">No alcanza para un lote</Badge>}
        {i.estado === 'no_calculable' && <Badge color="gray">No se puede calcular</Badge>}
      </div>

      {i.estado === 'puede' && i.limitante && (
        <p className="mt-1 text-xs text-gray-600">
          {i.cantidad_posible !== null && `${numero.format(i.cantidad_posible)} unidades · `}
          Lo que primero se acaba: {i.limitante.nombre} (hay {formatoCantidad(i.limitante.disponible, i.limitante.unidad)}, cada lote gasta{' '}
          {formatoCantidad(i.limitante.por_lote, i.limitante.unidad)}).
        </p>
      )}
      {i.estado === 'no_alcanza' && i.faltantes.length > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          Falta: {i.faltantes.map((f) => `${f.nombre} (${formatoCantidad(f.falta, f.unidad)})`).join(', ')}.
        </p>
      )}
      {i.estado === 'no_calculable' && i.motivo && <p className="mt-1 text-xs text-gray-600">{i.motivo}</p>}
      {i.compra_al_uso.length > 0 && (
        <p className="mt-1 text-xs text-blue-700">
          Se compra para producir: {i.compra_al_uso.map((c) => `${c.nombre} (${formatoCantidad(c.por_lote, c.unidad)} por lote)`).join(', ')}.
        </p>
      )}
    </li>
  );
}

// Qué productos se pueden hacer con lo que hay hoy. Sin dinero: lo ven todos los roles.
export function QueProducir() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['produccion', 'que-producir'], queryFn: getQueProducir });

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5" aria-label="Qué se puede producir">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Qué se puede producir hoy</h2>
        <p className="text-sm text-gray-500">Con las existencias vigentes (los lotes vencidos no cuentan).</p>
      </div>
      {isLoading && <LoadingState mensaje="Calculando..." />}
      {isError && <ErrorState onReintentar={() => refetch()} />}
      {data && (
        <>
          <p className="text-sm text-gray-700">
            {data.resumen.pueden} se pueden hacer · {data.resumen.no_alcanzan} no alcanzan
            {data.resumen.no_calculables > 0 && ` · ${data.resumen.no_calculables} sin calcular`}
          </p>
          <ul className="flex flex-col gap-2">
            {data.items.map((i) => (
              <Fila key={i.formulacion_id} i={i} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
