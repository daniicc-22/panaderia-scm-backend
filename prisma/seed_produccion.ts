import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Seed de PRODUCCIÓN: sin usuarios demo y sin contraseñas en el código.
 * Las credenciales se leen de variables de entorno al ejecutarlo
 * (no se guardan en .env ni en el repositorio).
 *
 *   SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NOMBRE
 *   ADMIN_EMAIL      / ADMIN_PASSWORD      / ADMIN_NOMBRE
 *   OPERARIO_EMAIL   / OPERARIO_PASSWORD   / OPERARIO_NOMBRE   (opcional)
 *
 * Antes se deben haber cargado: roles y catálogo (seed_catalogo.ts) para asignar la panadería.
 */
const prisma = new PrismaClient();

const NOMBRES_ROL = {
  superadministrador: 'Superadministrador',
  administrador: 'Administrador de panadería',
  operario: 'Operario / panadero',
} as const;
type RolCodigo = keyof typeof NOMBRES_ROL;

const PREFIJOS: { prefijo: string; rol: RolCodigo; asignaPanaderia: boolean }[] = [
  { prefijo: 'SUPERADMIN', rol: 'superadministrador', asignaPanaderia: false },
  { prefijo: 'ADMIN', rol: 'administrador', asignaPanaderia: true },
  { prefijo: 'OPERARIO', rol: 'operario', asignaPanaderia: true },
];

const CLAVES_PROHIBIDAS = ['demo123!', 'password', '12345678', 'admin123'];

function validarPassword(email: string, password: string) {
  if (password.length < 12) throw new Error(`La contraseña de ${email} debe tener al menos 12 caracteres.`);
  if (CLAVES_PROHIBIDAS.some((c) => password.toLowerCase().includes(c)))
    throw new Error(`La contraseña de ${email} es demasiado común.`);
}

async function main() {
  // 1. Roles (catálogo requerido por el sistema)
  for (const [codigo, nombre] of Object.entries(NOMBRES_ROL)) {
    await prisma.rol.upsert({
      where: { codigo: codigo as RolCodigo },
      update: {},
      create: { codigo: codigo as RolCodigo, nombre },
    });
  }
  console.log('Roles listos.');

  const panaderia = await prisma.panaderia.findFirst({ where: { nombre: 'La Casa del Pan de Maíz' } });

  // 2. Usuarios reales desde variables de entorno
  let creados = 0;
  for (const { prefijo, rol, asignaPanaderia } of PREFIJOS) {
    const email = process.env[`${prefijo}_EMAIL`]?.trim().toLowerCase();
    const password = process.env[`${prefijo}_PASSWORD`];
    const nombre = process.env[`${prefijo}_NOMBRE`]?.trim() || NOMBRES_ROL[rol];
    if (!email || !password) {
      console.log(`Se omite ${rol}: faltan ${prefijo}_EMAIL o ${prefijo}_PASSWORD.`);
      continue;
    }
    if (email.endsWith('@demo.local')) throw new Error('No se permiten correos @demo.local en producción.');
    validarPassword(email, password);

    const filaRol = await prisma.rol.findUniqueOrThrow({ where: { codigo: rol } });
    const password_hash = await bcrypt.hash(password, 12);
    const usuario = await prisma.usuario.upsert({
      where: { email },
      update: { nombre, password_hash, rol_id: filaRol.id, activo: true },
      create: { nombre, email, password_hash, rol_id: filaRol.id, activo: true },
    });

    if (asignaPanaderia) {
      if (!panaderia) throw new Error('Primero ejecuta seed_catalogo.ts (no existe la panadería piloto).');
      await prisma.usuario_panaderia.upsert({
        where: { usuario_id_panaderia_id: { usuario_id: usuario.id, panaderia_id: panaderia.id } },
        update: { activo: true },
        create: { usuario_id: usuario.id, panaderia_id: panaderia.id },
      });
    }
    creados++;
    console.log(`Usuario listo: ${email} (${rol})`);
  }
  if (creados === 0) throw new Error('No se creó ningún usuario: define al menos ADMIN_EMAIL y ADMIN_PASSWORD.');

  // 3. Verificación: no debe quedar ningún usuario demo
  const demo = await prisma.usuario.count({ where: { email: { endsWith: '@demo.local' } } });
  if (demo > 0) console.warn(`ATENCIÓN: existen ${demo} usuarios @demo.local. Desactívalos o elimínalos.`);
}

main()
  .catch((e) => {
    console.error('Error en el seed de producción:', e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
