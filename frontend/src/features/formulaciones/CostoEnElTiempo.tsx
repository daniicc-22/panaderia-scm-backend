import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { Panel } from '../inicio/Panel';
import { getCostoHistorico } from '../../services/formulacionesService';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
// El costo base de los insumos está por gramo: por kilo se lee mejor
const porKilo = (v: number) => pesos0.format(v * 1000);

// Cuánto ha costado producir la receta mes a mes con lo que de verdad se pagó por los insumos,
// y qué insumos explican el cambio. Es la evidencia del efecto de la inflación en cada producto.
export function CostoEnElTiempo({ formulacionId, tieneRendimiento }: { formulacionId: string; tieneRendimiento: boolean }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['formulacion-costo-historico', formulacionId], queryFn: () => getCostoHistorico(formulacionId, 12) });
  const [activo, setActivo] = useState<number | null>(null);

  if (isLoading) return <Esqueleto className="h-56" />;
  if (isError || !data) return <Panel titulo="Costo en el tiempo"><p className="text-sm text-critico-texto">No se pudo cargar el costo histórico.</p></Panel>;

  // Los meses anteriores a la primera compra real no dicen nada: la línea arranca donde hay datos
  const inicio = Math.max(0, data.puntos.findIndex((p) => p.con_compras > 0));
  const puntos = data.puntos.slice(inicio);
  const usarUnidad = tieneRendimiento && puntos.every((p) => p.costo_unidad !== null);
  const valor = (i: number) => (usarUnidad ? (puntos[i].costo_unidad as number) : puntos[i].costo_lote);
  const formato = usarUnidad ? (n: number) => pesos2.format(n) : (n: number) => pesos0.format(n);
  const v = puntos.map((_, i) => valor(i));
  const primero = v[0];
  const ultimo = v[v.length - 1];
  const variacion = primero > 0 ? ((ultimo - primero) / primero) * 100 : null;
  const sinCompras = data.insumos_con_compras === 0;
  const plano = v.every((x) => Math.abs(x - primero) < 0.005);
  const sube = (variacion ?? 0) > 0;

  const W = 640, H = 190, L = 12, R = 12, T = 18, B = 28;
  const minD = Math.min(...v), maxD = Math.max(...v);
  // Holgura arriba y abajo: una serie casi plana no debe quedar pegada al borde ni dejar un vacío raro
  const holgura = (maxD - minD) * 0.2 || maxD * 0.05 || 1;
  const min = minD - holgura, max = maxD + holgura;
  const rango = max - min;
  const x = (i: number) => (v.length === 1 ? W / 2 : L + (i / (v.length - 1)) * (W - L - R));
  const y = (val: number) => H - B - ((val - min) / rango) * (H - B - T);

  const explican = data.insumos.filter((i) => i.efecto_lote !== null && Math.abs(i.efecto_lote) >= 1).slice(0, 4);

  return (
    <Panel
      titulo="Costo en el tiempo"
      subtitulo={`Costo ${usarUnidad ? 'por unidad' : 'por lote'} desde ${etiquetaMes(puntos[0].mes)}, con el precio real pagado por cada insumo`}
      accion={
        variacion !== null && !plano ? (
          <span className={`cifras inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${sube ? 'bg-critico-fondo text-critico-texto' : 'bg-exito-fondo text-exito-texto'}`}>
            {sube ? <TrendingUp size={15} aria-hidden="true" /> : <TrendingDown size={15} aria-hidden="true" />}
            {sube ? '+' : ''}{num.format(variacion)} %
          </span>
        ) : undefined
      }
    >
      {sinCompras ? (
        <p className="rounded-lg bg-hueso px-4 py-6 text-center text-sm text-gris-texto">
          Aún no hay entradas de mercancía de los insumos de esta receta. El costo histórico se arma solo, con cada compra que registres en Inventario.
        </p>
      ) : puntos.length < 2 ? (
        <div className="rounded-lg bg-hueso px-4 py-5 text-center">
          <p className="text-xs font-medium text-gris-texto">Costo {usarUnidad ? 'por unidad' : 'por lote'} con el precio real pagado</p>
          <p className="cifras font-display text-2xl font-semibold text-azul-noche">{formato(v[0])}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gris-texto">
            Todas las compras registradas son de {etiquetaMes(puntos[0].mes)}, así que aún no hay una evolución que dibujar. Aparecerá cuando haya compras en otros meses.
          </p>
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label={`Costo ${usarUnidad ? 'por unidad' : 'por lote'} mes a mes`}>
            {(plano ? [minD] : [minD, maxD]).map((g) => <line key={g} x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--color-linea)" strokeDasharray="3 4" />)}
            <polyline points={v.map((val, i) => `${x(i)},${y(val)}`).join(' ')} fill="none" stroke="var(--color-azul-noche)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {v.map((val, i) => (
              <g key={puntos[i].mes} className="outline-none" style={{ outline: 'none' }} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)} tabIndex={0}>
                <circle cx={x(i)} cy={y(val)} r={16} fill="transparent" />
                <circle cx={x(i)} cy={y(val)} r={activo === i || i === v.length - 1 ? 5 : 3} fill={puntos[i].con_compras > 0 ? 'var(--color-azul-noche)' : 'var(--color-tabla)'} stroke="var(--color-azul-noche)" strokeWidth={2} />
                {(i === 0 || i === v.length - 1 || (i % Math.ceil(v.length / 6) === 0 && v.length - 1 - i >= Math.ceil(v.length / 6))) && (
                  <text x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === v.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--color-gris-texto)">{etiquetaMes(puntos[i].mes)}</text>
                )}
                {(activo === i || (activo === null && i === v.length - 1)) && (
                  <text x={Math.min(Math.max(x(i), 52), W - 52)} y={y(val) - 11} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-grafito)">{formato(val)}</text>
                )}
              </g>
            ))}
          </svg>
          <p className="mt-1 text-xs text-gris-texto">
            Punto lleno: ese mes hubo compras de algún insumo. Punto vacío: se mantiene el último precio conocido.
            {data.insumos_con_compras < data.insumos_total && ` Hay compras reales de ${data.insumos_con_compras} de ${data.insumos_total} insumos; el resto usa su precio actual.`}
          </p>

          {explican.length > 0 && !plano && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-azul-noche">Qué insumos explican el cambio</h3>
              <ul className="divide-y divide-linea rounded-lg border border-linea bg-white">
                {explican.map((i) => (
                  <li key={i.materia_prima_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-grafito">{i.materia}</span>
                      <span className="cifras block text-xs text-gris-texto">{i.costo_inicial !== null && i.costo_final !== null ? `${porKilo(i.costo_inicial)} → ${porKilo(i.costo_final)} por kg` : ''}</span>
                    </span>
                    <span className="text-right">
                      {i.variacion_pct !== null && <span className={`cifras block text-sm font-bold ${i.variacion_pct > 0 ? 'text-critico-texto' : 'text-exito-texto'}`}>{i.variacion_pct > 0 ? '+' : ''}{num.format(i.variacion_pct)} %</span>}
                      <span className="cifras text-xs text-gris-texto">{(i.efecto_lote as number) > 0 ? '+' : '−'}{pesos0.format(Math.abs(i.efecto_lote as number))} por lote</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
