import { rendimientoPct } from './pesaje';

// Cuántos días mira el tablero hacia atrás, contando hoy
export const DIAS_SEMANA = 7;

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Ventana de los últimos días en hora de Colombia (UTC-5). `hoy` es AAAA-MM-DD.
 * `desde` es el inicio del primer día y `hasta` el inicio del día siguiente a hoy (exclusivo).
 */
export function ventanaSemana(hoy: string, dias: number = DIAS_SEMANA): { desde: Date; hasta: Date; desde_texto: string } {
  const [a, m, d] = hoy.split('-').map(Number);
  const desde = new Date(Date.UTC(a, m - 1, d - (dias - 1), 5));
  const hasta = new Date(Date.UTC(a, m - 1, d + 1, 5));
  return { desde, hasta, desde_texto: new Date(desde.getTime() - 5 * 3_600_000).toISOString().slice(0, 10) };
}

export interface ProduccionParaResumen {
  estado: string;
  cantidad_planificada: number | null;
  cantidad_producida: number | null;
  insumos_total: number;
  insumos_pesados: number;
}

/** Resumen de las producciones cerradas: cuántas, rendimiento promedio y qué parte de los insumos se pesó. */
export function resumirSemana(filas: readonly ProduccionParaResumen[]) {
  const finalizadas = filas.filter((f) => f.estado === 'finalizada');
  const rendimientos = finalizadas
    .map((f) => rendimientoPct(f.cantidad_producida, f.cantidad_planificada))
    .filter((r): r is number => r !== null);
  const total = finalizadas.reduce((s, f) => s + f.insumos_total, 0);
  const pesados = finalizadas.reduce((s, f) => s + f.insumos_pesados, 0);
  return {
    producciones: finalizadas.length,
    rendimiento_prom_pct: rendimientos.length > 0 ? redondear1(rendimientos.reduce((s, r) => s + r, 0) / rendimientos.length) : null,
    insumos_pesados_pct: total > 0 ? redondear1((pesados / total) * 100) : null,
  };
}

/** Las causas de merma más repetidas: de mayor a menor y, si empatan, por nombre. */
export function causasFrecuentes(nombres: readonly string[], max = 3): { causa: string; veces: number }[] {
  const cuenta = new Map<string, number>();
  for (const n of nombres) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  return [...cuenta.entries()]
    .map(([causa, veces]) => ({ causa, veces }))
    .sort((a, b) => b.veces - a.veces || a.causa.localeCompare(b.causa, 'es'))
    .slice(0, max);
}
