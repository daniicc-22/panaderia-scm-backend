import { describe, expect, test } from 'vitest';
import { armarRecomendaciones, type DatosInsumo, type DatosProveedor } from '../src/utils/recomendaciones';

// Mismo caso base que reposicion.test.ts: consumo 7.000 por semana (1.000 por día), entrega los
// miércoles con 1 día de plazo, hoy lunes 2026-10-26 (próxima entrega miércoles 28/10, siguiente 4/11).
const HOY = '2026-10-26';
const MARTES = '2026-10-27';

const PROVEEDOR: DatosProveedor = {
  id: 'prov-1',
  nombre: 'Distribuidora Central',
  dias_entrega: [3],
  hora_limite_pedido: '16:00',
  pedido_minimo: null,
};

function insumo(cambios: Partial<DatosInsumo> = {}): DatosInsumo {
  return {
    materia_prima_id: 'mp-harina',
    codigo: 'MP-001',
    nombre: 'Harina',
    unidad: 'g',
    clase_abc: 'A',
    existencia: 5000,
    existencia_vencida: 0,
    consumo_real: null,
    consumo_declarado_semanal: 7000,
    consumo_estimado_semanal: null,
    parametros: {
      costo_pedido: 1000,
      costo_mantener_h: 2,
      tasa_mantenimiento_anual: null,
      dias_seguridad: 2,
      stock_minimo: null,
      stock_maximo: null,
      vida_util_dias: null,
      plazo_dias: null,
    },
    plazo_materia_dias: null,
    oferta: {
      proveedor_id: 'prov-1',
      presentacion: 'Bulto 1 kg',
      contenido: 1000,
      precio: 2000,
      costo_unitario: 2,
      plazo_dias: 1,
    },
    ...cambios,
  };
}

const armar = (insumos: DatosInsumo[], proveedores: DatosProveedor[] = [PROVEEDOR], hoy = HOY, hora = '09:00') =>
  armarRecomendaciones({ hoy, hora, insumos, proveedores });

describe('armarRecomendaciones: caso base', () => {
  test('recomienda cubrir 3 entregas y convierte a presentaciones y dinero', () => {
    const { items, resumen, fecha } = armar([insumo()]);
    expect(fecha).toBe(HOY);
    const h = items[0]!;
    expect(h.estado).toBe('pedir');
    expect(h.faltantes).toEqual([]);
    expect(h.demanda_semanal).toBe(7000);
    expect(h.demanda_origen).toBe('declarada');
    expect(h.stock_seguridad).toBe(2000); // 2 días × 1.000
    expect(h.proxima_entrega).toBe('2026-10-28');
    expect(h.fecha_limite_pedido).toBe('2026-10-27');
    expect(h.proyeccion_a_la_entrega).toBe(3000);
    expect(h.ciclos_elegidos).toBe(3);
    expect(h.nivel_objetivo).toBe(23000);
    expect(h.cantidad_recomendada).toBe(20000);
    expect(h.presentacion).toBe('Bulto 1 kg');
    expect(h.presentaciones_a_pedir).toBe(20);
    expect(h.costos?.valor_pedido).toBe(40000);
    expect(h.costos?.precio_presentacion).toBe(2000);
    expect(h.cobertura_dias).toBe(5);
    expect(h.fecha_agotamiento).toBe('2026-10-31');
    expect(h.proveedor).toEqual({ id: 'prov-1', nombre: 'Distribuidora Central' });
    expect(resumen.pedir).toBe(1);
    expect(resumen.ok).toBe(0);
  });

  test('H sale de la tasa por el costo cuando no hay H directo', () => {
    // i = 0,5 × costo 2 = H 1 → cubre 4 entregas: nivel 2.000 + 28.000 = 30.000; pide 27.000
    const base = insumo();
    const i = insumo({ parametros: { ...base.parametros!, costo_mantener_h: null, tasa_mantenimiento_anual: 0.5 } });
    const h = armar([i]).items[0]!;
    expect(h.ciclos_elegidos).toBe(4);
    expect(h.cantidad_recomendada).toBe(27000);
    expect(h.presentaciones_a_pedir).toBe(27);
  });

  test('redondea el pedido hacia arriba al contenido de la presentación', () => {
    // Se necesitan 20.000; con paquetes de 3.000 son 7 paquetes (21.000)
    const base = insumo();
    const i = insumo({ oferta: { ...base.oferta!, contenido: 3000, precio: 6000, costo_unitario: 2 } });
    const h = armar([i]).items[0]!;
    expect(h.cantidad_recomendada).toBe(21000);
    expect(h.presentaciones_a_pedir).toBe(7);
    expect(h.costos?.valor_pedido).toBe(42000);
  });

  test('el consumo real con 4 o más semanas reemplaza al declarado', () => {
    const h = armar([insumo({ consumo_real: { semanal: 14000, semanasObservadas: 4 } })]).items[0]!;
    expect(h.demanda_origen).toBe('real');
    expect(h.demanda_semanal).toBe(14000);
    expect(h.stock_seguridad).toBe(4000);
  });

  test('con pocas semanas de consumo real sigue usando el declarado', () => {
    const h = armar([insumo({ consumo_real: { semanal: 14000, semanasObservadas: 3 } })]).items[0]!;
    expect(h.demanda_origen).toBe('declarada');
  });

  test('el stock mínimo en unidades sirve de stock de seguridad si no hay días', () => {
    const base = insumo();
    const i = insumo({ parametros: { ...base.parametros!, dias_seguridad: null, stock_minimo: 1500 } });
    expect(armar([i]).items[0]!.stock_seguridad).toBe(1500);
  });

  test('pasada la hora límite el pedido cuenta para el día siguiente', () => {
    // Martes 17:00 (límite 16:00): cuenta como miércoles → llega el 4/11; con 5.000 el 4/11 ya no hay nada
    const h = armar([insumo()], [PROVEEDOR], MARTES, '17:00').items[0]!;
    expect(h.proxima_entrega).toBe('2026-11-04');
    expect(h.estado).toBe('quiebre_probable');
    const antes = armar([insumo()], [PROVEEDOR], MARTES, '16:00').items[0]!;
    expect(antes.proxima_entrega).toBe('2026-10-28');
    expect(antes.estado).toBe('pedir_hoy');
  });

  test('avisa que se excluyó la existencia vencida', () => {
    const h = armar([insumo({ existencia_vencida: 800 })]).items[0]!;
    expect(h.advertencias).toContain('existencia_vencida_excluida');
    expect(h.existencia_vencida).toBe(800);
  });
});

describe('armarRecomendaciones: datos que faltan', () => {
  test('sin oferta aplicada falta el proveedor y el plazo, y no se calcula la decisión', () => {
    const h = armar([insumo({ oferta: null })]).items[0]!;
    expect(h.estado).toBe('datos_insuficientes');
    expect(h.faltantes).toEqual(['proveedor', 'plazo_entrega']);
    expect(h.proveedor).toBeNull();
    expect(h.costos).toBeNull();
    expect(h.cantidad_recomendada).toBe(0);
  });

  test('el plazo del parámetro o del insumo sirve de respaldo', () => {
    const base = insumo();
    const sinPlazoOferta = { ...base.oferta!, plazo_dias: null };
    const conParametro = insumo({ oferta: sinPlazoOferta, parametros: { ...base.parametros!, plazo_dias: 1 } });
    expect(armar([conParametro]).items[0]!.estado).toBe('pedir');
    const conMateria = insumo({ oferta: sinPlazoOferta, plazo_materia_dias: 1 });
    expect(armar([conMateria]).items[0]!.estado).toBe('pedir');
  });

  test('sin plazo en ninguna parte falta el plazo de entrega', () => {
    const base = insumo();
    const h = armar([insumo({ oferta: { ...base.oferta!, plazo_dias: null } })]).items[0]!;
    expect(h.faltantes).toEqual(['plazo_entrega']);
  });

  test('proveedor sin días de entrega definidos', () => {
    const h = armar([insumo()], [{ ...PROVEEDOR, dias_entrega: [] }]).items[0]!;
    expect(h.estado).toBe('datos_insuficientes');
    expect(h.faltantes).toEqual(['dias_entrega']);
  });

  test('sin consumo ni stock de seguridad lo dice y no inventa valores', () => {
    const base = insumo();
    const h = armar([
      insumo({
        consumo_declarado_semanal: null,
        parametros: { ...base.parametros!, dias_seguridad: null },
      }),
    ]).items[0]!;
    expect(h.estado).toBe('datos_insuficientes');
    expect(h.faltantes).toEqual(['demanda', 'stock_seguridad']);
    expect(h.demanda_semanal).toBeNull();
    expect(h.nivel_objetivo).toBeNull();
  });

  test('sin parámetros todo lo que depende de ellos queda como faltante', () => {
    const h = armar([insumo({ parametros: null })]).items[0]!;
    expect(h.faltantes).toEqual(['stock_seguridad']);
    expect(h.eoq).toBeNull();
  });
});

describe('armarRecomendaciones: orden y resumen', () => {
  test('primero lo más urgente, luego clase A y luego por nombre', () => {
    const ok = insumo({ materia_prima_id: 'mp-ok', nombre: 'Sal', clase_abc: 'C', existencia: 40000 });
    const quiebre = insumo({ materia_prima_id: 'mp-q', nombre: 'Levadura', clase_abc: 'B', existencia: 500 });
    const pedirA = insumo({ materia_prima_id: 'mp-a', nombre: 'Harina', clase_abc: 'A', existencia: 5000 });
    const pedirC = insumo({ materia_prima_id: 'mp-c', nombre: 'Azúcar', clase_abc: 'C', existencia: 5000 });
    const sinDatos = insumo({ materia_prima_id: 'mp-s', nombre: 'Chocolate', oferta: null });
    const { items, resumen } = armar([ok, pedirC, sinDatos, pedirA, quiebre]);
    expect(items.map((i) => i.materia_prima_id)).toEqual(['mp-q', 'mp-a', 'mp-c', 'mp-s', 'mp-ok']);
    expect(items.map((i) => i.estado)).toEqual(['quiebre_probable', 'pedir', 'pedir', 'datos_insuficientes', 'ok']);
    expect(resumen).toEqual({
      quiebre_probable: 1,
      riesgo: 0,
      pedir_hoy: 0,
      pedir: 2,
      datos_insuficientes: 1,
      sobreinventario: 0,
      ok: 1,
    });
  });
});

describe('armarRecomendaciones: pedidos por proveedor', () => {
  const levadura = insumo({
    materia_prima_id: 'mp-lev',
    nombre: 'Levadura',
    existencia: 5000,
    oferta: { proveedor_id: 'prov-1', presentacion: 'Paquete 500 g', contenido: 500, precio: 3000, costo_unitario: 6, plazo_dias: 1 },
  });

  test('suma lo pedido de varios insumos y evalúa el pedido mínimo', () => {
    // Harina: 20 presentaciones × 2.000 = 40.000 · Levadura: nivel 23.000 − 3.000 = 20.000 → 40 paq × 3.000 = 120.000
    const prov = { ...PROVEEDOR, pedido_minimo: 750000 };
    const { pedidos } = armar([insumo(), levadura], [prov]);
    expect(pedidos).toHaveLength(1);
    const p = pedidos[0]!;
    expect(p.proveedor.nombre).toBe('Distribuidora Central');
    expect(p.insumos).toBe(2);
    expect(p.fecha_limite_pedido).toBe('2026-10-27');
    expect(p.proxima_entrega).toBe('2026-10-28');
    expect(p.costos.total).toBe(160000);
    expect(p.costos.pedido_minimo.cumple).toBe(false);
    expect(p.costos.pedido_minimo.faltante).toBe(590000);
  });

  test('sin pedido mínimo conocido no afirma si cumple', () => {
    const { pedidos } = armar([insumo()]);
    expect(pedidos[0]!.costos.pedido_minimo.cumple).toBeNull();
  });

  test('no incluye insumos que no hay que pedir ni los que no tienen datos', () => {
    const ok = insumo({ materia_prima_id: 'mp-ok', existencia: 40000 });
    const sinDatos = insumo({ materia_prima_id: 'mp-s', oferta: null });
    expect(armar([ok, sinDatos]).pedidos).toEqual([]);
  });
});
