export interface PresentacionMateriaPrima {
  id: string;
  nombre: string;
  contenido: number;
  precio: number | null;
  costo_por_unidad_base: number | null;
}

export type CriterioRotacion = 'FIFO' | 'FEFO' | 'ninguno';

export interface MateriaPrima {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  categoria_id: string | null;
  categoria: string | null;
  unidad_base_id: string;
  unidad: string;
  criterio_rotacion: CriterioRotacion | null;
  lead_time_dias: number | null;
  variabilidad_peso_unitario: boolean | null;
  // false: insumo que no se compra ni se guarda (agua); no tiene existencias ni se descuenta al producir
  controla_inventario: boolean;
  presentaciones: PresentacionMateriaPrima[];
}

export interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
}

export interface CategoriaMateriaPrima {
  id: string;
  nombre: string;
}

export interface CatalogosMateriaPrima {
  unidades: UnidadMedida[];
  categorias: CategoriaMateriaPrima[];
}

// Lo que se envía al crear una materia prima (el código lo genera el servidor)
export interface DatosNuevaMateriaPrima {
  nombre: string;
  unidad_base_id: string;
  categoria_id: string | null;
  criterio_rotacion: CriterioRotacion | null;
  lead_time_dias: number | null;
  variabilidad_peso_unitario: boolean | null;
  controla_inventario: boolean;
}

// Lo que se puede cambiar después: ni el código ni la unidad base
export type CambiosMateriaPrima = Partial<Omit<DatosNuevaMateriaPrima, 'unidad_base_id'>> & { activa?: boolean };
