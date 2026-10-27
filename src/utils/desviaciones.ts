// Desviación de pesaje por insumo (HU-11), sin acceso a base de datos.
// Desviación = (peso real − peso estándar) / peso estándar × 100. Solo cuentan los insumos que se pesaron
// de verdad: uno tomado «al ojo» usa el peso de la receta y daría 0 %, lo que escondería el error real.
import { desviacionPct } from './pesaje';
import type { Resultado } from './pesaje';

export interface FilaPesaje {
  produccion_id: string;
  materia_prima_id: string;
  nombre: string;
  peso_estandar: number;
  peso_real: number;
  pesado: boolean;
}

export interface DesviacionInsumo {
  materia_prima_id: string;
  nombre: string;
  producciones: number; // producciones en las que se usó
  pesadas: number; // de esas, cuántas se pesaron de verdad
  pct_pesado: number; // pesadas / producciones × 100
  desviacion_media_pct: number | null; // con signo: positivo = se pone de más, negativo = de menos
  desviacion_abs_media_pct: number | null; // sin signo: el error típico, sin que los + y − se cancelen
  desviacion_max_pct: number | null; // la más alejada de la receta, con su signo
}

export interface ResumenDesviaciones {
  global: {
    producciones: number;
    pesajes: number;
    pesados: number;
    pct_pesado: number | null;
    desviacion_abs_media_pct: number | null;
  };
  insumos: DesviacionInsumo[];
}

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const media = (v: number[]) => (v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length);

export function resumirDesviaciones(filas: readonly FilaPesaje[]): ResumenDesviaciones {
  const porInsumo = new Map<string, FilaPesaje[]>();
  for (const f of filas) {
    const lista = porInsumo.get(f.materia_prima_id) ?? [];
    lista.push(f);
    porInsumo.set(f.materia_prima_id, lista);
  }

  const todasAbs: number[] = [];
  const insumos: DesviacionInsumo[] = [];
  for (const [id, lista] of porInsumo) {
    const desv: number[] = [];
    for (const f of lista) {
      if (!f.pesado) continue;
      const d = desviacionPct(f.peso_real, f.peso_estandar);
      if (d !== null) desv.push(d);
    }
    const abs = desv.map(Math.abs);
    todasAbs.push(...abs);
    const mediaFirmada = media(desv);
    const mediaAbs = media(abs);
    const extremo = desv.length === 0 ? null : desv.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), desv[0]);
    insumos.push({
      materia_prima_id: id,
      nombre: lista[0].nombre,
      producciones: new Set(lista.map((f) => f.produccion_id)).size,
      pesadas: lista.filter((f) => f.pesado).length,
      pct_pesado: redondear((lista.filter((f) => f.pesado).length / lista.length) * 100, 1),
      desviacion_media_pct: mediaFirmada === null ? null : redondear(mediaFirmada, 2),
      desviacion_abs_media_pct: mediaAbs === null ? null : redondear(mediaAbs, 2),
      desviacion_max_pct: extremo === null ? null : redondear(extremo, 2),
    });
  }

  // Primero los que más se alejan de la receta; los que nunca se pesaron, al final
  insumos.sort((a, b) => {
    const x = a.desviacion_abs_media_pct;
    const y = b.desviacion_abs_media_pct;
    if (x === null && y !== null) return 1;
    if (y === null && x !== null) return -1;
    if (x !== null && y !== null && x !== y) return y - x;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const pesados = filas.filter((f) => f.pesado).length;
  const mediaGlobal = media(todasAbs);
  return {
    global: {
      producciones: new Set(filas.map((f) => f.produccion_id)).size,
      pesajes: filas.length,
      pesados,
      pct_pesado: filas.length === 0 ? null : redondear((pesados / filas.length) * 100, 1),
      desviacion_abs_media_pct: mediaGlobal === null ? null : redondear(mediaGlobal, 2),
    },
    insumos,
  };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

function aFecha(texto: string): Date | null {
  if (!FECHA.test(texto)) return null;
  const d = new Date(`${texto}T00:00:00-05:00`); // día de Colombia
  const [a, m, dia] = texto.split('-').map(Number);
  // new Date corrige fechas como 2026-02-31; aquí se rechazan
  return Number.isNaN(d.getTime()) || new Date(Date.UTC(a, m - 1, dia)).toISOString().slice(0, 10) !== texto ? null : d;
}

/** Rango opcional de fechas (días de Colombia, ambos incluidos) → [desde, hasta+1 día). */
export function validarRango(desde: unknown, hasta: unknown): Resultado<{ desde: Date | null; hasta: Date | null }> {
  const errores: string[] = [];
  let d: Date | null = null;
  let h: Date | null = null;
  if (desde !== undefined) {
    d = typeof desde === 'string' ? aFecha(desde) : null;
    if (!d) errores.push('La fecha «desde» no es válida (usa AAAA-MM-DD).');
  }
  if (hasta !== undefined) {
    const f = typeof hasta === 'string' ? aFecha(hasta) : null;
    if (!f) errores.push('La fecha «hasta» no es válida (usa AAAA-MM-DD).');
    else h = new Date(f.getTime() + DIA_MS);
  }
  if (errores.length > 0) return { ok: false, errores };
  if (d && h && d.getTime() >= h.getTime()) return { ok: false, errores: ['La fecha «desde» no puede ser posterior a «hasta».'] };
  return { ok: true, datos: { desde: d, hasta: h } };
}
