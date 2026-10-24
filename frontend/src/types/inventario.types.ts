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
