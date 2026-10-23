import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../features/auth/useAuth';
import { MateriaPrimaForm } from '../features/materias-primas/MateriaPrimaForm';
import { PanelPrecios } from '../features/precios/PanelPrecios';
import {
  editarMateriaPrima,
  getCatalogosMateriaPrima,
  getMateriasPrimas,
  getMateriasPrimasConInactivas,
} from '../services/materiasPrimasService';
import { mensajeDeError } from '../services/errores';
import type { MateriaPrima } from '../types/materiaPrima.types';

const ROLES_GESTION = ['administrador', 'superadministrador'];

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

interface AccionesFila {
  onEditar: (m: MateriaPrima) => void;
  onPrecios: (m: MateriaPrima) => void;
  onDesactivar: (m: MateriaPrima) => void;
  onReactivar: (m: MateriaPrima) => void;
  ocupado: boolean;
}

function crearColumnas(verPrecios: boolean, acciones: AccionesFila | null): ColumnaTabla<MateriaPrima>[] {
  const base: ColumnaTabla<MateriaPrima>[] = [
    { key: 'codigo', encabezado: 'Código', render: (m) => m.codigo },
    {
      key: 'nombre',
      encabezado: 'Materia prima',
      render: (m) => (
        <span className={`font-medium ${m.activa ? 'text-gray-900' : 'text-gray-400'}`}>
          {m.nombre}
          {!m.activa && (
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">Inactiva</span>
          )}
        </span>
      ),
    },
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

  const columnas: ColumnaTabla<MateriaPrima>[] = verPrecios
    ? [
        ...base,
        {
          key: 'costo',
          encabezado: 'Costo por unidad base',
          render: (m) => {
            const costo = m.presentaciones[0]?.costo_por_unidad_base;
            return costo == null ? '—' : `${formatoCosto.format(costo)} / ${m.unidad}`;
          },
        },
      ]
    : base;

  if (!acciones) return columnas;

  return [
    ...columnas,
    {
      key: 'acciones',
      encabezado: 'Acciones',
      render: (m) => (
        <div className="flex gap-3 whitespace-nowrap text-sm">
          <button
            type="button"
            className="font-medium text-blue-600 hover:underline disabled:opacity-50"
            disabled={acciones.ocupado}
            onClick={() => acciones.onEditar(m)}
          >
            Editar
          </button>
          <button
            type="button"
            className="font-medium text-gray-700 hover:underline disabled:opacity-50"
            disabled={acciones.ocupado}
            onClick={() => acciones.onPrecios(m)}
          >
            Precios
          </button>
          {m.activa ? (
            <button
              type="button"
              className="font-medium text-red-600 hover:underline disabled:opacity-50"
              disabled={acciones.ocupado}
              onClick={() => acciones.onDesactivar(m)}
            >
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              className="font-medium text-green-700 hover:underline disabled:opacity-50"
              disabled={acciones.ocupado}
              onClick={() => acciones.onReactivar(m)}
            >
              Reactivar
            </button>
          )}
        </div>
      ),
    },
  ];
}

export function MateriasPrimasPage() {
  const { usuario } = useAuth();
  const puedeGestionar = ROLES_GESTION.includes(usuario?.rol ?? '');
  const queryClient = useQueryClient();

  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  // 'nueva' abre el formulario vacío; una materia prima lo abre para editarla
  const [formulario, setFormulario] = useState<'nueva' | MateriaPrima | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<MateriaPrima | null>(null);
  const [conPrecios, setConPrecios] = useState<MateriaPrima | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['materias-primas', puedeGestionar ? 'gestion' : 'activas'],
    queryFn: puedeGestionar ? getMateriasPrimasConInactivas : getMateriasPrimas,
  });

  const catalogos = useQuery({
    queryKey: ['materias-primas-catalogos'],
    queryFn: getCatalogosMateriaPrima,
    enabled: puedeGestionar,
    staleTime: 5 * 60 * 1000,
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) => editarMateriaPrima(id, { activa }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['materias-primas'] }),
        queryClient.invalidateQueries({ queryKey: ['formulaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['clasificacion-abc'] }),
      ]);
    },
  });

  function reactivar(m: MateriaPrima) {
    setErrorAccion(null);
    cambiarEstado.mutate(
      { id: m.id, activa: true },
      { onError: (e) => setErrorAccion(mensajeDeError(e, 'No se pudo reactivar la materia prima.')) },
    );
  }

  function confirmarDesactivar() {
    if (!porDesactivar) return;
    cambiarEstado.mutate(
      { id: porDesactivar.id, activa: false },
      { onSuccess: () => setPorDesactivar(null) },
    );
  }

  // Si el servidor no envía precios (rol operario), se ocultan esas columnas
  const verPrecios = (data ?? []).some((m) => m.presentaciones.some((p) => p.precio !== null));
  const columnas = useMemo(
    () =>
      crearColumnas(
        verPrecios,
        puedeGestionar
          ? {
              onEditar: (m) => {
                setErrorAccion(null);
                setFormulario(m);
              },
              onPrecios: (m) => {
                setErrorAccion(null);
                setConPrecios(m);
              },
              onDesactivar: (m) => {
                cambiarEstado.reset();
                setPorDesactivar(m);
              },
              onReactivar: reactivar,
              ocupado: cambiarEstado.isPending,
            }
          : null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verPrecios, puedeGestionar, cambiarEstado.isPending],
  );

  const visibles = useMemo(
    () => (mostrarInactivas ? (data ?? []) : (data ?? []).filter((m) => m.activa)),
    [data, mostrarInactivas],
  );

  const categorias = useMemo(
    () => Array.from(new Set(visibles.map((m) => m.categoria).filter((c): c is string => !!c))).sort(),
    [visibles],
  );

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return visibles.filter(
      (m) =>
        (!categoria || m.categoria === categoria) &&
        (!texto || m.nombre.toLowerCase().includes(texto) || m.codigo.toLowerCase().includes(texto)),
    );
  }, [visibles, busqueda, categoria]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Materias primas</h1>
          <p className="text-sm text-gray-500">
            {data ? `${filtradas.length} de ${visibles.length} materias primas` : 'Catálogo de insumos de la panadería'}
          </p>
        </div>
        {puedeGestionar && (
          <Button type="button" onClick={() => setFormulario('nueva')} disabled={!catalogos.data}>
            Nueva materia prima
          </Button>
        )}
      </div>

      {errorAccion && <Alert variant="error">{errorAccion}</Alert>}
      {puedeGestionar && catalogos.isError && (
        <Alert variant="warning">
          No se pudieron cargar las unidades y categorías, por eso no se puede crear ni editar.{' '}
          <button type="button" className="font-medium underline" onClick={() => catalogos.refetch()}>
            Reintentar
          </button>
        </Alert>
      )}

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
        {puedeGestionar && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={mostrarInactivas}
              onChange={(e) => setMostrarInactivas(e.target.checked)}
            />
            Mostrar inactivas
          </label>
        )}
      </div>

      <DataTable
        columnas={columnas}
        datos={filtradas}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(m) => m.id}
      />

      {puedeGestionar && catalogos.data && (
        <Modal
          isOpen={formulario !== null}
          onClose={() => setFormulario(null)}
          title={formulario === 'nueva' || formulario === null ? 'Nueva materia prima' : 'Editar materia prima'}
        >
          {formulario !== null && (
            <MateriaPrimaForm
              key={formulario === 'nueva' ? 'nueva' : formulario.id}
              materia={formulario === 'nueva' ? null : formulario}
              catalogos={catalogos.data}
              onTerminar={() => setFormulario(null)}
            />
          )}
        </Modal>
      )}

      {puedeGestionar && (
        <Modal
          isOpen={conPrecios !== null}
          onClose={() => setConPrecios(null)}
          title={conPrecios ? `Precios · ${conPrecios.nombre}` : 'Precios'}
          size="lg"
        >
          {conPrecios && <PanelPrecios key={conPrecios.id} materiaId={conPrecios.id} />}
        </Modal>
      )}

      <Modal isOpen={porDesactivar !== null} onClose={() => setPorDesactivar(null)} title="Desactivar materia prima">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-700">
            ¿Desactivar <span className="font-medium">{porDesactivar?.nombre}</span>? Dejará de aparecer en el catálogo.
            Podrás reactivarla cuando quieras.
          </p>
          {cambiarEstado.isError && (
            <Alert variant="error">{mensajeDeError(cambiarEstado.error, 'No se pudo desactivar la materia prima.')}</Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPorDesactivar(null)} disabled={cambiarEstado.isPending}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" isLoading={cambiarEstado.isPending} onClick={confirmarDesactivar}>
              Desactivar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}