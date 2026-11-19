export interface OfertaPrecio {
  id: string;
  proveedor_id: string;
  proveedor: string;
  proveedor_activo: boolean;
  precio: number;
  tiempo_entrega_dias: number | null;
  vigente: boolean;
  // true si esta oferta cumple las reglas para contar en los costos
  cuenta: boolean;
  costo_por_unidad_base: number | null;
}

export interface PresentacionPrecios {
  id: string;
  nombre: string;
  contenido: number;
  activa: boolean;
  ofertas: OfertaPrecio[];
}

export interface PrecioAplicado {
  presentacion_id: string;
  oferta_id: string;
  precio: number;
  costo_por_unidad_base: number;
}

export interface PreciosMateria {
  materia: { id: string; codigo: string; nombre: string; unidad: string };
  // null cuando ninguna oferta cuenta: la materia queda sin costo
  precio_aplicado: PrecioAplicado | null;
  presentaciones: PresentacionPrecios[];
}

export interface PuntoHistorial {
  mes: string; // AAAA-MM
  costo_por_unidad_base: number;
  cantidad: number;
}

export interface HistorialInsumo {
  materia_prima_id: string;
  materia: string;
  unidad: string;
  puntos: PuntoHistorial[];
  variacion_pct: number | null;
}

export interface HistorialCostos {
  meses: number;
  desde: string;
  items: HistorialInsumo[];
}
