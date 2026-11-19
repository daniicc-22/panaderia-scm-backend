import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/useAuth';
import { getMateriasPrimas } from '../services/materiasPrimasService';
import { getFormulaciones } from '../services/formulacionesService';
import { ExactitudInventario } from '../features/conteos/ExactitudInventario';
import { Indicador, Seccion } from '../features/inicio/Panel';
import { ProduccionSemana } from '../features/inicio/ProduccionSemana';
import { RequiereAtencion } from '../features/inicio/RequiereAtencion';
import { BloqueAbc, BloqueEoq, BloqueScm, SelectorPeriodo } from '../features/inicio/BloquesModelo';
import { DecisionesHoy } from '../features/inicio/DecisionesHoy';
import { IndicadoresClave } from '../features/inicio/IndicadoresClave';
import { guardarPeriodo, leerPeriodo, type Periodo } from '../features/inicio/periodos';
import { AlertasVencimiento } from '../features/inventario/AlertasVencimiento';

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

  // Período de los bloques SCM / ABC / EOQ (se recuerda en este navegador)
  const [periodo, setPeriodo] = useState<Periodo>(leerPeriodo);
  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    guardarPeriodo(p);
  };

  const actualizando = useIsFetching() > 0;

  return (
    <>
    <PageHeader
      titulo="Inicio"
      subtitulo={`Hola, ${usuario?.nombre ?? ''}. ${fechaLarga()}`}
      acciones={
        <>
        <BotonImprimir />
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries()}
          disabled={actualizando}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-grafico-neutro px-4 text-sm font-semibold text-white transition-colors hover:bg-azul-noche disabled:opacity-70"
        >
          <RefreshCw size={16} className={actualizando ? 'animate-spin' : ''} aria-hidden="true" />
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
        </>
      }
    />
    <div className="mx-auto flex max-w-7xl flex-col gap-6">

      <RequiereAtencion verCostos={verCostos} />

      {verCostos ? (
        <>
          {/* 2. Lo que hay que decidir hoy */}
          <DecisionesHoy />

          {/* 3. Cómo va la operación frente a las metas, y 4. el detalle de cada modelo */}
          <Seccion titulo="Indicadores y modelo de gestión">
            <SelectorPeriodo periodo={periodo} onCambiar={cambiarPeriodo} />
            <IndicadoresClave periodo={periodo} />
            <BloqueScm periodo={periodo} />
            <BloqueAbc periodo={periodo} />
            <BloqueEoq periodo={periodo} />
          </Seccion>

          <ProduccionSemana />
        </>
      ) : (
        <>
          <ProduccionSemana />

          <Seccion titulo="Inventario y calidad">
            <div className="grid gap-3 lg:grid-cols-2">
              <AlertasVencimiento compacto />
              <ExactitudInventario />
            </div>
          </Seccion>
        </>
      )}

      <Seccion titulo="Catálogo">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador etiqueta="Insumos activos" valor="—" numero={materias.data?.length} tono="gris" enlace="/materias-primas" indice={0} />
          <Indicador etiqueta="Recetas estandarizadas" valor="—" numero={formulaciones.data?.length} tono="gris" enlace="/formulaciones" indice={1} />
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
      </Seccion>
    </div>
    </>
  );
}
