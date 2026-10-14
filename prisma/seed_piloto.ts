import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const panaderia = await prisma.panaderia.findFirst({
    where: { nombre: 'La Casa del Pan de Maíz' },
  });
  if (!panaderia) throw new Error('Primero ejecuta seed_catalogo.ts');

  // El superadministrador ve todas las panaderías, así que solo se asignan admin y operario.
  for (const email of ['admin@demo.local', 'operario@demo.local']) {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) {
      console.log('No existe el usuario', email);
      continue;
    }
    await prisma.usuario_panaderia.upsert({
      where: {
        usuario_id_panaderia_id: { usuario_id: usuario.id, panaderia_id: panaderia.id },
      },
      update: { activo: true },
      create: { usuario_id: usuario.id, panaderia_id: panaderia.id },
    });
    console.log('Asignado a', panaderia.nombre + ':', email);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());