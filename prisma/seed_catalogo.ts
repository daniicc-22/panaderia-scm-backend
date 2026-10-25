import { Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

type Presentacion = { gramos: number; precio: number; origen: string };
// controla_inventario=false: insumo que no se compra ni se guarda (el agua)
type MateriaPrimaDato = { codigo: string; nombre: string; categoria: string; controla_inventario?: boolean; presentaciones: Presentacion[] };
type Ingrediente = { mp: string; gramos: number };
type ProductoDato = {
  nombre: string;
  es_intermedio: boolean;
  rendimiento: number;
  ingredientes: Ingrediente[];
  extra_intermedio: { nombre: string; gramos: number } | null;
};

const ruta = path.join(process.cwd(), 'prisma', 'catalogo_piloto.json');
const datos = JSON.parse(fs.readFileSync(ruta, 'utf8')) as {
  unidades: { codigo: string; nombre: string; tipo: 'masa' | 'volumen' | 'unidad' }[];
  categorias: string[];
  materias_primas: MateriaPrimaDato[];
  productos: ProductoDato[];
};

function nombrePresentacion(gramos: number): string {
  return gramos >= 1000 && gramos % 1000 === 0 ? `${gramos / 1000} kg` : `${gramos} g`;
}

async function main() {
  // 1. Panadería piloto
  let panaderia = await prisma.panaderia.findFirst({ where: { nombre: 'La Casa del Pan de Maíz' } });
  if (!panaderia) {
    panaderia = await prisma.panaderia.create({ data: { nombre: 'La Casa del Pan de Maíz', ciudad: 'Pasto' } });
  }
  const panaderiaId = panaderia.id;
  console.log('Panadería:', panaderia.nombre);

  // 2. Unidades de medida (catálogo global)
  const unidad: Record<string, string> = {};
  for (const u of datos.unidades) {
    const fila = await prisma.unidad_medida.upsert({
      where: { codigo: u.codigo },
      update: {},
      create: { codigo: u.codigo, nombre: u.nombre, tipo: u.tipo },
    });
    unidad[u.codigo] = fila.id;
  }
  console.log('Unidades listas:', Object.keys(unidad).join(', '));

  // 3. Categorías de materia prima
  const categoria: Record<string, string> = {};
  for (const nombre of datos.categorias) {
    let fila = await prisma.categoria_materia_prima.findFirst({ where: { nombre } });
    if (!fila) fila = await prisma.categoria_materia_prima.create({ data: { nombre } });
    categoria[nombre] = fila.id;
  }

  // 4. Proveedor provisional (el Excel no trae proveedores)
  const nombreProv = 'Proveedor general (provisional)';
  let proveedor = await prisma.proveedor.findFirst({ where: { panaderia_id: panaderiaId, nombre: nombreProv } });
  if (!proveedor) proveedor = await prisma.proveedor.create({ data: { panaderia_id: panaderiaId, nombre: nombreProv } });

  // 5. Materias primas, presentaciones y precios
  const mpId: Record<string, string> = {};
  let nPres = 0;
  for (const m of datos.materias_primas) {
    const mp = await prisma.materia_prima.upsert({
      where: { panaderia_id_codigo: { panaderia_id: panaderiaId, codigo: m.codigo } },
      update: { nombre: m.nombre, categoria_id: categoria[m.categoria], controla_inventario: m.controla_inventario ?? true },
      create: {
        panaderia_id: panaderiaId,
        codigo: m.codigo,
        nombre: m.nombre,
        categoria_id: categoria[m.categoria],
        unidad_base_id: unidad['g'],
        controla_inventario: m.controla_inventario ?? true,
      },
    });
    mpId[m.codigo] = mp.id;

    for (const p of m.presentaciones) {
      const nombre = nombrePresentacion(p.gramos);
      let pres = await prisma.presentacion.findFirst({ where: { materia_prima_id: mp.id, nombre } });
      if (!pres) {
        pres = await prisma.presentacion.create({
          data: {
            panaderia_id: panaderiaId,
            materia_prima_id: mp.id,
            nombre,
            contenido: p.gramos,
            unidad_contenido_id: unidad['g'],
          },
        });
      }
      const precio = await prisma.presentacion_proveedor.findFirst({
        where: { presentacion_id: pres.id, proveedor_id: proveedor.id },
      });
      if (precio) {
        await prisma.presentacion_proveedor.update({ where: { id: precio.id }, data: { precio_referencia: p.precio } });
      } else {
        await prisma.presentacion_proveedor.create({
          data: {
            panaderia_id: panaderiaId,
            presentacion_id: pres.id,
            proveedor_id: proveedor.id,
            precio_referencia: p.precio,
          },
        });
      }
      nPres++;
    }
  }
  console.log(`Materias primas: ${datos.materias_primas.length} | presentaciones con precio: ${nPres}`);

  // 6. Productos y formulaciones (versión 1)
  const productoId: Record<string, string> = {};
  async function asegurarProducto(nombre: string, esIntermedio: boolean): Promise<string> {
    let prod = await prisma.producto.findFirst({ where: { panaderia_id: panaderiaId, nombre } });
    if (!prod) {
      prod = await prisma.producto.create({
        data: { panaderia_id: panaderiaId, nombre, unidad_produccion_id: unidad['un'], es_intermedio: esIntermedio },
      });
    }
    return prod.id;
  }

  // Intermedios primero (para poder referenciarlos)
  for (const p of datos.productos) {
    if (p.extra_intermedio) {
      productoId[p.extra_intermedio.nombre] = await asegurarProducto(p.extra_intermedio.nombre, true);
    }
  }

  let nDetalles = 0;
  for (const p of datos.productos) {
    const pid = await asegurarProducto(p.nombre, p.es_intermedio);
    productoId[p.nombre] = pid;

    const formulacion = await prisma.formulacion.upsert({
      where: { producto_id_version: { producto_id: pid, version: 1 } },
      update: { rendimiento_esperado: p.rendimiento, activa: true },
      create: {
        panaderia_id: panaderiaId,
        producto_id: pid,
        version: 1,
        activa: true,
        rendimiento_esperado: p.rendimiento,
      },
    });

    // Se reemplaza el detalle completo para que el seed sea repetible
    await prisma.detalle_formulacion.deleteMany({ where: { formulacion_id: formulacion.id } });

    const filas: Prisma.detalle_formulacionCreateManyInput[] = p.ingredientes.map((i) => ({
      formulacion_id: formulacion.id,
      materia_prima_id: mpId[i.mp],
      cantidad_estandar: i.gramos,
      unidad_id: unidad['g'],
    }));
    if (p.extra_intermedio) {
      filas.push({
        formulacion_id: formulacion.id,
        producto_intermedio_id: productoId[p.extra_intermedio.nombre],
        cantidad_estandar: p.extra_intermedio.gramos,
        unidad_id: unidad['g'],
      });
    }
    await prisma.detalle_formulacion.createMany({ data: filas });
    nDetalles += filas.length;
  }
  console.log(`Productos: ${datos.productos.length} | líneas de formulación: ${nDetalles}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
