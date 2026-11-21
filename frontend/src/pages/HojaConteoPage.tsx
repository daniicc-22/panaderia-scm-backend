import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { useAuth } from '../features/auth/useAuth';
import { formatoFecha } from '../features/inventario/formatos';
import { getMiPanaderia } from '../services/panaderiaService';
import { getOpcionesEntrada } from '../services/inventarioService';
import type { MateriaEntrada } from '../types/inventario.types';

// Hoja para contar la bodega a mano antes de la carga inicial. Se imprime en papel (o PDF), se llena con lapicero
// y luego se digita en «Carga inicial». Los insumos por vencimiento van primero: exigen la fecha del empaque
// más próximo a vencer.

const porNombre = (a: MateriaEntrada, b: MateriaEntrada) => a.nombre.localeCompare(b.nombre, 'es');

function Tabla({ titulo, nota, materias, pideFecha, nuevaHoja }: { titulo: string; nota: string; materias: MateriaEntrada[]; pideFecha: boolean; nuevaHoja?: boolean }) {
  if (materias.length === 0) return null;
  return (
    <section className={`flex flex-col gap-2${nuevaHoja ? ' print:break-before-page' : ''}`}>
      <div className="break-after-avoid">
        <h2 className="font-display text-lg font-semibold text-azul-noche">{titulo}</h2>
        <p className="text-xs text-gris-texto">{nota}</p>
      </div>
      <div className="overflow-x-auto rounded-tarjeta border border-linea bg-tabla print:overflow-visible print:rounded-none">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm print:min-w-0">
          <thead>
            <tr className="border-b border-grafito text-xs font-semibold uppercase tracking-wide text-azul-noche">
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Insumo</th>
              <th className="px-3 py-2">Se cuenta en</th>
              <th className="w-28 px-3 py-2">Cantidad</th>
              <th className="w-36 px-3 py-2">{pideFecha ? 'Vence (obligatorio)' : 'Vence (si lo trae)'}</th>
              <th className="px-3 py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {materias.map((m) => (
              <tr key={m.id} className="border-b border-linea align-middle print:border-gris-texto">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-gris-texto">{m.codigo}</td>
                <td className="px-3 py-3 font-medium text-grafito">{m.nombre}</td>
                <td className="px-3 py-3 text-grafito">
                  {m.presentaciones.length > 0 ? m.presentaciones.map((p) => p.nombre).join(' / ') : '—'}
                </td>
                <td className="px-3 py-3">
                  <span className="block h-7 border-b border-grafito" />
                </td>
                <td className="px-3 py-3">
                  <span className="block h-7 border-b border-grafito" />
                </td>
                <td className="px-3 py-3">
                  <span className="block h-7 border-b border-gris-texto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HojaConteoPage() {
  const { usuario } = useAuth();
  const opciones = useQuery({ queryKey: ['inventario', 'opciones'], queryFn: getOpcionesEntrada });
  const panaderia = useQuery({ queryKey: ['mi-panaderia', usuario?.id], queryFn: getMiPanaderia, enabled: !!usuario, staleTime: 5 * 60 * 1000 });

  const materias = opciones.data?.materias ?? [];
  const porVencer = materias.filter((m) => m.criterio_rotacion === 'FEFO').sort(porNombre);
  const resto = materias.filter((m) => m.criterio_rotacion !== 'FEFO').sort(porNombre);
  const hoy = opciones.data?.fecha ?? '';

  return (
    <div className="ficha-impresion flex flex-col gap-4">
      <div className="hidden print:block">
        <p className="text-xs font-semibold uppercase tracking-wider text-gris-texto">{panaderia.data?.nombre ?? ''}</p>
        <h1 className="font-display text-2xl font-semibold text-azul-noche">Hoja de conteo físico inicial</h1>
        <div className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-4 whitespace-nowrap text-sm text-grafito">
          <p>Fecha del conteo: {hoy ? formatoFecha(hoy) : ''}</p>
          <p>Contó: ______________________</p>
          <p>Revisó: _____________________</p>
        </div>
      </div>

      <PageHeader
        ocultarAlImprimir
        titulo="Hoja de conteo"
        subtitulo="Imprímela, cuenta la bodega con lapicero y luego digita los datos en Carga inicial."
        acciones={
          <>
            {materias.length > 0 && <BotonImprimir etiqueta="Imprimir hoja" />}
            <Link to="/inventario/carga-inicial" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-grafico-neutro px-4 text-sm font-semibold text-white transition-colors hover:bg-azul-noche print:hidden">
              <ArrowLeft size={16} aria-hidden="true" />
              Carga inicial
            </Link>
          </>
        }
      />

      {opciones.isLoading && <LoadingState />}
      {opciones.isError && <ErrorState mensaje="No se pudieron cargar los insumos." onReintentar={() => opciones.refetch()} />}

      {opciones.data && (
        <>
          <div className="print:hidden">
            <Alert variant="info">
              Cuenta cada insumo en la presentación que dice «Se cuenta en» (un bulto cerrado = 1; uno abierto, escribe la
              fracción, por ejemplo 0,5). Si un insumo tiene varias presentaciones, anótalo en observaciones. Deja en blanco lo que
              no haya. En los insumos por vencimiento escribe la fecha del empaque que vence primero.
            </Alert>
          </div>

          <Tabla
            titulo="Insumos por vencimiento"
            nota="Lácteos, huevos, levadura y similares. La fecha de vencimiento es obligatoria: revisa el empaque más próximo a vencer."
            materias={porVencer}
            pideFecha
          />
          <Tabla titulo="Demás insumos" nota="La fecha solo se anota si el empaque la trae." materias={resto} pideFecha={false} nuevaHoja />
        </>
      )}
    </div>
  );
}
