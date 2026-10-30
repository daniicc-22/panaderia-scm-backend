// Arma las recomendaciones de reposición de todos los insumos (Sprint 7: HU-21, HU-22 y HU-24).
// Función pura: junta los datos que ya leyó la ruta (existencias, consumo, parámetros, ofertas y
// proveedores) con las reglas de `reposicion.ts`. No consulta la base de datos ni lee el reloj.
import { fechaEfectivaDePedido, type FechaCivil } from './calendarioEntrega';
import {
  calcularCostoMantener,
  evaluarPedidoMinimo,
  recomendarReposicion,
  resolverDemanda,
  type EstadoReposicion,
  type EvaluacionPedidoMinimo,
  type OrigenDemanda,
} from './reposicion';

export type ClaseAbc = 'A' | 'B' | 'C';

export interface ParametrosInsumo {
  /** S: costo de hacer un pedido. */
  costo_pedido: number | null;
  /** H dado directamente; si falta se calcula con la tasa y el costo del insumo. */
  costo_mantener_h: number | null;
  tasa_mantenimiento_anual: number | null;
  dias_seguridad: number | null;
  /** Stock de seguridad en unidades base (se usa si no hay días de seguridad). */
  stock_minimo: number | null;
  stock_maximo: number | null;
  vida_util_dias: number | null;
  /** Tiempo de entrega propio del insumo (respaldo si la oferta no lo trae). */
  plazo_dias: number | null;
  porcentaje_perdida_tolerable?: number | null;
  /** Sin valor cuenta como 'periodica'. */
  modo_reposicion?: 'periodica' | 'al_uso';
}

export interface OfertaAplicada {
  proveedor_id: string;
  presentacion: string;
  /** Contenido de la presentación en unidad base: el pedido se redondea a este múltiplo. */
  contenido: number;
  /** Precio de una presentación. */
  precio: number;
  /** Costo por unidad base. */
  costo_unitario: number;
  plazo_dias: number | null;
}

export interface DatosInsumo {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  /** Existencias que se pueden usar (sin lotes vencidos). */
  existencia: number;
  existencia_vencida: number;
  consumo_real: { semanal: number; semanasObservadas: number } | null;
  consumo_declarado_semanal: number | null;
  consumo_estimado_semanal: number | null;
  parametros: ParametrosInsumo | null;
  plazo_materia_dias: number | null;
  oferta: OfertaAplicada | null;
}

export interface DatosProveedor {
  id: string;
  nombre: string;
  dias_entrega: readonly number[];
  hora_limite_pedido: string | null;
  pedido_minimo: number | null;
}

export interface ItemRecomendacion {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  estado: EstadoReposicion;
  faltantes: string[];
  advertencias: string[];
  existencia: number;
  existencia_vencida: number;
  demanda_semanal: number | null;
  demanda_origen: OrigenDemanda | null;
  cobertura_dias: number | null;
  fecha_agotamiento: FechaCivil | null;
  proveedor: { id: string; nombre: string } | null;
  /** Días entre pedir y recibir con los que se calculó (oferta, parámetro o insumo). */
  plazo_dias: number | null;
  proxima_entrega: FechaCivil | null;
  fecha_limite_pedido: FechaCivil | null;
  proyeccion_a_la_entrega: number | null;
  stock_seguridad: number | null;
  punto_reorden_calendario: number | null;
  nivel_objetivo: number | null;
  eoq: number | null;
  ciclo_economico_dias: number | null;
  ciclos_elegidos: number | null;
  /** Lo necesario para dibujar la curva de costos del EOQ. Solo existe si el EOQ se pudo calcular. */
  modelo: {
    demanda_anual: number;
    costo_pedido: number;
    costo_mantener: number;
    /** Cantidad de cada pedido con el ciclo elegido (adaptado al calendario del proveedor). */
    cantidad_politica: number | null;
    /** Costo anual de pedir y mantener pidiendo justo el EOQ. */
    costo_anual_eoq: number;
  } | null;
  cantidad_recomendada: number;
  presentacion: string | null;
  presentaciones_a_pedir: number | null;
  /** Dinero: la ruta lo quita si quien consulta no puede ver costos. */
  costos: { precio_presentacion: number; valor_pedido: number; costo_total_anual: number | null } | null;
}

export interface PedidoProveedor {
  proveedor: { id: string; nombre: string };
  fecha_limite_pedido: FechaCivil | null;
  proxima_entrega: FechaCivil | null;
  insumos: number;
  items: { materia_prima_id: string; nombre: string; presentaciones: number; valor: number }[];
  /** Dinero (la ruta lo quita si no corresponde). */
  costos: { total: number; pedido_minimo: EvaluacionPedidoMinimo };
}

/** Insumo perecedero que no se maneja con inventario: se compra según lo que pida la producción. */
export interface InsumoAlUso {
  materia_prima_id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clase_abc: ClaseAbc | null;
  existencia: number;
  existencia_vencida: number;
  demanda_semanal: number | null;
  demanda_origen: OrigenDemanda | null;
}

export interface ResultadoRecomendaciones {
  fecha: FechaCivil;
  resumen: Record<EstadoReposicion, number>;
  items: ItemRecomendacion[];
  /** Insumos en modo `al_uso`: no se calcula cuándo pedirlos y no cuentan en el resumen ni en las alertas. */
  al_uso: InsumoAlUso[];
  pedidos: PedidoProveedor[];
}

const ORDEN_ESTADO: Record<EstadoReposicion, number> = {
  quiebre_probable: 0,
  riesgo: 1,
  pedir_hoy: 2,
  pedir: 3,
  datos_insuficientes: 4,
  sobreinventario: 5,
  ok: 6,
};
const ORDEN_CLASE: Record<ClaseAbc, number> = { A: 0, B: 1, C: 2 };
const SIN_FECHA = '9999-12-31';

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const comparar = (a: string, b: string) => a.localeCompare(b, 'es');

export interface EntradaRecomendaciones {
  hoy: FechaCivil;
  /** Hora actual en Colombia, 'HH:MM', para saber si ya pasó la hora límite del proveedor. */
  hora: string;
  insumos: readonly DatosInsumo[];
  proveedores: readonly DatosProveedor[];
}

export function armarRecomendaciones(entrada: EntradaRecomendaciones): ResultadoRecomendaciones {
  const proveedores = new Map(entrada.proveedores.map((p) => [p.id, p]));
  const items: ItemRecomendacion[] = [];
  const alUso: InsumoAlUso[] = [];

  for (const insumo of entrada.insumos) {
    if (insumo.parametros?.modo_reposicion === 'al_uso') {
      const d = resolverDemanda({
        real: insumo.consumo_real,
        declaradaSemanal: insumo.consumo_declarado_semanal,
        estimadaSemanal: insumo.consumo_estimado_semanal,
      });
      alUso.push({
        materia_prima_id: insumo.materia_prima_id,
        codigo: insumo.codigo,
        nombre: insumo.nombre,
        unidad: insumo.unidad,
        clase_abc: insumo.clase_abc,
        existencia: insumo.existencia,
        existencia_vencida: insumo.existencia_vencida,
        demanda_semanal: d ? redondear(d.semanal) : null,
        demanda_origen: d ? d.origen : null,
      });
      continue;
    }
    const oferta = insumo.oferta;
    const proveedor = oferta ? (proveedores.get(oferta.proveedor_id) ?? null) : null;
    const par = insumo.parametros;

    const demanda = resolverDemanda({
      real: insumo.consumo_real,
      declaradaSemanal: insumo.consumo_declarado_semanal,
      estimadaSemanal: insumo.consumo_estimado_semanal,
    });

    // El plazo se toma de la oferta, luego del parámetro del insumo y por último del insumo mismo
    const plazo = oferta?.plazo_dias ?? par?.plazo_dias ?? insumo.plazo_materia_dias ?? null;
    const calendario =
      proveedor !== null && proveedor.dias_entrega.length > 0 && plazo !== null
        ? { diasEntrega: proveedor.dias_entrega, plazoDias: plazo }
        : null;

    // Stock de seguridad: días de consumo si están definidos; si no, el stock mínimo en unidades
    let stockSeguridad: number | null = null;
    if (par?.dias_seguridad != null && demanda !== null) stockSeguridad = demanda.diaria * par.dias_seguridad;
    else if (par?.stock_minimo != null) stockSeguridad = par.stock_minimo;

    const costoMantener =
      par?.costo_mantener_h ??
      calcularCostoMantener(par?.tasa_mantenimiento_anual ?? null, oferta?.costo_unitario ?? null);

    // Un pedido hecho después de la hora límite del proveedor cuenta como del día siguiente
    const fechaPedido = proveedor
      ? fechaEfectivaDePedido(entrada.hoy, entrada.hora, proveedor.hora_limite_pedido)
      : entrada.hoy;

    const r = recomendarReposicion({
      hoy: entrada.hoy,
      fechaPedido,
      existencia: insumo.existencia,
      demanda,
      costoPedido: par?.costo_pedido ?? null,
      costoMantener,
      stockSeguridad,
      calendario,
      vidaUtilDias: par?.vida_util_dias ?? null,
      stockMaximo: par?.stock_maximo ?? null,
      multiploCompra: oferta?.contenido ?? null,
    });

    // `calendario_entrega` se desglosa para que el administrador sepa qué completar
    const faltantes: string[] = [];
    for (const f of r.faltantes) {
      if (f !== 'calendario_entrega') {
        faltantes.push(f);
        continue;
      }
      if (oferta === null) faltantes.push('proveedor');
      else if (proveedor === null || proveedor.dias_entrega.length === 0) faltantes.push('dias_entrega');
      if (plazo === null) faltantes.push('plazo_entrega');
    }

    const advertencias = [...r.advertencias];
    if (insumo.existencia_vencida > 0) advertencias.push('existencia_vencida_excluida');

    const presentaciones =
      oferta && r.cantidad_recomendada > 0 ? redondear(r.cantidad_recomendada / oferta.contenido, 4) : null;
    items.push({
      materia_prima_id: insumo.materia_prima_id,
      codigo: insumo.codigo,
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      clase_abc: insumo.clase_abc,
      estado: r.estado,
      faltantes,
      advertencias,
      existencia: insumo.existencia,
      existencia_vencida: insumo.existencia_vencida,
      demanda_semanal: demanda ? redondear(demanda.semanal) : null,
      demanda_origen: r.demanda_origen,
      cobertura_dias: r.cobertura_dias === null ? null : redondear(r.cobertura_dias, 1),
      fecha_agotamiento: r.fecha_agotamiento,
      proveedor: proveedor ? { id: proveedor.id, nombre: proveedor.nombre } : null,
      plazo_dias: plazo,
      proxima_entrega: r.proxima_entrega,
      fecha_limite_pedido: r.fecha_limite_pedido,
      proyeccion_a_la_entrega: r.proyeccion_a_la_entrega === null ? null : redondear(r.proyeccion_a_la_entrega),
      stock_seguridad: stockSeguridad === null ? null : redondear(stockSeguridad),
      punto_reorden_calendario: r.punto_reorden_calendario === null ? null : redondear(r.punto_reorden_calendario),
      nivel_objetivo: r.nivel_objetivo === null ? null : redondear(r.nivel_objetivo),
      eoq: r.eoq === null ? null : redondear(r.eoq),
      ciclo_economico_dias: r.ciclo_economico_dias === null ? null : redondear(r.ciclo_economico_dias, 1),
      ciclos_elegidos: r.ciclos_elegidos,
      modelo:
        r.eoq !== null && r.costo_anual_eoq !== null && demanda !== null && par?.costo_pedido != null && costoMantener !== null
          ? {
              demanda_anual: redondear(demanda.anual),
              costo_pedido: par.costo_pedido,
              costo_mantener: redondear(costoMantener, 4),
              cantidad_politica: r.cantidad_politica === null ? null : redondear(r.cantidad_politica),
              costo_anual_eoq: redondear(r.costo_anual_eoq, 2),
            }
          : null,
      cantidad_recomendada: redondear(r.cantidad_recomendada),
      presentacion: oferta ? oferta.presentacion : null,
      presentaciones_a_pedir: presentaciones,
      costos: oferta
        ? {
            precio_presentacion: oferta.precio,
            valor_pedido: presentaciones === null ? 0 : redondear(presentaciones * oferta.precio, 2),
            costo_total_anual: r.costo_total_anual === null ? null : redondear(r.costo_total_anual, 2),
          }
        : null,
    });
  }

  items.sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      (a.clase_abc ? ORDEN_CLASE[a.clase_abc] : 3) - (b.clase_abc ? ORDEN_CLASE[b.clase_abc] : 3) ||
      comparar(a.fecha_limite_pedido ?? SIN_FECHA, b.fecha_limite_pedido ?? SIN_FECHA) ||
      comparar(a.nombre, b.nombre) ||
      comparar(a.materia_prima_id, b.materia_prima_id),
  );

  const resumen: Record<EstadoReposicion, number> = {
    quiebre_probable: 0,
    riesgo: 0,
    pedir_hoy: 0,
    pedir: 0,
    datos_insuficientes: 0,
    sobreinventario: 0,
    ok: 0,
  };
  for (const i of items) resumen[i.estado]++;

  // Lo que hay que pedir, agrupado por proveedor, con el pedido mínimo
  const porProveedor = new Map<string, ItemRecomendacion[]>();
  for (const i of items) {
    if (i.cantidad_recomendada <= 0 || i.proveedor === null || i.presentaciones_a_pedir === null) continue;
    const lista = porProveedor.get(i.proveedor.id) ?? [];
    lista.push(i);
    porProveedor.set(i.proveedor.id, lista);
  }
  const pedidos: PedidoProveedor[] = [...porProveedor.entries()].map(([id, lista]) => {
    const proveedor = proveedores.get(id)!;
    const lineas = lista.map((i) => ({
      cantidad: i.presentaciones_a_pedir as number,
      costoUnitario: i.costos?.precio_presentacion ?? 0,
    }));
    const minimo = evaluarPedidoMinimo(lineas, proveedor.pedido_minimo);
    const limites = lista.map((i) => i.fecha_limite_pedido).filter((f): f is FechaCivil => f !== null);
    const entregas = lista.map((i) => i.proxima_entrega).filter((f): f is FechaCivil => f !== null);
    return {
      proveedor: { id, nombre: proveedor.nombre },
      fecha_limite_pedido: limites.length > 0 ? limites.reduce((a, b) => (a < b ? a : b)) : null,
      proxima_entrega: entregas.length > 0 ? entregas.reduce((a, b) => (a < b ? a : b)) : null,
      insumos: lista.length,
      items: lista.map((i) => ({
        materia_prima_id: i.materia_prima_id,
        nombre: i.nombre,
        presentaciones: i.presentaciones_a_pedir as number,
        valor: i.costos?.valor_pedido ?? 0,
      })),
      costos: { total: redondear(minimo.total, 2), pedido_minimo: minimo },
    };
  });
  pedidos.sort((a, b) => comparar(a.fecha_limite_pedido ?? SIN_FECHA, b.fecha_limite_pedido ?? SIN_FECHA) || comparar(a.proveedor.nombre, b.proveedor.nombre));

  alUso.sort((a, b) => comparar(a.nombre, b.nombre) || comparar(a.materia_prima_id, b.materia_prima_id));

  return { fecha: entrada.hoy, resumen, items, al_uso: alUso, pedidos };
}
