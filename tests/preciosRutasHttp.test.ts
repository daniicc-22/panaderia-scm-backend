import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterPrecios } from '../src/routes/precios';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GRUPO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNIDAD_G = '11111111-1111-4111-8111-111111111111';
const MP_A = '22222222-2222-4222-8222-222222222221';
const MP_B = '22222222-2222-4222-8222-222222222299';
const PRES_A = '33333333-3333-4333-8333-333333333331';
const PRES_B = '33333333-3333-4333-8333-333333333399';
const PROV_1 = '44444444-4444-4444-8444-444444444441'; // propio, activo
const PROV_2 = '44444444-4444-4444-8444-444444444442'; // propio, activo
const PROV_OFF = '44444444-4444-4444-8444-444444444443'; // propio, desactivado
const PROV_AJENO = '44444444-4444-4444-8444-444444444499'; // de otra panadería
const PROV_GRUPO = '44444444-4444-4444-8444-444444444444'; // del grupo
const OF_1 = '55555555-5555-4555-8555-555555555551';
const OF_AJENA = '55555555-5555-4555-8555-555555555599';

type Fila = Record<string, any>;
let materias: Fila[], presentaciones: Fila[], ofertas: Fila[], proveedores: Fila[];
let grupoDePanaderiaA: string | null;
let contador = 0;

// Evaluador mínimo de los filtros que arma el router
function coincide(fila: Fila, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (k === 'OR') return v.some((c: any) => coincide(fila, c));
    if (v !== null && typeof v === 'object') {
      if ('not' in v) return fila[k] !== v.not;
      if ('equals' in v) return String(fila[k]).toLowerCase() === String(v.equals).toLowerCase();
    }
    return fila[k] === v;
  });
}

const prismaFalso: any = {
  panaderia: { findUnique: async () => ({ grupo_id: grupoDePanaderiaA }) },
  proveedor: { findFirst: async ({ where }: any) => proveedores.find((p) => coincide(p, where)) ?? null },
  materia_prima: {
    findFirst: async ({ where }: any) => {
      const m = materias.find((x) => coincide(x, where));
      if (!m) return null;
      return {
        ...m,
        unidad_medida: { codigo: 'g' },
        presentacion: presentaciones
          .filter((p) => p.materia_prima_id === m.id)
          .map((p) => ({
            ...p,
            presentacion_proveedor: ofertas
              .filter((o) => o.presentacion_id === p.id)
              .map((o) => ({ ...o, proveedor: proveedores.find((v) => v.id === o.proveedor_id) })),
          })),
      };
    },
  },
  presentacion: {
    findFirst: async ({ where }: any) => presentaciones.find((p) => coincide(p, where)) ?? null,
    create: async ({ data }: any) => {
      const fila = { id: `pres-nueva-${++contador}`, activa: true, ...data };
      presentaciones.push(fila);
      return fila;
    },
    update: async ({ where, data }: any) => Object.assign(presentaciones.find((p) => p.id === where.id)!, data),
  },
  presentacion_proveedor: {
    findFirst: async ({ where }: any) => ofertas.find((o) => coincide(o, where)) ?? null,
    create: async ({ data }: any) => {
      const fila = { id: `oferta-nueva-${++contador}`, vigente: true, ...data };
      ofertas.push(fila);
      return fila;
    },
    update: async ({ where, data }: any) => Object.assign(ofertas.find((o) => o.id === where.id)!, data),
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
  app.use('/precios', crearRouterPrecios(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  grupoDePanaderiaA = null;
  contador = 0;
  materias = [
    { id: MP_A, panaderia_id: PAN_A, codigo: 'MP-001', nombre: 'Harina', unidad_base_id: UNIDAD_G },
    { id: MP_B, panaderia_id: PAN_B, codigo: 'MP-001', nombre: 'Azúcar', unidad_base_id: UNIDAD_G },
  ];
  presentaciones = [
    { id: PRES_A, panaderia_id: PAN_A, materia_prima_id: MP_A, nombre: 'Bulto 50 kg', contenido: 50000, unidad_contenido_id: UNIDAD_G, activa: true },
    { id: PRES_B, panaderia_id: PAN_B, materia_prima_id: MP_B, nombre: 'Bulto 25 kg', contenido: 25000, unidad_contenido_id: UNIDAD_G, activa: true },
  ];
  proveedores = [
    { id: PROV_1, panaderia_id: PAN_A, grupo_id: null, nombre: 'Molino Uno', activo: true },
    { id: PROV_2, panaderia_id: PAN_A, grupo_id: null, nombre: 'Molino Dos', activo: true },
    { id: PROV_OFF, panaderia_id: PAN_A, grupo_id: null, nombre: 'Molino Viejo', activo: false },
    { id: PROV_AJENO, panaderia_id: PAN_B, grupo_id: null, nombre: 'Molino Ajeno', activo: true },
    { id: PROV_GRUPO, panaderia_id: null, grupo_id: GRUPO, nombre: 'Molino del Grupo', activo: true },
  ];
  ofertas = [
    { id: OF_1, panaderia_id: PAN_A, presentacion_id: PRES_A, proveedor_id: PROV_1, precio_referencia: 87150, tiempo_entrega_dias: null, vigente: true },
    { id: OF_AJENA, panaderia_id: PAN_B, presentacion_id: PRES_B, proveedor_id: PROV_AJENO, precio_referencia: 40000, tiempo_entrega_dias: null, vigente: true },
  ];
});

async function llamar(metodo: string, ruta: string, rol: string, cuerpo?: unknown) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-rol': rol },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

describe('permisos', () => {
  test('el operario no puede ver ni cambiar precios', async () => {
    expect((await llamar('GET', `/precios/materias-primas/${MP_A}`, 'operario')).status).toBe(403);
    expect((await llamar('POST', `/precios/materias-primas/${MP_A}/presentaciones`, 'operario', { nombre: 'Bulto', contenido: 100 })).status).toBe(403);
    expect((await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'operario', { proveedor_id: PROV_2, precio_referencia: 1000 })).status).toBe(403);
    expect((await llamar('PATCH', `/precios/ofertas/${OF_1}`, 'operario', { precio_referencia: 1 })).status).toBe(403);
    expect(ofertas[0].precio_referencia).toBe(87150);
  });
});

describe('GET /precios/materias-primas/:id', () => {
  test('devuelve presentaciones, ofertas y el precio que hoy cuenta', async () => {
    const r = await llamar('GET', `/precios/materias-primas/${MP_A}`, 'administrador');
    expect(r.status).toBe(200);
    expect(r.cuerpo.materia.codigo).toBe('MP-001');
    expect(r.cuerpo.precio_aplicado.precio).toBe(87150);
    expect(r.cuerpo.precio_aplicado.costo_por_unidad_base).toBeCloseTo(1.743, 6);
    expect(r.cuerpo.presentaciones[0].ofertas[0]).toMatchObject({ proveedor: 'Molino Uno', cuenta: true, vigente: true });
  });

  test('si el proveedor se desactiva, la oferta se marca como que no cuenta y no hay precio aplicado', async () => {
    proveedores[0].activo = false;
    const r = await llamar('GET', `/precios/materias-primas/${MP_A}`, 'administrador');
    expect(r.cuerpo.presentaciones[0].ofertas[0].cuenta).toBe(false);
    expect(r.cuerpo.precio_aplicado).toBeNull();
  });

  test('una materia prima de otra panadería da 404 y un identificador malo da 400', async () => {
    expect((await llamar('GET', `/precios/materias-primas/${MP_B}`, 'administrador')).status).toBe(404);
    expect((await llamar('GET', '/precios/materias-primas/abc', 'administrador')).status).toBe(400);
  });
});

describe('POST /precios/materias-primas/:id/presentaciones', () => {
  test('crea la presentación con la unidad base de la materia prima, sin importar el cuerpo', async () => {
    const r = await llamar('POST', `/precios/materias-primas/${MP_A}/presentaciones`, 'administrador', { nombre: 'Bolsa 1 kg', contenido: 1000 });
    expect(r.status).toBe(201);
    const creada = presentaciones.find((p) => p.nombre === 'Bolsa 1 kg')!;
    expect(creada.unidad_contenido_id).toBe(UNIDAD_G);
    expect(creada.panaderia_id).toBe(PAN_A);
    expect(creada.materia_prima_id).toBe(MP_A);
  });

  test('rechaza enviar otra unidad (no se puede falsear el contenido)', async () => {
    const r = await llamar('POST', `/precios/materias-primas/${MP_A}/presentaciones`, 'administrador', { nombre: 'Bolsa 1 kg', contenido: 1, unidad_contenido_id: 'kg' });
    expect(r.status).toBe(400);
  });

  test('un nombre repetido en la misma materia prima da 409, el de otra materia no cuenta', async () => {
    expect((await llamar('POST', `/precios/materias-primas/${MP_A}/presentaciones`, 'administrador', { nombre: 'BULTO 50 KG', contenido: 50000 })).status).toBe(409);
    expect((await llamar('POST', `/precios/materias-primas/${MP_A}/presentaciones`, 'administrador', { nombre: 'Bulto 25 kg', contenido: 25000 })).status).toBe(201);
  });

  test('datos inválidos dan 400 y materia de otra panadería 404', async () => {
    expect((await llamar('POST', `/precios/materias-primas/${MP_A}/presentaciones`, 'administrador', { nombre: 'Bolsa', contenido: 0 })).status).toBe(400);
    expect((await llamar('POST', `/precios/materias-primas/${MP_B}/presentaciones`, 'administrador', { nombre: 'Bolsa', contenido: 10 })).status).toBe(404);
  });
});

describe('PATCH /precios/presentaciones/:id', () => {
  test('edita contenido y estado', async () => {
    expect((await llamar('PATCH', `/precios/presentaciones/${PRES_A}`, 'administrador', { contenido: 45000 })).status).toBe(200);
    expect(presentaciones[0].contenido).toBe(45000);
    expect((await llamar('PATCH', `/precios/presentaciones/${PRES_A}`, 'administrador', { activa: false })).status).toBe(200);
    expect(presentaciones[0].activa).toBe(false);
  });

  test('no se toca una presentación de otra panadería ni se cambia su materia prima', async () => {
    expect((await llamar('PATCH', `/precios/presentaciones/${PRES_B}`, 'administrador', { contenido: 1 })).status).toBe(404);
    expect(presentaciones[1].contenido).toBe(25000);
    expect((await llamar('PATCH', `/precios/presentaciones/${PRES_A}`, 'administrador', { materia_prima_id: MP_B })).status).toBe(400);
  });

  test('no repite el nombre de otra presentación de la misma materia, pero sí conserva el propio', async () => {
    presentaciones.push({ id: '33333333-3333-4333-8333-333333333332', panaderia_id: PAN_A, materia_prima_id: MP_A, nombre: 'Bolsa 1 kg', contenido: 1000, unidad_contenido_id: UNIDAD_G, activa: true });
    expect((await llamar('PATCH', `/precios/presentaciones/${PRES_A}`, 'administrador', { nombre: 'bolsa 1 kg' })).status).toBe(409);
    expect((await llamar('PATCH', `/precios/presentaciones/${PRES_A}`, 'administrador', { nombre: 'bulto 50 kg' })).status).toBe(200);
  });
});

describe('POST /precios/presentaciones/:id/ofertas', () => {
  test('registra el precio de un segundo proveedor en la panadería del token', async () => {
    const r = await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id: PROV_2, precio_referencia: 82000, tiempo_entrega_dias: 2, panaderia_id: PAN_B });
    expect(r.status).toBe(400); // panaderia_id no se acepta en el cuerpo
    const ok = await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id: PROV_2, precio_referencia: 82000, tiempo_entrega_dias: 2 });
    expect(ok.status).toBe(201);
    const nueva = ofertas.find((o) => o.proveedor_id === PROV_2)!;
    expect(nueva.panaderia_id).toBe(PAN_A);
    expect(nueva.precio_referencia).toBe(82000);
    expect(nueva.tiempo_entrega_dias).toBe(2);
  });

  test('un proveedor que ya tiene precio en esa presentación da 409', async () => {
    const r = await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id: PROV_1, precio_referencia: 90000 });
    expect(r.status).toBe(409);
    expect(ofertas).toHaveLength(2);
  });

  test('no acepta proveedores desactivados, de otra panadería o inexistentes', async () => {
    for (const proveedor_id of [PROV_OFF, PROV_AJENO, '44444444-4444-4444-8444-444444444400']) {
      const r = await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id, precio_referencia: 1000 });
      expect(r.status).toBe(400);
    }
    expect(ofertas).toHaveLength(2);
  });

  test('un proveedor del grupo solo vale si la panadería pertenece al grupo', async () => {
    const sin = await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id: PROV_GRUPO, precio_referencia: 1000 });
    expect(sin.status).toBe(400);
    grupoDePanaderiaA = GRUPO;
    const con = await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id: PROV_GRUPO, precio_referencia: 1000 });
    expect(con.status).toBe(201);
  });

  test('precio inválido da 400 y una presentación de otra panadería 404', async () => {
    expect((await llamar('POST', `/precios/presentaciones/${PRES_A}/ofertas`, 'administrador', { proveedor_id: PROV_2, precio_referencia: -1 })).status).toBe(400);
    expect((await llamar('POST', `/precios/presentaciones/${PRES_B}/ofertas`, 'administrador', { proveedor_id: PROV_2, precio_referencia: 1000 })).status).toBe(404);
  });
});

describe('PATCH /precios/ofertas/:id', () => {
  test('actualiza el precio y la vigencia', async () => {
    const r = await llamar('PATCH', `/precios/ofertas/${OF_1}`, 'administrador', { precio_referencia: 92000 });
    expect(r.status).toBe(200);
    expect(r.cuerpo.precio_referencia).toBe(92000);
    expect(ofertas[0].precio_referencia).toBe(92000);
    expect((await llamar('PATCH', `/precios/ofertas/${OF_1}`, 'administrador', { vigente: false })).cuerpo.vigente).toBe(false);
  });

  test('no se puede cambiar el proveedor ni tocar el precio de otra panadería', async () => {
    expect((await llamar('PATCH', `/precios/ofertas/${OF_1}`, 'administrador', { proveedor_id: PROV_2 })).status).toBe(400);
    expect((await llamar('PATCH', `/precios/ofertas/${OF_AJENA}`, 'administrador', { precio_referencia: 1 })).status).toBe(404);
    expect(ofertas[1].precio_referencia).toBe(40000);
  });

  test('precio inválido da 400 sin modificar nada', async () => {
    expect((await llamar('PATCH', `/precios/ofertas/${OF_1}`, 'administrador', { precio_referencia: 0 })).status).toBe(400);
    expect(ofertas[0].precio_referencia).toBe(87150);
  });
});
