import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../../components/tables/DataTable';
import { getVersiones } from '../../services/formulacionesService';
import type { VersionFormulacion } from '../../types/formulacion.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "2026-10-21" -> "21/10/2026" sin pasar por Date (evita el desfase de zona horaria)
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

interface Props {
  // Formulación que se está viendo: sirve para pedir el historial y para marcar su fila
  formulacionId: string;
}

export function HistorialVersiones({ formulacionId }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulacion-versiones', formulacionId],
    queryFn: () => getVersiones(formulacionId),
  });

  const columnas: ColumnaTabla<VersionFormulacion>[] = [
    {
      key: 'version',
      encabezado: 'Versión',
      render: (v) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-grafito">v{v.version}</span>
          {v.activa ? (
            <span className="rounded-sm bg-exito-fondo px-1.5 py-0.5 text-xs text-exito-texto">Vigente</span>
          ) : (
            <span className="rounded-sm bg-arena px-1.5 py-0.5 text-xs text-gris-texto">Anterior</span>
          )}
          {v.id === formulacionId && <span className="rounded-sm bg-info-fondo px-1.5 py-0.5 text-xs text-pizarra">Estás aquí</span>}
        </div>
      ),
    },
    {
      key: 'vigencia',
      encabezado: 'Vigencia',
      render: (v) => `${fechaCorta(v.vigente_desde)} → ${v.vigente_hasta ? fechaCorta(v.vigente_hasta) : 'hoy'}`,
    },
    { key: 'rendimiento', encabezado: 'Rinde', render: (v) => v.rendimiento ?? '—' },
    { key: 'ingredientes', encabezado: 'Ingredientes', render: (v) => v.ingredientes },
    {
      key: 'costo_lote',
      encabezado: 'Costo por lote',
      render: (v) => (
        <div className="flex flex-col">
          <span>{pesos0.format(v.costo_lote)}</span>
          {v.costo_incompleto && <span className="text-xs text-atencion-texto">Costo incompleto</span>}
        </div>
      ),
    },
    { key: 'costo_unidad', encabezado: 'Costo por unidad', render: (v) => (v.costo_unidad == null ? '—' : pesos2.format(v.costo_unidad)) },
    { key: 'aprobado', encabezado: 'Aprobó', render: (v) => v.aprobado_por ?? '—' },
    {
      key: 'ver',
      encabezado: '',
      render: (v) =>
        v.id === formulacionId ? null : (
          <Link to={`/formulaciones/${v.id}`} className="text-sm font-medium text-pizarra hover:underline">
            Ver
          </Link>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-lg font-semibold text-grafito">Historial de versiones</h2>
        <p className="text-xs text-gris-texto">
          Las versiones anteriores no se modifican. El costo de cada una se calcula con los precios de hoy.
        </p>
      </div>
      <DataTable
        columnas={columnas}
        datos={data?.versiones}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(v) => v.id}
      />
    </section>
  );
}
