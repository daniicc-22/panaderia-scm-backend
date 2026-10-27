import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, type ColumnaTabla } from '../components/tables/DataTable';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { OfertasProveedor } from '../features/proveedores/OfertasProveedor';
import { ProveedorForm } from '../features/proveedores/ProveedorForm';
import { editarProveedor, getProveedores } from '../services/proveedoresService';
import { mensajeDeError } from '../services/errores';
import type { Proveedor } from '../types/proveedor.types';

const textoPrecios = (n: number) => (n === 1 ? '1 precio vigente' : `${n} precios vigentes`);

interface Acciones {
  onVerOferta: (p: Proveedor) => void;
  onEditar: (p: Proveedor) => void;
  onDesactivar: (p: Proveedor) => void;
  onReactivar: (p: Proveedor) => void;
  ocupado: boolean;
}

function crearColumnas(acciones: Acciones): ColumnaTabla<Proveedor>[] {
  return [
    {
      key: 'nombre',
      encabezado: 'Proveedor',
      render: (p) => (
        <span className={`font-medium ${p.activo ? 'text-gray-900' : 'text-gray-400'}`}>
          {p.nombre}
          {!p.activo && (
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">Inactivo</span>
          )}
          {p.alcance === 'grupo' && (
            <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">Del grupo</span>
          )}
        </span>
      ),
    },
    { key: 'contacto', encabezado: 'Contacto', render: (p) => p.contacto ?? '—' },
    { key: 'telefono', encabezado: 'Teléfono', render: (p) => p.telefono ?? '—' },
    { key: 'direccion', encabezado: 'Dirección', render: (p) => p.direccion ?? '—' },
    {
      key: 'precios',
      encabezado: 'Oferta y precios',
      render: (p) => (
        <button
          type="button"
          className="whitespace-nowrap font-medium text-blue-600 hover:underline"
          onClick={() => acciones.onVerOferta(p)}
        >
          {p.ofertas_vigentes === 0 ? 'Ver oferta' : `Ver oferta (${p.ofertas_vigentes})`}
        </button>
      ),
    },
    {
      key: 'acciones',
      encabezado: 'Acciones',
      render: (p) =>
        p.alcance === 'grupo' ? (
          <span className="text-xs text-gray-400">Solo consulta</span>
        ) : (
          <div className="flex gap-3 whitespace-nowrap text-sm">
            <button
              type="button"
              className="font-medium text-blue-600 hover:underline disabled:opacity-50"
              disabled={acciones.ocupado}
              onClick={() => acciones.onEditar(p)}
            >
              Editar
            </button>
            {p.activo ? (
              <button
                type="button"
                className="font-medium text-red-600 hover:underline disabled:opacity-50"
                disabled={acciones.ocupado}
                onClick={() => acciones.onDesactivar(p)}
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                className="font-medium text-green-700 hover:underline disabled:opacity-50"
                disabled={acciones.ocupado}
                onClick={() => acciones.onReactivar(p)}
              >
                Reactivar
              </button>
            )}
          </div>
        ),
    },
  ];
}

export function ProveedoresPage() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  // 'nuevo' abre el formulario vacío; un proveedor lo abre para editarlo
  const [formulario, setFormulario] = useState<'nuevo' | Proveedor | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Proveedor | null>(null);
  const [verOferta, setVerOferta] = useState<Proveedor | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['proveedores'], queryFn: getProveedores });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => editarProveedor(id, { activo }),
    onSuccess: async () => {
      // Los costos y el ABC dependen de qué proveedores estén activos
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
        queryClient.invalidateQueries({ queryKey: ['materias-primas'] }),
        queryClient.invalidateQueries({ queryKey: ['formulaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['formulacion'] }),
        queryClient.invalidateQueries({ queryKey: ['clasificacion-abc'] }),
        queryClient.invalidateQueries({ queryKey: ['precios'] }),
      ]);
    },
  });

  function reactivar(p: Proveedor) {
    setAviso(null);
    cambiarEstado.mutate(
      { id: p.id, activo: true },
      {
        onSuccess: () => setAviso({ tipo: 'success', texto: `${p.nombre} está activo de nuevo y sus precios vuelven a contar.` }),
        onError: (e) => setAviso({ tipo: 'error', texto: mensajeDeError(e, 'No se pudo reactivar el proveedor.') }),
      },
    );
  }

  function confirmarDesactivar() {
    if (!porDesactivar) return;
    const proveedor = porDesactivar;
    cambiarEstado.mutate(
      { id: proveedor.id, activo: false },
      {
        onSuccess: (r) => {
          setPorDesactivar(null);
          const n = r.ofertas_afectadas ?? 0;
          setAviso({
            tipo: 'success',
            texto:
              n > 0
                ? `${proveedor.nombre} se desactivó. ${textoPrecios(n)} dejan de contar en los costos.`
                : `${proveedor.nombre} se desactivó.`,
          });
        },
      },
    );
  }

  const columnas = useMemo(
    () =>
      crearColumnas({
        onVerOferta: (p) => setVerOferta(p),
        onEditar: (p) => {
          setAviso(null);
          setFormulario(p);
        },
        onDesactivar: (p) => {
          cambiarEstado.reset();
          setPorDesactivar(p);
        },
        onReactivar: reactivar,
        ocupado: cambiarEstado.isPending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cambiarEstado.isPending],
  );

  const visibles = useMemo(
    () => (mostrarInactivos ? (data ?? []) : (data ?? []).filter((p) => p.activo)),
    [data, mostrarInactivos],
  );

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return visibles.filter((p) => !texto || p.nombre.toLowerCase().includes(texto));
  }, [visibles, busqueda]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Proveedores</h1>
          <p className="text-sm text-gray-500">
            {data ? `${filtrados.length} de ${visibles.length} proveedores` : 'Quién te vende los insumos'}
          </p>
        </div>
        <Button type="button" onClick={() => setFormulario('nuevo')}>
          Nuevo proveedor
        </Button>
      </div>

      {aviso && <Alert variant={aviso.tipo}>{aviso.texto}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
      </div>

      <DataTable
        columnas={columnas}
        datos={filtrados}
        cargando={isLoading}
        error={isError}
        onReintentar={() => refetch()}
        obtenerKeyFila={(p) => p.id}
      />

      <Modal
        isOpen={formulario !== null}
        onClose={() => setFormulario(null)}
        title={formulario === 'nuevo' || formulario === null ? 'Nuevo proveedor' : 'Editar proveedor'}
      >
        {formulario !== null && (
          <ProveedorForm
            key={formulario === 'nuevo' ? 'nuevo' : formulario.id}
            proveedor={formulario === 'nuevo' ? null : formulario}
            onTerminar={() => setFormulario(null)}
          />
        )}
      </Modal>

      <Modal isOpen={verOferta !== null} onClose={() => setVerOferta(null)} title={verOferta ? `Oferta de ${verOferta.nombre}` : 'Oferta'} size="lg">
        {verOferta !== null && <OfertasProveedor key={verOferta.id} proveedorId={verOferta.id} />}
      </Modal>

      <Modal isOpen={porDesactivar !== null} onClose={() => setPorDesactivar(null)} title="Desactivar proveedor">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-700">
            ¿Desactivar <span className="font-medium">{porDesactivar?.nombre}</span>?
          </p>
          <Alert variant="warning">
            {porDesactivar && porDesactivar.ofertas_vigentes > 0
              ? `Sus ${textoPrecios(porDesactivar.ofertas_vigentes)} dejarán de contar en los costos. `
              : ''}
            Si es el único proveedor de un insumo, las formulaciones que lo usan quedarán con costo incompleto hasta que
            registres otro precio. Podrás reactivarlo cuando quieras.
          </Alert>
          {cambiarEstado.isError && (
            <Alert variant="error">{mensajeDeError(cambiarEstado.error, 'No se pudo desactivar el proveedor.')}</Alert>
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
