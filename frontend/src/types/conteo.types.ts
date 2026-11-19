export type EstadoConteo = 'en_curso' | 'enviado' | 'aplicado' | 'descartado';

export type MotivoDiferencia = 'error_registro' | 'error_produccion' | 'vencimiento' | 'perdida_dano' | 'otro';

export interface ResumenConteo {
  lotes: number;
  exactos: number;
  faltantes: number;
  sobrantes: number;
  // Exactitud de inventario en %; null si aún no se cuenta ningún lote
  eri: number | null;
}

export interface ItemConteo {
  id: string;
  numero: number;
  estado: EstadoConteo;
  // Según el rol y el estado: un conteo aplicado nunca se elimina
  puede_eliminar: boolean;
  observaciones: string | null;
  creado_por: string;
  creado_at: string;
  resumen: ResumenConteo;
}

export interface ListaConteos {
  meta_eri: number;
  ultimo_eri: number | null;
  promedio_eri: number | null;
  items: ItemConteo[];
}

export interface LineaConteo {
  lote_id: string;
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
  materia_prima_id: string | null;
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad_sistema: number;
  cantidad_contada: number;
  diferencia: number;
  motivo: MotivoDiferencia | null;
  observaciones: string | null;
  contado_por: string;
  contado_at: string;
  ajustada: boolean;
  // Solo para administradores
  valor_diferencia?: number;
}

export interface DetalleConteo {
  id: string;
  numero: number;
  estado: EstadoConteo;
  puede_eliminar: boolean;
  observaciones: string | null;
  creado_por: string;
  creado_at: string;
  enviado_at: string | null;
  resuelto_por: string | null;
  resuelto_at: string | null;
  resumen: ResumenConteo & {
    meta_eri: number;
    // Solo para administradores
    valor_faltantes?: number;
    valor_sobrantes?: number;
  };
  lineas: LineaConteo[];
  // Solo al aprobar
  ajustes?: number;
}

export interface LoteContable {
  lote_id: string;
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  // Clase ABC del insumo (A = el que más pesa en el costo); null si no se pudo clasificar
  clase_abc: 'A' | 'B' | 'C' | null;
  contado: boolean;
}

export interface LotesContables {
  conteo_id: string;
  items: LoteContable[];
}

export interface DatosLineaConteo {
  lote_id: string;
  cantidad_contada: number;
  motivo?: MotivoDiferencia | null;
  observaciones?: string | null;
}

// Respuesta 400 cuando hay diferencia y falta explicarla
export interface PideMotivo {
  requiere_motivo: true;
  cantidad_sistema: number;
  diferencia: number;
  error: string;
}
