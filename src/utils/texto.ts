// Resumen corto de una lista de nombres para mensajes: los primeros y cuántos faltan.
export const MAX_NOMBRES_EN_MENSAJE = 5;

export const resumirNombres = (nombres: string[]) =>
  nombres.length <= MAX_NOMBRES_EN_MENSAJE
    ? nombres.join(', ')
    : `${nombres.slice(0, MAX_NOMBRES_EN_MENSAJE).join(', ')} y ${nombres.length - MAX_NOMBRES_EN_MENSAJE} más`;
