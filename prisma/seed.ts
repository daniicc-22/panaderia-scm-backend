import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface UsuarioSemilla {
  nombre: string;
  email: string;
  password: string;
  rolCodigo: 'superadministrador' | 'administrador' | 'operario';
}

const USUARIOS_SEMILLA: UsuarioSemilla[] = [
  {
    nombre: 'Super Administrador',
    email: 'superadmin@demo.local',
    password: 'Demo123!',
    rolCodigo: 'superadministrador',
  },
  {
    nombre: 'Administrador Panadería',
    email: 'admin@demo.local',
    password: 'Demo123!',
    rolCodigo: 'administrador',
  },
  {
    nombre: 'Operario Panadero',
    email: 'operario@demo.local',
    password: 'Demo123!',
    rolCodigo: 'operario',
  },
];

async function main() {
  for (const datos of USUARIOS_SEMILLA) {
    const rol = await prisma.rol.findUnique({ where: { codigo: datos.rolCodigo } });

    if (!rol) {
      console.error(`No se encontró el rol '${datos.rolCodigo}'. Verifica la tabla rol.`);
      continue;
    }

    const passwordHash = await bcrypt.hash(datos.password, 10);

    const usuario = await prisma.usuario.upsert({
      where: { email: datos.email },
      update: {
        nombre: datos.nombre,
        password_hash: passwordHash,
        rol_id: rol.id,
        activo: true,
      },
      create: {
        nombre: datos.nombre,
        email: datos.email,
        password_hash: passwordHash,
        rol_id: rol.id,
        activo: true,
      },
    });

    console.log(`Usuario listo: ${usuario.email} (${datos.rolCodigo})`);
  }
}

main()
  .catch((error) => {
    console.error('Error al ejecutar el seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });