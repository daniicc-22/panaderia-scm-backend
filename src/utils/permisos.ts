// Roles que pueden ver precios y costos. El operario ve recetas e insumos, no dinero.
const ROLES_CON_COSTOS = ['administrador', 'superadministrador'];

export const puedeVerCostos = (rol?: string) => !!rol && ROLES_CON_COSTOS.includes(rol);