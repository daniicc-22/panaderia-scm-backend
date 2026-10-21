export interface FormulacionResumen {
  id: string;
  producto_id: string;
  producto: string;
  producto_activo: boolean;
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
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  tolerancia_porcentaje: number | null;
  codigo: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo_por_unidad: number | null;
  costo: number | null;
}

export interface FormulacionDetalle {
  id: string;
  producto_id: string;
  producto: string;
  producto_activo: boolean;
  version: number;
  activa: boolean;
  vigente_desde: string;
  vigente_hasta: string | null;
  rendimiento: number | null;
  peso_lote_g: number;
  costo_lote: number | null;
  costo_unidad: number | null;
  costo_incompleto: boolean;
  ingredientes: IngredienteFormulacion[];
}

// Una versión en el historial de un producto (solo administrador y superadministrador)
export interface VersionFormulacion {
  id: string;
  version: number;
  activa: boolean;
  vigente_desde: string;
  vigente_hasta: string | null;
  rendimiento: number | null;
  ingredientes: number;
  costo_lote: number;
  costo_unidad: number | null;
  costo_incompleto: boolean;
  aprobado_por: string | null;
}

export interface HistorialVersiones {
  producto_id: string;
  producto: string;
  versiones: VersionFormulacion[];
}

// Una línea de la receta tal como la recibe el servidor al crear una versión o un producto
export interface LineaReceta {
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  cantidad: number;
  tolerancia_porcentaje: number | null;
}

export interface DatosVersion {
  rendimiento: number;
  ingredientes: LineaReceta[];
}

export interface DatosProductoNuevo extends DatosVersion {
  nombre: string;
}
