import { Clock, Flame, Thermometer, TrendingDown } from 'lucide-react';
import { Panel } from '../inicio/Panel';
import type { FormulacionDetalle } from '../../types/formulacion.types';

const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

function Dato({ Icono, etiqueta, valor }: { Icono: typeof Clock; etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-linea bg-white px-3 py-2.5">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-trigo-suave text-atencion-texto"><Icono size={18} /></span>
      <div>
        <p className="text-xs font-medium text-gris-texto">{etiqueta}</p>
        <p className="cifras font-display text-lg font-semibold leading-tight text-azul-noche">{valor}</p>
      </div>
    </div>
  );
}

const minutos = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

// Cómo se prepara y qué se pierde en el horno: lo que completa la ficha técnica de la receta
export function PanelPreparacion({ data, puedeGestionar }: { data: FormulacionDetalle; puedeGestionar: boolean }) {
  const pasos = (data.procedimiento ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const tiene = pasos.length > 0 || data.tiempo_preparacion_min !== null || data.tiempo_horneado_min !== null || data.temperatura_horneado_c !== null || data.merma_horneado_pct !== null;

  if (!tiene) {
    // El operario no necesita ver un aviso de "falta"; la gestión sí, para saber que puede completarla
    if (!puedeGestionar) return null;
    return (
      <div className="rounded-tarjeta border border-dashed border-borde-campo bg-tabla px-4 py-5 text-sm text-gris-texto print:hidden">
        Esta versión aún no tiene <strong className="text-grafito">procedimiento ni datos de horneado</strong>. Agrégalos al editar la formulación para completar la ficha técnica.
      </div>
    );
  }

  const merma = data.merma_horneado_pct;
  const pesoHorneado = merma !== null ? data.peso_lote_g * (1 - merma / 100) : null;
  const porUnidad = pesoHorneado !== null && data.rendimiento ? pesoHorneado / data.rendimiento : null;

  return (
    <Panel titulo="Preparación y horneado" subtitulo="Ficha técnica de esta versión">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {pasos.length > 0 && (
          <ol className="flex flex-col gap-2">
            {pasos.map((p, i) => {
              const limpio = p.replace(/^\s*\d+\s*[.)-]\s*/, '');
              // "Amasar: texto" → el título del paso en negrita
              const m = limpio.match(/^([^:.]{3,40}):\s+(.+)$/);
              return (
              <li key={i} className="flex gap-3 text-sm text-grafito">
                <span aria-hidden="true" className="cifras mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-azul-noche text-xs font-semibold text-white">{i + 1}</span>
                <span className="pt-0.5">{m ? <><strong className="font-semibold text-azul-noche">{m[1]}:</strong> {m[2]}</> : limpio}</span>
              </li>
              );
            })}
          </ol>
        )}
        <div className={`grid grid-cols-2 gap-2 ${pasos.length > 0 ? 'lg:grid-cols-1' : 'lg:col-span-2 lg:grid-cols-4'} content-start`}>
          {data.tiempo_preparacion_min !== null && <Dato Icono={Clock} etiqueta="Preparación" valor={minutos(data.tiempo_preparacion_min)} />}
          {data.tiempo_horneado_min !== null && <Dato Icono={Flame} etiqueta="Horneado" valor={minutos(data.tiempo_horneado_min)} />}
          {data.temperatura_horneado_c !== null && <Dato Icono={Thermometer} etiqueta="Temperatura" valor={`${data.temperatura_horneado_c} °C`} />}
          {merma !== null && <Dato Icono={TrendingDown} etiqueta="Merma al hornear" valor={`${num.format(merma)} %`} />}
        </div>
      </div>
      {pesoHorneado !== null && (
        <p className="mt-3 rounded-lg bg-hueso px-3 py-2 text-sm text-grafito">
          De {num.format(data.peso_lote_g / 1000)} kg de masa salen <strong className="cifras">{num.format(pesoHorneado / 1000)} kg</strong> horneados
          {porUnidad !== null && <> · unas <strong className="cifras">{num.format(porUnidad)} g</strong> por unidad ya horneada</>}.
        </p>
      )}
    </Panel>
  );
}
