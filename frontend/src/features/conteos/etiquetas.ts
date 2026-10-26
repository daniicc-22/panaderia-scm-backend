import type { EstadoConteo, MotivoDiferencia } from '../../types/conteo.types';

export const ETIQUETA_ESTADO_CONTEO: Record<EstadoConteo, string> = {
  en_curso: 'Contando',
  enviado: 'Por revisar',
  aplicado: 'Aplicado',
  descartado: 'Descartado',
};

export const COLOR_ESTADO_CONTEO: Record<EstadoConteo, 'blue' | 'yellow' | 'green' | 'gray'> = {
  en_curso: 'blue',
  enviado: 'yellow',
  aplicado: 'green',
  descartado: 'gray',
};

export const MOTIVOS: { valor: MotivoDiferencia; etiqueta: string }[] = [
  { valor: 'error_registro', etiqueta: 'Error de registro (entrada o salida mal anotada)' },
  { valor: 'error_produccion', etiqueta: 'Error en una producción' },
  { valor: 'vencimiento', etiqueta: 'Baja por vencimiento' },
  { valor: 'perdida_dano', etiqueta: 'Pérdida o daño' },
  { valor: 'otro', etiqueta: 'Otro (explícalo)' },
];

export const ETIQUETA_MOTIVO: Record<MotivoDiferencia, string> = Object.fromEntries(
  MOTIVOS.map((m) => [m.valor, m.etiqueta]),
) as Record<MotivoDiferencia, string>;

const pct = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatoPorcentaje = (v: number | null): string => (v === null ? '—' : `${pct.format(v)} %`);

// Verde si cumple la meta; amarillo si queda a menos de 5 puntos; rojo si no
export function colorEri(eri: number | null, meta: number): 'green' | 'yellow' | 'red' | 'gray' {
  if (eri === null) return 'gray';
  if (eri >= meta) return 'green';
  return eri >= meta - 5 ? 'yellow' : 'red';
}
