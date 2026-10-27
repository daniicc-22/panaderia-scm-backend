import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTableroProduccion } from '../../services/produccionService';
import type { ProduccionResumen } from '../../types/produccion.types';
import { formatoFechaIso } from '../inventario/formatos';
import { Indicador, Panel, Seccion } from './Panel';
import { ProduccionDiaria } from './ProduccionDiaria';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

function Fila({ p }: { p: ProduccionResumen }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{p.producto}</p>
        <p className="text-xs text-gray-500">
          {formatoFechaIso(p.fecha)} · {hora(p.fecha)} · {p.usuario}
        </p>
      </div>
      <div className="shrink-0 text-right text-sm">
        <p className="font-medium text-gray-900">{p.cantidad_producida !== null ? `${numero.format(p.cantidad_producida)} und` : '—'}</p>
        {p.rendimiento_pct !== null && <p className="text-xs text-gray-500">{pct(p.rendimiento_pct)} de lo planificado</p>}
      </div>
    </li>
  );
}

// Producción de la última semana: indicadores, gráfico diario y últimas producciones cerradas.
// No muestra dinero, así que lo ven todos los roles.
export function ProduccionSemana() {
  const tablero = useQuery({ queryKey: ['produccion', 'tablero'], queryFn: getTableroProduccion });

  if (tablero.isLoading) return null;
  if (tablero.isError || !tablero.data) {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
        No se pudo cargar el resumen de producción.{' '}
        <button type="button" className="font-medium underline" onClick={() => tablero.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  const { semana, recientes, por_dia } = tablero.data;
  const principal = semana.causas_frecuentes[0];
  // Verde al cumplir lo planificado; amarillo si se aleja más de 10 puntos (umbral provisional)
  const tonoRendimiento =
    semana.rendimiento_prom_pct === null ? 'gris' : Math.abs(semana.rendimiento_prom_pct - 100) <= 10 ? 'verde' : 'amarillo';

  return (
    <Seccion titulo="Producción · últimos 7 días">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="Producciones cerradas" valor={String(semana.producciones)} tono="azul" />
        <Indicador
          etiqueta="Rendimiento promedio"
          valor={semana.rendimiento_prom_pct !== null ? pct(semana.rendimiento_prom_pct) : '—'}
          detalle="Producido frente a lo planificado"
          tono={tonoRendimiento}
        />
        <Indicador
          etiqueta="Insumos pesados"
          valor={semana.insumos_pesados_pct !== null ? pct(semana.insumos_pesados_pct) : '—'}
          detalle="El resto se tomó al ojo"
          tono={semana.insumos_pesados_pct === null ? 'gris' : semana.insumos_pesados_pct >= 90 ? 'verde' : 'amarillo'}
        />
        <Indicador
          etiqueta="Mermas registradas"
          valor={String(semana.mermas_registradas)}
          detalle={principal ? `Más frecuente: ${principal.causa} (${principal.veces})` : 'Sin mermas en la semana'}
          tono={semana.mermas_registradas === 0 ? 'verde' : 'amarillo'}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Panel titulo="Unidades producidas por día" subtitulo="Producciones cerradas, en hora de Colombia" className="lg:col-span-3">
          <ProduccionDiaria datos={por_dia} />
        </Panel>

        <Panel
          titulo="Últimas producciones"
          className="lg:col-span-2"
          accion={
            <Link to="/produccion" className="font-medium text-blue-600 hover:underline">
              Ver historial →
            </Link>
          }
        >
          {recientes.length === 0 ? (
            <p className="text-sm text-gray-500">
              Todavía no hay producciones cerradas. Registra una en{' '}
              <Link to="/produccion" className="font-medium text-blue-600 hover:underline">
                Producir
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recientes.map((p) => (
                <Fila key={p.id} p={p} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Seccion>
  );
}
