export interface FormulacionResumen {
  id: string;
  producto: string;
  es_intermedio: boolean;
  version: number;
  rendimiento: number | null;
  ingredientes: number;
  peso_lote_g: number;
  costo_lote: number | null;
  costo_unidad: number | null;
  costo_incompleto: boolean;
}

export interface IngredienteFormulacion {
  tipo: 'materia_prima' | 'producto_intermedio';
  codigo: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo_por_unidad: number | null;
  costo: number | null;
}

export interface FormulacionDetalle {
  id: string;
  producto: string;
  version: number;
  rendimiento: number | null;
  peso_lote_g: number;
  costo_lote: number | null;
  costo_unidad: number | null;
  costo_incompleto: boolean;
  ingredientes: IngredienteFormulacion[];
}