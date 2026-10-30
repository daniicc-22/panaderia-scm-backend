export type ClaseAbc = 'A' | 'B' | 'C';

export interface ItemAbc {
  codigo: string;
  nombre: string;
  demanda_anual_kg: number;
  costo_por_kg: number;
  valor_anual: number;
  porcentaje: number;
  porcentaje_acumulado: number;
  clase: ClaseAbc;
}

export interface ResumenAbc {
  clase: ClaseAbc;
  insumos: number;
  valor_anual: number;
  porcentaje: number;
}

export type FuenteAbc = 'estimada' | 'real';

export interface RespuestaAbc {
  fuente: FuenteAbc;
  supuestos: {
    semanas_al_anio: number;
    lotes_por_semana_por_defecto: number;
    limites: { A: number; B: number };
    // Solo con fuente real: semanas de consumo observado que se piden antes de fiarse de él
    semanas_minimas_consumo_real?: number;
  };
  total_valor_anual: number;
  resumen: ResumenAbc[];
  // Insumos sin precio que cuente: entran con valor 0 y quedan en clase C
  insumos_sin_costo: { codigo: string; nombre: string }[];
  // Productos intermedios usados o activos que no tienen receta vigente: su costo no se puede calcular
  intermedios_sin_receta: { id: string; nombre: string }[];
  // Solo con fuente real: insumos que aún no tienen semanas de consumo suficientes (no se estiman)
  insumos_sin_consumo_real?: { codigo: string; nombre: string; semanas_observadas: number }[];
  datos_insuficientes?: boolean;
  items: ItemAbc[];
}