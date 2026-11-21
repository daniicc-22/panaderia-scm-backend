// Resumen de lo que se recibe en la panadería por día (indicador de kilos por entrega del pre-test y post-test).
// Función pura: no consulta la base de datos. Cuenta solo materias primas que entran por compra (no lo que se produce).

export interface EntradaLote {
  /** Momento en que se registró la entrada (el lote se crea al recibir). */
  created_at: Date | string;
  cantidad_inicial: number;
  /** Código de la unidad de la materia prima: solo 'g' y 'kg' cuentan como peso. */
  unidad: string;
}

export interface EntregaDia {
  /** Día en hora de Colombia, 'AAAA-MM-DD'. */
  fecha: string;
  kg: number;
  /** Lotes (entradas) registrados ese día. */
  lotes: number;
}

export interface ResumenEntregas {
  dias: EntregaDia[];
  /** Entradas en unidades que no son de peso (huevos por unidad, etc.): no entran en los kg. */
  sin_peso: number;
}

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Día civil de Colombia (UTC−5) de un momento. */
export function diaColombia(momento: Date | string): string {
  return new Date(new Date(momento).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Kilos de una cantidad según su unidad; null si no es de peso. */
export function aKilos(cantidad: number, unidad: string): number | null {
  const u = unidad.trim().toLowerCase();
  if (u === 'kg') return cantidad;
  if (u === 'g') return cantidad / 1000;
  return null;
}

export function resumirEntregas(entradas: readonly EntradaLote[]): ResumenEntregas {
  const porDia = new Map<string, EntregaDia>();
  let sinPeso = 0;
  for (const e of entradas) {
    const kg = aKilos(e.cantidad_inicial, e.unidad);
    if (kg === null) {
      sinPeso += 1;
      continue;
    }
    const fecha = diaColombia(e.created_at);
    const dia = porDia.get(fecha) ?? { fecha, kg: 0, lotes: 0 };
    dia.kg += kg;
    dia.lotes += 1;
    porDia.set(fecha, dia);
  }
  const dias = [...porDia.values()].map((d) => ({ ...d, kg: redondear(d.kg) })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { dias, sin_peso: sinPeso };
}
