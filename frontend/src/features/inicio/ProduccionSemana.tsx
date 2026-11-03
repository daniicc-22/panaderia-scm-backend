import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTableroProduccion } from '../../services/produccionService';
import type { ProduccionResumen } from '../../types/produccion.types';
import { Esqueleto, EsqueletoIndicadores } from '../../components/feedback/Esqueleto';
import { formatoFechaIso } from '../inventario/formatos';
import { Indicador, Panel, Seccion } from './Panel';
import { ProduccionDiaria } from './ProduccionDiaria';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const pctEntero = (n: number) => `${Math.round(n).toLocaleString('es-CO')} %`;
const entero = (n: number) => Math.round(n).toLocaleString('es-CO');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

function Fila({ p }: { p: ProduccionResumen }) {
  return (
    <li>
      <Link to="/produccion" className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-arena">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-grafito">{p.producto}</p>
          <p className="text-xs text-gris-texto">
            {formatoFechaIso(p.fecha)} · {hora(p.fecha)} · {p.usuario}
          </p>
        </div>
        <div className="cifras shrink-0 text-right text-sm">
          <p className="font-semibold text-grafito">{p.cantidad_producida !== null ? `${numero.format(p.cantidad_producida)} und` : '—'}</p>
          {p.rendimiento_pct !== null && <p className="text-xs text-gris-texto">{pct(p.rendimiento_pct)} de lo planificado</p>}
        </div>
      </Link>
    </li>
  );
}

// Producción de la última semana: indicadores, gráfico diario y últimas producciones cerradas.
// No muestra dinero, así que lo ven todos los roles.
export function ProduccionSemana() {
  const tablero = useQuery({ queryKey: ['produccion', 'tablero'], queryFn: getTableroProduccion });

  if (tablero.isLoading) {
    return (
      <Seccion titulo="Producción · últimos 7 días">
        <EsqueletoIndicadores />
        <div className="grid gap-3 lg:grid-cols-5">
          <Esqueleto className="h-64 lg:col-span-3" />
          <Esqueleto className="h-64 lg:col-span-2" />
        </div>
      </Seccion>
    );
  }
  if (tablero.isError || !tablero.data) {
    return (
      <div className="rounded-tarjeta border border-[#f1d9a6] bg-atencion-fondo px-4 py-3 text-sm text-atencion-texto">
        No se pudo cargar el resumen de producción.{' '}
        <button type="button" className="font-semibold underline" onClick={() => tablero.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  const { semana, recientes, por_dia } = tablero.data;
  const principal = semana.causas_frecuentes[0];

  return (
    <Seccion titulo="Producción · últimos 7 días">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="Producciones cerradas" valor="0" numero={semana.producciones} formato={entero} tono="azul" enlace="/produccion" indice={0} />
        <Indicador
          etiqueta="Rendimiento promedio"
          valor="—"
          numero={semana.rendimiento_prom_pct ?? undefined}
          formato={pctEntero}
          detalle="Producido frente a lo planificado"
          tono="amarillo"
          enlace="/produccion"
          indice={1}
        />
        <Indicador
          etiqueta="Insumos pesados"
          valor="—"
          numero={semana.insumos_pesados_pct ?? undefined}
          formato={pctEntero}
          detalle="El resto se tomó al ojo"
          tono="verde"
          enlace="/desviacion-pesaje"
          indice={2}
        />
        <Indicador
          etiqueta="Mermas registradas"
          valor="0"
          numero={semana.mermas_registradas}
          formato={entero}
          detalle={principal ? `Más frecuente: ${principal.causa} (${principal.veces})` : 'Sin mermas en la semana'}
          tono="rojo"
          enlace="/mermas"
          indice={3}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Panel titulo="Unidades producidas por día" subtitulo="Producciones cerradas, en hora de Colombia" className="lg:col-span-3" oscuro>
          <ProduccionDiaria datos={por_dia} />
        </Panel>

        <Panel
          titulo="Últimas producciones"
          className="lg:col-span-2"
          accion={
            <Link to="/produccion" className="font-semibold text-pizarra hover:underline">
              Ver historial →
            </Link>
          }
        >
          {recientes.length === 0 ? (
            <p className="text-sm text-gris-texto">
              Todavía no hay producciones cerradas. Registra una en{' '}
              <Link to="/produccion" className="font-semibold text-pizarra hover:underline">
                Producir
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-linea">
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
