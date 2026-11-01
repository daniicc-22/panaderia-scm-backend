import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { getCortesEoq, guardarCorteEoq } from '../../../services/reposicionService';
import { mensajeDeError } from '../../../services/errores';

const fechaLarga = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const aFecha = (iso: string) => fechaLarga.format(new Date(`${iso}T00:00:00Z`));

// Guarda una foto del análisis de hoy para poder compararla después (antes y después del piloto).
export function CortesGuardados() {
  const queryClient = useQueryClient();
  const cortes = useQuery({ queryKey: ['reposicion', 'cortes'], queryFn: getCortesEoq });
  const guardar = useMutation({
    mutationFn: guardarCorteEoq,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reposicion', 'cortes'] }),
  });
  const r = guardar.data;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs" aria-label="Cortes guardados">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold text-gray-900">Guardar el análisis de hoy</h2>
          <p className="text-sm text-gray-500">
            Deja una copia con fecha de lo que el sistema calculó hoy (demanda, EOQ, costos y advertencias de cada insumo). Sirve para comparar el
            antes y el después del piloto. Si ya guardaste hoy, se reemplaza.
          </p>
        </div>
        <Button onClick={() => guardar.mutate()} isLoading={guardar.isPending} className="min-h-11">
          Guardar corte de hoy
        </Button>
      </div>

      {guardar.isError && (
        <div className="mt-3">
          <Alert variant="error">{mensajeDeError(guardar.error, 'No se pudo guardar el corte.')}</Alert>
        </div>
      )}

      {r && (
        <div className="mt-3" role="status">
          <Alert variant="success">
            Corte del {aFecha(r.fecha)} guardado: {r.guardados} {r.guardados === 1 ? 'insumo' : 'insumos'} ({r.calculados} con EOQ calculado,{' '}
            {r.datos_insuficientes} con datos insuficientes){r.reemplazados > 0 ? '. Reemplazó el que ya había de hoy' : ''}.
            {r.omitidos.length > 0 && (
              <>
                {' '}
                No se guardaron {r.omitidos.length} por no tener consumo todavía.
              </>
            )}
          </Alert>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-medium text-gray-900">Cortes guardados</h3>
        {cortes.isLoading && <p className="mt-1 text-sm text-gray-500">Cargando...</p>}
        {cortes.isError && <p className="mt-1 text-sm text-red-600">No se pudieron cargar los cortes.</p>}
        {cortes.data && cortes.data.length === 0 && <p className="mt-1 text-sm text-gray-500">Todavía no has guardado ninguno.</p>}
        {cortes.data && cortes.data.length > 0 && (
          <ul className="mt-1 divide-y divide-gray-100 text-sm">
            {cortes.data.map((c) => (
              <li key={c.fecha} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-gray-900">{aFecha(c.fecha)}</span>
                <span className="text-gray-600">
                  {c.insumos} insumos · {c.calculados} con EOQ · {c.datos_insuficientes} con datos insuficientes
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
