export interface PresentacionMateriaPrima {
  id: string;
  nombre: string;
  contenido: number;
  precio: number | null;
  costo_por_unidad_base: number | null;
}

export interface MateriaPrima {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  unidad: string;
  presentaciones: PresentacionMateriaPrima[];
}