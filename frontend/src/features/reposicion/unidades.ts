// El administrador habla en kilos y libras; el sistema guarda todo en la unidad base del insumo (gramos).
const FACTOR: Record<string, number> = { g: 1, kg: 1000, lb: 453.59237 };

export function unidadesDisponibles(base: string): string[] {
  return base === 'g' ? ['kg', 'lb', 'g'] : [base];
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

export function aBase(valor: number, unidad: string, base: string): number {
  if (base !== 'g' || unidad === base) return redondear(valor);
  return redondear(valor * (FACTOR[unidad] ?? 1));
}

// Muestra los gramos grandes en kilos para que se lean bien
export function desdeBase(valor: number, base: string): { texto: string; unidad: string } {
  if (base === 'g' && Math.abs(valor) >= 1000) return { texto: String(redondear(valor / 1000)), unidad: 'kg' };
  return { texto: String(redondear(valor)), unidad: base };
}

// '' → null (vacío); acepta coma o punto decimal; NaN si no es un número
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return null;
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : Number.NaN;
}
