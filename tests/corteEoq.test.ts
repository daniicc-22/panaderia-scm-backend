import { describe, expect, test } from 'vitest';
import { armarFilasCorte } from '../src/utils/corteEoq';
import type { ItemRecomendacion } from '../src/utils/recomendaciones';

function item(cambios: Partial<ItemRecomendacion> = {}): ItemRecomendacion {
  return {
    materia_prima_id: 'mp-1',
    codigo: 'MP-001',
    nombre: 'Harina',
    unidad: 'g',
    clase_abc: 'A',
    estado: 'pedir',
    faltantes: [],
    advertencias: [],
    existencia: 5000,
    existencia_vencida: 0,
    demanda_semanal: 7000,
    demanda_origen: 'declarada',
    cobertura_dias: 5,
    fecha_agotamiento: null,
    proveedor: null,
    plazo_dias: 0,
    proxima_entrega: null,
    fecha_limite_pedido: null,
    proyeccion_a_la_entrega: null,
    stock_seguridad: 2000,
    punto_reorden_calendario: 9000,
    nivel_objetivo: null,
    eoq: 21000,
    ciclo_economico_dias: 21,
    ciclos_elegidos: 3,
    modelo: { demanda_anual: 364000, costo_pedido: 1000, costo_mantener: 2, cantidad_politica: 21000, costo_anual_eoq: 34641 },
    cantidad_recomendada: 20000,
    presentacion: null,
    presentaciones_a_pedir: null,
    costos: null,
    ...cambios,
  };
}

describe('armarFilasCorte', () => {
  test('un insumo con EOQ se guarda como calculado, con los valores del modelo', () => {
    const { filas, omitidos } = armarFilasCorte([item()]);
    expect(omitidos).toEqual([]);
    expect(filas).toEqual([
      {
        materia_prima_id: 'mp-1',
        demanda_anual_d: 364000,
        costo_pedido_s: 1000,
        costo_mantenimiento_h: 2,
        eoq_calculado: 21000,
        lead_time_dias: 0,
        stock_seguridad: 2000,
        punto_reorden: 9000,
        estado: 'calculado',
        advertencias: 'demanda:declarada',
      },
    ]);
  });

  test('con demanda pero sin EOQ se guarda como datos_insuficientes y no inventa S ni H', () => {
    const { filas } = armarFilasCorte([
      item({ eoq: null, modelo: null, faltantes: ['costo_pedido', 'costo_mantener'], plazo_dias: null, stock_seguridad: null, punto_reorden_calendario: null }),
    ]);
    expect(filas[0]).toMatchObject({
      estado: 'datos_insuficientes',
      demanda_anual_d: 364000,
      costo_pedido_s: null,
      costo_mantenimiento_h: null,
      eoq_calculado: null,
      lead_time_dias: null,
      advertencias: 'demanda:declarada, falta:costo_pedido, falta:costo_mantener',
    });
  });

  test('un EOQ con modelo ausente o un modelo sin EOQ no se guarda con costos', () => {
    const { filas } = armarFilasCorte([item({ eoq: null })]);
    expect(filas[0]).toMatchObject({ estado: 'datos_insuficientes', costo_pedido_s: null, costo_mantenimiento_h: null, eoq_calculado: null });
  });

  test('la demanda anual sale de la semanal cuando no hay modelo', () => {
    const { filas } = armarFilasCorte([item({ eoq: null, modelo: null, demanda_semanal: 100.0004 })]);
    expect(filas[0].demanda_anual_d).toBe(5200.021);
  });

  test('sin demanda (o en cero) el insumo se omite y se dice por qué', () => {
    const { filas, omitidos } = armarFilasCorte([
      item({ materia_prima_id: 'a', codigo: 'A', nombre: 'Sal', demanda_semanal: null, demanda_origen: null, eoq: null, modelo: null }),
      item({ materia_prima_id: 'b', codigo: 'B', nombre: 'Agua', demanda_semanal: 0, eoq: null, modelo: null }),
    ]);
    expect(filas).toEqual([]);
    expect(omitidos).toEqual([
      { materia_prima_id: 'a', codigo: 'A', nombre: 'Sal', motivo: 'sin_demanda' },
      { materia_prima_id: 'b', codigo: 'B', nombre: 'Agua', motivo: 'sin_demanda' },
    ]);
  });

  test('las advertencias del cálculo quedan en el texto, en orden, y sin notas queda null', () => {
    const conAdvertencia = armarFilasCorte([item({ advertencias: ['vida_util_menor_que_ciclo', 'existencia_vencida_excluida'] })]);
    expect(conAdvertencia.filas[0].advertencias).toBe('demanda:declarada, vida_util_menor_que_ciclo, existencia_vencida_excluida');
    const sinNada = armarFilasCorte([item({ demanda_origen: null })]);
    expect(sinNada.filas[0].advertencias).toBeNull();
  });

  test('un EOQ sin modelo completo no cuenta como calculado (la tabla exige S y H)', () => {
    const { filas } = armarFilasCorte([item({ modelo: null })]);
    expect(filas[0].estado).toBe('datos_insuficientes');
    expect(filas[0].eoq_calculado).toBeNull();
  });
});
