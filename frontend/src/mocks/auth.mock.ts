import type { Credenciales, SesionIniciada, Usuario } from '../types/auth.types';

/**
 * USUARIOS DEMO — MOCK.
 * Estos usuarios NO existen en la base de datos real (panaderia_db).
 * Sirven únicamente para probar la interfaz mientras el backend no tiene
 * POST /login implementado. Cuando exista login real, este archivo deja
 * de usarse (ver src/features/auth/authService.ts).
 */
interface UsuarioDemo extends Usuario {
  password: string;
}

const USUARIOS_DEMO: UsuarioDemo[] = [
  {
    id: 'demo-superadmin',
    nombre: 'Super Administrador (Demo)',
    email: 'superadmin@demo.local',
    rol: 'superadministrador',
    password: 'Demo123!',
  },
  {
    id: 'demo-admin',
    nombre: 'Administrador (Demo)',
    email: 'admin@demo.local',
    rol: 'administrador',
    password: 'Demo123!',
  },
  {
    id: 'demo-operario',
    nombre: 'Operario (Demo)',
    email: 'operario@demo.local',
    rol: 'operario',
    password: 'Demo123!',
  },
];

const RETARDO_SIMULADO_MS = 600;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginMock(credenciales: Credenciales): Promise<SesionIniciada> {
  await esperar(RETARDO_SIMULADO_MS);

  const encontrado = USUARIOS_DEMO.find(
    (u) =>
      (u.email ?? '').toLowerCase() === credenciales.usuario.trim().toLowerCase() &&
      u.password === credenciales.password,
  );

  if (!encontrado) {
    throw new Error('Credenciales incorrectas. Verifica el usuario y la contraseña.');
  }

  const { password: _password, ...usuario } = encontrado;

  return {
    usuario,
    token: `mock-token-${usuario.id}`,
  };
}