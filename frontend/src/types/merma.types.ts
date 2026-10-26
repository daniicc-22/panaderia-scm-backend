export type EtapaMerma = 'recepcion' | 'almacenamiento' | 'produccion';

export interface CausaMerma {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

export interface DatosMerma {
  causa_id: string;
  etapa: EtapaMerma;
  cantidad: number;
  lote_id?: string;
  produccion_id?: string;
}

export interface MermaRegistrada {
  id: string;
  causa_id: string;
  etapa: EtapaMerma;
  cantidad: number;
  lote_id: string | null;
  produccion_id: string | null;
  // Solo para administradores
  costo_estimado?: number | null;
}

export interface MermaResumen {
  id: string;
  fecha: string; // instante ISO
  causa: string;
  causa_codigo: string;
  etapa: EtapaMerma | null;
  cantidad: number;
  unidad: string;
  insumo: string | null;
  codigo_lote: string | null;
  produccion_id: string | null;
  producto: string | null;
  usuario: string;
  // Solo para administradores
  costo_estimado?: number | null;
}
