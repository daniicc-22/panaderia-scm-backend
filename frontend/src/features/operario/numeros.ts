// Acepta coma o punto como decimal (el operario escribe como esté acostumbrado)
export function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  return limpio === '' ? NaN : Number(limpio);
}

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
