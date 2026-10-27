import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterProveedores } from '../src/routes/proveedores';
import { sinErroresEnConsola } from './helpers';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GRUPO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROV = '55555555-5555-4555-8555-555555555551';
const PROV_GRUPO = '55555555-5555-4555-8555-555555555552';
const PROV_OTRO = '55555555-5555-4555-8555-555555555553';
const PROV_AJENO = '55555555-5555-4555-8555-555555555599';
const HARINA = '22222222-2222-4222-8222-222222222221';
const AZUCAR = '22222222-2222-4222-8222-222222222222';

type Fila = Record<string, any>;
let proveedores: Fila[], presentaciones: Fila[];
let grupoDePanaderiaA: string | null;
let fallar = false;
let consultasPresentacion = 0;

const enAlcance = (p: Fila, where: any) =>
  !where.OR || where.OR.some((c: any) => (c.panaderia_id && p.panaderia_id === c.panaderia_id) || (c.grupo_id && p.grupo_id === c.grupo_id));

const prismaFalso: any = {
  panaderia: { findUnique: async () => ({ grupo_id: grupoDePanaderiaA }) },
  proveedor: {
    findFirst: async ({ where }: any) => {
      if (fallar) throw new Error('boom');
      return proveedores.find((p) => p.id === where.id && enAlcance(p, where)) ?? null;
    },
  },
  presentacion_proveedor: {
    findMany: async ({ where }: any) =>
      presentaciones
        .filter((p) => p.panaderia_id === where.panaderia_id)
        .flatMap((p) => p.ofertas.filter((o: Fila) => o.proveedor_id === where.proveedor_id).map(() => ({ presentacion: { materia_prima_id: p.materia_prima_id } }))),
  },
  presentacion: {
    findMany: async ({ where }: any) => {
      consultasPresentacion++;
      return presentaciones
        .filter((p) => p.panaderia_id === where.panaderia_id && where.materia_prima_id.in.includes(p.materia_prima_id))
        .map((p) => ({
          id: p.id,
          materia_prima_id: p.materia_prima_id,
          nombre: p.nombre,
          contenido: p.contenido,
          activa: p.activa,
          materia_prima: { id: p.materia_prima_id, codigo: p.codigo, nombre: p.materia, unidad_medida: { codigo: 'g' } },
          presentacion_proveedor: p.ofertas.map((o: Fila) => ({
            id: o.id,
            proveedor_id: o.proveedor_id,
            precio_referencia: o.precio,
            vigente: o.vigente,
            tiempo_entrega_dias: o.entrega ?? null,
            proveedor: { activo: o.proveedor_activo ?? true },
          })),
        }));
    },
  },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).usuario = { id: 'u1', email: 'x@x.com', rol: String(req.headers['x-rol']) };
    (req as any).panaderiaId = PAN_A;
    next();
  });
  app.use('/proveedores', crearRouterProveedores(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => {
  servidor.close();
});

const pres = (id: string, pan: string, materia: string, nombre: string, contenido: number, ofertas: Fila[]) => ({
  id, panaderia_id: pan, materia_prima_id: materia, materia: nombre, codigo: 'MP-001', nombre: `Pres ${id}`, contenido, activa: true, ofertas,
});

beforeEach(() => {
  grupoDePanaderiaA = null;
  fallar = false;
  consultasPresentacion = 0;
  proveedores = [
    { id: PROV, panaderia_id: PAN_A, grupo_id: null, nombre: 'Molino', activo: true },
    { id: PROV_GRUPO, panaderia_id: null, grupo_id: GRUPO, nombre: 'Distribuidora del grupo', activo: true },
    { id: PROV_OTRO, panaderia_id: PAN_A, grupo_id: null, nombre: 'Mayorista', activo: true },
    { id: PROV_AJENO, panaderia_id: PAN_B, grupo_id: null, nombre: 'De otra panadería', activo: true },
  ];
  presentaciones = [
    pres('pr1', PAN_A, HARINA, 'Harina', 1000, [
      { id: 'o1', proveedor_id: PROV, precio: 3300, vigente: true, entrega: 2 },
      { id: 'o2', proveedor_id: PROV_OTRO, precio: 3000, vigente: true },
    ]),
    pres('pr2', PAN_A, AZUCAR, 'Azúcar', 5000, [{ id: 'o3', proveedor_id: PROV, precio: 9000, vigente: false }]),
    // Oferta de otra panadería al mismo proveedor: no debe aparecer
    pres('pr3', PAN_B, HARINA, 'Harina', 1000, [{ id: 'o9', proveedor_id: PROV, precio: 1, vigente: true }]),
  ];
});

async function llamar(ruta: string, rol = 'administrador') {
  const r = await fetch(base + ruta, { headers: { 'x-rol': rol } });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

describe('GET /proveedores/:id/ofertas', () => {
  test('el operario no tiene acceso', async () => {
    expect((await llamar(`/proveedores/${PROV}/ofertas`, 'operario')).status).toBe(403);
  });

  test('un identificador que no es UUID da 400', async () => {
    expect((await llamar('/proveedores/abc/ofertas')).status).toBe(400);
  });

  test('un proveedor de otra panadería da 404', async () => {
    expect((await llamar(`/proveedores/${PROV_AJENO}/ofertas`)).status).toBe(404);
  });

  test('un proveedor que no existe da 404', async () => {
    expect((await llamar('/proveedores/55555555-5555-4555-8555-555555555000/ofertas')).status).toBe(404);
  });

  test('devuelve el proveedor, el resumen y sus ofertas comparadas', async () => {
    const { status, cuerpo } = await llamar(`/proveedores/${PROV}/ofertas`);
    expect(status).toBe(200);
    expect(cuerpo.proveedor).toEqual({ id: PROV, nombre: 'Molino', activo: true, alcance: 'panaderia' });
    expect(cuerpo.items.map((i: Fila) => i.oferta_id)).toEqual(['o3', 'o1']);
    const harina = cuerpo.items.find((i: Fila) => i.oferta_id === 'o1');
    expect(harina.precio).toBe(3300);
    expect(harina.costo_por_unidad_base).toBe(3.3);
    expect(harina.sobre_mejor_pct).toBe(10);
    expect(harina.otros_proveedores).toBe(1);
    expect(harina.tiempo_entrega_dias).toBe(2);
    expect(cuerpo.resumen).toEqual({ ofertas: 2, cuentan: 1, aplicadas: 0, mejor_precio: 0, entrega_promedio_dias: 2 });
  });

  test('no mezcla ofertas de otra panadería', async () => {
    const { cuerpo } = await llamar(`/proveedores/${PROV}/ofertas`);
    expect(cuerpo.items.some((i: Fila) => i.oferta_id === 'o9')).toBe(false);
  });

  test('un proveedor del grupo se puede consultar', async () => {
    grupoDePanaderiaA = GRUPO;
    presentaciones.push(pres('pr4', PAN_A, AZUCAR, 'Azúcar', 1000, [{ id: 'o5', proveedor_id: PROV_GRUPO, precio: 2000, vigente: true }]));
    const { status, cuerpo } = await llamar(`/proveedores/${PROV_GRUPO}/ofertas`);
    expect(status).toBe(200);
    expect(cuerpo.proveedor.alcance).toBe('grupo');
    expect(cuerpo.items.length).toBe(1);
  });

  test('un proveedor del grupo no se ve si la panadería no pertenece al grupo', async () => {
    expect((await llamar(`/proveedores/${PROV_GRUPO}/ofertas`)).status).toBe(404);
  });

  test('sin ofertas devuelve listas vacías y no consulta presentaciones', async () => {
    presentaciones = [];
    const { status, cuerpo } = await llamar(`/proveedores/${PROV}/ofertas`);
    expect(status).toBe(200);
    expect(cuerpo.items).toEqual([]);
    expect(cuerpo.resumen).toEqual({ ofertas: 0, cuentan: 0, aplicadas: 0, mejor_precio: 0, entrega_promedio_dias: null });
    expect(consultasPresentacion).toBe(0);
  });

  test('un fallo de base de datos da un mensaje genérico', async () => {
    fallar = true;
    const r = await sinErroresEnConsola(() => llamar(`/proveedores/${PROV}/ofertas`));
    expect(r.status).toBe(500);
    expect(r.cuerpo.error).toBe('Error al consultar las ofertas del proveedor');
  });
});
