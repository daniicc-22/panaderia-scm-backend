import { useMemo, useState } from 'react';
import { Minus, Plus, Scale } from 'lucide-react';
import { Panel } from '../inicio/Panel';
import type { FormulacionDetalle, IngredienteFormulacion } from '../../types/formulacion.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Los cinco ingredientes que más cuestan tienen su propio color (el mismo en la barra y en su fila);
// el resto se agrupa en "Otros" con un gris neutro, para que ningún color se repita
const COLORES = ['var(--color-azul-noche)', 'var(--color-trigo)', 'var(--color-verde-bosque)', 'var(--color-terracota)', 'var(--color-pizarra)'];
const COLOR_OTROS = 'var(--color-grafico-neutro)';

function cantidad(unidad: string, valor: number): string {
  if (unidad === 'g' && Math.abs(valor) >= 1000) return `${num.format(valor / 1000)} kg`;
  return `${num.format(valor)} ${unidad}`;
}

function Fila({ i, factor, color, harinaG, total, verCostos, mayor }: { i: IngredienteFormulacion; factor: number; color: string; harinaG: number; total: number | null; verCostos: boolean; mayor: boolean }) {
  const parte = verCostos && i.costo != null && total ? (i.costo / total) * 100 : null;
  const panadero = harinaG > 0 && i.unidad === 'g' ? (i.cantidad / harinaG) * 100 : null;
  const c = i.cantidad * factor;
  const tol = i.tolerancia_porcentaje;
  return (
    <li className="grid gap-x-4 gap-y-2 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-grafito">{i.nombre}</span>
            {mayor && <span className="rounded-full bg-trigo-suave px-2 py-0.5 text-[11px] font-semibold text-atencion-texto">Mayor costo</span>}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-gris-texto">
            {i.tipo === 'producto_intermedio' && <span className="rounded-full bg-verde-suave px-2 py-0.5 font-semibold text-verde-bosque">Intermedio</span>}
            {panadero !== null && <span className="cifras" title="Porcentaje panadero: peso sobre el peso de harina">{num1.format(panadero)} % panadero</span>}
          </p>
        </div>
      </div>

      <div className="pl-[18px] sm:pl-0 sm:text-right">
        <p className="cifras font-display text-xl font-semibold leading-none text-azul-noche">{cantidad(i.unidad, c)}</p>
        {tol != null && tol > 0 && (
          <p className="cifras mt-1 text-xs text-gris-texto">
            Pesar entre {cantidad(i.unidad, c * (1 - tol / 100))} y {cantidad(i.unidad, c * (1 + tol / 100))}
          </p>
        )}
      </div>

      {verCostos && (
        <div className="pl-[18px] sm:pl-0">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className={`cifras font-semibold ${i.costo == null ? 'text-atencion-texto' : 'text-grafito'}`}>{i.costo == null ? 'Sin costo' : pesos0.format(i.costo * factor)}</span>
            {parte !== null && <span className="cifras text-xs text-gris-texto">{num1.format(parte)} % del costo</span>}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-arena" aria-hidden="true">
            {parte !== null && <div className="h-full rounded-full" style={{ width: `${Math.max(parte, 2)}%`, background: color }} />}
          </div>
        </div>
      )}
    </li>
  );
}

// Lo que lleva la fórmula: cantidades escalables, rango de pesaje, % panadero y composición del costo
export function IngredientesReceta({ data, verCostos }: { data: FormulacionDetalle; verCostos: boolean }) {
  const [texto, setTexto] = useState('1');
  const leido = Number(texto.replace(',', '.'));
  const factor = Number.isFinite(leido) && leido > 0 ? leido : 1;
  const escalado = Math.abs(factor - 1) > 1e-9;

  const ordenados = useMemo(() => [...data.ingredientes].sort((a, b) => b.cantidad - a.cantidad), [data.ingredientes]);
  const porCosto = useMemo(() => (verCostos ? [...ordenados].filter((i) => i.costo != null && i.costo > 0).sort((a, b) => (b.costo as number) - (a.costo as number)) : []), [ordenados, verCostos]);
  const colorDe = useMemo(() => new Map(porCosto.slice(0, COLORES.length).map((i, n) => [`${i.tipo}-${i.codigo ?? i.nombre}`, COLORES[n]])), [porCosto]);
  const harinaG = ordenados.filter((i) => i.unidad === 'g' && sinTildes(i.nombre).includes('harina')).reduce((s, i) => s + i.cantidad, 0);
  const mayorCosto = verCostos ? [...ordenados].filter((i) => i.costo != null).sort((a, b) => (b.costo as number) - (a.costo as number))[0] : undefined;
  const claveDe = (i: IngredienteFormulacion) => `${i.tipo}-${i.codigo ?? i.nombre}`;

  const totalSeg = data.costo_lote ?? 0;
  const segmentos: { clave: string; nombre: string; costo: number; color: string }[] = totalSeg > 0
    ? porCosto.slice(0, COLORES.length).map((i, n) => ({ clave: claveDe(i), nombre: i.nombre, costo: i.costo as number, color: COLORES[n] }))
    : [];
  const otros = totalSeg > 0 ? porCosto.slice(COLORES.length) : [];
  if (otros.length > 0) segmentos.push({ clave: 'otros', nombre: `Otros ${otros.length} ingredientes`, costo: otros.reduce((s, i) => s + (i.costo as number), 0), color: COLOR_OTROS });

  function mover(delta: number) {
    const nuevo = Math.max(0.5, Math.round((factor + delta) * 2) / 2);
    setTexto(String(nuevo).replace('.', ','));
  }

  const boton = 'grid size-11 place-items-center rounded-lg border border-borde-campo bg-white text-azul-noche transition-colors hover:bg-arena disabled:opacity-40';

  return (
    <Panel
      titulo="Ingredientes"
      subtitulo={`${data.ingredientes.length} ${data.ingredientes.length === 1 ? 'ingrediente' : 'ingredientes'} por lote`}
      accion={
        <div className="flex items-center gap-2 print:hidden">
          <label htmlFor="lotes" className="hidden text-xs font-semibold text-gris-texto sm:block">
            Calcular para
          </label>
          <button type="button" className={boton} onClick={() => mover(-0.5)} disabled={factor <= 0.5} aria-label="Menos lotes">
            <Minus size={16} />
          </button>
          <input
            id="lotes"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="decimal"
            aria-invalid={texto.trim() !== '' && !(leido > 0)}
            className={`cifras min-h-11 w-16 ${texto.trim() !== '' && !(leido > 0) ? 'border-critico ring-1 ring-critico' : ''} rounded-lg border border-borde-campo bg-white text-center text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-trigo`}
          />
          <button type="button" className={boton} onClick={() => mover(0.5)} aria-label="Más lotes">
            <Plus size={16} />
          </button>
          <span className="text-xs font-semibold text-gris-texto">{factor === 1 ? 'lote' : 'lotes'}</span>
        </div>
      }
    >
      {escalado && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-azul-suave px-3 py-2 text-sm text-azul-noche">
          <Scale size={16} aria-hidden="true" />
          <span>
            Cantidades para <strong>{num.format(factor)} lotes</strong>
            {data.rendimiento ? <> · {num.format(data.rendimiento * factor)} unidades</> : null} · {cantidad('g', data.peso_lote_g * factor)} de masa
          </span>
          <button type="button" onClick={() => setTexto('1')} className="ml-auto font-semibold underline print:hidden">
            Volver a 1 lote
          </button>
        </p>
      )}

      {segmentos.length > 1 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold text-gris-texto">Así se reparte el costo del lote</p>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Composición del costo por ingrediente">
            {segmentos.map((g) => (
              <div key={g.clave} title={`${g.nombre}: ${num1.format((g.costo / totalSeg) * 100)} %`} style={{ width: `${(g.costo / totalSeg) * 100}%`, background: g.color }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-grafito">
            {segmentos.map((g) => (
              <li key={g.clave} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: g.color }} />
                {g.nombre}
                <span className="cifras text-gris-texto">{num1.format((g.costo / totalSeg) * 100)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-linea border-t border-linea">
        {ordenados.map((i) => (
          <Fila key={claveDe(i)} i={i} factor={factor} color={colorDe.get(claveDe(i)) ?? COLOR_OTROS} harinaG={harinaG} total={data.costo_lote} verCostos={verCostos} mayor={!!mayorCosto && mayorCosto === i && ordenados.length > 2} />
        ))}
      </ul>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-hueso px-4 py-3 text-sm">
        <span className="font-semibold text-azul-noche">Total del lote{escalado ? ` × ${num.format(factor)}` : ''}</span>
        <span className="cifras flex flex-wrap items-center gap-x-5 gap-y-1 font-semibold text-grafito">
          <span>{cantidad('g', data.peso_lote_g * factor)}</span>
          {verCostos && data.costo_lote != null && <span>{pesos0.format(data.costo_lote * factor)}</span>}
          {harinaG > 0 && <span className="text-xs font-normal text-gris-texto">Harina {cantidad('g', harinaG * factor)} = 100 %</span>}
        </span>
      </div>
    </Panel>
  );
}
