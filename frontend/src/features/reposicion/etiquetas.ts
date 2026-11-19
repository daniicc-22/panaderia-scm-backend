import type { EstadoReposicion, OrigenDemanda } from '../../types/reposicion.types';

export const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
export const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
// La semana empieza el lunes (0 = domingo va al final)
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export function textoDiasEntrega(dias: number[]): string {
  if (dias.length === 0) return 'Sin definir';
  const ordenados = ORDEN_SEMANA.filter((d) => dias.includes(d)).map((d) => NOMBRE_DIA[d]);
  if (ordenados.length === 1) return `Los ${ordenados[0]}`;
  return `${ordenados.slice(0, -1).join(', ')} y ${ordenados[ordenados.length - 1]}`;
}

type ColorInsignia = 'gray' | 'green' | 'red' | 'yellow' | 'blue';

export const ESTADOS: Record<EstadoReposicion, { etiqueta: string; color: ColorInsignia; detalle: string }> = {
  quiebre_probable: { etiqueta: 'Se acaba antes de la entrega', color: 'red', detalle: 'Se agotaría antes de que llegue el próximo pedido.' },
  riesgo: { etiqueta: 'En riesgo', color: 'yellow', detalle: 'Llega a la entrega por debajo del stock de seguridad.' },
  pedir_hoy: { etiqueta: 'Pedir hoy', color: 'red', detalle: 'Hoy es el último día para pedirlo y que llegue a tiempo.' },
  pedir: { etiqueta: 'Pedir', color: 'blue', detalle: 'Toca pedirlo en la próxima entrega.' },
  ok: { etiqueta: 'Suficiente', color: 'green', detalle: 'Alcanza hasta después de la próxima entrega.' },
  sobreinventario: { etiqueta: 'Exceso', color: 'yellow', detalle: 'Hay más de lo que se alcanza a usar antes de que se pierda.' },
  datos_insuficientes: { etiqueta: 'Faltan datos', color: 'gray', detalle: 'No se puede calcular hasta completar lo que falta.' },
};

const FALTANTES: Record<string, string> = {
  demanda: 'consumo semanal',
  stock_seguridad: 'días de seguridad o stock mínimo',
  proveedor: 'proveedor con precio vigente',
  dias_entrega: 'días de entrega del proveedor',
  plazo_entrega: 'plazo de entrega',
  costo_pedido: 'costo por pedido',
  costo_mantener: 'tasa de mantenimiento',
};
export const etiquetaFaltante = (codigo: string) => FALTANTES[codigo] ?? codigo;

const ADVERTENCIAS: Record<string, string> = {
  sin_eoq_falta_costo_pedido: 'Sin costo por pedido no se calcula el EOQ.',
  sin_eoq_falta_costo_mantener: 'Sin tasa de mantenimiento no se calcula el EOQ.',
  vida_util_menor_que_ciclo: 'La vida útil es menor que el tiempo entre entregas: una entrega no alcanza a cubrir hasta la siguiente.',
  ciclo_minimo_por_falta_de_eoq: 'Sin EOQ se cubre solo una entrega.',
  nivel_objetivo_supera_maximo: 'El stock máximo recortó la cantidad: el pedido se limitó para no superarlo.',
  cantidad_limitada_por_maximo: 'No se pide nada: lo que quedará al llegar la entrega ya alcanza o supera el stock máximo.',
  cantidad_limitada_por_vida_util: 'La cantidad se limitó por la vida útil.',
  redondeo_supera_maximo: 'Al redondear a la presentación se supera el stock máximo.',
  existencia_vencida_excluida: 'Hay existencias vencidas que no se cuentan.',
};
export const etiquetaAdvertencia = (codigo: string) => ADVERTENCIAS[codigo] ?? codigo;

export const ORIGEN_DEMANDA: Record<OrigenDemanda, string> = {
  real: 'consumo real',
  declarada: 'declarado por el administrador',
  estimada: 'estimado con las recetas',
};
