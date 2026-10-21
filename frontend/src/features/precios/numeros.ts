// Convierte lo que escribe la persona en número. Acepta coma o punto como decimal
// y rechaza separadores de miles ("1.500.000") para no interpretar mal un precio.
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
});

export const formatoCantidad = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });
