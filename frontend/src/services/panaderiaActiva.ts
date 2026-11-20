// Panadería que el superadministrador está viendo. Solo él puede elegir: para el resto el servidor ignora el dato.
const CLAVE = 'panaderia_activa_id';

export function getPanaderiaActivaId(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function setPanaderiaActivaId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CLAVE, id);
    else localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento: se usa la primera panadería activa
  }
}
