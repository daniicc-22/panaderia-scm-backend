// Consumo de insumos al producir (HU-13), sin acceso a base de datos (se prueba solo).
import { UUID, type CriterioRotacion } from './materiaPrima';
import { expandirLineas, type LineaReceta, type Recetas } from './intermedios';
import { estadoLote, ordenarLotes, type LoteVista } from './inventario';

export const LOTES_MAX = 1000;

export interface DatosProduccion {
  formulacion_id: string;
  lotes: number; // cuántas veces se hace la receta (admite fracciones, p. ej. 0,5)
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function validarProduccion(body: unknown): Resultado<DatosProduccion> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  }
  const b = body as Record<string, unknown>;
  const errores: string[] = [];
  if (typeof b.formulacion_id !== 'string' || !UUID.test(b.formulacion_id)) errores.push('La formulación no es válida.');
  let lotes = 0;
  if (typeof b.lotes !== 'number' || !Number.isFinite(b.lotes) || b.lotes <= 0 || b.lotes > LOTES_MAX) {
    errores.push(`Los lotes deben ser un número mayor que 0 y no superar ${LOTES_MAX.toLocaleString('es-CO')}.`);
  } else {
    lotes = redondear(b.lotes);
    if (lotes <= 0) errores.push('La cantidad de lotes es demasiado pequeña.');
  }
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { formulacion_id: b.formulacion_id as string, lotes } };
}

export interface Necesidades {
  materias: Map<string, number>; // gramos (o unidad base) por insumo, ya con los intermedios repartidos
  sin_receta: Set<string>;
  ciclos: Set<string>;
}

/** Lo que pide producir `lotes` veces una receta: los intermedios se reparten en sus insumos. */
export function necesidadesDeProduccion(
  lineas: readonly LineaReceta[],
  recetas: Recetas,
  producto: string,
  lotes: number,
): Necesidades {
  const e = expandirLineas(lineas, recetas, producto, lotes);
  const materias = new Map<string, number>();
  for (const [id, g] of e.materias) {
    const r = redondear(g);
    if (r > 0) materias.set(id, r);
  }
  return { materias, sin_receta: e.sin_receta, ciclos: e.ciclos };
}

/** Productos intermedios que hay detrás de unas líneas, a cualquier profundidad (sin repetir ni ciclar). */
export function intermediosAlcanzados(lineas: readonly LineaReceta[], recetas: Recetas): Set<string> {
  const vistos = new Set<string>();
  const pendientes = lineas.flatMap((l) => (l.producto_intermedio_id ? [l.producto_intermedio_id] : []));
  while (pendientes.length > 0) {
    const id = pendientes.pop()!;
    if (vistos.has(id)) continue;
    vistos.add(id);
    for (const l of recetas.get(id) ?? []) if (l.producto_intermedio_id) pendientes.push(l.producto_intermedio_id);
  }
  return vistos;
}

/** Separa lo que se descuenta del inventario de lo que no se controla (p. ej. el agua). */
export function separarControlados(
  necesidades: ReadonlyMap<string, number>,
  sinControl: ReadonlySet<string>,
): { controladas: Map<string, number>; no_controladas: Map<string, number> } {
  const controladas = new Map<string, number>();
  const no_controladas = new Map<string, number>();
  for (const [id, cantidad] of necesidades) (sinControl.has(id) ? no_controladas : controladas).set(id, cantidad);
  return { controladas, no_controladas };
}

export interface Asignacion {
  lote_id: string;
  cantidad: number;
}

export interface ResultadoAsignacion {
  asignaciones: Asignacion[];
  faltante: number;
  // Existencias que no se pueden usar porque el lote ya venció
  vencido_omitido: number;
}

/**
 * Reparte lo necesario entre los lotes, en el orden de rotación del insumo. Los lotes vencidos no se
 * usan (se informan aparte) y los agotados se ignoran.
 */
export function asignarLotes(
  necesario: number,
  lotes: readonly LoteVista[],
  criterio: CriterioRotacion | null,
  hoy: string,
): ResultadoAsignacion {
  const conExistencias = lotes.filter((l) => l.cantidad_disponible > 0);
  const vigentes = conExistencias.filter((l) => estadoLote(l.fecha_vencimiento, hoy) !== 'vencido');
  const vencido_omitido = redondear(
    conExistencias.filter((l) => estadoLote(l.fecha_vencimiento, hoy) === 'vencido').reduce((s, l) => s + l.cantidad_disponible, 0),
  );

  let pendiente = redondear(necesario);
  const asignaciones: Asignacion[] = [];
  for (const l of ordenarLotes(vigentes, criterio)) {
    if (pendiente <= 0) break;
    const toma = redondear(Math.min(l.cantidad_disponible, pendiente));
    if (toma <= 0) continue;
    asignaciones.push({ lote_id: l.id, cantidad: toma });
    pendiente = redondear(pendiente - toma);
  }
  return { asignaciones, faltante: Math.max(pendiente, 0), vencido_omitido };
}

export interface ItemPlan extends ResultadoAsignacion {
  materia_prima_id: string;
  necesario: number;
}

export interface Plan {
  items: ItemPlan[];
  completo: boolean; // true si hay existencias utilizables para todo
}

/** Plan de consumo de toda la producción: un ítem por insumo. */
export function planificarConsumo(
  necesidades: ReadonlyMap<string, number>,
  lotesPorMateria: ReadonlyMap<string, readonly LoteVista[]>,
  criterios: ReadonlyMap<string, CriterioRotacion | null>,
  hoy: string,
): Plan {
  const items: ItemPlan[] = [...necesidades].map(([id, necesario]) => ({
    materia_prima_id: id,
    necesario,
    ...asignarLotes(necesario, lotesPorMateria.get(id) ?? [], criterios.get(id) ?? null, hoy),
  }));
  return { items, completo: items.every((i) => i.faltante === 0) };
}
