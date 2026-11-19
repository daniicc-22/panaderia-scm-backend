import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { getOfertasProveedor } from '../../services/proveedoresService';
import type { OfertaProveedor, Proveedor } from '../../types/proveedor.types';
import { formatoPesos } from '../precios/numeros';

type Fila = OfertaProveedor & { proveedor: string };
interface Insumo {
  id: string;
  materia: string;
  unidad: string;
  filas: Fila[];
  mejor: number;
  masRapido: number | null;
}

const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;

function costo(unidad: string, v: number): string {
  return unidad === 'g' ? `${formatoPesos.format(v * 1000)} / kg` : `${formatoPesos.format(v)} / ${unidad}`;
}

// Vista inversa de la oferta: para cada insumo, quién lo vende más barato y quién entrega más rápido
export function CompararProveedores({ proveedores }: { proveedores: Proveedor[] }) {
  const activos = proveedores.filter((p) => p.activo);
  const consultas = useQueries({
    queries: activos.map((p) => ({ queryKey: ['precios', 'proveedor', p.id], queryFn: () => getOfertasProveedor(p.id) })),
  });
  const [busqueda, setBusqueda] = useState('');
  const [soloVarios, setSoloVarios] = useState(false);
  const cargando = consultas.some((c) => c.isLoading);
  const fallo = consultas.some((c) => c.isError);

  const insumos = useMemo<Insumo[]>(() => {
    const mapa = new Map<string, Insumo>();
    consultas.forEach((c, i) => {
      for (const o of c.data?.items ?? []) {
        if (!o.cuenta || o.costo_por_unidad_base === null) continue;
        const ins = mapa.get(o.materia_prima_id) ?? { id: o.materia_prima_id, materia: o.materia, unidad: o.unidad, filas: [], mejor: Infinity, masRapido: null };
        ins.filas.push({ ...o, proveedor: activos[i].nombre });
        mapa.set(o.materia_prima_id, ins);
      }
    });
    return [...mapa.values()]
      .map((ins) => {
        ins.filas.sort((a, b) => (a.costo_por_unidad_base ?? 0) - (b.costo_por_unidad_base ?? 0));
        ins.mejor = ins.filas[0].costo_por_unidad_base ?? 0;
        const dias = ins.filas.map((f) => f.tiempo_entrega_dias).filter((d): d is number => d !== null);
        ins.masRapido = dias.length > 1 ? Math.min(...dias) : null;
        return ins;
      })
      .sort((a, b) => b.filas.length - a.filas.length || a.materia.localeCompare(b.materia, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultas.map((c) => c.dataUpdatedAt).join(','), activos.length]);

  if (cargando) return <Esqueleto className="h-48 w-full" />;
  if (fallo) return <p className="rounded-lg bg-critico-fondo p-3 text-sm text-critico-texto">No se pudieron cargar todos los precios. Recarga la página.</p>;

  const texto = busqueda.trim().toLowerCase();
  const visibles = insumos.filter((i) => (!soloVarios || i.filas.length > 1) && (!texto || i.materia.toLowerCase().includes(texto)));

  if (insumos.length === 0)
    return <p className="rounded-tarjeta border border-linea bg-tabla p-6 text-center text-sm text-gris-texto">Aún no hay precios vigentes para comparar. Agrégalos desde la oferta de cada proveedor.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo"
          className="min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 text-base placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo sm:max-w-xs sm:text-sm"
        />
        <button
          type="button"
          aria-pressed={soloVarios}
          onClick={() => setSoloVarios((v) => !v)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${soloVarios ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
        >
          <Scale size={15} aria-hidden="true" />
          Solo con 2 o más proveedores
        </button>
      </div>

      {visibles.length === 0 && <p className="text-sm text-gris-texto">Ningún insumo coincide con el filtro.</p>}

      <ul className="grid gap-3 lg:grid-cols-2">
        {visibles.map((ins) => (
          <li key={ins.id} className="rounded-tarjeta border border-linea bg-tabla p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-azul-noche">{ins.materia}</h3>
              <span className="text-xs text-gris-texto">{ins.filas.length === 1 ? 'Un proveedor' : `${ins.filas.length} proveedores`}</span>
            </div>
            <ul className="mt-2 divide-y divide-linea">
              {ins.filas.map((f, i) => {
                const sobre = ins.mejor > 0 ? (((f.costo_por_unidad_base ?? 0) - ins.mejor) / ins.mejor) * 100 : 0;
                const rapido = ins.masRapido !== null && f.tiempo_entrega_dias === ins.masRapido;
                return (
                  <li key={f.oferta_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-grafito">{f.proveedor}</p>
                      <p className="text-xs text-gris-texto">{f.presentacion}{f.tiempo_entrega_dias !== null ? ` · entrega ${f.tiempo_entrega_dias} d` : ''}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {rapido && <Badge color="blue">Más rápido</Badge>}
                      {i === 0 && ins.filas.length > 1 && <Badge color="green">Más barato</Badge>}
                      {i > 0 && <span className={`text-xs font-semibold ${sobre >= 10 ? 'text-critico-texto' : 'text-atencion-texto'}`}>+{pct(sobre)}</span>}
                      <span className="cifras text-sm font-semibold text-grafito">{costo(ins.unidad, f.costo_por_unidad_base ?? 0)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
