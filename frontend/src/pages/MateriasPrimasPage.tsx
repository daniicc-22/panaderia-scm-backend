import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { getMateriasPrimas } from '../services/materiasPrimasService';
import type { MateriaPrima } from '../types/materiaPrima.types';

const formatoPrecio = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formatoCosto = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function crearColumnas(verPrecios: boolean): ColumnaTabla<MateriaPrima>[] {
  const base: ColumnaTabla<MateriaPrima>[] = [
    { key: 'codigo', encabezado: 'Código', render: (m) => m.codigo },
    { key: 'nombre', encabezado: 'Materia prima', render: (m) => <span className="font-medium text-gray-900">{m.nombre}</span> },
    { key: 'categoria', encabezado: 'Categoría', render: (m) => m.categoria ?? '—' },
    {
      key: 'presentaciones',
      encabezado: verPrecios ? 'Presentación y precio' : 'Presentación',
      render: (m) =>
        m.presentaciones.length === 0 ? (
          '—'
        ) : (
          <div className="flex flex-col gap-0.5">
            {m.presentaciones.map((p) => (
              <span key={p.id}>
                {p.nombre}
                {verPrecios && p.precio != null ? ` · ${formatoPrecio.format(p.precio)}` : ''}
              </span>
            ))}
          </div>
        ),
    },
  ];

  if (!verPrecios) return base;

  return [
    ...base,
    {
      key: 'costo',
      encabezado: 'Costo por unidad base',
      render: (m) => {
        const costo = m.presentaciones[0]?.costo_por_unidad_base;
        return costo == null ? '—' : `${formatoCosto.format(costo)} / ${m.unidad}`;
      },
    },
  ];
}

export function MateriasPrimasPage() {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['materias-primas'],
    queryFn: getMateriasPrimas,
  });

  // Si el servidor no envía precios (rol operario), se ocultan esas columnas
  const verPrecios = (data ?? []).some((m) => m.presentaciones.some((p) => p.precio !== null));
  const columnas = useMemo(() => crearColumnas(verPrecios), [verPrecios]);

  const categorias = useMemo(
    () => Array.from(new Set((data ?? []).map((m) => m.categoria).filter((c): c is string => !!c))).sort(),
    [data],
  );

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data ?? []).filter(
      (m) =>
        (!categoria || m.categoria === categoria) &&
        (!texto || m.nombre.toLowerCase().includes(texto) || m.codigo.toLowerCase().includes(texto)),
    );
  }, [data, busqueda, categoria]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Materias primas</h1>
        <p className="text-sm text-gray-500">
          {data ? `${filtradas.length} de ${data.length} materias primas` : 'Catálogo de insumos de la panadería'}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columnas={columnas}
        datos={filtradas}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(m) => m.id}
      />
    </div>
  );
}