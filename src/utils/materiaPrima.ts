// Reglas de validación de materias primas, sin acceso a base de datos (se prueban solas).

export const CRITERIOS_ROTACION = ['FIFO', 'FEFO', 'ninguno'] as const;
export type CriterioRotacion = (typeof CRITERIOS_ROTACION)[number];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 100;
export const LEAD_TIME_MAX = 365;

export interface DatosMateria {
  nombre: string;
  categoria_id: string | null;
  unidad_base_id: string;
  criterio_rotacion: CriterioRotacion | null;
  lead_time_dias: number | null;
  variabilidad_peso_unitario: boolean | null;
  // false para insumos que no se compran ni se guardan (p. ej. el agua): no tienen lotes ni existencias
  controla_inventario: boolean;
}

export type CambiosMateria = Partial<Omit<DatosMateria, 'unidad_base_id'>> & { activa?: boolean };

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export const normalizarNombre = (n: string) => n.trim().replace(/\s+/g, ' ');

function validarNombre(valor: unknown, errores: string[]): string | undefined {
  if (typeof valor !== 'string') {
    errores.push('El nombre es obligatorio.');
    return undefined;
  }
  const nombre = normalizarNombre(valor);
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    errores.push(`El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`);
    return undefined;
  }
  return nombre;
}

function validarCategoria(valor: unknown, errores: string[]): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    errores.push('La categoría no es válida.');
    return null;
  }
  return valor;
}

function validarCriterio(valor: unknown, errores: string[]): CriterioRotacion | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !(CRITERIOS_ROTACION as readonly string[]).includes(valor)) {
    errores.push('El criterio de rotación debe ser FIFO, FEFO o ninguno.');
    return null;
  }
  return valor as CriterioRotacion;
}

function validarLeadTime(valor: unknown, errores: string[]): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > LEAD_TIME_MAX) {
    errores.push(`El tiempo de entrega debe ser un número de días entre 0 y ${LEAD_TIME_MAX}.`);
    return null;
  }
  return Math.round(valor * 100) / 100;
}

function validarBooleanoOpcional(valor: unknown, etiqueta: string, errores: string[]): boolean | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'boolean') {
    errores.push(`${etiqueta} debe ser verdadero o falso.`);
    return null;
  }
  return valor;
}

function validarControla(valor: unknown, errores: string[]): boolean | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'boolean') {
    errores.push('Controla inventario debe ser verdadero o falso.');
    return undefined;
  }
  return valor;
}

export function validarCrear(cuerpo: unknown): Resultado<DatosMateria> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  const nombre = validarNombre(cuerpo.nombre, errores);

  let unidad = '';
  if (typeof cuerpo.unidad_base_id !== 'string' || !UUID.test(cuerpo.unidad_base_id)) {
    errores.push('La unidad base es obligatoria y debe ser válida.');
  } else {
    unidad = cuerpo.unidad_base_id;
  }

  const categoria_id = validarCategoria(cuerpo.categoria_id, errores);
  const criterio_rotacion = validarCriterio(cuerpo.criterio_rotacion, errores);
  const lead_time_dias = validarLeadTime(cuerpo.lead_time_dias, errores);
  const variabilidad_peso_unitario = validarBooleanoOpcional(
    cuerpo.variabilidad_peso_unitario,
    'La variabilidad de peso',
    errores,
  );

  const controla_inventario = validarControla(cuerpo.controla_inventario, errores);

  if (errores.length > 0 || nombre === undefined) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      nombre,
      categoria_id,
      unidad_base_id: unidad,
      criterio_rotacion,
      lead_time_dias,
      variabilidad_peso_unitario,
      controla_inventario: controla_inventario ?? true,
    },
  };
}

// El código y la unidad base no se cambian: romperían formulaciones, costos y ABC ya calculados.
const CAMPOS_BLOQUEADOS = ['codigo', 'unidad_base_id'] as const;
const CAMPOS_EDITABLES = [
  'nombre',
  'categoria_id',
  'criterio_rotacion',
  'lead_time_dias',
  'variabilidad_peso_unitario',
  'activa',
  'controla_inventario',
] as const;

export function validarEditar(cuerpo: unknown): Resultado<CambiosMateria> {
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  const errores: string[] = [];

  for (const campo of CAMPOS_BLOQUEADOS) {
    if (campo in cuerpo) errores.push(`El campo ${campo} no se puede modificar.`);
  }
  for (const campo of Object.keys(cuerpo)) {
    if (
      !(CAMPOS_EDITABLES as readonly string[]).includes(campo) &&
      !(CAMPOS_BLOQUEADOS as readonly string[]).includes(campo)
    ) {
      errores.push(`El campo ${campo} no existe.`);
    }
  }

  const cambios: CambiosMateria = {};
  if ('nombre' in cuerpo) {
    const nombre = validarNombre(cuerpo.nombre, errores);
    if (nombre !== undefined) cambios.nombre = nombre;
  }
  if ('categoria_id' in cuerpo) cambios.categoria_id = validarCategoria(cuerpo.categoria_id, errores);
  if ('criterio_rotacion' in cuerpo) cambios.criterio_rotacion = validarCriterio(cuerpo.criterio_rotacion, errores);
  if ('lead_time_dias' in cuerpo) cambios.lead_time_dias = validarLeadTime(cuerpo.lead_time_dias, errores);
  if ('variabilidad_peso_unitario' in cuerpo) {
    cambios.variabilidad_peso_unitario = validarBooleanoOpcional(
      cuerpo.variabilidad_peso_unitario,
      'La variabilidad de peso',
      errores,
    );
  }
  if ('controla_inventario' in cuerpo) {
    const v = validarControla(cuerpo.controla_inventario, errores);
    if (v !== undefined) cambios.controla_inventario = v;
  }
  if ('activa' in cuerpo) {
    if (typeof cuerpo.activa !== 'boolean') errores.push('El estado activa debe ser verdadero o falso.');
    else cambios.activa = cuerpo.activa;
  }

  if (errores.length === 0 && Object.keys(cambios).length === 0) {
    errores.push('No hay cambios para guardar.');
  }
  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: cambios };
}

// Siguiente código MP-0xx a partir de los existentes (ignora los que no siguen el formato).
export function siguienteCodigo(codigos: string[]): string {
  let max = 0;
  for (const c of codigos) {
    const m = /^MP-(\d+)$/i.exec(c.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `MP-${String(max + 1).padStart(3, '0')}`;
}
