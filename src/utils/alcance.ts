import { PrismaClient } from '@prisma/client';

// Proveedores visibles para una panadería: los propios y, si pertenece a un grupo, los compartidos del grupo
export async function alcanceProveedores(prisma: PrismaClient, panaderiaId: string) {
  const panaderia = await prisma.panaderia.findUnique({ where: { id: panaderiaId }, select: { grupo_id: true } });
  return panaderia?.grupo_id
    ? [{ panaderia_id: panaderiaId }, { grupo_id: panaderia.grupo_id }]
    : [{ panaderia_id: panaderiaId }];
}
