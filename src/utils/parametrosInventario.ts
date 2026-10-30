// Validación de los parámetros de reposición de un insumo (Sprint 7), sin acceso a base de datos.

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

/** Campos que se pueden cambiar: número o null (null borra el valor). Los ausentes no se tocan. */
export interface CambiosParametros {
  costo_ordenar_s?: number | null;
  costo_mantener_h?: number | null;
  tasa_mantenimiento_anual?: number | null;
  dias_seguridad?: number | null;
  stock_minimo?: number | null;
  stock_maximo?: number | null;
  vida_util_dias?: number | null;
  consumo_semanal_declarado?: number | null;
  lead_time_dias?: number | null;
  porcentaje_perdida_tolerable?: number | null;
  /** 'periodica' (por defecto) o 'al_uso': perecedero que se compra según la producción. */
  modo_reposicion?: ModoReposicion;
}

export const MODOS_REPOSICION = ['periodica', 'al_uso'] as const;
export type ModoReposicion = (typeof MODOS_REPOSICION)[number];

/** Campos numéricos (el modo de reposición es texto y se valida aparte). */
type CampoNumerico = Exclude<keyof CambiosParametros, 'modo_reposicion'>;

interface Regla {
  campo: CampoNumerico;
  etiqueta: string;
  /** El valor debe ser mayor que este mínimo (estricto) o, si `incluyeMinimo`, mayor o igual. */
  minimo: number;
  incluyeMinimo: boolean;
  maximo?: number;
  /** Cifras decimales que admite la columna. */
  decimales: number;
  /** Cifras enteras que admite la columna. */
  enteros: number;
}

export const REGLAS_PARAMETROS: readonly Regla[] = [
  { campo: 'costo_ordenar_s', etiqueta: 'El costo de hacer un pedido', minimo: 0, incluyeMinimo: true, decimales: 2, enteros: 10 },
  { campo: 'costo_mantener_h', etiqueta: 'El costo anual de mantener una unidad', minimo: 0, incluyeMinimo: false, decimales: 4, enteros: 8 },
  { campo: 'tasa_mantenimiento_anual', etiqueta: 'La tasa anual de mantenimiento', minimo: 0, incluyeMinimo: false, maximo: 5, decimales: 4, enteros: 1 },
  { campo: 'dias_seguridad', etiqueta: 'Los días de seguridad', minimo: 0, incluyeMinimo: true, maximo: 365, decimales: 2, enteros: 4 },
  { campo: 'stock_minimo', etiqueta: 'El stock mínimo', minimo: 0, incluyeMinimo: true, decimales: 3, enteros: 9 },
  { campo: 'stock_maximo', etiqueta: 'El stock máximo', minimo: 0, incluyeMinimo: false, decimales: 3, enteros: 9 },
  { campo: 'vida_util_dias', etiqueta: 'La vida útil', minimo: 0, incluyeMinimo: false, maximo: 3650, decimales: 1, enteros: 5 },
  { campo: 'consumo_semanal_declarado', etiqueta: 'El consumo semanal declarado', minimo: 0, incluyeMinimo: true, decimales: 3, enteros: 11 },
  { campo: 'lead_time_dias', etiqueta: 'El tiempo de entrega', minimo: 0, incluyeMinimo: true, maximo: 365, decimales: 2, enteros: 4 },
  { campo: 'porcentaje_perdida_tolerable', etiqueta: 'El porcentaje de pérdida tolerable', minimo: 0, incluyeMinimo: true, maximo: 100, decimales: 2, enteros: 3 },
];

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const decimalesDe = (n: number) => {
  const texto = String(n);
  if (/e/i.test(texto)) return Number.POSITIVE_INFINITY;
  return texto.includes('.') ? (texto.split('.')[1] ?? '').length : 0;
};

export function validarParametros(cuerpo: unknown): Resultado<CambiosParametros> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];
  const datos: CambiosParametros = {};
  const conocidos = new Set<string>([...REGLAS_PARAMETROS.map((r) => r.campo), 'modo_reposicion']);

  for (const clave of Object.keys(cuerpo)) {
    if (!conocidos.has(clave)) errores.push(`El campo "${clave}" no se puede modificar.`);
  }

  // El modo no admite null: la columna siempre tiene valor ('periodica' si no se dice otra cosa)
  if ('modo_reposicion' in cuerpo) {
    const modo = cuerpo.modo_reposicion;
    if (typeof modo === 'string' && (MODOS_REPOSICION as readonly string[]).includes(modo)) {
      datos.modo_reposicion = modo as ModoReposicion;
    } else {
      errores.push('El modo de reposición debe ser "periodica" o "al_uso".');
    }
  }

  for (const r of REGLAS_PARAMETROS) {
    if (!(r.campo in cuerpo)) continue;
    const valor = cuerpo[r.campo];
    if (valor === null) {
      datos[r.campo] = null;
      continue;
    }
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      errores.push(`${r.etiqueta} debe ser un número o null para borrarlo.`);
      continue;
    }
    const sobreMinimo = r.incluyeMinimo ? valor >= r.minimo : valor > r.minimo;
    if (!sobreMinimo) {
      errores.push(`${r.etiqueta} debe ser ${r.incluyeMinimo ? 'mayor o igual que' : 'mayor que'} ${r.minimo}.`);
      continue;
    }
    if (r.maximo !== undefined && valor > r.maximo) {
      errores.push(`${r.etiqueta} no puede ser mayor que ${r.maximo}.`);
      continue;
    }
    if (decimalesDe(valor) > r.decimales) {
      errores.push(`${r.etiqueta} admite hasta ${r.decimales} decimales.`);
      continue;
    }
    if (Math.abs(valor) >= 10 ** r.enteros) {
      errores.push(`${r.etiqueta} es demasiado grande.`);
      continue;
    }
    datos[r.campo] = valor;
  }

  if (errores.length === 0 && Object.keys(datos).length === 0) {
    errores.push('No hay ningún cambio para guardar.');
  }
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos };
}

/** Revisa la coherencia entre los valores ya mezclados (lo guardado más los cambios). */
export function revisarCoherencia(final: { stock_minimo: number | null; stock_maximo: number | null }): string[] {
  const errores: string[] = [];
  if (final.stock_minimo !== null && final.stock_maximo !== null && final.stock_minimo > final.stock_maximo) {
    errores.push('El stock mínimo no puede ser mayor que el stock máximo.');
  }
  return errores;
}
