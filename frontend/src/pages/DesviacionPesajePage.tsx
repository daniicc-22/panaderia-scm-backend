import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { colorDesviacion, textoDesviacion } from '../features/produccion/pesos';
import { getDesviacionesPesaje } from '../services/produccionService';

const CAMPO =
  'min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm';
const entero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const pct = (n: number | null) => (n === null ? '—' : `${entero.format(n)} %`);

// Qué tanto se aleja el pesaje real de la receta, por insumo (solo gestión)
export function DesviacionPesajePage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rangoInvalido = desde !== '' && hasta !== '' && desde > hasta;

  const datos = useQuery({
    queryKey: ['produccion', 'desviaciones', desde, hasta],
    queryFn: () => getDesviacionesPesaje(desde || undefined, hasta || undefined),
    enabled: !rangoInvalido,
  });
  const g = datos.data?.global;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Desviación de pesaje</h1>
        <p className="text-sm text-gray-500">
          Qué tanto se aleja lo que se pesa de lo que pide la receta. Solo cuentan los insumos que se pesaron; los que van «al ojo» se anotan aparte.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="dp-desde" className="text-sm font-medium text-gray-700">Desde</label>
          <input id="dp-desde" type="date" className={CAMPO} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="dp-hasta" className="text-sm font-medium text-gray-700">Hasta</label>
          <input id="dp-hasta" type="date" className={CAMPO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          onClick={() => {
            setDesde('');
            setHasta('');
          }}
        >
          Ver todo
        </Button>
      </div>
      {rangoInvalido && <Alert variant="error">La fecha «desde» no puede ser posterior a «hasta».</Alert>}

      {datos.isLoading ? (
        <LoadingState mensaje="Calculando desviaciones..." />
      ) : datos.isError ? (
        <ErrorState onReintentar={() => datos.refetch()} />
      ) : !datos.data || datos.data.insumos.length === 0 ? (
        !rangoInvalido && <EmptyState mensaje="Todavía no hay producciones con insumos pesados en este periodo." />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <dt className="text-xs text-gray-500">Producciones medidas</dt>
              <dd className="text-xl font-semibold text-gray-900">{g?.producciones}</dd>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <dt className="text-xs text-gray-500">Insumos pesados</dt>
              <dd className="text-xl font-semibold text-gray-900">{pct(g?.pct_pesado ?? null)}</dd>
              <dd className="text-xs text-gray-500">{g?.pesados} de {g?.pesajes}</dd>
            </div>
            <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-3">
              <dt className="text-xs text-gray-500">Desviación típica (sin signo)</dt>
              <dd className="text-xl font-semibold text-gray-900">{pct(g?.desviacion_abs_media_pct ?? null)}</dd>
              <dd className="text-xs text-gray-500">Promedio de cuánto se aleja cada pesaje de la receta, para arriba o para abajo.</dd>
            </div>
          </dl>

          <ul className="flex flex-col gap-2" aria-label="Desviación por insumo">
            {datos.data.insumos.map((i) => (
              <li key={i.materia_prima_id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-gray-900">{i.nombre}</span>
                  {i.desviacion_abs_media_pct === null ? (
                    <Badge color="gray">Nunca se pesó</Badge>
                  ) : (
                    <Badge color={colorDesviacion(i.desviacion_abs_media_pct)}>Error típico {pct(i.desviacion_abs_media_pct)}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-700">
                  Pesado {i.pesadas} de {i.producciones} {i.producciones === 1 ? 'vez' : 'veces'} ({pct(i.pct_pesado)})
                </p>
                {i.desviacion_media_pct !== null && (
                  <p className="mt-0.5 text-xs text-gray-600">
                    En promedio {textoDesviacion(i.desviacion_media_pct)} frente a la receta
                    {i.desviacion_media_pct > 0 ? ' (tiende a pasarse)' : i.desviacion_media_pct < 0 ? ' (tiende a quedarse corto)' : ''}
                    {' · '}Mayor desvío {textoDesviacion(i.desviacion_max_pct)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
