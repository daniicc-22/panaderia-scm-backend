// Panadería que el superadministrador eligió ver. El backend la lee como ?panaderiaId=...
// solo cuando quien consulta es superadministrador; para los demás roles se ignora.
const CLAVE = 'panaderia_seleccionada';

export function leerPanaderiaActiva(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarPanaderiaActiva(id: string) {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    // sin almacenamiento disponible
  }
}

export function borrarPanaderiaActiva() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento disponible
  }
}
