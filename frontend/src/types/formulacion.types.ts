export interface FormulacionResumen {
  id: string;
  producto_id: string;
  producto: string;
  producto_activo: boolean;
  es_intermedio: boolean;
  version: number;
  vigente_desde: string;
  rendimiento: number | null;
  ingredientes: number;
  peso_lote_g: number;
  costo_lote: number | null;
  costo_unidad: number | null;
  costo_incompleto: boolean;
  // Solo gestión: precio de venta por unidad y margen sobre ese precio
  precio_venta: number | null;
  margen_pct: number | null;
  // Ficha técnica: tiene procedimiento y, si se hornea, tiempo y temperatura
  tiene_procedimiento: boolean;
  ficha_completa: boolean;
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

// Ficha técnica de una versión: cómo se prepara y qué se pierde al hornear
export interface FichaTecnica {
  motivo_cambio: string | null;
  procedimiento: string | null;
  tiempo_preparacion_min: number | null;
  tiempo_horneado_min: number | null;
  temperatura_horneado_c: number | null;
  merma_horneado_pct: number | null;
}

export interface FormulacionDetalle extends FichaTecnica {
  ficha_completa: boolean;
  aprobado_por: string | null;
  id: string;
  producto_id: string;
  producto: string;
  producto_activo: boolean;
  es_intermedio: boolean;
  version: number;
  activa: boolean;
  vigente_desde: string;
  vigente_hasta: string | null;
  rendimiento: number | null;
  peso_lote_g: number;
  costo_lote: number | null;
  costo_unidad: number | null;
  costo_incompleto: boolean;
  precio_venta: number | null;
  margen_unidad: number | null;
  margen_pct: number | null;
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
  motivo_cambio: string | null;
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

export interface DatosVersion extends Partial<FichaTecnica> {
  rendimiento: number;
  ingredientes: LineaReceta[];
}

export interface DatosProductoNuevo extends DatosVersion {
  nombre: string;
  // Un producto intermedio (masa base, galleta) se usa como ingrediente de otros productos
  es_intermedio?: boolean;
  precio_venta?: number | null;
}

// Lo que se puede cambiar de un producto desde su formulación (null borra el precio de venta)
export interface CambiosProducto {
  activo?: boolean;
  nombre?: string;
  precio_venta?: number | null;
}

export interface UsoComoIngrediente {
  formulacion_id: string;
  producto_id: string;
  producto: string;
  activo: boolean;
  cantidad_g: number;
}

export interface UsadoEn {
  producto_id: string;
  producto: string;
  es_intermedio: boolean;
  items: UsoComoIngrediente[];
}

export interface PuntoCostoHistorico {
  mes: string; // AAAA-MM
  costo_lote: number;
  costo_unidad: number | null;
  costo_incompleto: boolean;
  con_compras: number;
}

export interface InsumoCostoHistorico {
  materia_prima_id: string;
  materia: string;
  tiene_compras: boolean;
  costo_inicial: number | null;
  costo_final: number | null;
  variacion_pct: number | null;
  efecto_lote: number | null;
}

export interface CostoHistorico {
  formulacion_id: string;
  meses: number;
  desde: string;
  insumos_total: number;
  insumos_con_compras: number;
  puntos: PuntoCostoHistorico[];
  insumos: InsumoCostoHistorico[];
}
