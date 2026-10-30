// Lee de la base de datos lo que se gastó de cada insumo al producir y lo resume (Sprint 7).
import type { PrismaClient } from '@prisma/client';
import { sumarDias } from '../utils/calendarioEntrega';
import { consumoReal, VENTANA_SEMANAS, type ConsumoReal, type SalidaConsumo } from '../utils/consumoReal';
import { hoyColombia } from '../utils/entradas';

/** Consumo real por insumo (clave: id de la materia prima). Un insumo sin consumo no aparece. */
export async function cargarConsumoReal(
  prisma: PrismaClient,
  panaderiaId: string,
  hoy: string,
): Promise<Map<string, ConsumoReal>> {
  const primera = await prisma.produccion.findFirst({
    where: { panaderia_id: panaderiaId },
    orderBy: { fecha: 'asc' },
    select: { fecha: true },
  });
  const resultado = new Map<string, ConsumoReal>();
  if (!primera) return resultado;
  const inicio = hoyColombia(primera.fecha);

  const desde = sumarDias(hoy, -(VENTANA_SEMANAS * 7 - 1));
  const filas = await prisma.consumo_produccion.findMany({
    where: { panaderia_id: panaderiaId, produccion: { fecha: { gte: new Date(`${desde}T00:00:00-05:00`) } } },
    select: {
      cantidad_consumida: true,
      lote: { select: { materia_prima_id: true } },
      produccion: { select: { fecha: true } },
    },
  });

  const porMateria = new Map<string, SalidaConsumo[]>();
  for (const f of filas) {
    const id = f.lote.materia_prima_id;
    if (!id) continue;
    const lista = porMateria.get(id) ?? [];
    lista.push({ fecha: hoyColombia(f.produccion.fecha), cantidad: Number(f.cantidad_consumida) });
    porMateria.set(id, lista);
  }
  for (const [id, salidas] of porMateria) {
    const c = consumoReal(salidas, hoy, inicio);
    if (c) resultado.set(id, c);
  }
  return resultado;
}
