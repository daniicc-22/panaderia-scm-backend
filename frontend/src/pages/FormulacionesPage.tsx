import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { getFormulaciones } from '../services/formulacionesService';
import type { FormulacionResumen } from '../types/formulacion.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

function crearColumnas(verCostos: boolean): ColumnaTabla<FormulacionResumen>[] {
  const base: ColumnaTabla<FormulacionResumen>[] = [
    {
      key: 'producto',
      encabezado: 'Producto',
      render: (f) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{f.producto}</span>
          {f.es_intermedio && <span className="text-xs text-gray-500">Producto intermedio</span>}
        </div>
      ),
    },
    { key: 'rendimiento', encabezado: 'Rinde (unidades)', render: (f) => f.rendimiento ?? '—' },
    { key: 'peso', encabezado: 'Peso del lote', render: (f) => `${kg.format(f.peso_lote_g / 1000)} kg` },
    { key: 'ingredientes', encabezado: 'Ingredientes', render: (f) => f.ingredientes },
  ];

  const costos: ColumnaTabla<FormulacionResumen>[] = verCostos
    ? [
        {
          key: 'costo_lote',
          encabezado: 'Costo por lote',
          render: (f) => (
            <div className="flex flex-col">
              <span>{f.costo_lote == null ? '—' : pesos0.format(f.costo_lote)}</span>
              {f.costo_incompleto && <span className="text-xs text-amber-600">Costo incompleto</span>}
            </div>
          ),
        },
        {
          key: 'costo_unidad',
          encabezado: 'Costo por unidad',
          render: (f) => (f.costo_unidad == null ? '—' : pesos2.format(f.costo_unidad)),
        },
      ]
    : [];

  const detalle: ColumnaTabla<FormulacionResumen> = {
    key: 'detalle',
    encabezado: '',
    render: (f) => (
      <Link to={`/formulaciones/${f.id}`} className="text-sm font-medium text-blue-600 hover:underline">
        Ver detalle
      </Link>
    ),
  };

  return [...base, ...costos, detalle];
}

export function FormulacionesPage() {
  const [busqueda, setBusqueda] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulaciones'],
    queryFn: getFormulaciones,
  });

  const verCostos = (data ?? []).some((f) => f.costo_lote !== null);
  const columnas = useMemo(() => crearColumnas(verCostos), [verCostos]);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data ?? []).filter((f) => !texto || f.producto.toLowerCase().includes(texto));
  }, [data, busqueda]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Formulaciones</h1>
        <p className="text-sm text-gray-500">
          {data ? `${filtradas.length} de ${data.length} recetas estandarizadas` : 'Recetas estandarizadas'}
        </p>
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
      />

      <DataTable
        columnas={columnas}
        datos={filtradas}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(f) => f.id}
      />
    </div>
  );
}