export type EstadoProduccion = 'planificada' | 'en_curso' | 'finalizada' | 'cancelada';

export interface PesoRealEnvio {
  materia_prima_id: string;
  peso_real: number;
}

export interface ProduccionResumen {
  id: string;
  fecha: string; // instante ISO
  estado: EstadoProduccion;
  producto: string;
  version: number;
  usuario: string;
  lotes: number | null;
  cantidad_planificada: number | null;
  cantidad_producida: number | null;
  rendimiento_pct: number | null;
  insumos_total: number;
  insumos_pesados: number;
}

export interface LoteUsado {
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
  cantidad: number;
}

export interface InsumoProduccion {
  materia_prima_id: string;
  codigo: string | null;
  nombre: string;
  unidad: string | null;
  controla_inventario: boolean;
  // Nulos en producciones anteriores al registro del peso real
  peso_estandar: number | null;
  peso_real: number | null;
  pesado: boolean | null;
  desviacion_pct: number | null;
  lotes: LoteUsado[];
}

export interface ProduccionDetalle {
  id: string;
  fecha: string;
  estado: EstadoProduccion;
  producto: string;
  version: number;
  usuario: string;
  cantidad_planificada: number | null;
  cantidad_producida: number | null;
  rendimiento_pct: number | null;
  insumos: InsumoProduccion[];
}

export interface ProduccionFinalizada {
  id: string;
  estado: 'finalizada';
  cantidad_planificada: number | null;
  cantidad_producida: number;
  rendimiento_pct: number | null;
  aviso: string | null;
}
