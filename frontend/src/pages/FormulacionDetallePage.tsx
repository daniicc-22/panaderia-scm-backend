import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EditorVersion } from '../features/formulaciones/EditorVersion';
import { HistorialVersiones } from '../features/formulaciones/HistorialVersiones';
import { useAuth } from '../features/auth/AuthContext';
import { cambiarEstadoProducto, getFormulacion } from '../services/formulacionesService';
import { mensajeDeError } from '../services/errores';
import type { IngredienteFormulacion } from '../types/formulacion.types';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const ROLES_GESTION = ['administrador', 'superadministrador'];

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{etiqueta}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{valor}</p>
    </div>
  );
}

export function FormulacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useAuth();
  const puedeGestionar = ROLES_GESTION.includes(usuario?.rol ?? '');
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulacion', id],
    queryFn: () => getFormulacion(id as string),
    enabled: !!id,
  });

  const verCostos = data?.costo_lote != null;

  const cambiarEstado = useMutation({
    mutationFn: (activo: boolean) => cambiarEstadoProducto(id as string, activo),
    onSuccess: async () => {
      // La lista, el detalle y el ABC dependen de qué productos estén activos
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['formulaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['formulacion'] }),
        queryClient.invalidateQueries({ queryKey: ['clasificacion-abc'] }),
      ]);
    },
  });

  function reactivar() {
    if (!data) return;
    setAviso(null);
    cambiarEstado.mutate(true, {
      onSuccess: () =>
        setAviso({ tipo: 'success', texto: `${data.producto} está activo de nuevo: vuelve a la lista y al ABC.` }),
      onError: (e) => setAviso({ tipo: 'error', texto: mensajeDeError(e, 'No se pudo reactivar el producto.') }),
    });
  }

  function confirmarBaja() {
    if (!data) return;
    cambiarEstado.mutate(false, {
      onSuccess: () => {
        setConfirmandoBaja(false);
        setAviso({
          tipo: 'success',
          texto: `${data.producto} se dio de baja. Sale de la lista y del ABC; sus versiones se conservan.`,
        });
      },
    });
  }

  const columnas: ColumnaTabla<IngredienteFormulacion>[] = [
    {
      key: 'nombre',
      encabezado: 'Ingrediente',
      render: (i) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{i.nombre}</span>
          {i.tipo === 'producto_intermedio' && <span className="text-xs text-gray-500">Producto intermedio</span>}
        </div>
      ),
    },
    { key: 'cantidad', encabezado: 'Cantidad', render: (i) => `${numero.format(i.cantidad)} ${i.unidad}` },
    ...(verCostos
      ? ([
          {
            key: 'costo_unidad',
            encabezado: 'Costo por unidad',
            render: (i) => (i.costo_por_unidad == null ? '—' : pesos2.format(i.costo_por_unidad)),
          },
          {
            key: 'costo',
            encabezado: 'Costo',
            render: (i) => (i.costo == null ? 'Sin costo' : pesos0.format(i.costo)),
          },
          {
            key: 'participacion',
            encabezado: '% del costo',
            render: (i) =>
              i.costo == null || !data?.costo_lote ? '—' : `${numero.format((i.costo / data.costo_lote) * 100)} %`,
          },
        ] as ColumnaTabla<IngredienteFormulacion>[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link to="/formulaciones" className="text-sm font-medium text-blue-600 hover:underline">
        ← Volver a formulaciones
      </Link>

      {data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {data.producto}
                {!data.producto_activo && (
                  <span className="ml-3 rounded bg-gray-100 px-2 py-0.5 align-middle text-sm font-normal text-gray-600">
                    Dado de baja
                  </span>
                )}
              </h1>
              <p className="text-sm text-gray-500">
                Versión {data.version} · {data.activa ? 'vigente' : 'anterior'} desde {fechaCorta(data.vigente_desde)}
                {data.vigente_hasta ? ` hasta ${fechaCorta(data.vigente_hasta)}` : ''}
              </p>
            </div>
            {puedeGestionar && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setEditando(true)}>
                  {data.activa ? 'Editar formulación' : 'Usar como base'}
                </Button>
                {data.producto_activo ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => {
                      cambiarEstado.reset();
                      setAviso(null);
                      setConfirmandoBaja(true);
                    }}
                  >
                    Dar de baja
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" isLoading={cambiarEstado.isPending} onClick={reactivar}>
                    Reactivar producto
                  </Button>
                )}
              </div>
            )}
          </div>

          {aviso && <Alert variant={aviso.tipo}>{aviso.texto}</Alert>}

          {!data.activa && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Estás viendo una versión anterior. No se usa en la producción ni en el ABC; el costo se calcula con los
              precios de hoy.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato etiqueta="Rinde" valor={data.rendimiento == null ? '—' : `${data.rendimiento} unidades`} />
            <Dato etiqueta="Peso del lote" valor={`${numero.format(data.peso_lote_g / 1000)} kg`} />
            {verCostos && data.costo_lote != null && (
              <Dato etiqueta="Costo por lote" valor={pesos0.format(data.costo_lote)} />
            )}
            {verCostos && (
              <Dato etiqueta="Costo por unidad" valor={data.costo_unidad == null ? '—' : pesos2.format(data.costo_unidad)} />
            )}
          </div>

          {verCostos && data.costo_incompleto && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Esta formulación incluye un ingrediente sin costo (producto intermedio o materia prima sin precio). El costo total es parcial.
            </div>
          )}
        </>
      )}

      <DataTable
        columnas={columnas}
        datos={data?.ingredientes ?? []}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(i) => `${i.tipo}-${i.codigo ?? i.nombre}`}
      />

      {puedeGestionar && id && <HistorialVersiones formulacionId={id} />}

      {puedeGestionar && data && (
        <Modal isOpen={confirmandoBaja} onClose={() => setConfirmandoBaja(false)} title="Dar de baja el producto">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-700">
              ¿Dar de baja <span className="font-medium">{data.producto}</span>?
            </p>
            <Alert variant="warning">
              Dejará de salir en la lista de formulaciones y de contar en la demanda del ABC. Sus versiones y su historial
              se conservan, y podrás reactivarlo cuando quieras.
            </Alert>
            {cambiarEstado.isError && (
              <Alert variant="error">{mensajeDeError(cambiarEstado.error, 'No se pudo dar de baja el producto.')}</Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmandoBaja(false)} disabled={cambiarEstado.isPending}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" isLoading={cambiarEstado.isPending} onClick={confirmarBaja}>
                Dar de baja
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {puedeGestionar && data && (
        <Modal
          isOpen={editando}
          onClose={() => setEditando(false)}
          size="lg"
          title={data.activa ? `Editar ${data.producto}` : `${data.producto}: usar la v${data.version} como base`}
        >
          {editando && <EditorVersion key={data.id} base={data} onTerminar={() => setEditando(false)} />}
        </Modal>
      )}
    </div>
  );
}