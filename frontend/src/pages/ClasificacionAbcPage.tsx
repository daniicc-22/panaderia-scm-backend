import { useQuery } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { getClasificacionAbc } from '../services/abcService';
import type { ClaseAbc, ItemAbc } from '../types/abc.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-red-100 text-red-700',
  B: 'bg-amber-100 text-amber-700',
  C: 'bg-gray-100 text-gray-600',
};

function Insignia({ clase }: { clase: ClaseAbc }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${COLOR_CLASE[clase]}`}>
      {clase}
    </span>
  );
}

const columnas: ColumnaTabla<ItemAbc>[] = [
  { key: 'clase', encabezado: 'Clase', render: (i) => <Insignia clase={i.clase} /> },
  { key: 'codigo', encabezado: 'Código', render: (i) => i.codigo },
  { key: 'nombre', encabezado: 'Insumo', render: (i) => <span className="font-medium text-gray-900">{i.nombre}</span> },
  { key: 'demanda', encabezado: 'Demanda anual', render: (i) => `${numero.format(i.demanda_anual_kg)} kg` },
  { key: 'costo', encabezado: 'Costo por kg', render: (i) => pesos0.format(i.costo_por_kg) },
  { key: 'valor', encabezado: 'Valor anual', render: (i) => pesos0.format(i.valor_anual) },
  { key: 'pct', encabezado: '% del valor', render: (i) => `${numero.format(i.porcentaje)} %` },
  { key: 'acum', encabezado: '% acumulado', render: (i) => `${numero.format(i.porcentaje_acumulado)} %` },
];

export function ClasificacionAbcPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clasificacion-abc'],
    queryFn: getClasificacionAbc,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Clasificación ABC</h1>
        <p className="text-sm text-gray-500">
          Insumos ordenados por valor anual de consumo (demanda × costo)
        </p>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {data.resumen.map((r) => (
              <div key={r.clase} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Insignia clase={r.clase} />
                  <p className="text-sm font-semibold text-gray-700">Clase {r.clase}</p>
                </div>
                <p className="mt-2 text-xl font-semibold text-gray-900">{numero.format(r.porcentaje)} % del valor</p>
                <p className="text-sm text-gray-500">
                  {r.insumos} insumos · {pesos0.format(r.valor_anual)} al año
                </p>
              </div>
            ))}
          </div>

                    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Demanda estimada a partir de las formulaciones, con {data.supuestos.lotes_por_semana_por_defecto} lotes por
            semana por producto y {data.supuestos.semanas_al_anio} semanas al año. Se recalibrará con el consumo real del
            piloto. Regla de clasificación: un insumo es clase A si el acumulado previo es menor a{' '}
            {data.supuestos.limites.A} %, clase B si es menor a {data.supuestos.limites.B} %, y clase C en los demás
            casos; así, el insumo que cruza el límite queda en la clase superior.
          </div>
        </>
      )}

      <DataTable
        columnas={columnas}
        datos={data?.items ?? []}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(i) => i.codigo}
      />
    </div>
  );
}