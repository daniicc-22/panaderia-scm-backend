// Tipos de las respuestas de /reposicion y /produccion/existencias-bajas (iguales a los del backend).

export type ClaseAbc = 'A' | 'B' | 'C';
export type OrigenDemanda = 'real' | 'declarada' | 'estimada';
export type ModoReposicion = 'periodica' | 'al_uso';

export type EstadoReposicion =
  | 'datos_insuficientes'
  | 'quiebre_probable'
  | 'riesgo'
  | 'pedir_hoy'
  | 'pedir'
  | 'ok'
  | 'sobreinventario';

export interface ItemRecomendacion {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  estado: EstadoReposicion;
  // Códigos de lo que falta para poder calcular (ver etiquetas.ts)
  faltantes: string[];
  advertencias: string[];
  existencia: number;
  existencia_vencida: number;
  demanda_semanal: number | null;
  demanda_origen: OrigenDemanda | null;
  cobertura_dias: number | null;
  fecha_agotamiento: string | null;
  proveedor: { id: string; nombre: string } | null;
  proxima_entrega: string | null;
  fecha_limite_pedido: string | null;
  proyeccion_a_la_entrega: number | null;
  stock_seguridad: number | null;
  punto_reorden_calendario: number | null;
  nivel_objetivo: number | null;
  eoq: number | null;
  ciclo_economico_dias: number | null;
  ciclos_elegidos: number | null;
  cantidad_recomendada: number;
  presentacion: string | null;
  presentaciones_a_pedir: number | null;
  costos: { precio_presentacion: number; valor_pedido: number; costo_total_anual: number | null } | null;
}

export interface EvaluacionPedidoMinimo {
  total: number;
  minimo: number | null;
  // null = no se conoce el mínimo del proveedor
  cumple: boolean | null;
  faltante: number;
}

export interface PedidoProveedor {
  proveedor: { id: string; nombre: string };
  fecha_limite_pedido: string | null;
  proxima_entrega: string | null;
  insumos: number;
  items: { materia_prima_id: string; nombre: string; presentaciones: number; valor: number }[];
  costos: { total: number; pedido_minimo: EvaluacionPedidoMinimo };
}

export interface InsumoAlUso {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  existencia: number;
  existencia_vencida: number;
  demanda_semanal: number | null;
  demanda_origen: OrigenDemanda | null;
}

export interface RespuestaRecomendaciones {
  fecha: string;
  resumen: Record<EstadoReposicion, number>;
  items: ItemRecomendacion[];
  al_uso: InsumoAlUso[];
  pedidos: PedidoProveedor[];
}

// ---- Parámetros por insumo (GET /reposicion/parametros)

export interface ParametrosInsumo {
  costo_pedido: number | null;
  costo_mantener_h: number | null;
  tasa_mantenimiento_anual: number | null;
  dias_seguridad: number | null;
  stock_minimo: number | null;
  stock_maximo: number | null;
  vida_util_dias: number | null;
  plazo_dias: number | null;
  porcentaje_perdida_tolerable?: number | null;
  modo_reposicion?: ModoReposicion;
}

export interface ItemParametros {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  parametros: ParametrosInsumo | null;
  consumo_semanal: {
    declarado: number | null;
    estimado_recetas: number | null;
    real: { semanal: number; semanas_observadas: number } | null;
  };
  oferta: {
    proveedor: { id: string; nombre: string | null };
    presentacion: string;
    contenido: number;
    precio: number;
    plazo_dias: number | null;
  } | null;
}

export interface RespuestaParametros {
  fecha: string;
  items: ItemParametros[];
}

// Lo que se envía a PUT /reposicion/parametros/:id (solo los campos que cambian; null borra)
export interface CambiosParametros {
  costo_ordenar_s?: number | null;
  costo_mantener_h?: number | null;
  tasa_mantenimiento_anual?: number | null;
  dias_seguridad?: number | null;
  stock_minimo?: number | null;
  stock_maximo?: number | null;
  vida_util_dias?: number | null;
  consumo_semanal_declarado?: number | null;
  lead_time_dias?: number | null;
  modo_reposicion?: ModoReposicion;
}

// ---- Existencias bajas (sin dinero: lo ven todos los roles)

export type NivelExistencia = 'agotado' | 'critico' | 'bajo';

export interface ItemExistenciaBaja {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  nivel: NivelExistencia;
  existencia: number;
  stock_seguridad: number | null;
  cobertura_dias: number | null;
  fecha_agotamiento: string | null;
}

export interface RespuestaExistenciasBajas {
  fecha: string;
  resumen: { agotados: number; criticos: number; bajos: number };
  items: ItemExistenciaBaja[];
}

// ---- Qué se puede producir (sin dinero)

export interface ItemProducible {
  producto_id: string;
  producto: string;
  formulacion_id: string;
  version: number;
  estado: 'puede' | 'no_alcanza' | 'no_calculable';
  motivo: string | null;
  lotes_posibles: number | null;
  lotes_exactos: number | null;
  rendimiento_por_lote: number | null;
  cantidad_posible: number | null;
  limitante: { materia_prima_id: string; nombre: string; unidad: string; disponible: number; por_lote: number } | null;
  faltantes: { materia_prima_id: string; nombre: string; unidad: string; falta: number }[];
  compra_al_uso: { materia_prima_id: string; nombre: string; unidad: string; por_lote: number }[];
}

export interface RespuestaQueProducir {
  fecha: string;
  resumen: { pueden: number; no_alcanzan: number; no_calculables: number };
  items: ItemProducible[];
}
