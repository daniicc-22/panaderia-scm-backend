import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { aNumero } from '../features/inventario/esquemaEntrada';
import { formatoCantidad, formatoFecha } from '../features/inventario/formatos';
import { ProduccionesRecientes } from '../features/produccion/ProduccionesRecientes';
import { colorDesviacion, leerPesos, textoDesviacion, type PesosTexto } from '../features/produccion/pesos';
import { getFormulaciones } from '../services/formulacionesService';
import { mensajeDeError } from '../services/errores';
import { registrarProduccion, simularProduccion } from '../services/produccionService';
import type { PlanConsumo } from '../types/inventario.types';

const LOTES_MAX = 1000;
// Un peso a más de la mitad de la receta casi siempre es un error de unidad (kilos en vez de gramos)
const DESVIACION_SOSPECHOSA = 50;

const CAMPO =
  'min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm';

export function ProduccionPage() {
  const queryClient = useQueryClient();
  const [formulacionId, setFormulacionId] = useState('');
  const [lotesTexto, setLotesTexto] = useState('1');
  const [errorLotes, setErrorLotes] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanConsumo | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [pesosTexto, setPesosTexto] = useState<PesosTexto>({});

  const formulaciones = useQuery({ queryKey: ['formulaciones', 'produccion'], queryFn: getFormulaciones });

  const lotes = aNumero(lotesTexto);
  const lotesValidos = lotesTexto.trim() !== '' && Number.isFinite(lotes) && lotes > 0 && lotes <= LOTES_MAX;

  // Pesos que el operario escribió: los vacíos son insumos «al ojo» y usan el peso de la receta
  const lectura = leerPesos(pesosTexto);
  const hayErrorPesos = Object.keys(lectura.errores).length > 0;

  // Cualquier cambio en lo que se pidió invalida el plan que ya se estaba mostrando (y los pesos escritos)
  function limpiarPlan() {
    setPlan(null);
    setPesosTexto({});
    setExito(null);
    calcular.reset();
    confirmar.reset();
  }

  const calcular = useMutation({
    mutationFn: () => simularProduccion({ formulacion_id: formulacionId, lotes, pesos_reales: lectura.pesos }),
    onSuccess: (p) => setPlan(p),
  });

  const confirmar = useMutation({
    mutationFn: () => registrarProduccion({ formulacion_id: formulacionId, lotes, pesos_reales: lectura.pesos }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      await queryClient.invalidateQueries({ queryKey: ['produccion'] });
      setExito(
        `Producción registrada: ${lotes} ${lotes === 1 ? 'lote' : 'lotes'} de ${r.plan.formulacion.producto}. Los insumos ya se descontaron del inventario. Cuando termine la tanda, ciérrala abajo con lo que salió.`,
      );
      setPlan(null);
      setPesosTexto({});
    },
    // Si faltó un insumo, el servidor devuelve el plan con el faltante para mostrarlo
    onError: (error) => {
      const plan409 = (error as { response?: { data?: { plan?: PlanConsumo } } }).response?.data?.plan;
      if (plan409) setPlan(plan409);
    },
  });

  // Al terminar de escribir un peso se recalcula: el peso real cambia de qué lotes sale cada insumo
  function alSalirDelPeso() {
    if (plan && !hayErrorPesos && !calcular.isPending) calcular.mutate();
  }

  function alCalcular() {
    setExito(null);
    if (!formulacionId) return setErrorLotes('Elige el producto.');
    if (!lotesValidos) return setErrorLotes(`Escribe una cantidad de lotes mayor que 0 y hasta ${LOTES_MAX}.`);
    setErrorLotes(null);
    confirmar.reset();
    calcular.mutate();
  }

  const elegida = formulaciones.data?.find((f) => f.id === formulacionId);
  const faltantes = plan?.items.filter((i) => i.faltante > 0) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Producir</h1>
        <p className="text-sm text-gray-500">Registra una producción y descuenta los insumos del inventario.</p>
      </div>

      {exito && <Alert variant="success">{exito}</Alert>}

      {formulaciones.isLoading ? (
        <LoadingState mensaje="Cargando productos..." />
      ) : formulaciones.isError ? (
        <ErrorState onReintentar={() => formulaciones.refetch()} />
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:max-w-xl">
          <div className="flex flex-col gap-1">
            <label htmlFor="pr-producto" className="text-sm font-medium text-gray-700">
              Producto
            </label>
            <select
              id="pr-producto"
              className={CAMPO}
              value={formulacionId}
              onChange={(e) => {
                setFormulacionId(e.target.value);
                setErrorLotes(null);
                limpiarPlan();
              }}
            >
              <option value="">Elige el producto</option>
              {(formulaciones.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.producto}
                  {f.es_intermedio ? ' (intermedio)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="pr-lotes" className="text-sm font-medium text-gray-700">
              ¿Cuántos lotes de la receta?
            </label>
            <input
              id="pr-lotes"
              className={CAMPO}
              inputMode="decimal"
              autoComplete="off"
              value={lotesTexto}
              onChange={(e) => {
                setLotesTexto(e.target.value);
                setErrorLotes(null);
                limpiarPlan();
              }}
            />
            {elegida && lotesValidos && (
              <span className="text-xs text-gray-500">
                Cada lote pesa {formatoCantidad(elegida.peso_lote_g, 'g')}
                {elegida.rendimiento !== null ? ` y rinde ${elegida.rendimiento} unidades` : ''}
                {elegida.rendimiento !== null ? ` (${Math.round(elegida.rendimiento * lotes * 1000) / 1000} en total).` : '.'}
              </span>
            )}
            {errorLotes && <span className="text-xs text-red-600">{errorLotes}</span>}
          </div>

          <Button type="button" className="min-h-11" isLoading={calcular.isPending} onClick={alCalcular}>
            Calcular consumo
          </Button>
          {calcular.isError && <Alert variant="error">{mensajeDeError(calcular.error, 'No se pudo calcular el consumo.')}</Alert>}
        </div>
      )}

      {plan && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              Consumo para {plan.lotes} {plan.lotes === 1 ? 'lote' : 'lotes'} de {plan.formulacion.producto}
            </h2>
            <Badge color={plan.completo ? 'green' : 'red'}>{plan.completo ? 'Hay existencias' : 'Faltan existencias'}</Badge>
          </div>

          {!plan.completo && (
            <Alert variant="error">
              No se puede registrar: faltan existencias de {faltantes.map((i) => i.nombre).join(', ')}. Registra la entrada de
              esos insumos o reduce los lotes.
            </Alert>
          )}

          <p className="text-sm text-gray-600">
            Escribe lo que pesaste de cada insumo. Los que dejes vacíos se toman «al ojo» con el peso de la receta.
          </p>

          <ul className="flex flex-col gap-2">
            {plan.items.map((i) => (
              <li
                key={i.materia_prima_id}
                className={`rounded-lg border p-3 ${
                  i.faltante > 0 ? 'border-red-200 bg-red-50' : i.controla_inventario ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-gray-900">{i.nombre}</span>
                  <span className="text-sm font-semibold text-gray-900">{formatoCantidad(i.necesario, i.unidad)}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <label htmlFor={`peso-${i.materia_prima_id}`} className="text-xs font-medium text-gray-600">
                    Lo que pesaste ({i.unidad})
                  </label>
                  <input
                    id={`peso-${i.materia_prima_id}`}
                    className={CAMPO}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={`Receta: ${i.peso_estandar.toLocaleString('es-CO')} ${i.unidad}`}
                    value={pesosTexto[i.materia_prima_id] ?? ''}
                    onChange={(e) => setPesosTexto((prev) => ({ ...prev, [i.materia_prima_id]: e.target.value }))}
                    onBlur={alSalirDelPeso}
                  />
                  {lectura.errores[i.materia_prima_id] && <span className="text-xs text-red-600">{lectura.errores[i.materia_prima_id]}</span>}
                  {i.pesado && i.desviacion_pct !== null && !lectura.errores[i.materia_prima_id] && (
                    <span>
                      <Badge color={colorDesviacion(i.desviacion_pct)}>{textoDesviacion(i.desviacion_pct)} frente a la receta</Badge>
                    </span>
                  )}
                  {i.pesado && i.desviacion_pct !== null && Math.abs(i.desviacion_pct) > DESVIACION_SOSPECHOSA && !lectura.errores[i.materia_prima_id] && (
                    <span className="text-xs font-medium text-yellow-700">
                      Está muy lejos de la receta ({formatoCantidad(i.peso_estandar, i.unidad)}). Revisa que lo escribiste en {i.unidad === 'g' ? 'gramos, no en kilos' : i.unidad}.
                    </span>
                  )}
                </div>
                {!i.controla_inventario && (
                  <p className="mt-1 text-xs text-gray-500">No se controla en inventario: no se descuenta.</p>
                )}
                {i.faltante > 0 && (
                  <p className="mt-1 text-sm font-medium text-red-700">Faltan {formatoCantidad(i.faltante, i.unidad)}</p>
                )}
                {i.vencido_omitido > 0 && (
                  <p className="mt-1 text-xs text-yellow-700">
                    {formatoCantidad(i.vencido_omitido, i.unidad)} en lotes vencidos no se usan.
                  </p>
                )}
                {i.lotes.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-gray-600">
                    {i.lotes.map((l) => (
                      <li key={l.lote_id}>
                        {formatoCantidad(l.cantidad, i.unidad)} del lote {l.codigo_lote ?? 'sin código'}
                        {l.fecha_vencimiento ? ` (vence ${formatoFecha(l.fecha_vencimiento)})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {confirmar.isError && <Alert variant="error">{mensajeDeError(confirmar.error, 'No se pudo registrar la producción.')}</Alert>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="min-h-11" onClick={limpiarPlan} disabled={confirmar.isPending}>
              Cancelar
            </Button>
            <Button type="button" className="min-h-11" isLoading={confirmar.isPending} disabled={!plan.completo || hayErrorPesos} onClick={() => confirmar.mutate()}>
              Registrar producción
            </Button>
          </div>
        </div>
      )}

      <ProduccionesRecientes />
    </div>
  );
}
