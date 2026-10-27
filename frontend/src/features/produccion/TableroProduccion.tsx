import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { getTableroProduccion } from '../../services/produccionService';
import type { ProduccionResumen } from '../../types/produccion.types';
import { formatoFechaIso } from '../inventario/formatos';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{valor}</p>
      {detalle && <p className="text-sm text-gray-500">{detalle}</p>}
    </div>
  );
}

function Fila({ p }: { p: ProduccionResumen }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{p.producto}</p>
        <p className="text-xs text-gray-500">
          {formatoFechaIso(p.fecha)} · {hora(p.fecha)} · {p.usuario}
        </p>
      </div>
      <p className="text-sm text-gray-700">
        {p.cantidad_producida !== null
          ? `${numero.format(p.cantidad_producida)} und${p.rendimiento_pct !== null ? ` (${pct(p.rendimiento_pct)})` : ''}`
          : p.cantidad_planificada !== null
            ? `${numero.format(p.cantidad_planificada)} planificadas`
            : 'Sin cantidad'}
      </p>
    </li>
  );
}

// Lo operativo del día a día en el Inicio: qué falta por cerrar, cómo va la semana y lo último producido.
// No muestra dinero, así que lo ven todos los roles.
export function TableroProduccion() {
  const tablero = useQuery({ queryKey: ['produccion', 'tablero'], queryFn: getTableroProduccion });

  if (tablero.isLoading) return null;

  if (tablero.isError || !tablero.data) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        No se pudo cargar el resumen de producción.{' '}
        <button type="button" className="font-medium underline" onClick={() => tablero.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  const { semana, pendientes, recientes } = tablero.data;
  const principal = semana.causas_frecuentes[0];

  return (
    <>
      {pendientes.length > 0 && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4" aria-label="Producciones por cerrar">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Producciones por cerrar</h2>
            <Badge color="blue">{pendientes.length}</Badge>
          </div>
          <p className="text-sm text-gray-600">
            Ya descontaron insumos, pero falta anotar cuántas unidades salieron.
          </p>
          <ul className="divide-y divide-blue-100">
            {pendientes.map((p) => (
              <Fila key={p.id} p={p} />
            ))}
          </ul>
          <Link to="/produccion" className="mt-1 inline-block text-sm font-medium text-blue-700 hover:underline">
            Ir a Producir para cerrarlas →
          </Link>
        </section>
      )}

      <section aria-label="Resumen de la semana" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-gray-900">Últimos 7 días</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato etiqueta="Producciones cerradas" valor={String(semana.producciones)} />
          <Dato
            etiqueta="Rendimiento promedio"
            valor={semana.rendimiento_prom_pct !== null ? pct(semana.rendimiento_prom_pct) : '—'}
            detalle="Producido frente a lo planificado"
          />
          <Dato
            etiqueta="Insumos pesados"
            valor={semana.insumos_pesados_pct !== null ? pct(semana.insumos_pesados_pct) : '—'}
            detalle="El resto se tomó al ojo"
          />
          <Dato
            etiqueta="Mermas registradas"
            valor={String(semana.mermas_registradas)}
            detalle={principal ? `Más frecuente: ${principal.causa} (${principal.veces})` : 'Sin mermas en la semana'}
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4" aria-label="Últimas producciones">
        <h2 className="text-base font-semibold text-gray-900">Últimas producciones</h2>
        {recientes.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">
            Todavía no hay producciones cerradas. Registra una en <Link to="/produccion" className="font-medium text-blue-600 hover:underline">Producir</Link>.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {recientes.map((p) => (
                <Fila key={p.id} p={p} />
              ))}
            </ul>
            <Link to="/produccion" className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline">
              Ver historial completo →
            </Link>
          </>
        )}
      </section>
    </>
  );
}
