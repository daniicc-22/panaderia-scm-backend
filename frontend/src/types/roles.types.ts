import type { RolCodigo } from './auth.types';

// Forma real y verificada de la respuesta de GET /roles (no inventada).
export interface Rol {
  id: string;
  codigo: RolCodigo;
  nombre: string;
}