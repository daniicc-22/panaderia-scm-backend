import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProduccion } from '../src/routes/produccion';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';
const HARINA = '22222222-2222-4222-8222-222222222221';
const SAL = '22222222-2222-4222-8222-222222222222';
const P1 = '55555555-5555-4555-8555-555555555551';
const P2 = '55555555-5555-4555-8555-555555555552';
const P_CANC = '55555555-5555-4555-8555-555555555553';
const P_AJENA = '55555555-5555-4555-8555-555555555559';

type Fila = Record<string, any>;
let producciones: Fila[], pesajes: Fila[], materias: Fila[];
let rol = 'administrador';

// Evalúa el filtro anidado de la ruta: estado distinto de cancelada y fecha dentro del rango
function produccionCumple(p: Fila, filtro: any): boolean {
  if (!p) return false;
  if (filtro.estado?.not !== undefined && p.estado === filtro.estado.not) return false;
  if (filtro.fecha?.gte && p.fecha < filtro.fecha.gte) return false;
  if (filtro.fecha?.lt && p.fecha >= filtro.fecha.lt) return false;
  return true;
}

const prismaFalso: any = {
  pesaje_produccion: {
    findMany: async ({ where }: any) =>
      pesajes.filter((x) => x.panaderia_id === where.panaderia_id && produccionCumple(producciones.find((p) => p.id === x.produccion_id)!, where.produccion)),
  },
  materia_prima: {
    findMany: async ({ where }: any) => materias.filter((m) => m.panaderia_id === where.panaderia_id && where.id.in.includes(m.id)),
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

const pesaje = (produccion: string, materia: string, estandar: number, real: number, pesado = true, pan = PAN) => ({
  produccion_id: produccion,
  panaderia_id: pan,
  materia_prima_id: materia,
  peso_estandar: estandar,
  peso_real: real,
  pesado,
});

beforeEach(() => {
  rol = 'administrador';
  materias = [
    { id: HARINA, panaderia_id: PAN, nombre: 'Harina' },
    { id: SAL, panaderia_id: PAN, nombre: 'Sal' },
  ];
  producciones = [
    { id: P1, panaderia_id: PAN, estado: 'finalizada', fecha: new Date('2026-10-25T15:00:00Z') },
    { id: P2, panaderia_id: PAN, estado: 'en_curso', fecha: new Date('2026-10-26T15:00:00Z') },
    { id: P_CANC, panaderia_id: PAN, estado: 'cancelada', fecha: new Date('2026-10-26T16:00:00Z') },
    { id: P_AJENA, panaderia_id: OTRA, estado: 'finalizada', fecha: new Date('2026-10-26T17:00:00Z') },
  ];
  pesajes = [
    pesaje(P1, HARINA, 1000, 1100), // +10 %
    pesaje(P1, SAL, 10, 10, false),
    pesaje(P2, HARINA, 1000, 800), // −20 %
    pesaje(P2, SAL, 10, 11), // +10 %
    pesaje(P_CANC, HARINA, 1000, 5000), // cancelada: no cuenta
    pesaje(P_AJENA, HARINA, 1000, 9999, true, OTRA), // otra panadería: no cuenta
  ];
});

const pedir = async (consulta = '') => {
  const r = await fetch(`${base}/produccion/desviaciones${consulta}`);
  return { estado: r.status, cuerpo: (await r.json()) as any };
};

describe('GET /produccion/desviaciones', () => {
  test('resume por insumo, ordenado por error típico', async () => {
    const { estado, cuerpo } = await pedir();
    expect(estado).toBe(200);
    expect(cuerpo.insumos.map((i: any) => i.nombre)).toEqual(['Harina', 'Sal']);
    expect(cuerpo.insumos[0]).toEqual({
      materia_prima_id: HARINA,
      nombre: 'Harina',
      producciones: 2,
      pesadas: 2,
      pct_pesado: 100,
      desviacion_media_pct: -5,
      desviacion_abs_media_pct: 15,
      desviacion_max_pct: -20,
    });
    expect(cuerpo.insumos[1]).toMatchObject({ nombre: 'Sal', producciones: 2, pesadas: 1, pct_pesado: 50, desviacion_media_pct: 10 });
  });

  test('global: solo cuenta producciones no canceladas de la panadería', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.global).toEqual({ producciones: 2, pesajes: 4, pesados: 3, pct_pesado: 75, desviacion_abs_media_pct: 13.33 });
  });

  test('las canceladas y las de otra panadería no entran', async () => {
    const { cuerpo } = await pedir();
    expect(JSON.stringify(cuerpo)).not.toContain('5000');
    expect(JSON.stringify(cuerpo)).not.toContain('9999');
    expect(cuerpo.insumos[0].desviacion_max_pct).toBe(-20);
  });

  test('filtra por rango de fechas de Colombia', async () => {
    const solo26 = await pedir('?desde=2026-10-26&hasta=2026-10-26');
    expect(solo26.cuerpo.global.producciones).toBe(1);
    expect(solo26.cuerpo.insumos[0]).toMatchObject({ nombre: 'Harina', desviacion_media_pct: -20 });
    expect(solo26.cuerpo.desde).toBe('2026-10-26');
    expect(solo26.cuerpo.hasta).toBe('2026-10-26');

    const solo25 = await pedir('?hasta=2026-10-25');
    expect(solo25.cuerpo.global.producciones).toBe(1);
    expect(solo25.cuerpo.insumos[0]).toMatchObject({ nombre: 'Harina', desviacion_media_pct: 10 });

    const desde27 = await pedir('?desde=2026-10-27');
    expect(desde27.cuerpo.insumos).toEqual([]);
    expect(desde27.cuerpo.global.producciones).toBe(0);
  });

  test('sin rango las fechas se devuelven nulas', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.desde).toBeNull();
    expect(cuerpo.hasta).toBeNull();
  });

  test('fechas inválidas: 400 con los errores', async () => {
    const r = await pedir('?desde=ayer&hasta=2026-02-31');
    expect(r.estado).toBe(400);
    expect(r.cuerpo.errores).toHaveLength(2);
    expect((await pedir('?desde=2026-10-27&hasta=2026-10-26')).estado).toBe(400);
  });

  test('el operario recibe 403', async () => {
    rol = 'operario';
    const { estado, cuerpo } = await pedir();
    expect(estado).toBe(403);
    expect(cuerpo.insumos).toBeUndefined();
  });

  test('el superadministrador sí puede', async () => {
    rol = 'superadministrador';
    expect((await pedir()).estado).toBe(200);
  });

  test('no se confunde con el detalle de una producción: «desviaciones» no es un id', async () => {
    // Si la ruta quedara después de «/:id», esto respondería 404 «Producción no encontrada»
    const { cuerpo } = await pedir();
    expect(cuerpo.error).toBeUndefined();
    expect(cuerpo.global).toBeDefined();
  });

  test('un insumo sin nombre conocido se muestra como desconocido', async () => {
    materias = [];
    const { cuerpo } = await pedir();
    expect(cuerpo.insumos.every((i: any) => i.nombre === 'Insumo desconocido')).toBe(true);
  });

  test('un fallo de la base responde 500 sin detalles', async () => {
    const original = prismaFalso.pesaje_produccion.findMany;
    prismaFalso.pesaje_produccion.findMany = async () => {
      throw new Error('falla con datos internos');
    };
    const log = console.error;
    console.error = () => {};
    try {
      const { estado, cuerpo } = await pedir();
      expect(estado).toBe(500);
      expect(cuerpo.error).toBe('Error al calcular la desviación de pesaje');
      expect(JSON.stringify(cuerpo)).not.toContain('internos');
    } finally {
      console.error = log;
      prismaFalso.pesaje_produccion.findMany = original;
    }
  });
});
