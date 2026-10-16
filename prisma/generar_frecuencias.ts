import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const LOTES_POR_DEFECTO = 6;

async function main() {
  const ruta = path.join(process.cwd(), 'prisma', 'frecuencia_lotes.json');
  const existente: Record<string, number> = fs.existsSync(ruta)
    ? JSON.parse(fs.readFileSync(ruta, 'utf-8'))
    : {};

  const formulaciones = await prisma.formulacion.findMany({
    where: { activa: true },
    include: { producto: true },
    orderBy: { producto: { nombre: 'asc' } },
  });

  const resultado: Record<string, number> = {};
  for (const f of formulaciones) {
    resultado[f.producto.nombre] = existente[f.producto.nombre] ?? LOTES_POR_DEFECTO;
  }

  fs.writeFileSync(ruta, JSON.stringify(resultado, null, 2), 'utf-8');
  console.log(`Archivo generado con ${Object.keys(resultado).length} productos: ${ruta}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());