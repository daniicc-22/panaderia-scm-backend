import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ListaProveedores } from '../features/proveedores/ListaProveedores';
import { OfertasProveedor } from '../features/proveedores/OfertasProveedor';
import { EntregaProveedorForm } from '../features/proveedores/EntregaProveedorForm';
import { ProveedorForm } from '../features/proveedores/ProveedorForm';
import { editarProveedor, getProveedores } from '../services/proveedoresService';
import { mensajeDeError } from '../services/errores';
import type { Proveedor } from '../types/proveedor.types';

const textoPrecios = (n: number) => (n === 1 ? '1 precio vigente' : `${n} precios vigentes`);

export function ProveedoresPage() {
  const queryClient = useQueryClient();
  // 'nuevo' abre el formulario vacío; un proveedor lo abre para editarlo
  const [formulario, setFormulario] = useState<'nuevo' | Proveedor | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Proveedor | null>(null);
  const [verOferta, setVerOferta] = useState<Proveedor | null>(null);
  const [conEntrega, setConEntrega] = useState<Proveedor | null>(null);
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

  const activos = (data ?? []).filter((p) => p.activo).length;
  const inactivos = (data ?? []).length - activos;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Proveedores"
        subtitulo={data ? `${activos} activos${inactivos > 0 ? ` · ${inactivos} inactivos` : ''}` : 'Quién te vende los insumos'}
        acciones={
          <Button type="button" onClick={() => setFormulario('nuevo')}>
            <Plus size={16} aria-hidden="true" />
            Nuevo proveedor
          </Button>
        }
      />

      {aviso && <Alert variant={aviso.tipo}>{aviso.texto}</Alert>}

      {isError ? (
        <Alert variant="error">
          No se pudieron cargar los proveedores.{' '}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </Alert>
      ) : (
        <ListaProveedores
          proveedores={data}
          cargando={isLoading}
          acciones={{
            onVerOferta: (p) => setVerOferta(p),
            onEntrega: (p) => {
              setAviso(null);
              setConEntrega(p);
            },
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
          }}
        />
      )}

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

      <Modal isOpen={conEntrega !== null} onClose={() => setConEntrega(null)} title={conEntrega ? `Entrega de ${conEntrega.nombre}` : 'Entrega'}>
        {conEntrega !== null && <EntregaProveedorForm key={conEntrega.id} proveedor={conEntrega} onTerminar={() => setConEntrega(null)} />}
      </Modal>

      <Modal isOpen={porDesactivar !== null} onClose={() => setPorDesactivar(null)} title="Desactivar proveedor">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grafito">
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
