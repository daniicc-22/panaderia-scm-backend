import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PanaderiaForm } from '../features/panaderias/PanaderiaForm';
import { mensajeDeError } from '../services/errores';
import { cambiarEstadoPanaderia, eliminarPanaderia, getPanaderias } from '../services/panaderiasService';
import type { PanaderiaCreada, PanaderiaResumen } from '../types/panaderia.types';

interface Acciones {
  ocupado: boolean;
  onCambiarEstado: (p: PanaderiaResumen, activa: boolean) => void;
  onEliminar: (p: PanaderiaResumen) => void;
}

function crearColumnas(a: Acciones): ColumnaTabla<PanaderiaResumen>[] {
  return [
    {
      key: 'nombre',
      encabezado: 'Panadería',
      render: (p) => <span className={`font-medium ${p.activa ? 'text-gray-900' : 'text-gray-400'}`}>{p.nombre}</span>,
    },
    { key: 'ciudad', encabezado: 'Ciudad', render: (p) => p.ciudad },
    { key: 'telefono', encabezado: 'Teléfono', render: (p) => p.telefono ?? '—' },
    { key: 'direccion', encabezado: 'Dirección', render: (p) => p.direccion ?? '—' },
    { key: 'usuarios', encabezado: 'Usuarios activos', render: (p) => p.usuarios_activos },
    { key: 'estado', encabezado: 'Estado', render: (p) => <Badge color={p.activa ? 'green' : 'gray'}>{p.activa ? 'Activa' : 'Inactiva'}</Badge> },
    {
      key: 'acciones',
      encabezado: 'Acciones',
      render: (p) => (
        <div className="flex gap-3 whitespace-nowrap text-sm">
          {p.activa ? (
            <button type="button" className="font-medium text-blue-600 hover:underline disabled:opacity-50" disabled={a.ocupado} onClick={() => a.onCambiarEstado(p, false)}>
              Desactivar
            </button>
          ) : (
            <button type="button" className="font-medium text-green-700 hover:underline disabled:opacity-50" disabled={a.ocupado} onClick={() => a.onCambiarEstado(p, true)}>
              Reactivar
            </button>
          )}
          <button type="button" className="font-medium text-red-600 hover:underline disabled:opacity-50" disabled={a.ocupado} onClick={() => a.onEliminar(p)}>
            Eliminar
          </button>
        </div>
      ),
    },
  ];
}

export function PanaderiasPage() {
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState<PanaderiaCreada | null>(null);
  const [porEliminar, setPorEliminar] = useState<PanaderiaResumen | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['panaderias'], queryFn: getPanaderias });

  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['panaderias'] }),
      queryClient.invalidateQueries({ queryKey: ['usuarios-panaderias'] }),
      queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
    ]);

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) => cambiarEstadoPanaderia(id, activa),
    onSuccess: refrescar,
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarPanaderia(id),
    onSuccess: refrescar,
  });

  const cols = useMemo(
    () =>
      crearColumnas({
        ocupado: cambiarEstado.isPending || eliminar.isPending,
        onCambiarEstado: (p, activa) => {
          setAviso(null);
          setCreada(null);
          cambiarEstado.mutate(
            { id: p.id, activa },
            {
              onSuccess: () =>
                setAviso({ tipo: 'success', texto: activa ? `${p.nombre} está activa de nuevo.` : `${p.nombre} quedó inactiva: sus usuarios ya no pueden entrar. Sus datos se conservan.` }),
              onError: (e) => setAviso({ tipo: 'error', texto: mensajeDeError(e, 'No se pudo cambiar el estado.') }),
            },
          );
        },
        onEliminar: (p) => {
          setAviso(null);
          setCreada(null);
          eliminar.reset();
          setConfirmacion('');
          setPorEliminar(p);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cambiarEstado.isPending, eliminar.isPending],
  );

  function confirmarEliminar() {
    if (!porEliminar) return;
    const p = porEliminar;
    eliminar.mutate(p.id, {
      onSuccess: () => {
        setPorEliminar(null);
        setAviso({ tipo: 'success', texto: `${p.nombre} se eliminó junto con sus usuarios.` });
      },
    });
  }

  const coincide = porEliminar !== null && confirmacion.trim().toLowerCase() === porEliminar.nombre.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Panaderías</h1>
          <p className="text-sm text-gray-500">
            {data ? `${data.length} ${data.length === 1 ? 'panadería' : 'panaderías'}` : 'Las panaderías que usan el sistema'}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreada(null);
            setAviso(null);
            setCreando(true);
          }}
        >
          Nueva panadería
        </Button>
      </div>

      {aviso && <Alert variant={aviso.tipo}>{aviso.texto}</Alert>}

      {creada && (
        <Alert variant="success">
          <p className="font-medium">{creada.nombre} quedó creada.</p>
          <p className="mt-1">
            Pueden entrar con su usuario y la contraseña inicial que les diste:{' '}
            {creada.usuarios.map((u) => `${u.nombre_usuario} (${u.rol})`).join(', ')}. Solo verán esta panadería y tendrán que cambiar la contraseña al entrar.
          </p>
        </Alert>
      )}

      <DataTable columnas={cols} datos={data} cargando={isLoading} error={isError} onReintentar={() => refetch()} obtenerKeyFila={(p) => p.id} />

      <Modal isOpen={creando} onClose={() => setCreando(false)} title="Nueva panadería">
        {creando && (
          <PanaderiaForm
            onTerminar={(c) => {
              setCreando(false);
              setCreada(c);
            }}
          />
        )}
      </Modal>

      <Modal isOpen={porEliminar !== null} onClose={() => setPorEliminar(null)} title="Eliminar panadería">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-700">
            Vas a eliminar <span className="font-medium">{porEliminar?.nombre}</span> y a los usuarios que solo pertenecen a ella. No se puede deshacer.
          </p>
          <Alert variant="warning">
            Solo se puede eliminar si la panadería no tiene datos de trabajo (inventario, producción, proveedores u otros). Si ya los tiene, usa Desactivar: sus
            usuarios no podrán entrar y los datos se conservan.
          </Alert>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Escribe el nombre de la panadería para confirmar
            <input
              type="text"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="off"
              placeholder={porEliminar?.nombre}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {eliminar.isError && <Alert variant="error">{mensajeDeError(eliminar.error, 'No se pudo eliminar la panadería.')}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPorEliminar(null)} disabled={eliminar.isPending}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" disabled={!coincide} isLoading={eliminar.isPending} onClick={confirmarEliminar}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
