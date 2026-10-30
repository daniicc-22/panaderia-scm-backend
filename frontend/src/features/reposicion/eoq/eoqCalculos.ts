// Cálculos del panel EOQ: funciones puras, sin React, para poder probarlas aparte.
import type { ItemRecomendacion } from '../../../types/reposicion.types';

export type Modelo = NonNullable<ItemRecomendacion['modelo']>;
export type ItemConEoq = ItemRecomendacion & { modelo: Modelo; eoq: number };

export interface Costos {
  q: number;
  pedir: number;
  mantener: number;
  total: number;
}

// Costo anual de pedir y guardar cuando cada pedido es de q unidades: (D/q)·S + (q/2)·H
export function costosEn(m: Modelo, q: number): Costos {
  const pedir = (m.demanda_anual / q) * m.costo_pedido;
  const mantener = (q / 2) * m.costo_mantener;
  return { q, pedir, mantener, total: pedir + mantener };
}

export function conEoq(items: readonly ItemRecomendacion[]): ItemConEoq[] {
  return items.filter((i): i is ItemConEoq => i.modelo !== null && i.eoq !== null);
}

export const costoEoq = (i: ItemConEoq) => i.modelo.costo_anual_eoq;
export const costoPolitica = (i: ItemConEoq): number | null =>
  i.modelo.cantidad_politica === null ? null : costosEn(i.modelo, i.modelo.cantidad_politica).total;
// Para ordenar y dibujar: el costo con calendario si se pudo calcular y, si no, el mínimo teórico
export const costoReferencia = (i: ItemConEoq): number => costoPolitica(i) ?? costoEoq(i);

// Rango de cantidades a dibujar: desde bien por debajo hasta bien por encima de las dos cantidades que importan
export function rangoCurva(i: ItemConEoq): { lo: number; hi: number } {
  const refs = [i.eoq, i.modelo.cantidad_politica ?? i.eoq];
  return { lo: Math.min(...refs) * 0.3, hi: Math.max(...refs) * 2.2 };
}

export function puntosCurva(i: ItemConEoq, n = 90): Costos[] {
  const { lo, hi } = rangoCurva(i);
  return Array.from({ length: n + 1 }, (_, k) => costosEn(i.modelo, lo + ((hi - lo) * k) / n));
}

// Marcas "redondas" para un eje que va de 0 a max
export function marcas(max: number, cuantas = 4): number[] {
  if (!(max > 0)) return [0];
  const crudo = max / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const f = crudo / potencia;
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia;
  const lista: number[] = [];
  for (let v = 0; v <= max + paso * 1e-9; v += paso) lista.push(v);
  return lista;
}

export function techoNice(valor: number): number {
  const m = marcas(valor, 4);
  const ultimo = m[m.length - 1] ?? valor;
  return ultimo >= valor ? ultimo : ultimo + (m[1] ?? ultimo);
}

export interface ResumenEoq {
  conEoq: number;
  // Cuántos de ellos además tienen calendario de entrega y días de seguridad (los únicos que entran en los costos de abajo)
  conCalendario: number;
  total: number;
  costoPolitica: number;
  costoMinimo: number;
  extra: number;
  extraPct: number | null;
}

// Cuánto cuesta (solo pedir y guardar, sin el precio de compra) ajustarse al calendario del proveedor
export function resumenGlobal(todos: readonly ItemRecomendacion[]): ResumenEoq {
  const conMinimo = conEoq(todos);
  // La comparación solo es justa entre insumos que tienen las dos cifras
  const lista = conMinimo.filter((i) => costoPolitica(i) !== null);
  const costoPol = lista.reduce((s, i) => s + (costoPolitica(i) as number), 0);
  const minimo = lista.reduce((s, i) => s + costoEoq(i), 0);
  return {
    conEoq: conMinimo.length,
    conCalendario: lista.length,
    total: todos.length,
    costoPolitica: costPolRedondeo(costoPol),
    costoMinimo: costPolRedondeo(minimo),
    extra: costPolRedondeo(costoPol - minimo),
    extraPct: minimo > 0 ? ((costoPol - minimo) / minimo) * 100 : null,
  };
}
const costPolRedondeo = (n: number) => Math.round(n * 100) / 100;

// Por qué no se pudo calcular el EOQ de los demás insumos (para decirle al usuario qué completar)
export function motivosSinEoq(items: readonly ItemRecomendacion[]) {
  const sin = items.filter((i) => i.modelo === null);
  return {
    sinEoq: sin.length,
    faltaCostoPedido: sin.filter((i) => i.advertencias.includes('sin_eoq_falta_costo_pedido')).length,
    faltaTasa: sin.filter((i) => i.advertencias.includes('sin_eoq_falta_costo_mantener')).length,
    faltaConsumo: sin.filter((i) => i.faltantes.includes('demanda')).length,
  };
}

const dias = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 });

// La explicación en palabras de un insumo: lo que el administrador necesita entender sin saber la fórmula
export function explicacion(
  i: ItemConEoq,
  f: { cantidad: (v: number) => string; dinero: (v: number) => string },
): string[] {
  const partes: string[] = [];
  const cicloEoq = i.ciclo_economico_dias;
  partes.push(
    `Sin restricciones, lo más barato sería pedir ${f.cantidad(i.eoq)} de ${i.nombre}${cicloEoq !== null ? ` cada ${dias(cicloEoq)} días` : ''}.`,
  );
  const qp = i.modelo.cantidad_politica;
  const polit = costoPolitica(i);
  if (qp === null || polit === null) {
    partes.push('Falta el calendario de entrega del proveedor para saber cuánto conviene pedir en cada entrega.');
    return partes;
  }
  const diarias = i.demanda_semanal !== null && i.demanda_semanal > 0 ? i.demanda_semanal / 7 : null;
  const cubre = diarias ? ` (alcanza para ${dias(qp / diarias)} días)` : '';
  const k = i.ciclos_elegidos ?? 1;
  const quien = i.proveedor ? i.proveedor.nombre : 'El proveedor';
  partes.push(
    `${quien} solo entrega en días fijos, así que el sistema recomienda pedir ${f.cantidad(qp)}${cubre} y cubrir ${k} ${k === 1 ? 'entrega' : 'entregas'} con cada pedido.`,
  );
  const extra = polit - costoEoq(i);
  const pct = costoEoq(i) > 0 ? (extra / costoEoq(i)) * 100 : 0;
  if (extra < 1 || pct < 1) partes.push('Esa diferencia casi no cambia el costo: el calendario no encarece este insumo.');
  else partes.push(`Ajustarse al calendario cuesta ${f.dinero(extra)} más al año que el mínimo teórico (${dias(pct)} % más), solo en pedir y guardar.`);
  return partes;
}
