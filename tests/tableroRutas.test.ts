import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProduccion } from '../src/routes/produccion';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USU = '99999999-9999-4999-8999-999999999999';

type Fila = Record<string, any>;
let producciones: Fila[], desperdicios: Fila[];
let rol = 'operario';
let fallar = false;
let consultas: Fila[] = [];

const dentro = (f: Date, filtro: any) => (!filtro?.gte || f >= filtro.gte) && (!filtro?.lt || f < filtro.lt);

const prismaFalso: any = {
  produccion: {
    findMany: async (args: any) => {
      if (fallar) throw new Error('boom');
      consultas.push(args);
      const w = args.where;
      let r = producciones.filter(
        (p) =>
          p.panaderia_id === w.panaderia_id &&
          (w.estado === undefined || (typeof w.estado === 'string' ? p.estado === w.estado : w.estado.in.includes(p.estado))) &&
          (w.fecha === undefined || dentro(p.fecha, w.fecha)),
      );
      const dir = args.orderBy?.fecha;
      if (dir) r = [...r].sort((a, b) => (dir === 'asc' ? 1 : -1) * (a.fecha.getTime() - b.fecha.getTime()));
      if (args.take) r = r.slice(0, args.take);
      return r;
    },
  },
  desperdicio: {
    findMany: async ({ where }: any) =>
      desperdicios.filter((d) => d.panaderia_id === where.panaderia_id && dentro(d.fecha, where.fecha)),
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

const ahora = Date.now();
const hace = (dias: number) => new Date(ahora - dias * 86_400_000);

const prod = (id: string, estado: string, fecha: Date, planificada: number | null, producida: number | null, pan = PAN, pesos = [true, true, false]) => ({
  id,
  panaderia_id: pan,
  estado,
  fecha,
  cantidad_planificada: planificada,
  cantidad_producida: producida,
  producto: { nombre: `Pan ${id}` },
  formulacion: { version: 1, rendimiento_esperado: 10 },
  pesaje_produccion: pesos.map((pesado) => ({ pesado })),
  usuario_panaderia: { usuario: { nombre: 'Ana' } },
});
const merma = (causa: string, fecha: Date, pan = PAN) => ({ panaderia_id: pan, fecha, causa_desperdicio: { nombre: causa } });

beforeEach(() => {
  rol = 'operario';
  fallar = false;
  consultas = [];
  producciones = [
    prod('p1', 'finalizada', hace(1), 10, 10),
    prod('p2', 'finalizada', hace(2), 10, 5),
    prod('p3', 'finalizada', hace(30), 10, 10),
    prod('p4', 'en_curso', hace(0.1), 20, null),
    prod('p5', 'planificada', hace(0.2), 10, null),
    prod('p6', 'cancelada', hace(1), 10, null),
    prod('x1', 'finalizada', hace(1), 10, 10, OTRA),
    prod('x2', 'en_curso', hace(1), 10, null, OTRA),
  ];
  desperdicios = [
    merma('Derrame', hace(1)),
    merma('Derrame', hace(2)),
    merma('Quemado', hace(3)),
    merma('Vencimiento', hace(40)),
    merma('Derrame', hace(1), OTRA),
  ];
});

const pedir = async () => {
  const r = await fetch(`${base}/produccion/tablero`);
  return { estado: r.status, cuerpo: (await r.json()) as any };
};

describe('GET /produccion/tablero', () => {
  test('responde a cualquier rol y no confunde la ruta con un id', async () => {
    for (const r of ['operario', 'administrador', 'superadministrador']) {
      rol = r;
      const { estado, cuerpo } = await pedir();
      expect(estado).toBe(200);
      expect(Array.isArray(cuerpo.pendientes)).toBe(true);
    }
  });

  test('pendientes: en curso y planificadas de esta panadería, la más antigua primero', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.pendientes.map((p: Fila) => p.id)).toEqual(['p4', 'p5'].sort((a, b) => producciones.find((x) => x.id === a)!.fecha.getTime() - producciones.find((x) => x.id === b)!.fecha.getTime()));
    expect(cuerpo.pendientes.every((p: Fila) => p.estado !== 'finalizada' && p.estado !== 'cancelada')).toBe(true);
  });

  test('recientes: solo finalizadas de la panadería, de la más nueva a la más vieja', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.recientes.map((p: Fila) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('recientes se limita a 5', async () => {
    for (let i = 0; i < 8; i++) producciones.push(prod(`m${i}`, 'finalizada', hace(5 + i * 0.01), 10, 10));
    const { cuerpo } = await pedir();
    expect(cuerpo.recientes.length).toBe(5);
  });

  test('cada producción trae lo necesario para mostrarla', async () => {
    const { cuerpo } = await pedir();
    const p2 = cuerpo.recientes.find((p: Fila) => p.id === 'p2');
    expect(p2.producto).toBe('Pan p2');
    expect(p2.usuario).toBe('Ana');
    expect(p2.rendimiento_pct).toBe(50);
    expect(p2.insumos_total).toBe(3);
    expect(p2.insumos_pesados).toBe(2);
  });

  test('la semana solo cuenta las finalizadas de los últimos 7 días', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.semana.producciones).toBe(2);
    expect(cuerpo.semana.rendimiento_prom_pct).toBe(75);
    expect(cuerpo.semana.insumos_pesados_pct).toBe(66.7);
  });

  test('una producción con fecha futura no entra en la semana', async () => {
    producciones.push(prod('f1', 'finalizada', hace(-3), 10, 10));
    const { cuerpo } = await pedir();
    expect(cuerpo.semana.producciones).toBe(2);
  });

  test('las mermas de la semana excluyen otras panaderías y fechas viejas', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.semana.mermas_registradas).toBe(3);
    expect(cuerpo.semana.causas_frecuentes).toEqual([
      { causa: 'Derrame', veces: 2 },
      { causa: 'Quemado', veces: 1 },
    ]);
  });

  test('por_dia trae un registro por cada uno de los 7 días y suma lo producido', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.por_dia.length).toBe(7);
    expect(cuerpo.por_dia.reduce((s: number, d: Fila) => s + d.producciones, 0)).toBe(2);
    expect(cuerpo.por_dia.reduce((s: number, d: Fila) => s + d.producidas, 0)).toBe(15);
  });

  test('informa la fecha de hoy y desde cuándo mira', async () => {
    const { cuerpo } = await pedir();
    expect(cuerpo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cuerpo.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cuerpo.desde < cuerpo.fecha).toBe(true);
  });

  test('sin datos devuelve todo vacío', async () => {
    producciones = [];
    desperdicios = [];
    const { cuerpo } = await pedir();
    expect(cuerpo.pendientes).toEqual([]);
    expect(cuerpo.recientes).toEqual([]);
    expect(cuerpo.semana).toEqual({ producciones: 0, rendimiento_prom_pct: null, insumos_pesados_pct: null, mermas_registradas: 0, causas_frecuentes: [] });
    expect(cuerpo.por_dia.every((d: Fila) => d.producciones === 0 && d.producidas === 0)).toBe(true);
  });

  test('no expone dinero', async () => {
    const { cuerpo } = await pedir();
    expect(JSON.stringify(cuerpo)).not.toMatch(/costo|precio|valor/i);
  });

  test('un fallo de base de datos da un mensaje genérico', async () => {
    fallar = true;
    const { estado, cuerpo } = await pedir();
    expect(estado).toBe(500);
    expect(cuerpo.error).toBe('Error al consultar el tablero');
  });
});
