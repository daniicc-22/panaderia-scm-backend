import express from 'express';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterPanaderias } from '../src/routes/panaderias';
import { sinErroresEnConsola } from './helpers';

const CLAVE = 'Pan-de-maiz-26';
type Fila = Record<string, any>;

// Los identificadores de panadería son UUID de verdad: la ruta rechaza cualquier otra cosa
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PAN0 = uuid(1000);

let panaderias: Fila[];
let causas: Fila[];
let usuarios: Fila[];
let fallarAlCrearUsuarioN: number | null; // número (desde 1) del usuario cuya creación falla
let errorUnico: boolean;
let creados: number;
let conDatos: Set<string>; // panaderías con filas de trabajo que las referencian (la base se niega a borrarlas)

const prismaFalso: any = {
  rol: { findFirst: async ({ where }: any) => ({ id: `rol-${where.codigo}`, codigo: where.codigo }) },
  panaderia: {
    findFirst: async ({ where }: any) => {
      const buscado = String(where.nombre.equals).toLowerCase();
      return panaderias.find((p) => p.nombre.toLowerCase() === buscado) ?? null;
    },
    findMany: async (args: any) => {
      // El falso respeta el filtro pedido a la relación: solo cuenta usuarios activos si la ruta lo pide
      const filtro = args?.select?.usuario_panaderia?.where ?? {};
      const soloActivos = filtro.activo === true && filtro.usuario?.activo === true;
      return panaderias.map((p) => ({
        ...p,
        usuario_panaderia: usuarios
          .filter((u) => u.panaderias.includes(p.id) && (!soloActivos || u.activo))
          .map((u) => ({ usuario_id: u.id })),
      }));
    },
    create: async ({ data }: any) => {
      const p = { id: uuid(panaderias.length + 1), activa: true, ...data };
      panaderias.push(p);
      return { id: p.id, nombre: p.nombre, ciudad: p.ciudad };
    },
    findUnique: async ({ where }: any) => panaderias.find((p) => p.id === where.id) ?? null,
    count: async ({ where }: any) => panaderias.filter((p) => p.activa === where.activa && p.id !== where.id.not).length,
    update: async ({ where, data }: any) => {
      const p = panaderias.find((x) => x.id === where.id)!;
      Object.assign(p, data);
      return { id: p.id, nombre: p.nombre, activa: p.activa };
    },
    delete: async ({ where }: any) => {
      if (conDatos.has(where.id)) throw Object.assign(new Error('foreign key'), { code: 'P2003' });
      panaderias = panaderias.filter((p) => p.id !== where.id);
    },
  },
  usuario_panaderia: {
    findMany: async ({ where }: any) =>
      usuarios
        .filter((u) => u.panaderias.includes(where.panaderia_id))
        .map((u) => ({ usuario_id: u.id, usuario: { rol: { codigo: u.rol }, usuario_panaderia: u.panaderias.map((p: string) => ({ panaderia_id: p })) } })),
    deleteMany: async ({ where }: any) => {
      for (const u of usuarios) u.panaderias = u.panaderias.filter((p: string) => p !== where.panaderia_id);
    },
  },
  causa_desperdicio: {
    createMany: async ({ data }: any) => {
      causas.push(...data);
    },
    deleteMany: async ({ where }: any) => {
      causas = causas.filter((c) => c.panaderia_id !== where.panaderia_id);
    },
  },
  usuario: {
    deleteMany: async ({ where }: any) => {
      usuarios = usuarios.filter((u) => !where.id.in.includes(u.id));
    },
    findFirst: async ({ where }: any) =>
      usuarios.find(
        (u) => (where.nombre_usuario === undefined || u.nombre_usuario === where.nombre_usuario) && (where.email === undefined || u.email === where.email),
      ) ?? null,
    create: async ({ data }: any) => {
      creados++;
      if (errorUnico) throw Object.assign(new Error('unique'), { code: 'P2002' });
      if (fallarAlCrearUsuarioN === creados) throw new Error('falla simulada');
      const u = {
        id: `usr-${usuarios.length + 1}`,
        nombre: data.nombre,
        nombre_usuario: data.nombre_usuario,
        email: data.email,
        password_hash: data.password_hash,
        rol: data.rol_id.replace('rol-', ''),
        debe_cambiar_password: data.debe_cambiar_password,
        activo: data.activo,
        panaderias: [data.usuario_panaderia.create.panaderia_id],
      };
      usuarios.push(u);
      return { id: u.id };
    },
  },
  // Transacción simulada: si algo falla se devuelve todo al estado de antes
  $transaction: async (fn: any) => {
    const copia = [structuredClone(panaderias), structuredClone(causas), structuredClone(usuarios)];
    try {
      return await fn(prismaFalso);
    } catch (e) {
      [panaderias, causas, usuarios] = copia;
      throw e;
    }
  },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/panaderias', crearRouterPanaderias(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  fallarAlCrearUsuarioN = null;
  errorUnico = false;
  creados = 0;
  conDatos = new Set();
  panaderias = [{ id: PAN0, nombre: 'Casa del Pan de Maíz', ciudad: 'Pasto', direccion: null, telefono: null, activa: true }];
  causas = [];
  usuarios = [
    { id: 'usr-0', nombre: 'Admin', nombre_usuario: 'admin', email: 'admin@demo.local', rol: 'administrador', password_hash: 'h', activo: true, panaderias: [PAN0] },
  ];
});

async function pedir(metodo: string, cuerpo?: unknown, ruta = '') {
  const r = await fetch(`${base}/panaderias${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

const ADMIN = { nombre: 'Laura Gómez', nombre_usuario: 'laura.gomez', password: CLAVE };
const OPER = { nombre: 'Pedro Ruiz', nombre_usuario: 'pedro.ruiz', password: CLAVE };
const NUEVA = { nombre: 'Panadería El Trigal', ciudad: 'Ipiales', administrador: ADMIN, operario: OPER };

describe('POST /panaderias', () => {
  test('crea la panadería, su catálogo de causas y dos usuarios que solo pertenecen a ella', async () => {
    const r = await pedir('POST', NUEVA);
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({ nombre: 'Panadería El Trigal', ciudad: 'Ipiales' });
    expect(r.cuerpo.usuarios).toEqual([
      { nombre: 'Laura Gómez', nombre_usuario: 'laura.gomez', rol: 'administrador' },
      { nombre: 'Pedro Ruiz', nombre_usuario: 'pedro.ruiz', rol: 'operario' },
    ]);

    const nueva = panaderias.find((p) => p.nombre === 'Panadería El Trigal')!;
    expect(causas).toHaveLength(7);
    expect(causas.every((c) => c.panaderia_id === nueva.id)).toBe(true);

    const laura = usuarios.find((u) => u.nombre_usuario === 'laura.gomez')!;
    const pedro = usuarios.find((u) => u.nombre_usuario === 'pedro.ruiz')!;
    expect(laura).toMatchObject({ rol: 'administrador', activo: true, debe_cambiar_password: true, panaderias: [nueva.id] });
    expect(pedro).toMatchObject({ rol: 'operario', debe_cambiar_password: true, panaderias: [nueva.id] });
    // Las cuentas de La Casa del Pan de Maíz no se tocan
    expect(usuarios.find((u) => u.nombre_usuario === 'admin')!.panaderias).toEqual([PAN0]);
  });

  test('las contraseñas se guardan cifradas y nunca vuelven en la respuesta', async () => {
    const r = await pedir('POST', NUEVA);
    const laura = usuarios.find((u) => u.nombre_usuario === 'laura.gomez')!;
    expect(laura.password_hash).not.toBe(CLAVE);
    expect(await bcrypt.compare(CLAVE, laura.password_hash)).toBe(true);
    expect(JSON.stringify(r.cuerpo)).not.toContain(CLAVE);
    expect(JSON.stringify(r.cuerpo)).not.toContain('hash');
  });

  test('sin operario crea solo al administrador; sin ciudad queda Pasto', async () => {
    const r = await pedir('POST', { nombre: 'Solo Admin', administrador: ADMIN });
    expect(r.status).toBe(201);
    expect(r.cuerpo.usuarios).toHaveLength(1);
    expect(r.cuerpo.ciudad).toBe('Pasto');
    expect(usuarios).toHaveLength(2);
  });

  test('un nombre repetido (sin importar mayúsculas) da 409 y no crea nada', async () => {
    const r = await pedir('POST', { ...NUEVA, nombre: 'casa del pan de maíz' });
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toContain('panadería con ese nombre');
    expect(panaderias).toHaveLength(1);
    expect(causas).toHaveLength(0);
    expect(usuarios).toHaveLength(1);
  });

  test('un usuario o correo ya existente da 409 y no crea nada', async () => {
    const r1 = await pedir('POST', { ...NUEVA, administrador: { ...ADMIN, nombre_usuario: 'admin' } });
    expect(r1.status).toBe(409);
    expect(r1.cuerpo.error).toContain('admin');
    const r2 = await pedir('POST', { ...NUEVA, operario: { ...OPER, email: 'admin@demo.local' } });
    expect(r2.status).toBe(409);
    expect(r2.cuerpo.error).toContain('correo');
    expect(panaderias).toHaveLength(1);
    expect(usuarios).toHaveLength(1);
  });

  test('datos no válidos dan 400 y no crean nada', async () => {
    for (const cuerpo of [{ ...NUEVA, nombre: '' }, { ...NUEVA, administrador: { ...ADMIN, password: 'corta' } }, { nombre: 'X' }]) {
      const r = await pedir('POST', cuerpo);
      expect(r.status).toBe(400);
    }
    expect(panaderias).toHaveLength(1);
    expect(causas).toHaveLength(0);
  });

  test('si falla la creación del operario se deshace TODO, también la panadería y su administrador', async () => {
    await sinErroresEnConsola(async () => {
      fallarAlCrearUsuarioN = 2;
      const r = await pedir('POST', NUEVA);
      expect(r.status).toBe(500);
      expect(r.cuerpo.error).toBe('Error al crear la panadería');
    });
    expect(panaderias).toHaveLength(1);
    expect(causas).toHaveLength(0);
    expect(usuarios).toHaveLength(1);
  });

  test('una colisión de unicidad en la base (carrera) responde 409 y deshace todo', async () => {
    errorUnico = true;
    const r = await pedir('POST', NUEVA);
    expect(r.status).toBe(409);
    expect(panaderias).toHaveLength(1);
    expect(causas).toHaveLength(0);
  });
});

describe('GET /panaderias', () => {
  test('lista las panaderías con su número de usuarios activos', async () => {
    await pedir('POST', NUEVA);
    usuarios.find((u) => u.nombre_usuario === 'pedro.ruiz')!.activo = false; // un usuario desactivado no cuenta
    const r = await pedir('GET');
    expect(r.status).toBe(200);
    const casa = r.cuerpo.find((p: any) => p.nombre === 'Casa del Pan de Maíz');
    const trigal = r.cuerpo.find((p: any) => p.nombre === 'Panadería El Trigal');
    expect(casa).toMatchObject({ usuarios_activos: 1, activa: true });
    expect(trigal).toMatchObject({ usuarios_activos: 1, ciudad: 'Ipiales', direccion: null, telefono: null });
  });
});

const idDe = (nombre: string) => panaderias.find((p) => p.nombre === nombre)!.id;

describe('DELETE /panaderias/:id', () => {
  test('elimina una panadería de prueba sin datos, con su catálogo y sus usuarios, y no toca las demás', async () => {
    await pedir('POST', NUEVA);
    const id = idDe('Panadería El Trigal');
    const r = await pedir('DELETE', undefined, `/${id}`);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ eliminada: 'Panadería El Trigal' });
    expect(panaderias.map((p) => p.id)).toEqual([PAN0]);
    expect(causas).toHaveLength(0);
    expect(usuarios.map((u) => u.nombre_usuario)).toEqual(['admin']);
  });

  test('si ya tiene datos de trabajo responde 409 sugiriendo desactivarla y NO borra nada (ni usuarios ni causas)', async () => {
    await pedir('POST', NUEVA);
    const id = idDe('Panadería El Trigal');
    conDatos.add(id);
    const r = await pedir('DELETE', undefined, `/${id}`);
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toContain('desactivarla');
    expect(panaderias).toHaveLength(2);
    expect(causas).toHaveLength(7);
    expect(usuarios).toHaveLength(3);
    expect(usuarios.find((u) => u.nombre_usuario === 'laura.gomez')!.panaderias).toEqual([id]);
  });

  test('un usuario de otra panadería solo pierde esta asignación; un superadministrador nunca se borra', async () => {
    await pedir('POST', NUEVA);
    const id = idDe('Panadería El Trigal');
    usuarios.push({ id: 'usr-comp', nombre: 'Compartido', nombre_usuario: 'compartido', email: null, rol: 'administrador', password_hash: 'h', activo: true, panaderias: [id, PAN0] });
    usuarios.push({ id: 'usr-sup', nombre: 'Super', nombre_usuario: 'super', email: null, rol: 'superadministrador', password_hash: 'h', activo: true, panaderias: [id] });
    const r = await pedir('DELETE', undefined, `/${id}`);
    expect(r.status).toBe(200);
    expect(usuarios.find((u) => u.nombre_usuario === 'compartido')!.panaderias).toEqual([PAN0]);
    expect(usuarios.some((u) => u.nombre_usuario === 'super')).toBe(true);
    expect(usuarios.some((u) => u.nombre_usuario === 'laura.gomez')).toBe(false);
  });

  test('no se puede eliminar la única panadería activa', async () => {
    const r = await pedir('DELETE', undefined, `/${PAN0}`);
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toContain('única');
    expect(panaderias).toHaveLength(1);
    expect(usuarios).toHaveLength(1);
  });

  test('identificador no válido 400; inexistente 404', async () => {
    expect((await pedir('DELETE', undefined, '/no-es-uuid')).status).toBe(400);
    expect((await pedir('DELETE', undefined, `/${uuid(7777)}`)).status).toBe(404);
  });
});

describe('PATCH /panaderias/:id', () => {
  test('desactiva y reactiva una panadería sin tocar sus datos', async () => {
    await pedir('POST', NUEVA);
    const id = idDe('Panadería El Trigal');
    const off = await pedir('PATCH', { activa: false }, `/${id}`);
    expect(off.status).toBe(200);
    expect(off.cuerpo).toMatchObject({ nombre: 'Panadería El Trigal', activa: false });
    expect(causas).toHaveLength(7);
    expect(usuarios).toHaveLength(3);
    const on = await pedir('PATCH', { activa: true }, `/${id}`);
    expect(on.cuerpo.activa).toBe(true);
  });

  test('no deja desactivar la única panadería activa', async () => {
    const r = await pedir('PATCH', { activa: false }, `/${PAN0}`);
    expect(r.status).toBe(409);
    expect(panaderias[0].activa).toBe(true);
  });

  test('validaciones: estado no booleano 400, identificador malo 400, inexistente 404', async () => {
    expect((await pedir('PATCH', { activa: 'no' }, `/${PAN0}`)).status).toBe(400);
    expect((await pedir('PATCH', {}, `/${PAN0}`)).status).toBe(400);
    expect((await pedir('PATCH', { activa: false }, '/xx')).status).toBe(400);
    expect((await pedir('PATCH', { activa: false }, `/${uuid(7777)}`)).status).toBe(404);
  });
});
