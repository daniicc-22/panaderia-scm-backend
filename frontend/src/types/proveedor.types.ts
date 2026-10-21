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
}

export interface DatosProveedor {
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
}

export type CambiosProveedor = Partial<DatosProveedor> & { activo?: boolean };
