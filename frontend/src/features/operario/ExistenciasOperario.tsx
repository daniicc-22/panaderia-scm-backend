import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CircleCheck, Clock, OctagonAlert, Package, PackageX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getInventario } from '../../services/inventarioService';
import { formatoCantidad, textoVencimiento } from '../inventario/formatos';
import type { EstadoStock, ItemInventario } from '../../types/inventario.types';
import { BuscadorGrande, CargandoGrande, COLOR_SEMAFORO, MensajeGrande, PantallaOperario, type Semaforo } from './ui';

const SEMAFORO: Record<EstadoStock, Semaforo> = { ok: 'verde', por_vencer: 'amarillo', vencido: 'rojo', sin_stock: 'gris' };
const ICONO: Record<EstadoStock, LucideIcon> = { ok: CircleCheck, por_vencer: Clock, vencido: OctagonAlert, sin_stock: PackageX };
// Fondo de cada tarjeta según su estado
const TINTE: Record<EstadoStock, string> = { ok: 'bg-[#eef5f0]', por_vencer: 'bg-[#fdf4e1]', vencido: 'bg-[#fcecea]', sin_stock: 'bg-[#f1ede6]' };
// Etiqueta de estado en color sólido
const CHIP: Record<EstadoStock, string> = { ok: 'bg-verde-bosque text-white', por_vencer: 'bg-trigo text-grafito', vencido: 'bg-critico-texto text-white', sin_stock: 'bg-grafico-neutro text-white' };
// Primero lo que pide atención
const ORDEN: Record<EstadoStock, number> = { vencido: 0, por_vencer: 1, sin_stock: 2, ok: 3 };

// Contadores de colores arriba: también sirven de filtro
const CONTADORES: { estado: EstadoStock; etiqueta: string; clase: string }[] = [
  { estado: 'vencido', etiqueta: 'Vencidos', clase: 'bg-critico-texto text-white' },
  { estado: 'por_vencer', etiqueta: 'Por vencer', clase: 'bg-trigo text-grafito' },
  { estado: 'sin_stock', etiqueta: 'No hay', clase: 'bg-grafico-neutro text-white' },
  { estado: 'ok', etiqueta: 'Bien', clase: 'bg-verde-bosque text-white' },
];

function estadoTexto(i: ItemInventario, hoy: string): string {
  if (i.estado === 'sin_stock') return 'No hay';
  if (i.estado === 'ok') return 'Bien';
  return textoVencimiento(hoy, i.proximo_vencimiento);
}

export function ExistenciasOperario() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<EstadoStock | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['inventario'], queryFn: getInventario });

  const cuenta = useMemo(() => {
    const c: Record<EstadoStock, number> = { vencido: 0, por_vencer: 0, sin_stock: 0, ok: 0 };
    for (const i of data?.items ?? []) c[i.estado] += 1;
    return c;
  }, [data]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data?.items ?? [])
      .filter((i) => (filtro ? i.estado === filtro : true))
      .filter((i) => !texto || i.nombre.toLowerCase().includes(texto))
      .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, 'es'));
  }, [data, busqueda, filtro]);

  return (
    <PantallaOperario seccion="existencias" icono={Package} titulo="Existencias" ayuda="Lo que hay en bodega ahora.">
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Filtrar por estado">
          {CONTADORES.map((c, n) => {
            const Icono = ICONO[c.estado];
            const activo = filtro === c.estado;
            return (
              <motion.button
                key={c.estado}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltro(activo ? null : c.estado)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: n * 0.05 }}
                whileTap={{ scale: 0.96 }}
                className={`flex min-h-24 flex-col items-start justify-between rounded-2xl p-4 text-left shadow-elevada ${c.clase} ${
                  activo ? 'ring-4 ring-azul-noche ring-offset-2 ring-offset-hueso' : filtro ? 'opacity-60' : ''
                }`}
              >
                <Icono size={26} aria-hidden="true" />
                <span>
                  <span className="block font-display text-[32px] leading-none font-semibold cifras">{cuenta[c.estado]}</span>
                  <span className="text-base font-semibold">{c.etiqueta}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      <BuscadorGrande seccion="existencias" valor={busqueda} onCambio={setBusqueda} placeholder="Buscar un insumo" />

      {filtro && (
        <button
          type="button"
          onClick={() => setFiltro(null)}
          className="min-h-12 w-fit rounded-xl border-2 border-verde-bosque bg-[#fff] px-4 text-base font-semibold text-exito-texto"
        >
          Ver todos otra vez
        </button>
      )}

      {isLoading && <CargandoGrande />}
      {isError && (
        <button type="button" onClick={() => refetch()} className="w-full">
          <MensajeGrande tono="rojo">No se pudieron cargar las existencias. Toca para intentar de nuevo.</MensajeGrande>
        </button>
      )}
      {data && visibles.length === 0 && (
        <MensajeGrande tono={filtro && filtro !== 'ok' ? 'verde' : 'gris'}>
          {filtro && filtro !== 'ok' ? '¡Nada por aquí! Todo bien.' : 'No hay insumos con ese nombre.'}
        </MensajeGrande>
      )}

      <ul className="flex flex-col gap-3 rounded-2xl bg-verde-suave p-3 empty:hidden">
        {data &&
          visibles.map((i, n) => {
            const s = COLOR_SEMAFORO[SEMAFORO[i.estado]];
            const Icono = ICONO[i.estado];
            return (
              <motion.li
                key={i.materia_prima_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(n, 12) * 0.03, duration: 0.25 }}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border-l-8 px-5 py-4 shadow-xs ${s.borde} ${TINTE[i.estado]}`}
              >
                <span className="min-w-0 text-xl font-semibold text-grafito">{i.nombre}</span>
                <span className="flex items-center gap-3">
                  <span className="font-display text-2xl font-semibold text-azul-noche cifras">{formatoCantidad(i.stock, i.unidad)}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-base font-semibold ${CHIP[i.estado]}`}>
                    <Icono size={20} aria-hidden="true" />
                    {estadoTexto(i, data.fecha)}
                  </span>
                </span>
              </motion.li>
            );
          })}
      </ul>
    </PantallaOperario>
  );
}
