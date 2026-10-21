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

export interface RespuestaAbc {
  supuestos: {
    semanas_al_anio: number;
    lotes_por_semana_por_defecto: number;
    limites: { A: number; B: number };
  };
  total_valor_anual: number;
  resumen: ResumenAbc[];
  // Insumos sin precio que cuente: entran con valor 0 y quedan en clase C
  insumos_sin_costo: { codigo: string; nombre: string }[];
  items: ItemAbc[];
}