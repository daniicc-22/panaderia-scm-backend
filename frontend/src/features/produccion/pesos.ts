import { aNumero } from '../inventario/esquemaEntrada';
import type { PesoRealEnvio } from '../../types/produccion.types';

export const PESO_MAX = 1_000_000;
export const PRODUCIDA_MAX = 10_000_000;

// Lo que el operario escribió, por insumo (texto tal cual, para no pelear con las comas)
export type PesosTexto = Record<string, string>;

/** Pesos listos para enviar y errores por insumo. Un campo vacío es un insumo «al ojo». */
export function leerPesos(textos: PesosTexto): { pesos: PesoRealEnvio[]; errores: Record<string, string> } {
  const pesos: PesoRealEnvio[] = [];
  const errores: Record<string, string> = {};
  for (const [id, texto] of Object.entries(textos)) {
    if (texto.trim() === '') continue;
    const n = aNumero(texto);
    if (!Number.isFinite(n) || n <= 0 || n > PESO_MAX) {
      errores[id] = `Escribe un peso mayor que 0 y hasta ${PESO_MAX.toLocaleString('es-CO')}.`;
      continue;
    }
    pesos.push({ materia_prima_id: id, peso_real: n });
  }
  return { pesos, errores };
}

/** Cantidad producida válida, o null si el texto no sirve. */
export function leerProducida(texto: string): number | null {
  const n = aNumero(texto);
  return texto.trim() !== '' && Number.isFinite(n) && n > 0 && n <= PRODUCIDA_MAX ? n : null;
}

const porcentaje = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, signDisplay: 'exceptZero' });

/** «+10 %», «-3,5 %» o «0 %» para la desviación frente a la receta. */
export function textoDesviacion(pct: number | null): string {
  return pct === null ? '—' : `${porcentaje.format(pct)} %`;
}

/** Verde si está dentro de ±5 %, amarillo hasta ±10 %, rojo por fuera. */
export function colorDesviacion(pct: number | null): 'gray' | 'green' | 'yellow' | 'red' {
  if (pct === null) return 'gray';
  const a = Math.abs(pct);
  return a <= 5 ? 'green' : a <= 10 ? 'yellow' : 'red';
}
