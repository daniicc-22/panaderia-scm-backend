import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/useAuth';
import { getMateriasPrimas } from '../services/materiasPrimasService';
import { getFormulaciones } from '../services/formulacionesService';
import { getClasificacionAbc } from '../services/abcService';
import { ExactitudInventario } from '../features/conteos/ExactitudInventario';
import { Indicador, Panel, Seccion } from '../features/inicio/Panel';
import { ProduccionSemana } from '../features/inicio/ProduccionSemana';
import { RequiereAtencion } from '../features/inicio/RequiereAtencion';
import { AlertasVencimiento } from '../features/inventario/AlertasVencimiento';
import type { ClaseAbc } from '../types/abc.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const millones = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// Colores ABC del sistema de diseño: difieren en claridad para distinguirse también en gris
const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-azul-noche',
  B: 'bg-trigo',
  C: 'bg-clase-c',
};

const fechaLarga = () => {
  const t = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function HomePage() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const verCostos = usuario?.rol === 'administrador' || usuario?.rol === 'superadministrador';

  const materias = useQuery({ queryKey: ['materias-primas'], queryFn: getMateriasPrimas });
  const formulaciones = useQuery({ queryKey: ['formulaciones'], queryFn: getFormulaciones });
  // La clasificación ABC solo existe para administradores; el operario no la consulta
  const abc = useQuery({ queryKey: ['clasificacion-abc'], queryFn: () => getClasificacionAbc(), enabled: verCostos });

  const actualizando = useIsFetching() > 0;
  const claseA = abc.data?.resumen.find((r) => r.clase === 'A');
  const top = abc.data?.items.slice(0, 10) ?? [];
  const maximo = top[0]?.porcentaje || 1;

  return (
    <>
    <PageHeader
      titulo="Inicio"
      subtitulo={`Hola, ${usuario?.nombre ?? ''}. ${fechaLarga()}`}
      acciones={
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries()}
          disabled={actualizando}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-grafico-neutro px-4 text-sm font-semibold text-white transition-colors hover:bg-azul-noche disabled:opacity-70"
        >
          <RefreshCw size={16} className={actualizando ? 'animate-spin' : ''} aria-hidden="true" />
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
      }
    />
    <div className="mx-auto flex max-w-7xl flex-col gap-6">

      <RequiereAtencion verCostos={verCostos} />

      <ProduccionSemana />

      <Seccion titulo="Inventario y calidad">
        <div className="grid gap-3 lg:grid-cols-2">
          <AlertasVencimiento compacto />
          <ExactitudInventario />
        </div>
      </Seccion>

      <Seccion titulo={verCostos ? 'Catálogo y costos' : 'Catálogo'}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador etiqueta="Insumos activos" valor="—" numero={materias.data?.length} tono="gris" enlace="/materias-primas" indice={0} />
          <Indicador etiqueta="Recetas estandarizadas" valor="—" numero={formulaciones.data?.length} tono="gris" enlace="/formulaciones" indice={1} />
          {verCostos && (
            <>
              <Indicador
                etiqueta="Valor anual estimado"
                valor={abc.data ? `$ ${millones.format(abc.data.total_valor_anual / 1_000_000)} M` : '—'}
                detalle={`Estimado: ${abc.data?.supuestos.lotes_por_semana_por_defecto ?? 6} lotes por semana`}
                tono="azul"
                enlace="/clasificacion-abc"
                indice={2}
              />
              <Indicador
                etiqueta="Insumos clase A"
                valor={claseA ? String(claseA.insumos) : '—'}
                detalle={claseA ? `${numero.format(claseA.porcentaje)} % del valor` : undefined}
                tono="amarillo"
                enlace="/clasificacion-abc"
                indice={3}
              />
            </>
          )}
        </div>

        {!verCostos && (
          <p className="rounded-tarjeta border border-linea bg-tabla px-4 py-3 text-sm text-gris-texto">
            Consulta las recetas estandarizadas en{' '}
            <Link to="/formulaciones" className="font-semibold text-pizarra hover:underline">
              Formulaciones
            </Link>
            . Registra lo que produces en{' '}
            <Link to="/produccion" className="font-semibold text-pizarra hover:underline">
              Producir
            </Link>{' '}
            y las entradas en{' '}
            <Link to="/inventario" className="font-semibold text-pizarra hover:underline">
              Inventario
            </Link>
            .
          </p>
        )}

        {verCostos && abc.isError && (
          <div className="rounded-tarjeta border border-[#f0c3c0] bg-critico-fondo px-4 py-3 text-sm text-critico-texto">
            No se pudo cargar la clasificación ABC.{' '}
            <button type="button" className="font-medium underline" onClick={() => abc.refetch()}>
              Reintentar
            </button>
          </div>
        )}

        {verCostos && abc.data && (
          <div className="grid gap-3 lg:grid-cols-5">
            <Panel
              titulo="Distribución del valor por clase ABC"
              subtitulo={`Demanda estimada con ${abc.data.supuestos.lotes_por_semana_por_defecto} lotes por semana por producto`}
              className="lg:col-span-2"
            >
              <div className="flex h-8 gap-0.5 overflow-hidden rounded-md" role="img" aria-label="Distribución del valor anual por clase ABC">
                {abc.data.resumen.map((r) => (
                  <div
                    key={r.clase}
                    className={COLOR_CLASE[r.clase]}
                    style={{ width: `${r.porcentaje}%` }}
                    title={`Clase ${r.clase}: ${r.insumos} insumos, ${numero.format(r.porcentaje)} % del valor (${pesos0.format(r.valor_anual)})`}
                  />
                ))}
              </div>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-grafito">
                {abc.data.resumen.map((r) => (
                  <li key={r.clase} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-xs ${COLOR_CLASE[r.clase]}`} aria-hidden="true" />
                      Clase {r.clase} · {r.insumos} insumos
                    </span>
                    <span className="cifras font-semibold text-grafito">{numero.format(r.porcentaje)} %</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel
              titulo="Insumos que más pesan en el costo"
              subtitulo="Los 10 con mayor valor anual; el color indica la clase ABC"
              className="lg:col-span-3"
              accion={
                <Link to="/clasificacion-abc" className="font-semibold text-pizarra hover:underline">
                  Ver tabla completa →
                </Link>
              }
            >
              <ul className="flex flex-col gap-2">
                {top.map((i) => (
                  <li
                    key={i.codigo}
                    className="grid grid-cols-[7rem_1fr_4rem] items-center gap-3 sm:grid-cols-[11rem_1fr_5rem]"
                    title={`${i.nombre}: ${pesos0.format(i.valor_anual)} al año (${numero.format(i.porcentaje)} %) · Clase ${i.clase}`}
                  >
                    <span className="truncate text-sm text-grafito">{i.nombre}</span>
                    <div className="h-4 rounded-xs bg-arena">
                      <div className={`h-4 rounded-r-[4px] ${COLOR_CLASE[i.clase]}`} style={{ width: `${(i.porcentaje / maximo) * 100}%` }} />
                    </div>
                    <span className="cifras text-right text-sm text-grafito">{numero.format(i.porcentaje)} %</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </Seccion>
    </div>
    </>
  );
}
