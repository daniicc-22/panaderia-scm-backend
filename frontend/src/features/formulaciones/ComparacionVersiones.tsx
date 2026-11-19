import { useQueries } from '@tanstack/react-query';
import { ArrowRight, Minus, Pencil, Plus } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { getFormulacion } from '../../services/formulacionesService';
import { compararVersiones, type CambioIngrediente, type EstadoCambio } from './comparar';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

const cant = (n: number | null, unidad: string) => (n === null ? '—' : unidad === 'g' && n >= 1000 ? `${num.format(n / 1000)} kg` : `${num.format(n)} ${unidad}`);
const signo = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

const ESTILO: Record<EstadoCambio, { etiqueta: string; chip: string; borde: string; Icono: typeof Plus | null }> = {
  agregado: { etiqueta: 'Agregado', chip: 'bg-exito-fondo text-exito-texto', borde: 'border-l-verde-bosque', Icono: Plus },
  quitado: { etiqueta: 'Quitado', chip: 'bg-critico-fondo text-critico-texto', borde: 'border-l-critico', Icono: Minus },
  cambiado: { etiqueta: 'Cambió', chip: 'bg-atencion-fondo text-atencion-texto', borde: 'border-l-trigo', Icono: Pencil },
  igual: { etiqueta: 'Igual', chip: 'bg-arena text-gris-texto', borde: 'border-l-linea', Icono: null },
};

function Fila({ c, verCostos }: { c: CambioIngrediente; verCostos: boolean }) {
  const e = ESTILO[c.estado];
  const tolCambia = c.estado === 'cambiado' && c.tolerancia_antes !== c.tolerancia_despues;
  return (
    <li className={`grid gap-x-4 gap-y-1 border-l-4 px-3 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_8rem] sm:items-center ${e.borde} ${c.estado === 'igual' ? 'opacity-70' : ''}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-grafito">{c.nombre}</p>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.chip}`}>
          {e.Icono && <e.Icono size={11} aria-hidden="true" />}
          {e.etiqueta}
        </span>
      </div>
      <p className="cifras flex flex-wrap items-center gap-x-2 text-sm text-grafito">
        <span className={c.estado === 'agregado' ? 'text-gris-texto' : ''}>{cant(c.antes, c.unidad)}</span>
        <ArrowRight size={13} aria-hidden="true" className="text-gris-texto" />
        <span className={`font-semibold ${c.estado === 'quitado' ? 'text-gris-texto' : ''}`}>{cant(c.despues, c.unidad)}</span>
        {c.variacion_pct !== null && Math.abs(c.variacion_pct) >= 0.05 && (
          <span className="text-xs text-gris-texto">({signo(c.variacion_pct)}{num.format(Math.abs(c.variacion_pct))} %)</span>
        )}
        {tolCambia && (
          <span className="w-full text-xs text-gris-texto">
            Tolerancia: {c.tolerancia_antes === null ? 'sin' : `± ${num.format(c.tolerancia_antes)} %`} → {c.tolerancia_despues === null ? 'sin' : `± ${num.format(c.tolerancia_despues)} %`}
          </span>
        )}
      </p>
      {verCostos && (
        <p className={`cifras text-sm font-semibold sm:text-right ${c.efecto_costo === null || Math.abs(c.efecto_costo) < 0.5 ? 'text-gris-texto' : c.efecto_costo > 0 ? 'text-critico-texto' : 'text-exito-texto'}`}>
          {c.efecto_costo === null ? 'Sin costo' : Math.abs(c.efecto_costo) < 0.5 ? '—' : `${signo(c.efecto_costo)}${pesos0.format(Math.abs(c.efecto_costo))}`}
        </p>
      )}
    </li>
  );
}

function Variacion({ titulo, antes, despues, formato }: { titulo: string; antes: number | null; despues: number | null; formato: (n: number) => string }) {
  const delta = antes !== null && despues !== null && antes > 0 ? ((despues - antes) / antes) * 100 : null;
  return (
    <div className="rounded-lg border border-linea bg-white px-3 py-2">
      <p className="text-xs font-medium text-gris-texto">{titulo}</p>
      <p className="cifras text-sm font-semibold text-grafito">
        {antes === null ? '—' : formato(antes)} <span className="text-gris-texto">→</span> {despues === null ? '—' : formato(despues)}
      </p>
      {delta !== null && Math.abs(delta) >= 0.05 && (
        <p className={`cifras text-xs font-bold ${delta > 0 ? 'text-critico-texto' : 'text-exito-texto'}`}>{delta > 0 ? '▲ +' : '▼ −'}{num.format(Math.abs(delta))} %</p>
      )}
    </div>
  );
}

// Qué cambió entre dos versiones de una receta: ingredientes, ficha técnica y efecto en el costo
export function ComparacionVersiones({ idAnterior, idNueva, verCostos = true }: { idAnterior: string; idNueva: string; verCostos?: boolean }) {
  const [a, b] = useQueries({ queries: [idAnterior, idNueva].map((id) => ({ queryKey: ['formulacion', id], queryFn: () => getFormulacion(id) })) });

  if (a.isLoading || b.isLoading) return <Esqueleto className="h-48 w-full" />;
  if (a.isError || b.isError || !a.data || !b.data) return <Alert variant="error">No se pudieron cargar las versiones para compararlas.</Alert>;

  const c = compararVersiones(a.data, b.data);
  const costos = verCostos && c.costo_lote.antes !== null;
  const mostrarFicha = (v: string | number | null) => (v === null || v === '' ? 'sin dato' : String(v));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gris-texto">
        De la <strong className="text-grafito">versión {a.data.version}</strong> a la <strong className="text-grafito">versión {b.data.version}</strong> de {b.data.producto}.
      </p>

      {!c.hay_cambios ? (
        <Alert variant="info">Las dos versiones tienen exactamente la misma receta y ficha técnica.</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {(['agregado', 'quitado', 'cambiado'] as const).map((k) => c.conteo[k] > 0 && (
              <span key={k} className={`rounded-full px-2.5 py-1 ${ESTILO[k].chip}`}>
                {c.conteo[k]} {k === 'agregado' ? (c.conteo[k] === 1 ? 'agregado' : 'agregados') : k === 'quitado' ? (c.conteo[k] === 1 ? 'quitado' : 'quitados') : (c.conteo[k] === 1 ? 'modificado' : 'modificados')}
              </span>
            ))}
            {c.conteo.igual > 0 && <span className="rounded-full bg-arena px-2.5 py-1 text-gris-texto">{c.conteo.igual} sin cambios</span>}
          </div>

          <div className={`grid grid-cols-2 gap-2 ${costos ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
            <Variacion titulo="Rinde" antes={c.rendimiento.antes} despues={c.rendimiento.despues} formato={(n) => `${num.format(n)} un.`} />
            <Variacion titulo="Peso del lote" antes={c.peso_lote.antes} despues={c.peso_lote.despues} formato={(n) => `${num.format(n / 1000)} kg`} />
            {costos && <Variacion titulo="Costo por lote" antes={c.costo_lote.antes} despues={c.costo_lote.despues} formato={(n) => pesos0.format(n)} />}
            {costos && <Variacion titulo="Costo por unidad" antes={c.costo_unidad.antes} despues={c.costo_unidad.despues} formato={(n) => pesos2.format(n)} />}
          </div>
        </>
      )}

      <div>
        <div className="mb-1 hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_8rem] gap-x-4 px-3 text-xs font-semibold uppercase tracking-wide text-gris-texto sm:grid">
          <span>Ingrediente</span>
          <span>Antes → después</span>
          {verCostos && <span className="text-right">Efecto en el costo</span>}
        </div>
        <ul className="divide-y divide-linea overflow-hidden rounded-lg border border-linea bg-white">
          {c.ingredientes.map((i) => (
            <Fila key={i.clave} c={i} verCostos={verCostos} />
          ))}
        </ul>
      </div>

      {c.ficha.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-azul-noche">Ficha técnica</h3>
          {c.ficha.map((f) => (
            <div key={f.campo} className="rounded-lg border border-linea bg-white px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-gris-texto">{f.etiqueta}</p>
              {f.campo === 'procedimiento' ? (
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <p className="whitespace-pre-line rounded bg-hueso p-2 text-xs text-gris-texto">{mostrarFicha(f.antes)}</p>
                  <p className="whitespace-pre-line rounded bg-trigo-suave/50 p-2 text-xs text-grafito">{mostrarFicha(f.despues)}</p>
                </div>
              ) : (
                <p className="cifras font-semibold text-grafito">
                  {mostrarFicha(f.antes)} <span className="text-gris-texto">→</span> {mostrarFicha(f.despues)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {costos && <p className="text-xs text-gris-texto">Los costos de las dos versiones usan los precios de hoy: la diferencia se debe solo a los cambios de la receta, no a variaciones de precio.</p>}
    </div>
  );
}
