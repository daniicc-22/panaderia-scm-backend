import type { CriterioRotacion } from './materiaPrima.types';

export type EstadoStock = 'ok' | 'por_vencer' | 'vencido' | 'sin_stock';

export interface ItemInventario {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  criterio_rotacion: CriterioRotacion | null;
  stock: number;
  lotes_activos: number;
  proximo_vencimiento: string | null;
  estado: EstadoStock;
  // Solo lo envía el servidor a administradores
  valor?: number;
}

export interface Inventario {
  fecha: string;
  items: ItemInventario[];
}

export interface LoteInventario {
  id: string;
  codigo_lote: string | null;
  cantidad_inicial: number;
  cantidad_disponible: number;
  fecha_vencimiento: string | null;
  created_at: string;
  // Solo para administradores
  costo_unitario?: number;
}

export interface LotesMateria {
  materia: { id: string; codigo: string; nombre: string; unidad: string };
  criterio_rotacion: CriterioRotacion | null;
  resumen: {
    stock: number;
    lotes_activos: number;
    proximo_vencimiento: string | null;
    estado: EstadoStock;
    valor?: number;
  };
  lotes: LoteInventario[];
}

export interface PresentacionEntrada {
  id: string;
  nombre: string;
  contenido: number;
  proveedores: { id: string; nombre: string }[];
}

export interface MateriaEntrada {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  criterio_rotacion: CriterioRotacion | null;
  presentaciones: PresentacionEntrada[];
}

export interface OpcionesEntrada {
  fecha: string;
  materias: MateriaEntrada[];
}

export interface DatosEntrada {
  materia_prima_id: string;
  presentacion_id: string;
  proveedor_id?: string;
  cantidad: number;
  fecha_vencimiento?: string;
  codigo_lote?: string;
}

export interface EntradaRegistrada {
  lote: {
    id: string;
    codigo_lote: string;
    materia_prima_id: string;
    nombre: string;
    unidad: string;
    cantidad: number;
    fecha_vencimiento: string | null;
    costo_unitario?: number;
  };
}

// ---- Producción (consumo de insumos) ----
export interface LoteConsumo {
  lote_id: string;
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
  cantidad: number;
}

export interface ItemConsumo {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  // false (agua): se muestra en el plan pero no se descuenta ni exige existencias
  controla_inventario: boolean;
  // Lo que pide la receta y si el operario escribió el peso real (si no, se usa el estándar)
  peso_estandar: number;
  pesado: boolean;
  desviacion_pct: number | null;
  // Lo que se usará: el peso real si se pesó y, si no, el estándar
  necesario: number;
  faltante: number;
  // Existencias que no se usan porque el lote ya venció
  vencido_omitido: number;
  lotes: LoteConsumo[];
}

export interface PlanConsumo {
  formulacion: { id: string; producto: string; version: number };
  lotes: number;
  completo: boolean;
  items: ItemConsumo[];
}

export interface ProduccionRegistrada {
  produccion_id: string;
  plan: PlanConsumo;
}

// ---- Alertas de vencimiento ----
export interface CorreccionLote {
  lote_id: string;
  codigo_lote: string | null;
  nombre: string;
  unidad: string;
  cantidad_anterior: number;
  cantidad_nueva: number;
  diferencia: number;
}

export interface VencimientoCorregido {
  lote_id: string;
  codigo_lote: string | null;
  nombre: string;
  fecha_anterior: string | null;
  fecha_nueva: string | null;
}

export interface AlertaVencimiento {
  lote_id: string;
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  codigo_lote: string | null;
  cantidad_disponible: number;
  fecha_vencimiento: string;
  // Negativo si ya venció
  dias: number;
  estado: 'vencido' | 'por_vencer';
  // Solo lo envía el servidor a administradores
  valor?: number;
}

export interface AlertasVencimiento {
  fecha: string;
  dias_alerta: number;
  resumen: {
    vencidos: number;
    por_vencer: number;
    valor_vencido?: number;
    valor_por_vencer?: number;
  };
  items: AlertaVencimiento[];
}

export interface EntregaDia {
  fecha: string;
  kg: number;
  lotes: number;
}

export interface ResumenEntregas {
  dias: EntregaDia[];
  sin_peso: number;
}
