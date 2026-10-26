import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProduccion } from '../src/routes/produccion';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';
const HARINA = '22222222-2222-4222-8222-222222222221';
const AZUCAR = '22222222-2222-4222-8222-222222222222';
const AGUA = '22222222-2222-4222-8222-222222222223';
const HUEVOS = '22222222-2222-4222-8222-222222222224';
const L_H = '44444444-4444-4444-8444-444444444441';
const L_A = '44444444-4444-4444-8444-444444444442';
const P1 = '55555555-5555-4555-8555-555555555551';
const P_VIEJA = '55555555-5555-4555-8555-555555555552';
const P_AJENA = '55555555-5555-4555-8555-555555555559';

type Fila = Record<string, any>;
let producciones: Fila[], pesajes: Fila[], consumos: Fila[], desperdicios: Fila[], lotes: Fila[], materias: Fila[];
let rol = 'operario';

function coincide(fila: Fila, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'in' in v) return v.in.includes(fila[k]);
    return fila[k] === v;
  });
}

const prismaFalso: any = {
  produccion: {
    findFirst: async ({ where }: any) => {
      // Como la base real: un id que no es UUID no llega a dar «no encontrado», revienta
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(where.id)) throw new Error('invalid input syntax for type uuid');
      const f = producciones.find((x) => coincide(x, where));
      return f ? { ...f, producto: { nombre: f.producto } } : null;
    },
  },
  pesaje_produccion: { findMany: async ({ where }: any) => pesajes.filter((x) => coincide(x, where)) },
  consumo_produccion: {
    findMany: async ({ where }: any) =>
      consumos.filter((c) => coincide(c, where)).map((c) => ({ ...c, lote: { materia_prima_id: lotes.find((l) => l.id === c.lote_id)!.materia_prima_id } })),
  },
  desperdicio: {
    findMany: async ({ where }: any) =>
      desperdicios
        .filter((d) => coincide(d, where))
        .map((d) => ({
          ...d,
          causa_desperdicio: { nombre: d.causa },
          lote: d.lote_id ? { materia_prima_id: lotes.find((l) => l.id === d.lote_id)!.materia_prima_id } : null,
        })),
  },
  materia_prima: {
    findMany: async ({ where }: any) => materias.filter((m) => coincide(m, where)).map((m) => ({ ...m, unidad_medida: { codigo: m.unidad } })),
  },
};

let servidor: ReturnType<express.Express['listen']>;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.usuario = { id: USU, email: 'x@x.co', rol };
    req.panaderiaId = PAN;
    next();
  });
  app.use('/produccion', crearRouterProduccion(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

const pesaje = (produccion: string, materia: string, real: number, pesado = true) => ({
  produccion_id: produccion,
  panaderia_id: PAN,
  materia_prima_id: materia,
  peso_estandar: real,
  peso_real: real,
  pesado,
});

beforeEach(() => {
  rol = 'operario';
  materias = [
    { id: HARINA, panaderia_id: PAN, nombre: 'Harina', unidad: 'g' },
    { id: AZUCAR, panaderia_id: PAN, nombre: 'Azúcar', unidad: 'kg' },
    { id: AGUA, panaderia_id: PAN, nombre: 'Agua', unidad: 'g' },
    { id: HUEVOS, panaderia_id: PAN, nombre: 'Huevos', unidad: 'und' },
  ];
  lotes = [
    { id: L_H, panaderia_id: PAN, materia_prima_id: HARINA },
    { id: L_A, panaderia_id: PAN, materia_prima_id: AZUCAR },
  ];
  producciones = [
    { id: P1, panaderia_id: PAN, producto: 'Pan dulce', estado: 'finalizada', cantidad_planificada: 10, cantidad_producida: 6 },
    { id: P_VIEJA, panaderia_id: PAN, producto: 'Galleta', estado: 'finalizada', cantidad_planificada: 20, cantidad_producida: null },
    { id: P_AJENA, panaderia_id: OTRA, producto: 'Ajena', estado: 'finalizada', cantidad_planificada: 1, cantidad_producida: 1 },
  ];
  pesajes = [pesaje(P1, HARINA, 800), pesaje(P1, AZUCAR, 0.1), pesaje(P1, AGUA, 100), pesaje(P1, HUEVOS, 6, false)];
  consumos = [];
  desperdicios = [];
});

const pedir = async (id: string) => {
  const r = await fetch(`${base}/produccion/${id}/balance`);
  return { estado: r.status, cuerpo: (await r.json()) as any };
};

describe('GET /produccion/:id/balance', () => {
  test('suma insumos con agua, convierte kilos y deja aparte lo que no es masa', async () => {
    const { estado, cuerpo } = await pedir(P1);
    expect(estado).toBe(200);
    expect(cuerpo.produccion_id).toBe(P1);
    expect(cuerpo.producto).toBe('Pan dulce');
    expect(cuerpo.estado).toBe('finalizada');
    expect(cuerpo.con_pesaje).toBe(true);
    expect(cuerpo.insumos_g).toBe(1000);
    expect(cuerpo.insumos).toEqual([
      { materia_prima_id: HARINA, nombre: 'Harina', gramos: 800, porcentaje: 80 },
      { materia_prima_id: AGUA, nombre: 'Agua', gramos: 100, porcentaje: 10 },
      { materia_prima_id: AZUCAR, nombre: 'Azúcar', gramos: 100, porcentaje: 10 },
    ]);
    expect(cuerpo.sin_masa).toEqual(['Huevos']);
  });

  test('rendimiento, cantidades y masa del producto terminado pendiente', async () => {
    const { cuerpo } = await pedir(P1);
    expect(cuerpo.cantidad_planificada).toBe(10);
    expect(cuerpo.cantidad_producida).toBe(6);
    expect(cuerpo.rendimiento_pct).toBe(60);
    expect(cuerpo.masa_producto_terminado_g).toBeNull();
  });

  test('sin mermas: todo en cero y porcentaje 0', async () => {
    const { cuerpo } = await pedir(P1);
    expect(cuerpo).toMatchObject({ merma_masa_g: 0, merma_insumo_g: 0, merma_total_g: 0, merma_pct: 0, por_causa: [] });
  });

  test('merma de masa (sin lote) y merma de insumo (con lote, en kilos) se separan', async () => {
    desperdicios = [
      { produccion_id: P1, panaderia_id: PAN, lote_id: null, cantidad: 50, causa: 'Quemado o sobrehorneado' },
      { produccion_id: P1, panaderia_id: PAN, lote_id: L_A, cantidad: 0.05, causa: 'Derrame o caída' },
      { produccion_id: P1, panaderia_id: PAN, lote_id: L_H, cantidad: 100, causa: 'Derrame o caída' },
    ];
    const { cuerpo } = await pedir(P1);
    expect(cuerpo.merma_masa_g).toBe(50);
    expect(cuerpo.merma_insumo_g).toBe(150);
    expect(cuerpo.merma_total_g).toBe(200);
    // 200 / (1000 + 150)
    expect(cuerpo.merma_pct).toBe(17.39);
    expect(cuerpo.por_causa).toEqual([
      { causa: 'Derrame o caída', gramos: 150 },
      { causa: 'Quemado o sobrehorneado', gramos: 50 },
    ]);
  });

  test('solo cuentan las mermas de esa producción', async () => {
    desperdicios = [
      { produccion_id: P1, panaderia_id: PAN, lote_id: null, cantidad: 10, causa: 'Masa pasada' },
      { produccion_id: P_VIEJA, panaderia_id: PAN, lote_id: null, cantidad: 999, causa: 'Masa pasada' },
      { produccion_id: null, panaderia_id: PAN, lote_id: L_H, cantidad: 999, causa: 'Vencimiento' },
    ];
    const { cuerpo } = await pedir(P1);
    expect(cuerpo.merma_total_g).toBe(10);
  });

  test('producción anterior al peso real: se arma con lo consumido de los lotes', async () => {
    consumos = [
      { produccion_id: P_VIEJA, panaderia_id: PAN, lote_id: L_H, cantidad_consumida: 300 },
      { produccion_id: P_VIEJA, panaderia_id: PAN, lote_id: L_H, cantidad_consumida: 200 },
      { produccion_id: P_VIEJA, panaderia_id: PAN, lote_id: L_A, cantidad_consumida: 0.5 },
    ];
    const { estado, cuerpo } = await pedir(P_VIEJA);
    expect(estado).toBe(200);
    expect(cuerpo.con_pesaje).toBe(false);
    expect(cuerpo.insumos_g).toBe(1000);
    expect(cuerpo.insumos.map((i: any) => [i.nombre, i.gramos])).toEqual([['Harina', 500], ['Azúcar', 500]].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]), 'es')));
    expect(cuerpo.cantidad_producida).toBeNull();
    expect(cuerpo.rendimiento_pct).toBeNull();
  });

  test('producción sin pesajes ni consumos: balance vacío, no error', async () => {
    const { estado, cuerpo } = await pedir(P_VIEJA);
    expect(estado).toBe(200);
    expect(cuerpo.insumos_g).toBe(0);
    expect(cuerpo.insumos).toEqual([]);
    expect(cuerpo.merma_pct).toBeNull();
  });

  test('no trae dinero ni siquiera para el administrador', async () => {
    rol = 'administrador';
    desperdicios = [{ produccion_id: P1, panaderia_id: PAN, lote_id: L_H, cantidad: 10, causa: 'Derrame o caída', costo_estimado: 50 }];
    const { cuerpo } = await pedir(P1);
    expect(JSON.stringify(cuerpo)).not.toMatch(/costo|precio|valor/i);
  });

  test('el operario y el administrador ven lo mismo', async () => {
    const op = await pedir(P1);
    rol = 'administrador';
    const ad = await pedir(P1);
    expect(ad.cuerpo).toEqual(op.cuerpo);
  });

  test('producción de otra panadería: 404', async () => {
    expect((await pedir(P_AJENA)).estado).toBe(404);
  });

  test('producción inexistente: 404', async () => {
    expect((await pedir('55555555-5555-4555-8555-5555555555aa')).estado).toBe(404);
  });

  test('id que no es UUID: 404', async () => {
    const { estado, cuerpo } = await pedir('abc');
    expect(estado).toBe(404);
    expect(cuerpo.error).toBe('Producción no encontrada.');
  });

  test('un fallo de la base responde 500 sin detalles', async () => {
    const original = prismaFalso.pesaje_produccion.findMany;
    prismaFalso.pesaje_produccion.findMany = async () => {
      throw new Error('falla simulada con datos internos');
    };
    const log = console.error;
    console.error = () => {};
    try {
      const { estado, cuerpo } = await pedir(P1);
      expect(estado).toBe(500);
      expect(cuerpo.error).toBe('Error al calcular el balance de masas');
      expect(JSON.stringify(cuerpo)).not.toContain('internos');
    } finally {
      console.error = log;
      prismaFalso.pesaje_produccion.findMany = original;
    }
  });
});
