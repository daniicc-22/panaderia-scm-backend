import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EditorVersion } from '../features/formulaciones/EditorVersion';
import { useAuth } from '../features/auth/useAuth';
import { getFormulaciones, getFormulacionesConInactivos } from '../services/formulacionesService';
import type { FormulacionResumen } from '../types/formulacion.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const ROLES_GESTION = ['administrador', 'superadministrador'];

function crearColumnas(verCostos: boolean): ColumnaTabla<FormulacionResumen>[] {
  const base: ColumnaTabla<FormulacionResumen>[] = [
    {
      key: 'producto',
      encabezado: 'Producto',
      render: (f) => (
        <div className="flex flex-col">
          <span className={`font-medium ${f.producto_activo ? 'text-grafito' : 'text-gris-texto'}`}>
            {f.producto}
            {!f.producto_activo && (
              <span className="ml-2 rounded-sm bg-arena px-1.5 py-0.5 text-xs font-normal text-gris-texto">Dado de baja</span>
            )}
          </span>
          {f.es_intermedio && <span className="text-xs text-gris-texto">Producto intermedio</span>}
        </div>
      ),
    },
    { key: 'version', encabezado: 'Versión', render: (f) => `v${f.version}` },
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
              {f.costo_incompleto && <span className="text-xs text-atencion-texto">Costo incompleto</span>}
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
      <Link to={`/formulaciones/${f.id}`} className="text-sm font-medium text-pizarra hover:underline">
        Ver detalle
      </Link>
    ),
  };

  return [...base, ...costos, detalle];
}

export function FormulacionesPage() {
  const { usuario } = useAuth();
  const puedeGestionar = ROLES_GESTION.includes(usuario?.rol ?? '');
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const conInactivos = puedeGestionar && mostrarInactivos;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulaciones', conInactivos ? 'con-inactivos' : 'activos'],
    queryFn: conInactivos ? getFormulacionesConInactivos : getFormulaciones,
  });

  const verCostos = (data ?? []).some((f) => f.costo_lote !== null);
  const columnas = useMemo(() => crearColumnas(verCostos), [verCostos]);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data ?? []).filter((f) => !texto || f.producto.toLowerCase().includes(texto));
  }, [data, busqueda]);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Formulaciones</h1>
          <p className="mt-1 text-sm text-niebla">
            {data ? `${filtradas.length} de ${data.length} recetas estandarizadas` : 'Recetas estandarizadas'}
          </p>
        </div>
        {puedeGestionar && (
          <Button type="button" onClick={() => setCreando(true)}>
            Nuevo producto
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto"
          className="w-full rounded-md border border-borde-campo px-3 py-2 text-sm sm:max-w-xs"
        />
        {puedeGestionar && (
          <label className="flex items-center gap-2 text-sm text-grafito">
            <input type="checkbox" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
            Mostrar dados de baja
          </label>
        )}
      </div>

      <DataTable
        columnas={columnas}
        datos={filtradas}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(f) => f.id}
      />

      {puedeGestionar && (
        <Modal isOpen={creando} onClose={() => setCreando(false)} size="lg" title="Nuevo producto">
          {creando && <EditorVersion onTerminar={() => setCreando(false)} />}
        </Modal>
      )}
    </div>
  );
}