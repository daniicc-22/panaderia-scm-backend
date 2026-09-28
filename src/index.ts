import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.rol.findMany();
  console.log('Roles encontrados en panaderia_db:', roles);
}

main()
  .catch((error) => {
    console.error('Error al conectar con la base de datos:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });