import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../features/auth/useAuth';
import { ListaMateriasPrimas } from '../features/materias-primas/ListaMateriasPrimas';
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

export function MateriasPrimasPage() {
  const { usuario } = useAuth();
  const puedeGestionar = ROLES_GESTION.includes(usuario?.rol ?? '');
  const queryClient = useQueryClient();

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
  const activas = (data ?? []).filter((m) => m.activa).length;
  const inactivas = (data ?? []).length - activas;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Materias primas"
        subtitulo={data ? `${activas} ${activas === 1 ? 'activa' : 'activas'}${puedeGestionar && inactivas > 0 ? ` · ${inactivas} ${inactivas === 1 ? 'inactiva' : 'inactivas'}` : ''}` : 'Catálogo de insumos de la panadería'}
        acciones={
          puedeGestionar ? (
            <Button type="button" onClick={() => setFormulario('nueva')} disabled={!catalogos.data}>
              <Plus size={16} aria-hidden="true" />
              Nueva materia prima
            </Button>
          ) : undefined
        }
      />

      {errorAccion && <Alert variant="error">{errorAccion}</Alert>}
      {puedeGestionar && catalogos.isError && (
        <Alert variant="warning">
          No se pudieron cargar las unidades y categorías, por eso no se puede crear ni editar.{' '}
          <button type="button" className="font-medium underline" onClick={() => catalogos.refetch()}>
            Reintentar
          </button>
        </Alert>
      )}

      {isError ? (
        <Alert variant="error">
          No se pudieron cargar las materias primas.{' '}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </Alert>
      ) : (
        <ListaMateriasPrimas
          materias={data}
          cargando={isLoading}
          verPrecios={verPrecios}
          puedeGestionar={puedeGestionar}
          acciones={
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
              : null
          }
        />
      )}

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
          <p className="text-sm text-grafito">
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