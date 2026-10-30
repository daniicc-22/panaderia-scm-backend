export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  // 'grupo': compartido con otras panaderías del grupo; solo se puede consultar
  alcance: 'panaderia' | 'grupo';
  ofertas_vigentes: number;
  // Calendario de entrega: 0 = domingo ... 6 = sábado; lista vacía = sin definir
  dias_entrega: number[];
  hora_limite_pedido: string | null;
  pedido_minimo: number | null;
}

export interface EntregaProveedor {
  dias_entrega: number[];
  hora_limite_pedido: string | null;
  pedido_minimo: number | null;
}

export interface DatosProveedor {
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
}

export type CambiosProveedor = Partial<DatosProveedor> & { activo?: boolean };

export interface OfertaProveedor {
  oferta_id: string;
  materia_prima_id: string;
  codigo: string | null;
  materia: string;
  unidad: string;
  presentacion_id: string;
  presentacion: string;
  contenido: number;
  precio: number;
  costo_por_unidad_base: number | null;
  tiempo_entrega_dias: number | null;
  vigente: boolean;
  presentacion_activa: boolean;
  // Cumple las reglas para contar en los costos
  cuenta: boolean;
  // Es el precio que hoy usan los costos de ese insumo
  aplicado: boolean;
  // El más barato por unidad entre los proveedores que cuentan
  mejor_precio: boolean;
  sobre_mejor_pct: number | null;
  otros_proveedores: number;
}

export interface OfertasProveedor {
  proveedor: { id: string; nombre: string; activo: boolean; alcance: 'panaderia' | 'grupo' };
  resumen: {
    ofertas: number;
    cuentan: number;
    aplicadas: number;
    mejor_precio: number;
    entrega_promedio_dias: number | null;
  };
  items: OfertaProveedor[];
}
