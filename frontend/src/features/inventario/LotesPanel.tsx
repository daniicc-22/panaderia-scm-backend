import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { getLotesMateria } from '../../services/inventarioService';
import { COLOR_ESTADO, ETIQUETA_ESTADO, formatoCantidad, formatoCosto, formatoDinero, formatoFecha, formatoFechaIso, textoVencimiento } from './formatos';

interface Props {
  materiaId: string;
  hoy: string;
}

const ROTACION: Record<string, string> = {
  FEFO: 'Se usa primero lo que vence antes (FEFO).',
  FIFO: 'Se usa primero lo que llegó antes (FIFO).',
  ninguno: 'Sin orden de uso definido.',
};

export function LotesPanel({ materiaId, hoy }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventario', 'lotes', materiaId],
    queryFn: () => getLotesMateria(materiaId),
  });

  if (isLoading) return <LoadingState mensaje="Cargando lotes..." />;
  if (isError || !data) return <ErrorState onReintentar={() => refetch()} />;

  const { materia, resumen, lotes, criterio_rotacion } = data;
  const unidad = materia.unidad;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
        <span>
          Existencias: <span className="font-semibold text-gray-900">{formatoCantidad(resumen.stock, unidad)}</span>
        </span>
        {resumen.valor !== undefined && (
          <span>
            Valor: <span className="font-semibold text-gray-900">{formatoDinero(resumen.valor)}</span>
          </span>
        )}
        <Badge color={COLOR_ESTADO[resumen.estado]}>{ETIQUETA_ESTADO[resumen.estado]}</Badge>
      </div>
      <p className="text-xs text-gray-500">{criterio_rotacion ? ROTACION[criterio_rotacion] : 'Criterio de uso sin definir.'}</p>

      {lotes.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No hay lotes con existencias.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {lotes.map((l, i) => (
            <li key={l.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {i === 0 && lotes.length > 1 && <span className="mr-2 text-xs font-medium text-blue-600">Usar primero</span>}
                    Lote {l.codigo_lote ?? 'sin código'}
                  </p>
                  <p className="text-xs text-gray-500">Entró el {formatoFechaIso(l.created_at)}</p>
                </div>
                <p className="text-sm font-medium text-gray-900">{formatoCantidad(l.cantidad_disponible, unidad)}</p>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {l.fecha_vencimiento ? `${formatoFecha(l.fecha_vencimiento)} · ` : ''}
                {textoVencimiento(hoy, l.fecha_vencimiento)}
                {l.costo_unitario !== undefined && ` · ${formatoCosto(l.costo_unitario)} por ${unidad}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
