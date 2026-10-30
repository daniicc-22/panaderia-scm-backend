import { describe, it, expect } from 'vitest';
import {
  calcularCostoMantener,
  calcularEOQ,
  capacidadProduccion,
  costoTotalAnual,
  evaluarPedidoMinimo,
  recomendarReposicion,
  resolverDemanda,
  stockSeguridadEstadistico,
  stockSeguridadPorDias,
  zParaNivelDeServicio,
  type EntradaReposicion,
} from '../src/utils/reposicion';

// Caso base con números redondos, calculados a mano:
//  - Consumo 7.000 por semana = 1.000 por día = 364.000 por año.
//  - Entrega los miércoles (día 3), 1 día de plazo. Hoy es lunes 2026-10-26,
//    así que la próxima entrega es el miércoles 2026-10-28 (en 2 días) y la
//    siguiente el 2026-11-04 (R1 = 7 días). Último día para pedir: 2026-10-27.
//  - Stock de seguridad 2.000. Umbral para pedir: 2.000 + 1.000 × 7 = 9.000.
const LUNES = '2026-10-26';
const MARTES = '2026-10-27';
const DEMANDA = resolverDemanda({ declaradaSemanal: 7000 });

function entrada(cambios: Partial<EntradaReposicion> = {}): EntradaReposicion {
  return {
    hoy: LUNES,
    existencia: 5000,
    demanda: DEMANDA,
    costoPedido: null,
    costoMantener: null,
    stockSeguridad: 2000,
    calendario: { diasEntrega: [3], plazoDias: 1 },
    vidaUtilDias: null,
    stockMaximo: null,
    multiploCompra: null,
    ...cambios,
  };
}

describe('resolverDemanda', () => {
  it('convierte el consumo semanal en diario y anual', () => {
    expect(DEMANDA?.semanal).toBe(7000);
    expect(DEMANDA?.diaria).toBe(1000);
    expect(DEMANDA?.anual).toBe(364000);
    expect(DEMANDA?.origen).toBe('declarada');
  });

  it('usa el consumo real solo con 4 o más semanas observadas', () => {
    const poco = resolverDemanda({
      real: { semanal: 5000, semanasObservadas: 3 },
      declaradaSemanal: 7000,
    });
    expect(poco?.origen).toBe('declarada');
    const suficiente = resolverDemanda({
      real: { semanal: 5000, semanasObservadas: 4 },
      declaradaSemanal: 7000,
    });
    expect(suficiente?.origen).toBe('real');
    expect(suficiente?.semanal).toBe(5000);
  });

  it('respeta un mínimo de semanas distinto', () => {
    const r = resolverDemanda({ real: { semanal: 5000, semanasObservadas: 2 } }, 2);
    expect(r?.origen).toBe('real');
  });

  it('cae a la estimada si no hay real ni declarada válidas', () => {
    expect(resolverDemanda({ declaradaSemanal: 0, estimadaSemanal: 3500 })?.origen).toBe('estimada');
    expect(resolverDemanda({ declaradaSemanal: null, estimadaSemanal: 3500 })?.semanal).toBe(3500);
  });

  it('devuelve null si ninguna fuente sirve (no inventa un valor)', () => {
    expect(resolverDemanda({})).toBeNull();
    expect(resolverDemanda({ declaradaSemanal: 0, estimadaSemanal: -5 })).toBeNull();
    expect(resolverDemanda({ declaradaSemanal: Number.NaN })).toBeNull();
    expect(resolverDemanda({ real: { semanal: 0, semanasObservadas: 10 } })).toBeNull();
  });
});

describe('calcularCostoMantener', () => {
  it('es la tasa anual por el costo unitario', () => {
    expect(calcularCostoMantener(0.24, 1000)).toBeCloseTo(240, 6);
  });

  it('devuelve null si falta la tasa o el costo, o no son positivos', () => {
    expect(calcularCostoMantener(null, 1000)).toBeNull();
    expect(calcularCostoMantener(0.24, null)).toBeNull();
    expect(calcularCostoMantener(0, 1000)).toBeNull();
    expect(calcularCostoMantener(0.24, 0)).toBeNull();
  });
});

describe('calcularEOQ', () => {
  it('aplica √(2·D·S / H)', () => {
    const r = calcularEOQ({ demandaAnual: 1000, costoPedido: 10, costoMantener: 0.5 });
    expect(r.eoq).toBeCloseTo(200, 6);
    expect(r.faltantes).toEqual([]);
  });

  it('con costo de pedido 0 da cantidad 0 (pedir cada vez que se necesita)', () => {
    const r = calcularEOQ({ demandaAnual: 1000, costoPedido: 0, costoMantener: 0.5 });
    expect(r.eoq).toBe(0);
  });

  it('informa qué falta y no calcula', () => {
    const r = calcularEOQ({ demandaAnual: null, costoPedido: null, costoMantener: 0 });
    expect(r.eoq).toBeNull();
    expect(r.faltantes).toEqual(['demanda', 'costo_pedido', 'costo_mantener']);
  });
});

describe('costoTotalAnual', () => {
  it('suma el costo de pedir y el de mantener', () => {
    const base = { demandaAnual: 1000, costoPedido: 10, costoMantener: 0.5 };
    expect(costoTotalAnual({ ...base, cantidad: 200 })).toBeCloseTo(100, 6);
    expect(costoTotalAnual({ ...base, cantidad: 100 })).toBeCloseTo(125, 6);
  });

  it('es mínimo en el EOQ', () => {
    const base = { demandaAnual: 1000, costoPedido: 10, costoMantener: 0.5 };
    const enEOQ = costoTotalAnual({ ...base, cantidad: 200 });
    expect(costoTotalAnual({ ...base, cantidad: 150 })).toBeGreaterThan(enEOQ);
    expect(costoTotalAnual({ ...base, cantidad: 260 })).toBeGreaterThan(enEOQ);
  });

  it('rechaza cantidades que no son positivas', () => {
    const base = { demandaAnual: 1000, costoPedido: 10, costoMantener: 0.5 };
    expect(() => costoTotalAnual({ ...base, cantidad: 0 })).toThrow('mayor que cero');
    expect(() => costoTotalAnual({ ...base, cantidad: -1 })).toThrow('mayor que cero');
  });
});

describe('stock de seguridad', () => {
  it('por días es demanda diaria por días', () => {
    expect(stockSeguridadPorDias(1000, 2)).toBe(2000);
    expect(stockSeguridadPorDias(1000, 0)).toBe(0);
  });

  it('rechaza valores negativos', () => {
    expect(() => stockSeguridadPorDias(-1, 2)).toThrow('negativa');
    expect(() => stockSeguridadPorDias(1000, -2)).toThrow('negativos');
  });

  it('z para los niveles de servicio usuales', () => {
    expect(zParaNivelDeServicio(0.9)).toBeCloseTo(1.2816, 4);
    expect(zParaNivelDeServicio(0.95)).toBeCloseTo(1.6449, 4);
    expect(zParaNivelDeServicio(0.975)).toBeCloseTo(1.96, 4);
    expect(zParaNivelDeServicio(0.99)).toBeCloseTo(2.3263, 4);
    expect(() => zParaNivelDeServicio(0.5)).toThrow('no soportado');
  });

  it('estadístico es z · σ · √días', () => {
    expect(stockSeguridadEstadistico({ z: 1.6449, sigmaDiaria: 100, diasProteccion: 4 })).toBeCloseTo(
      328.98,
      2,
    );
    expect(() => stockSeguridadEstadistico({ z: 0, sigmaDiaria: 100, diasProteccion: 4 })).toThrow();
    expect(() =>
      stockSeguridadEstadistico({ z: 1.6449, sigmaDiaria: -1, diasProteccion: 4 }),
    ).toThrow();
    expect(() =>
      stockSeguridadEstadistico({ z: 1.6449, sigmaDiaria: 100, diasProteccion: 0 }),
    ).toThrow();
  });
});

describe('evaluarPedidoMinimo', () => {
  const lineas = [
    { cantidad: 2, costoUnitario: 100 },
    { cantidad: 1, costoUnitario: 50 },
  ];

  it('suma el pedido y compara con el mínimo', () => {
    expect(evaluarPedidoMinimo(lineas, 750)).toEqual({
      total: 250,
      minimo: 750,
      cumple: false,
      faltante: 500,
    });
    expect(evaluarPedidoMinimo(lineas, 250)).toEqual({
      total: 250,
      minimo: 250,
      cumple: true,
      faltante: 0,
    });
  });

  it('sin mínimo conocido no afirma nada', () => {
    expect(evaluarPedidoMinimo(lineas, null)).toEqual({
      total: 250,
      minimo: null,
      cumple: null,
      faltante: 0,
    });
  });
});

describe('recomendarReposicion: datos insuficientes', () => {
  it('sin demanda no decide y lo dice', () => {
    const r = recomendarReposicion(entrada({ demanda: null }));
    expect(r.estado).toBe('datos_insuficientes');
    expect(r.faltantes).toEqual(['demanda']);
    expect(r.cantidad_recomendada).toBe(0);
    expect(r.demanda_origen).toBeNull();
  });

  it('sin calendario ni stock de seguridad lista ambos faltantes', () => {
    const r = recomendarReposicion(entrada({ calendario: null, stockSeguridad: null }));
    expect(r.estado).toBe('datos_insuficientes');
    expect(r.faltantes).toEqual(['calendario_entrega', 'stock_seguridad']);
    expect(r.proxima_entrega).toBeNull();
  });

  it('aun sin poder decidir calcula el EOQ y la cobertura si puede', () => {
    const r = recomendarReposicion(
      entrada({ stockSeguridad: null, costoPedido: 1000, costoMantener: 2 }),
    );
    expect(r.estado).toBe('datos_insuficientes');
    expect(r.faltantes).toEqual(['stock_seguridad']);
    expect(r.eoq).toBeCloseTo(19078.78, 1);
    expect(r.ciclo_economico_dias).toBeCloseTo(19.08, 2);
    expect(r.cobertura_dias).toBe(5);
    expect(r.fecha_agotamiento).toBe('2026-10-31');
  });

  it('rechaza existencias negativas', () => {
    expect(() => recomendarReposicion(entrada({ existencia: -1 }))).toThrow('negativa');
  });
});

describe('recomendarReposicion: fechas y proyección', () => {
  it('calcula la próxima entrega, el último día para pedir y la proyección', () => {
    const r = recomendarReposicion(entrada());
    expect(r.proxima_entrega).toBe('2026-10-28');
    expect(r.fecha_limite_pedido).toBe('2026-10-27');
    expect(r.proyeccion_a_la_entrega).toBe(3000); // 5.000 - 1.000 × 2 días
    expect(r.punto_reorden_clasico).toBe(3000); // 1.000 × 1 + 2.000
    expect(r.punto_reorden_calendario).toBe(10000); // 1.000 × (1 + 7) + 2.000
    expect(r.demanda_origen).toBe('declarada');
  });

  it('con la hora límite vencida el pedido cuenta para mañana, pero la existencia se proyecta desde hoy', () => {
    // Martes después de la hora límite: el pedido cuenta como del miércoles → llega el miércoles de la semana siguiente
    const r = recomendarReposicion(entrada({ hoy: MARTES, fechaPedido: '2026-10-28', existencia: 20000 }));
    expect(r.proxima_entrega).toBe('2026-11-04');
    expect(r.fecha_limite_pedido).toBe('2026-11-03');
    expect(r.proyeccion_a_la_entrega).toBe(12000); // 20.000 - 1.000 × 8 días desde el martes
    expect(r.estado).toBe('ok');
  });

  it('un miércoles ya no alcanza la entrega de ese día: apunta a la siguiente', () => {
    const r = recomendarReposicion(entrada({ hoy: '2026-10-28', existencia: 20000 }));
    expect(r.proxima_entrega).toBe('2026-11-04');
    expect(r.fecha_limite_pedido).toBe('2026-11-03');
    expect(r.proyeccion_a_la_entrega).toBe(13000);
  });
});

describe('recomendarReposicion: estados', () => {
  it('quiebre probable si al llegar la entrega ya no queda nada', () => {
    const r = recomendarReposicion(entrada({ existencia: 2000 }));
    expect(r.estado).toBe('quiebre_probable');
    const peor = recomendarReposicion(entrada({ existencia: 1000 }));
    expect(peor.estado).toBe('quiebre_probable');
    expect(peor.proyeccion_a_la_entrega).toBe(-1000);
    // la proyección negativa se cuenta como 0: se pide el nivel objetivo completo
    expect(peor.cantidad_recomendada).toBe(9000);
  });

  it('riesgo si llega con menos que el stock de seguridad', () => {
    const r = recomendarReposicion(entrada({ existencia: 3000 })); // proyección 1.000
    expect(r.estado).toBe('riesgo');
    expect(r.cantidad_recomendada).toBe(8000); // 9.000 - 1.000
  });

  it('pedir si no alcanza hasta la siguiente entrega y aún hay días para pedir', () => {
    const r = recomendarReposicion(entrada({ existencia: 5000 })); // proyección 3.000 < 9.000
    expect(r.estado).toBe('pedir');
    expect(r.cantidad_recomendada).toBe(6000); // 9.000 - 3.000
    expect(r.advertencias).toContain('ciclo_minimo_por_falta_de_eoq');
    expect(r.ciclos_elegidos).toBe(1);
    expect(r.nivel_objetivo).toBe(9000);
  });

  it('pedir hoy cuando hoy es el último día para pedir', () => {
    const r = recomendarReposicion(entrada({ hoy: MARTES, existencia: 5000 }));
    expect(r.fecha_limite_pedido).toBe(MARTES);
    expect(r.estado).toBe('pedir_hoy');
    expect(r.proyeccion_a_la_entrega).toBe(4000);
    expect(r.cantidad_recomendada).toBe(5000);
  });

  it('ok justo en el umbral (la proyección igual a SS + d·R1 no pide)', () => {
    // proyección = existencia - 2.000 = 9.000
    const r = recomendarReposicion(entrada({ existencia: 11000 }));
    expect(r.estado).toBe('ok');
    expect(r.cantidad_recomendada).toBe(0);
  });

  it('pide cuando falta un poco para el umbral', () => {
    const r = recomendarReposicion(entrada({ existencia: 10999 }));
    expect(r.estado).toBe('pedir');
    expect(r.cantidad_recomendada).toBe(1);
  });

  it('sobreinventario si supera el stock máximo', () => {
    const r = recomendarReposicion(entrada({ existencia: 30000, stockMaximo: 20000 }));
    expect(r.estado).toBe('sobreinventario');
    expect(r.cantidad_recomendada).toBe(0);
  });

  it('sobreinventario si hay más de lo que se consume en la vida útil', () => {
    const r = recomendarReposicion(entrada({ existencia: 15000, vidaUtilDias: 14 }));
    expect(r.estado).toBe('sobreinventario');
    const justo = recomendarReposicion(entrada({ existencia: 14000, vidaUtilDias: 14 }));
    expect(justo.estado).toBe('ok');
  });
});

describe('recomendarReposicion: ciclo económico', () => {
  const costos = { costoPedido: 1000, costoMantener: 2 };

  it('elige cuántas entregas cubrir por menor costo anual', () => {
    // k=1: 52·1.000 + 3.500·2 = 59.000 · k=2: 26.000 + 14.000 = 40.000
    // k=3: 17.333,33 + 21.000 = 38.333,33 · k=4: 13.000 + 28.000 = 41.000
    const r = recomendarReposicion(entrada(costos));
    expect(r.ciclos_elegidos).toBe(3);
    expect(r.costo_total_anual).toBeCloseTo(38333.33, 1);
    expect(r.nivel_objetivo).toBe(23000); // 2.000 + 1.000 × 21 días
    expect(r.cantidad_recomendada).toBe(20000); // 23.000 - 3.000
    expect(r.advertencias).toEqual([]);
  });

  it('la vida útil limita cuántas entregas se cubren', () => {
    const r = recomendarReposicion(entrada({ ...costos, vidaUtilDias: 14 }));
    expect(r.ciclos_elegidos).toBe(2);
    expect(r.costo_total_anual).toBeCloseTo(40000, 6);
    expect(r.nivel_objetivo).toBe(16000);
    expect(r.cantidad_recomendada).toBe(13000);
  });

  it('el stock máximo limita cuántas entregas se cubren', () => {
    const r = recomendarReposicion(entrada({ ...costos, stockMaximo: 20000 }));
    expect(r.ciclos_elegidos).toBe(2);
    expect(r.nivel_objetivo).toBe(16000);
  });

  it('avisa si ni una entrega cabe en el stock máximo', () => {
    const r = recomendarReposicion(entrada({ ...costos, stockMaximo: 5000 }));
    expect(r.ciclos_elegidos).toBe(1);
    expect(r.advertencias).toContain('nivel_objetivo_supera_maximo');
  });

  it('avisa si la vida útil es menor que el tiempo entre entregas', () => {
    const r = recomendarReposicion(entrada({ ...costos, vidaUtilDias: 5 }));
    expect(r.advertencias).toContain('vida_util_menor_que_ciclo');
    expect(r.ciclos_elegidos).toBe(1);
    expect(r.nivel_objetivo).toBe(7000); // 2.000 + 1.000 × 5 (tope de la vida útil)
  });

  it('sin costo de pedido avisa que falta y cubre una sola entrega', () => {
    const r = recomendarReposicion(entrada({ costoPedido: null, costoMantener: 2 }));
    expect(r.eoq).toBeNull();
    expect(r.advertencias).toContain('sin_eoq_falta_costo_pedido');
    expect(r.advertencias).toContain('ciclo_minimo_por_falta_de_eoq');
    expect(r.ciclos_elegidos).toBe(1);
  });

  it('sin costo de mantener avisa que falta', () => {
    const r = recomendarReposicion(entrada({ costoPedido: 1000, costoMantener: null }));
    expect(r.advertencias).toContain('sin_eoq_falta_costo_mantener');
  });

  it('con dos entregas por semana el ciclo base es el tiempo hasta la siguiente', () => {
    // entregas lunes y jueves; hoy lunes 26: pedido llega el martes→jueves 29 (plazo 1)
    const r = recomendarReposicion(
      entrada({ calendario: { diasEntrega: [1, 4], plazoDias: 1 }, existencia: 5000 }),
    );
    expect(r.proxima_entrega).toBe('2026-10-29');
    expect(r.nivel_objetivo).toBe(2000 + 1000 * 4); // entre jueves y lunes: 4 días
  });
});

describe('recomendarReposicion: múltiplo de compra', () => {
  it('redondea hacia arriba al contenido de la presentación', () => {
    const r = recomendarReposicion(entrada({ multiploCompra: 4000 })); // necesita 6.000
    expect(r.cantidad_recomendada).toBe(8000);
  });

  it('no suma de más cuando ya es múltiplo', () => {
    const r = recomendarReposicion(entrada({ multiploCompra: 3000 }));
    expect(r.cantidad_recomendada).toBe(6000);
  });

  it('avisa si el redondeo supera el stock máximo', () => {
    const r = recomendarReposicion(entrada({ multiploCompra: 4000, stockMaximo: 10000 }));
    expect(r.cantidad_recomendada).toBe(8000);
    expect(r.advertencias).toContain('redondeo_supera_maximo'); // 3.000 + 8.000 > 10.000
  });
});

describe('capacidadProduccion', () => {
  const requerimientos = [
    { materiaPrimaId: 'harina', cantidad: 500 },
    { materiaPrimaId: 'levadura', cantidad: 200 },
  ];

  it('los lotes posibles los marca el insumo que se agota primero', () => {
    const r = capacidadProduccion(requerimientos, { harina: 1200, levadura: 300 });
    expect(r.lotesPosibles).toBe(1); // harina 2,4 · levadura 1,5
    expect(r.limitante).toEqual({ materiaPrimaId: 'levadura', disponible: 300, porLote: 200 });
    expect(r.faltaParaUnLote).toEqual([]);
  });

  it('si no alcanza para un lote, dice cuánto falta', () => {
    const r = capacidadProduccion(requerimientos, { harina: 1200, levadura: 100 });
    expect(r.lotesPosibles).toBe(0);
    expect(r.limitante?.materiaPrimaId).toBe('levadura');
    expect(r.faltaParaUnLote).toEqual([{ materiaPrimaId: 'levadura', falta: 100 }]);
  });

  it('un insumo sin existencia registrada cuenta como cero', () => {
    const r = capacidadProduccion(requerimientos, { harina: 1200 });
    expect(r.lotesPosibles).toBe(0);
    expect(r.faltaParaUnLote).toEqual([{ materiaPrimaId: 'levadura', falta: 200 }]);
  });

  it('una fórmula sin ingredientes válidos no tiene capacidad calculable', () => {
    expect(capacidadProduccion([], {})).toEqual({
      lotesPosibles: null,
      limitante: null,
      faltaParaUnLote: [],
    });
    expect(capacidadProduccion([{ materiaPrimaId: 'x', cantidad: 0 }], { x: 5 }).lotesPosibles).toBeNull();
  });
});
