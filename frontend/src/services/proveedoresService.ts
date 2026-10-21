import { httpClient } from './httpClient';
import type { CambiosProveedor, DatosProveedor, Proveedor } from '../types/proveedor.types';

export async function getProveedores(): Promise<Proveedor[]> {
  const { data } = await httpClient.get<Proveedor[]>('/proveedores');
  return data;
}

export async function crearProveedor(datos: DatosProveedor) {
  const { data } = await httpClient.post<{ id: string; nombre: string }>('/proveedores', datos);
  return data;
}

export async function editarProveedor(id: string, cambios: CambiosProveedor) {
  const { data } = await httpClient.patch<{ id: string; nombre: string; activo: boolean; ofertas_afectadas?: number }>(
    `/proveedores/${id}`,
    cambios,
  );
  return data;
}
