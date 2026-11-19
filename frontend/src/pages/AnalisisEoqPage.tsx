import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/ui/Alert';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { BarrasCostoAnual } from '../features/reposicion/eoq/BarrasCostoAnual';
import { CortesGuardados } from '../features/reposicion/eoq/CortesGuardados';
import { CurvaCostos } from '../features/reposicion/eoq/CurvaCostos';
import { TablaEoq } from '../features/reposicion/eoq/TablaEoq';
import { conEoq, costoEoq, costoPolitica, costoReferencia, explicacion, insumosSinEoq, motivosSinCalendario, motivosSinEoq, resumenGlobal } from '../features/reposicion/eoq/eoqCalculos';
import { Indicador } from '../features/inicio/Panel';
import { NavReposicion } from '../features/reposicion/NavReposicion';
import { formatoCantidadPlan, formatoDinero } from '../features/inventario/formatos';
import { getRecomendaciones } from '../services/reposicionService';

// Las dos cantidades que importan, antes de mirar la curva: el pedido ideal y el que recomienda el sistema con el calendario
function CifrasClave({ item }: { item: ReturnType<typeof conEoq>[number] }) {
  const qp = item.modelo.cantidad_politica;
  const polit = costoPolitica(item);
  const extra = polit === null ? null : polit - costoEoq(item);
  return (
    <dl className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="rounded-tarjeta bg-azul-noche p-3 text-white">
        <dt className="text-xs font-medium text-niebla">Pedido ideal (EOQ)</dt>
        <dd className="cifras mt-0.5 font-display text-xl font-semibold">{formatoCantidadPlan(item.eoq, item.unidad)}</dd>
        <dd className="text-xs text-niebla">{formatoDinero(costoEoq(item))} al año</dd>
      </div>
      <div className="rounded-tarjeta bg-trigo p-3 text-grafito">
        <dt className="text-xs font-medium text-[#4a3509]">Recomendado con el calendario</dt>
        <dd className="cifras mt-0.5 font-display text-xl font-semibold">{qp === null ? '—' : formatoCantidadPlan(qp, item.unidad)}</dd>
        <dd className="text-xs text-[#4a3509]">{polit === null ? 'Falta el calendario del proveedor' : `${formatoDinero(polit)} al año`}</dd>
      </div>
      <div className="rounded-tarjeta border border-linea bg-hueso p-3 text-grafito">
        <dt className="text-xs font-medium text-gris-texto">Costo de ajustarse</dt>
        <dd className="cifras mt-0.5 font-display text-xl font-semibold">{extra === null ? '—' : extra < 1 ? 'Casi nada' : `+ ${formatoDinero(extra)}`}</dd>
        <dd className="text-xs text-gris-texto">por año, solo pedir y guardar</dd>
      </div>
    </dl>
  );
}

// Análisis EOQ: cuánto conviene pedir de cada insumo, qué tan cerca queda de ese ideal con el calendario del proveedor y cuánto cuesta la diferencia.
export function AnalisisEoqPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });
  const [seleccionId, setSeleccionId] = useState<string | null>(null);

  const lista = useMemo(
    () => conEoq(data?.items ?? []).sort((a, b) => costoReferencia(b) - costoReferencia(a)),
    [data],
  );
  const resumen = useMemo(() => resumenGlobal(data?.items ?? []), [data]);
  const motivos = useMemo(() => motivosSinEoq(data?.items ?? []), [data]);
  const sinEoq = useMemo(() => insumosSinEoq(data?.items ?? []), [data]);
  const sinCalendario = useMemo(() => motivosSinCalendario(data?.items ?? []), [data]);
  const elegido = lista.find((i) => i.materia_prima_id === seleccionId) ?? lista[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6">
        <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Análisis EOQ</h1>
        <p className="mt-1 text-sm text-niebla">Cuánto conviene pedir de cada insumo y cuánto cuesta ajustarse al calendario del proveedor</p>
      </div>
      <NavReposicion />

      <details className="rounded-tarjeta border border-linea bg-tabla p-3 text-sm text-grafito">
        <summary className="cursor-pointer font-medium text-grafito">¿Cómo se lee esta pantalla?</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            Pedir cuesta (hacer el pedido, recibir, pesar) y guardar también cuesta (espacio, riesgo de que se dañe, plata quieta). Si pides
            poco y seguido, pagas muchos pedidos; si pides mucho de una vez, pagas guardar. El <strong>EOQ</strong> es la cantidad por pedido
            donde la suma de los dos costos es la más baja.
          </p>
          <p>
            Pero el proveedor solo entrega en días fijos y algunos insumos duran poco. Por eso el sistema recomienda la cantidad que más se
            acerca al EOQ <em>respetando el calendario</em>. La diferencia es lo que cuesta ese ajuste.
          </p>
          <p>
            Solo se cuenta el costo de pedir y guardar; <strong>no incluye el precio de compra del producto</strong>. El resultado depende del
            consumo semanal, el costo por pedido y el costo de mantener: si alguno es un supuesto, el análisis también lo es.{' '}
            <Link to="/reposicion/parametros" className="font-medium text-pizarra underline">
              Revisar parámetros
            </Link>
          </p>
        </div>
      </details>

      {isLoading && <LoadingState mensaje="Calculando..." />}
      {isError && <ErrorState onReintentar={() => refetch()} />}

      {data && lista.length === 0 && (
        <Alert variant="warning">
          <p className="font-medium">Todavía no se puede calcular el EOQ de ningún insumo.</p>
          <ul className="mt-1 list-disc pl-5">
            {motivos.faltaConsumo > 0 && <li>{motivos.faltaConsumo} sin consumo semanal.</li>}
            {motivos.faltaCostoPedido > 0 && <li>{motivos.faltaCostoPedido} sin costo por pedido.</li>}
            {motivos.faltaTasa > 0 && <li>{motivos.faltaTasa} sin costo de mantener (se calcula con la tasa anual de mantenimiento).</li>}
          </ul>
          <p className="mt-1">
            Complétalo en{' '}
            <Link to="/reposicion/parametros" className="font-medium underline">
              Parámetros
            </Link>
            : el botón «Completar vacíos» lo llena de una vez para todos los insumos.
          </p>
        </Alert>
      )}

      {data && lista.length > 0 && elegido && (
        <>
          {motivos.sinEoq > 0 && (
            <Alert variant="info">
              {motivos.sinEoq === 1 ? '1 insumo no aparece' : `${motivos.sinEoq} insumos no aparecen`} porque aún no se puede calcular su EOQ
              (falta consumo, costo por pedido o costo de mantener).{' '}
              <Link to="/reposicion/parametros" className="font-medium underline">
                Completarlos
              </Link>
              <details className="mt-1">
                <summary className="cursor-pointer font-medium">Ver cuáles y qué les falta</summary>
                <ul className="mt-1 list-disc pl-5">
                  {sinEoq.map((i) => (
                    <li key={i.id}>
                      {i.nombre}: {i.falta.join(', ') || 'revisar parámetros'}
                    </li>
                  ))}
                </ul>
              </details>
            </Alert>
          )}

          {sinCalendario.total > 0 && (
            <Alert variant="info">
              <p>
                {sinCalendario.total === 1 ? '1 insumo' : `${sinCalendario.total} insumos`} se muestra solo con su mínimo teórico (barras más claras) y no
                entra en la comparación con el calendario del proveedor. Lo que falta:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {sinCalendario.sinSeguridad > 0 && (
                  <li>
                    {sinCalendario.sinSeguridad} sin días de seguridad ni stock mínimo (se completan en{' '}
                    <Link to="/reposicion/parametros" className="font-medium underline">
                      Parámetros
                    </Link>
                    , «Completar vacíos»): {sinCalendario.nombresSinSeguridad.join(', ')}.
                  </li>
                )}
                {sinCalendario.sinProveedor > 0 && <li>{sinCalendario.sinProveedor} sin proveedor con precio vigente.</li>}
                {sinCalendario.sinDiasEntrega > 0 && (
                  <li>
                    {sinCalendario.sinDiasEntrega} con un proveedor sin días de entrega (en{' '}
                    <Link to="/proveedores" className="font-medium underline">
                      Proveedores
                    </Link>
                    , botón «Entrega»).
                  </li>
                )}
                {sinCalendario.sinPlazo > 0 && <li>{sinCalendario.sinPlazo} sin plazo de entrega.</li>}
              </ul>
            </Alert>
          )}

          <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador indice={0} tono="azul" etiqueta="Insumos con EOQ" valor={`${resumen.conEoq} de ${resumen.total}`} />
            <Indicador
              indice={1}
              tono="gris"
              etiqueta="Pedir y guardar, con calendario"
              valor={formatoDinero(resumen.costoPolitica)}
              detalle={`por año · ${resumen.conCalendario} ${resumen.conCalendario === 1 ? 'insumo' : 'insumos'}`}
            />
            <Indicador indice={2} tono="verde" etiqueta="Mínimo teórico (EOQ)" valor={formatoDinero(resumen.costoMinimo)} detalle="por año, los mismos insumos, sin restricciones" />
            <Indicador
              indice={3}
              tono="amarillo"
              etiqueta="Costo de ajustarse al calendario"
              valor={`+ ${formatoDinero(resumen.extra)}`}
              detalle={resumen.extraPct === null ? 'por año' : `por año (${resumen.extraPct.toLocaleString('es-CO', { maximumFractionDigits: 1 })} % más)`}
            />
          </section>
          <p className="-mt-2 text-xs text-gris-texto">Solo costo de pedir y guardar; no incluye el precio de compra del producto.</p>

          <section className="rounded-tarjeta border border-linea bg-tabla p-4" aria-label="Dónde se concentra el costo">
            <h2 className="text-base font-semibold text-grafito">Dónde se concentra el costo de pedir y guardar</h2>
            <p className="mb-2 text-sm text-gris-texto">Los 10 insumos que más cuestan al año. Toca uno para ver su curva.</p>
            <BarrasCostoAnual items={lista} seleccionadoId={elegido.materia_prima_id} onSeleccionar={setSeleccionId} />
          </section>

          <section className="rounded-tarjeta border border-linea bg-tabla p-4" aria-label="Curva de costos">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-grafito">Curva de costos de {elegido.nombre}</h2>
                <p className="text-sm text-gris-texto">
                  Consumo de {elegido.demanda_semanal === null ? '—' : formatoCantidadPlan(elegido.demanda_semanal, elegido.unidad)} por semana
                </p>
              </div>
              <label className="text-sm text-grafito">
                <span className="sr-only">Insumo</span>
                <select
                  value={elegido.materia_prima_id}
                  onChange={(e) => setSeleccionId(e.target.value)}
                  className="min-h-11 rounded-md border border-borde-campo px-3 py-2 text-sm"
                >
                  {lista.map((i) => (
                    <option key={i.materia_prima_id} value={i.materia_prima_id}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <CifrasClave item={elegido} />
            <CurvaCostos key={elegido.materia_prima_id} item={elegido} />
            <div className="mt-3 flex flex-col gap-1 rounded-md bg-hueso p-3 text-sm text-grafito">
              {explicacion(elegido, { cantidad: (v) => formatoCantidadPlan(v, elegido.unidad), dinero: formatoDinero }).map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          </section>

          <details className="rounded-tarjeta border border-linea bg-tabla p-3">
            <summary className="cursor-pointer text-sm font-medium text-grafito">Ver todos los números en una tabla</summary>
            <div className="mt-3">
              <TablaEoq items={lista} />
            </div>
          </details>
        </>
      )}

      {data && <CortesGuardados />}
    </div>
  );
}
