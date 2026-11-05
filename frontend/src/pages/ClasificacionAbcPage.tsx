import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Alert } from '../components/ui/Alert';
import { getClasificacionAbc } from '../services/abcService';
import { ParetoAbc } from '../features/abc/ParetoAbc';
import type { ClaseAbc, FuenteAbc, ItemAbc } from '../types/abc.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-critico-fondo text-critico-texto',
  B: 'bg-atencion-fondo text-atencion-texto',
  C: 'bg-arena text-gris-texto',
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
  { key: 'nombre', encabezado: 'Insumo', render: (i) => <span className="font-medium text-grafito">{i.nombre}</span> },
  { key: 'demanda', encabezado: 'Demanda anual', render: (i) => `${numero.format(i.demanda_anual_kg)} kg` },
  { key: 'costo', encabezado: 'Costo por kg', render: (i) => pesos0.format(i.costo_por_kg) },
  { key: 'valor', encabezado: 'Valor anual', render: (i) => pesos0.format(i.valor_anual) },
  { key: 'pct', encabezado: '% del valor', render: (i) => `${numero.format(i.porcentaje)} %` },
  { key: 'acum', encabezado: '% acumulado', render: (i) => `${numero.format(i.porcentaje_acumulado)} %` },
];

export function ClasificacionAbcPage() {
  const [fuente, setFuente] = useState<FuenteAbc>('estimada');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clasificacion-abc', fuente],
    queryFn: () => getClasificacionAbc(fuente),
  });
  const esReal = data?.fuente === 'real';

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6">
        <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Clasificación ABC</h1>
        <p className="mt-1 text-sm text-niebla">
          Insumos ordenados por valor anual de consumo (demanda × costo)
        </p>
      </div>

      <div role="group" aria-label="Fuente de la demanda" className="inline-flex w-fit rounded-md border border-linea bg-tabla p-0.5 text-sm">
        {(
          [
            ['estimada', 'Demanda estimada'],
            ['real', 'Consumo real'],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={fuente === valor}
            onClick={() => setFuente(valor)}
            className={`min-h-[40px] rounded px-3 py-1.5 font-medium ${
              fuente === valor ? 'bg-terracota text-white' : 'text-gris-texto hover:bg-arena'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {data && (
        <>
          {data.insumos_sin_costo.length > 0 && (
            <Alert variant="warning">
              {data.insumos_sin_costo.length === 1
                ? '1 insumo no tiene un precio que cuente'
                : `${data.insumos_sin_costo.length} insumos no tienen un precio que cuente`}
              : {data.insumos_sin_costo.map((i) => i.nombre).join(', ')}. Entran con valor 0 y quedan en clase C, así que
              esta clasificación puede estar subestimada. Registra su precio en Materias primas → Precios.
            </Alert>
          )}

          {data.intermedios_sin_receta.length > 0 && (
            <Alert variant="warning">
              {data.intermedios_sin_receta.length === 1
                ? '1 producto intermedio no tiene receta vigente'
                : `${data.intermedios_sin_receta.length} productos intermedios no tienen receta vigente`}
              : {data.intermedios_sin_receta.map((i) => i.nombre).join(', ')}. Sin receta no se puede repartir su consumo entre
              los insumos, así que el costo de los productos que lo usan queda incompleto y el ABC puede estar subestimado.
              Crea su fórmula en Formulaciones.
            </Alert>
          )}

          {esReal && data.datos_insuficientes && (
            <Alert variant="warning">
              Todavía no hay insumos con al menos {data.supuestos.semanas_minimas_consumo_real ?? 4} semanas de consumo
              registrado en producciones, así que no se puede clasificar con consumo real. El sistema no estima ese
              consumo: sigue usando la pestaña «Demanda estimada» mientras tanto.
            </Alert>
          )}

          {esReal && (data.insumos_sin_consumo_real?.length ?? 0) > 0 && (
            <Alert variant="warning">
              <p>
                {data.insumos_sin_consumo_real!.length === 1
                  ? '1 insumo no entra'
                  : `${data.insumos_sin_consumo_real!.length} insumos no entran`}{' '}
                porque aún no tienen {data.supuestos.semanas_minimas_consumo_real ?? 4} semanas de consumo real:
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer font-medium">Ver cuáles</summary>
                <ul className="mt-1 list-disc pl-5">
                  {data.insumos_sin_consumo_real!.map((i) => (
                    <li key={i.codigo}>
                      {i.nombre} ({i.semanas_observadas} {i.semanas_observadas === 1 ? 'semana' : 'semanas'})
                    </li>
                  ))}
                </ul>
              </details>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {data.resumen.map((r) => (
              <div key={r.clase} className="rounded-lg border border-linea bg-tabla p-4">
                <div className="flex items-center gap-2">
                  <Insignia clase={r.clase} />
                  <p className="text-sm font-semibold text-grafito">Clase {r.clase}</p>
                </div>
                <p className="mt-2 text-xl font-semibold text-grafito">{numero.format(r.porcentaje)} % del valor</p>
                <p className="text-sm text-gris-texto">
                  {r.insumos} insumos · {pesos0.format(r.valor_anual)} al año
                </p>
              </div>
            ))}
          </div>

          {!data.datos_insuficientes && data.items.length > 0 && <ParetoAbc datos={data} />}

          <div className="rounded-md border border-[#c6d3de] bg-info-fondo px-4 py-3 text-sm text-pizarra">
            {esReal
              ? `Demanda calculada con lo que realmente se gastó al producir (promedio semanal × ${data.supuestos.semanas_al_anio} semanas), solo para insumos con al menos ${data.supuestos.semanas_minimas_consumo_real ?? 4} semanas de consumo registrado.`
              : `Demanda estimada a partir de las formulaciones, con ${data.supuestos.lotes_por_semana_por_defecto} lotes por semana por producto y ${data.supuestos.semanas_al_anio} semanas al año. Cuando haya consumo real suficiente, compárala en la pestaña «Consumo real».`}{' '}
            Regla de clasificación: un insumo es clase A si el acumulado previo es menor a{' '}
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