import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import { getProduccion } from '../../services/produccionService';
import { BalanceDeMasas } from './BalanceDeMasas';
import { colorDesviacion, textoDesviacion } from './pesos';

// Qué se usó de cada insumo en una producción: receta, peso real, desviación y lotes
export function DetalleProduccion({ id }: { id: string }) {
  const detalle = useQuery({ queryKey: ['produccion', 'detalle', id], queryFn: () => getProduccion(id) });

  if (detalle.isLoading) return <LoadingState mensaje="Cargando el detalle..." />;
  if (detalle.isError || !detalle.data) return <ErrorState onReintentar={() => detalle.refetch()} />;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <BalanceDeMasas id={id} />
      <ul className="flex flex-col gap-2">
      {detalle.data.insumos.map((i) => (
        <li key={i.materia_prima_id} className="rounded-md border border-linea bg-tabla p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="font-medium text-grafito">{i.nombre}</span>
            {i.pesado === null ? (
              <Badge color="gray">Sin dato de pesaje</Badge>
            ) : i.pesado ? (
              <Badge color={colorDesviacion(i.desviacion_pct)}>{textoDesviacion(i.desviacion_pct)} frente a la receta</Badge>
            ) : (
              <Badge color="gray">Al ojo</Badge>
            )}
          </div>
          {i.unidad && i.peso_real !== null && i.peso_estandar !== null && (
            <p className="mt-1 text-sm text-grafito">
              Usado {formatoCantidad(i.peso_real, i.unidad)}
              {i.pesado ? ` (receta: ${formatoCantidad(i.peso_estandar, i.unidad)})` : ' (se tomó el peso de la receta)'}
            </p>
          )}
          {!i.controla_inventario && <p className="mt-1 text-xs text-gris-texto">No se controla en inventario.</p>}
          {i.unidad &&
            i.lotes.map((l, n) => (
              <p key={n} className="mt-0.5 text-xs text-gris-texto">
                {formatoCantidad(l.cantidad, i.unidad!)} del lote {l.codigo_lote ?? 'sin código'}
                {l.fecha_vencimiento ? ` (vence ${formatoFecha(l.fecha_vencimiento)})` : ''}
              </p>
            ))}
        </li>
      ))}
      </ul>
    </div>
  );
}
