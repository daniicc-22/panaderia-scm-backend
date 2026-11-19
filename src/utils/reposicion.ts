/**
 * Reposición de insumos: EOQ, punto de reorden, fecha límite de pedido y
 * cantidad recomendada (Sprint 7: HU-20, HU-21, HU-22 y HU-24).
 *
 * Funciones puras, sin base de datos ni reloj. Reglas del proyecto:
 *  - Nunca se inventa un valor para poder calcular. Si falta un dato, el
 *    resultado lo dice (`faltantes`) y no se calcula lo que depende de él.
 *  - La demanda siempre lleva su origen (real, declarada o estimada).
 *  - Las unidades son las de la unidad base del insumo (gramos en el piloto);
 *    el que llama convierte bultos, cajas, libras, etc.
 *
 * Contexto: el proveedor entrega solo ciertos días de la semana, así que no se
 * puede pedir "al llegar al punto de reorden": solo se puede pedir para la
 * siguiente entrega. Por eso el EOQ clásico se complementa con una política de
 * revisión periódica (se pide hasta un nivel objetivo, solo si lo que queda al
 * llegar la entrega no alcanza hasta la siguiente).
 */

import {
  cicloPromedioDias,
  diasEntre,
  entregaPosteriorA,
  normalizarDiasEntrega,
  proximaEntrega,
  sumarDias,
  ultimoDiaParaPedir,
  type FechaCivil,
} from './calendarioEntrega';

export const SEMANAS_POR_ANIO = 52;
/** Máximo de entregas que puede cubrir un pedido al elegir el ciclo económico. */
export const MAX_CICLOS = 8;
const TOLERANCIA = 1e-9;

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

// ---------------------------------------------------------------- demanda

export type OrigenDemanda = 'real' | 'declarada' | 'estimada';

export interface DemandaResuelta {
  semanal: number;
  diaria: number;
  anual: number;
  origen: OrigenDemanda;
}

export interface FuentesDemanda {
  /** Consumo real medido en las salidas por producción. */
  real?: { semanal: number; semanasObservadas: number } | null | undefined;
  /** Consumo semanal que declaró el administrador. */
  declaradaSemanal?: number | null | undefined;
  /** Consumo semanal estimado a partir de las recetas. */
  estimadaSemanal?: number | null | undefined;
}

function construirDemanda(semanal: number, origen: OrigenDemanda): DemandaResuelta {
  return {
    semanal,
    diaria: semanal / 7,
    anual: semanal * SEMANAS_POR_ANIO,
    origen,
  };
}

/**
 * Elige la demanda con esta prioridad: real (si hay al menos
 * `minSemanasReal` semanas observadas), declarada y estimada. Devuelve null si
 * ninguna fuente tiene un valor positivo.
 */
export function resolverDemanda(
  fuentes: FuentesDemanda,
  minSemanasReal = 4,
): DemandaResuelta | null {
  const real = fuentes.real;
  if (
    real != null &&
    esNumero(real.semanal) &&
    real.semanal > 0 &&
    esNumero(real.semanasObservadas) &&
    real.semanasObservadas >= minSemanasReal
  ) {
    return construirDemanda(real.semanal, 'real');
  }
  if (esNumero(fuentes.declaradaSemanal) && fuentes.declaradaSemanal > 0) {
    return construirDemanda(fuentes.declaradaSemanal, 'declarada');
  }
  if (esNumero(fuentes.estimadaSemanal) && fuentes.estimadaSemanal > 0) {
    return construirDemanda(fuentes.estimadaSemanal, 'estimada');
  }
  return null;
}

// -------------------------------------------------------------------- EOQ

/** H = i × C: costo anual de mantener una unidad (tasa anual por costo unitario). */
export function calcularCostoMantener(
  tasaAnual: number | null,
  costoUnitario: number | null,
): number | null {
  if (!esNumero(tasaAnual) || tasaAnual <= 0) return null;
  if (!esNumero(costoUnitario) || costoUnitario <= 0) return null;
  return tasaAnual * costoUnitario;
}

export interface EntradaEOQ {
  demandaAnual: number | null;
  costoPedido: number | null;
  costoMantener: number | null;
}

export interface ResultadoEOQ {
  eoq: number | null;
  faltantes: string[];
}

/** EOQ = √(2·D·S / H). Si falta o es inválido un dato, no calcula y lo informa. */
export function calcularEOQ(entrada: EntradaEOQ): ResultadoEOQ {
  const faltantes: string[] = [];
  if (!esNumero(entrada.demandaAnual) || entrada.demandaAnual <= 0) faltantes.push('demanda');
  if (!esNumero(entrada.costoPedido) || entrada.costoPedido < 0) faltantes.push('costo_pedido');
  if (!esNumero(entrada.costoMantener) || entrada.costoMantener <= 0) {
    faltantes.push('costo_mantener');
  }
  if (faltantes.length > 0) return { eoq: null, faltantes };
  const eoq = Math.sqrt(
    (2 * (entrada.demandaAnual as number) * (entrada.costoPedido as number)) /
      (entrada.costoMantener as number),
  );
  return { eoq, faltantes };
}

export interface EntradaCostoTotal {
  demandaAnual: number;
  costoPedido: number;
  costoMantener: number;
  cantidad: number;
}

/** Costo anual de pedir y mantener con pedidos de `cantidad`: (D/Q)·S + (Q/2)·H. */
export function costoTotalAnual(entrada: EntradaCostoTotal): number {
  if (!(entrada.cantidad > 0)) {
    throw new RangeError('La cantidad del pedido debe ser mayor que cero');
  }
  return (
    (entrada.demandaAnual / entrada.cantidad) * entrada.costoPedido +
    (entrada.cantidad / 2) * entrada.costoMantener
  );
}

// ------------------------------------------------------ stock de seguridad

/** Stock de seguridad expresado como días de consumo. */
export function stockSeguridadPorDias(demandaDiaria: number, dias: number): number {
  if (!esNumero(demandaDiaria) || demandaDiaria < 0) {
    throw new RangeError('La demanda diaria no puede ser negativa');
  }
  if (!esNumero(dias) || dias < 0) {
    throw new RangeError('Los días de seguridad no pueden ser negativos');
  }
  return demandaDiaria * dias;
}

const Z_POR_NIVEL_DE_SERVICIO: Readonly<Record<string, number>> = {
  '0.9': 1.2816,
  '0.95': 1.6449,
  '0.975': 1.96,
  '0.99': 2.3263,
};

/** Valor z de la normal para los niveles de servicio usuales (90, 95, 97,5 y 99 %). */
export function zParaNivelDeServicio(nivel: number): number {
  const z = Z_POR_NIVEL_DE_SERVICIO[String(nivel)];
  if (z === undefined) {
    throw new RangeError('Nivel de servicio no soportado: use 0.9, 0.95, 0.975 o 0.99');
  }
  return z;
}

/**
 * Stock de seguridad estadístico: z · σ · √(días de protección). Solo es
 * válido cuando hay consumo real con variabilidad medida; mientras tanto se
 * usa `stockSeguridadPorDias` con un valor declarado.
 */
export function stockSeguridadEstadistico(entrada: {
  z: number;
  sigmaDiaria: number;
  diasProteccion: number;
}): number {
  if (!(entrada.z > 0) || !(entrada.sigmaDiaria >= 0) || !(entrada.diasProteccion > 0)) {
    throw new RangeError('z, desvío diario y días de protección deben ser válidos');
  }
  return entrada.z * entrada.sigmaDiaria * Math.sqrt(entrada.diasProteccion);
}

// ---------------------------------------------------------- pedido mínimo

export interface LineaPedido {
  cantidad: number;
  costoUnitario: number;
}

export interface EvaluacionPedidoMinimo {
  total: number;
  minimo: number | null;
  /** null cuando no se conoce el mínimo del proveedor. */
  cumple: boolean | null;
  faltante: number;
}

export function evaluarPedidoMinimo(
  lineas: readonly LineaPedido[],
  minimo: number | null,
): EvaluacionPedidoMinimo {
  const total = lineas.reduce((suma, linea) => suma + linea.cantidad * linea.costoUnitario, 0);
  if (!esNumero(minimo) || minimo < 0) {
    return { total, minimo: null, cumple: null, faltante: 0 };
  }
  const cumple = total >= minimo;
  return { total, minimo, cumple, faltante: cumple ? 0 : minimo - total };
}

// ------------------------------------------------------------ recomendación

export type EstadoReposicion =
  | 'datos_insuficientes'
  | 'quiebre_probable'
  | 'riesgo'
  | 'pedir_hoy'
  | 'pedir'
  | 'ok'
  | 'sobreinventario';

export interface EntradaReposicion {
  /** Fecha de hoy en Colombia. Se pasa siempre: la función no lee el reloj. */
  hoy: FechaCivil;
  /**
   * Día en que cuenta un pedido hecho ahora (pasa a mañana si ya se cerró la hora límite del
   * proveedor). Sin valor cuenta `hoy`. La existencia se proyecta siempre desde `hoy`.
   */
  fechaPedido?: FechaCivil | undefined;
  existencia: number;
  demanda: DemandaResuelta | null;
  costoPedido: number | null;
  /** H: costo anual de mantener una unidad. */
  costoMantener: number | null;
  /** Stock de seguridad en unidades. null = no definido (no se inventa). */
  stockSeguridad: number | null;
  calendario: { diasEntrega: readonly number[]; plazoDias: number } | null;
  /** Máximo de días que se acepta tener el insumo guardado. */
  vidaUtilDias: number | null;
  stockMaximo: number | null;
  /** Contenido de la presentación de compra (el pedido se redondea hacia arriba). */
  multiploCompra: number | null;
}

export interface ResultadoReposicion {
  estado: EstadoReposicion;
  /** Datos que faltan para decidir. Con faltantes no se calcula la decisión. */
  faltantes: string[];
  advertencias: string[];
  demanda_origen: OrigenDemanda | null;
  eoq: number | null;
  /** EOQ / demanda diaria: cada cuántos días convendría pedir sin restricciones. */
  ciclo_economico_dias: number | null;
  /** Entregas que cubre un pedido (1 = cada entrega). */
  ciclos_elegidos: number | null;
  /** Costo anual de pedir y mantener con el ciclo elegido. */
  costo_total_anual: number | null;
  /** Costo anual de pedir y mantener si se pidiera justo el EOQ (el mínimo teórico, sin calendario). */
  costo_anual_eoq: number | null;
  /** Cantidad de cada pedido con el ciclo elegido (d × días que cubre). */
  cantidad_politica: number | null;
  cobertura_dias: number | null;
  fecha_agotamiento: FechaCivil | null;
  proxima_entrega: FechaCivil | null;
  fecha_limite_pedido: FechaCivil | null;
  /** Existencia que quedaría al llegar la próxima entrega (puede ser negativa). */
  proyeccion_a_la_entrega: number | null;
  /** d × plazo + stock de seguridad (el ROP clásico). */
  punto_reorden_clasico: number | null;
  /** d × (plazo + días hasta la siguiente entrega) + stock de seguridad, medido el día de pedir. */
  punto_reorden_calendario: number | null;
  nivel_objetivo: number | null;
  /** 0 si no hay que pedir. */
  cantidad_recomendada: number;
}

function resultadoVacio(): ResultadoReposicion {
  return {
    estado: 'datos_insuficientes',
    faltantes: [],
    advertencias: [],
    demanda_origen: null,
    eoq: null,
    ciclo_economico_dias: null,
    ciclos_elegidos: null,
    costo_total_anual: null,
    costo_anual_eoq: null,
    cantidad_politica: null,
    cobertura_dias: null,
    fecha_agotamiento: null,
    proxima_entrega: null,
    fecha_limite_pedido: null,
    proyeccion_a_la_entrega: null,
    punto_reorden_clasico: null,
    punto_reorden_calendario: null,
    nivel_objetivo: null,
    cantidad_recomendada: 0,
  };
}

const ESTADOS_DE_PEDIDO: readonly EstadoReposicion[] = [
  'quiebre_probable',
  'riesgo',
  'pedir_hoy',
  'pedir',
];

/**
 * Decide si hay que pedir y cuánto, para un insumo y un proveedor con
 * calendario de entregas.
 *
 * Regla de decisión: con la próxima entrega posible E1 y la siguiente E2
 * (R1 días después), se proyecta la existencia al llegar E1. Si esa
 * existencia no alcanza para llegar a E2 con el stock de seguridad
 * (proyección < SS + d·R1), hay que pedir para E1.
 *
 * Cantidad: hasta el nivel objetivo SS + d·cobertura(k), donde k es la
 * cantidad de entregas que cubre un pedido, elegida por menor costo anual de
 * pedir y mantener (EOQ ajustado al calendario) y limitada por la vida útil y
 * el stock máximo.
 */
export function recomendarReposicion(entrada: EntradaReposicion): ResultadoReposicion {
  if (!esNumero(entrada.existencia) || entrada.existencia < 0) {
    throw new RangeError('La existencia no puede ser negativa');
  }

  const r = resultadoVacio();
  const demanda =
    entrada.demanda !== null && entrada.demanda.diaria > 0 && entrada.demanda.anual > 0
      ? entrada.demanda
      : null;
  r.demanda_origen = demanda ? demanda.origen : null;

  // EOQ de referencia: no depende del calendario ni del stock de seguridad.
  const resEOQ = calcularEOQ({
    demandaAnual: demanda ? demanda.anual : null,
    costoPedido: entrada.costoPedido,
    costoMantener: entrada.costoMantener,
  });
  r.eoq = resEOQ.eoq;
  if (resEOQ.eoq !== null && demanda) {
    r.ciclo_economico_dias = resEOQ.eoq / demanda.diaria;
    r.costo_anual_eoq = costoTotalAnual({
      demandaAnual: demanda.anual,
      costoPedido: entrada.costoPedido as number,
      costoMantener: entrada.costoMantener as number,
      cantidad: resEOQ.eoq,
    });
  }
  if (resEOQ.eoq === null) {
    if (resEOQ.faltantes.includes('costo_pedido')) r.advertencias.push('sin_eoq_falta_costo_pedido');
    if (resEOQ.faltantes.includes('costo_mantener')) {
      r.advertencias.push('sin_eoq_falta_costo_mantener');
    }
  }

  // Datos sin los cuales no se puede decidir.
  if (demanda === null) r.faltantes.push('demanda');
  if (entrada.calendario === null) r.faltantes.push('calendario_entrega');
  if (!esNumero(entrada.stockSeguridad) || entrada.stockSeguridad < 0) {
    r.faltantes.push('stock_seguridad');
  }
  if (demanda) r.cobertura_dias = entrada.existencia / demanda.diaria;
  if (demanda && r.cobertura_dias !== null) {
    r.fecha_agotamiento = sumarDias(entrada.hoy, Math.floor(r.cobertura_dias + TOLERANCIA));
  }
  if (r.faltantes.length > 0 || demanda === null || entrada.calendario === null) return r;

  const ss = entrada.stockSeguridad as number;
  const d = demanda.diaria;
  const dias = normalizarDiasEntrega(entrada.calendario.diasEntrega);
  const plazo = entrada.calendario.plazoDias;

  const fechaPedido = entrada.fechaPedido ?? entrada.hoy;
  const entrega1 = proximaEntrega(fechaPedido, dias, plazo);
  const entrega2 = entregaPosteriorA(entrega1, dias);
  const r1 = diasEntre(entrega1, entrega2);
  const rPromedio = cicloPromedioDias(dias);
  const diasHastaEntrega = diasEntre(entrada.hoy, entrega1);
  const proyeccion = entrada.existencia - d * diasHastaEntrega;
  const umbral = ss + d * r1;

  r.proxima_entrega = entrega1;
  r.fecha_limite_pedido = ultimoDiaParaPedir(entrega1, plazo);
  r.proyeccion_a_la_entrega = proyeccion;
  r.punto_reorden_clasico = d * plazo + ss;
  r.punto_reorden_calendario = d * (plazo + r1) + ss;

  // Ciclo económico: cuántas entregas cubre un pedido.
  const vida = entrada.vidaUtilDias !== null && entrada.vidaUtilDias > 0 ? entrada.vidaUtilDias : null;
  const maximo = entrada.stockMaximo !== null && entrada.stockMaximo > 0 ? entrada.stockMaximo : null;
  const cobertura = (k: number): number => {
    const cruda = r1 + (k - 1) * rPromedio;
    return vida !== null ? Math.min(cruda, vida) : cruda;
  };
  if (vida !== null && r1 > vida + TOLERANCIA) r.advertencias.push('vida_util_menor_que_ciclo');

  let k = 1;
  if (resEOQ.eoq !== null && entrada.costoPedido !== null && entrada.costoMantener !== null) {
    let mejor = Number.POSITIVE_INFINITY;
    for (let c = 1; c <= MAX_CICLOS; c++) {
      const crudo = r1 + (c - 1) * rPromedio;
      if (c > 1 && vida !== null && crudo > vida + TOLERANCIA) break;
      if (c > 1 && maximo !== null && ss + d * crudo > maximo + TOLERANCIA) break;
      const costo = costoTotalAnual({
        demandaAnual: demanda.anual,
        costoPedido: entrada.costoPedido,
        costoMantener: entrada.costoMantener,
        cantidad: d * cobertura(c),
      });
      if (costo < mejor - TOLERANCIA) {
        mejor = costo;
        k = c;
      }
    }
    r.costo_total_anual = mejor;
    r.cantidad_politica = d * cobertura(k);
  } else {
    r.advertencias.push('ciclo_minimo_por_falta_de_eoq');
  }
  r.ciclos_elegidos = k;

  // El stock máximo es un tope duro (Q = mín(nivel objetivo, Smáx) − lo que quedará al llegar la entrega):
  // si el nivel objetivo lo supera, el pedido se recorta al máximo y se avisa.
  let nivelObjetivo = ss + d * cobertura(k);
  let recortadoPorMaximo = false;
  if (maximo !== null && nivelObjetivo > maximo + TOLERANCIA) {
    r.advertencias.push('nivel_objetivo_supera_maximo');
    nivelObjetivo = maximo;
    recortadoPorMaximo = true;
  }
  r.nivel_objetivo = nivelObjetivo;

  // Estado.
  // La tolerancia evita que el redondeo de decimales cambie el estado justo en el límite.
  if (proyeccion <= TOLERANCIA) {
    r.estado = 'quiebre_probable';
  } else if (proyeccion < ss - TOLERANCIA) {
    r.estado = 'riesgo';
  } else if (proyeccion < umbral - TOLERANCIA) {
    // Con la hora límite vencida el pedido cuenta para mañana: el último día para pedir ya no es hoy
    r.estado = r.fecha_limite_pedido === entrada.hoy ? 'pedir_hoy' : 'pedir';
  } else {
    const excedeMaximo = maximo !== null && entrada.existencia > maximo;
    const excedeVida = vida !== null && entrada.existencia > d * vida + TOLERANCIA;
    r.estado = excedeMaximo || excedeVida ? 'sobreinventario' : 'ok';
  }

  // Cantidad.
  if (ESTADOS_DE_PEDIDO.includes(r.estado)) {
    let cantidad = Math.max(0, nivelObjetivo - Math.max(0, proyeccion));
    const multiplo = entrada.multiploCompra;
    if (esNumero(multiplo) && multiplo > 0 && cantidad > 0) {
      cantidad = Math.ceil(cantidad / multiplo - TOLERANCIA) * multiplo;
    }
    r.cantidad_recomendada = cantidad;
    if (cantidad === 0) r.advertencias.push(recortadoPorMaximo ? 'cantidad_limitada_por_maximo' : 'cantidad_limitada_por_vida_util');
    if (cantidad > 0 && maximo !== null && Math.max(0, proyeccion) + cantidad > maximo + TOLERANCIA) {
      r.advertencias.push('redondeo_supera_maximo');
    }
  }
  return r;
}

// -------------------------------------------------- qué se puede producir

export interface RequerimientoLote {
  materiaPrimaId: string;
  /** Cantidad que usa un lote, en unidad base. */
  cantidad: number;
}

export interface CapacidadProduccion {
  /** null si la fórmula no tiene ingredientes con cantidad positiva. */
  lotesPosibles: number | null;
  /** El insumo que se agota primero. */
  limitante: { materiaPrimaId: string; disponible: number; porLote: number } | null;
  /** Para los insumos que no alcanzan para un lote, cuánto falta. */
  faltaParaUnLote: { materiaPrimaId: string; falta: number }[];
}

/**
 * Cuántos lotes de una fórmula se pueden producir con las existencias. No usa
 * precios: es la vista del operario ("qué se puede producir con lo que hay").
 * Un insumo sin existencia registrada cuenta como cero.
 */
export function capacidadProduccion(
  requerimientos: readonly RequerimientoLote[],
  existencias: Readonly<Record<string, number>>,
): CapacidadProduccion {
  const validos = requerimientos.filter((req) => esNumero(req.cantidad) && req.cantidad > 0);
  if (validos.length === 0) {
    return { lotesPosibles: null, limitante: null, faltaParaUnLote: [] };
  }
  let limitante: CapacidadProduccion['limitante'] = null;
  let menor = Number.POSITIVE_INFINITY;
  const falta: CapacidadProduccion['faltaParaUnLote'] = [];
  for (const req of validos) {
    const disponible = Math.max(0, existencias[req.materiaPrimaId] ?? 0);
    const lotes = disponible / req.cantidad;
    if (lotes < menor) {
      menor = lotes;
      limitante = { materiaPrimaId: req.materiaPrimaId, disponible, porLote: req.cantidad };
    }
    if (disponible < req.cantidad) {
      falta.push({ materiaPrimaId: req.materiaPrimaId, falta: req.cantidad - disponible });
    }
  }
  return {
    lotesPosibles: Math.floor(menor + TOLERANCIA),
    limitante,
    faltaParaUnLote: falta,
  };
}
