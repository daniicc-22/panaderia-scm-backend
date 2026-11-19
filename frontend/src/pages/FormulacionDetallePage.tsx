import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Power, RotateCcw, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Esqueleto } from '../components/feedback/Esqueleto';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { Indicador } from '../features/inicio/Panel';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EditorVersion } from '../features/formulaciones/EditorVersion';
import { IngredientesReceta } from '../features/formulaciones/IngredientesReceta';
import { HistorialVersiones } from '../features/formulaciones/HistorialVersiones';
import { useAuth } from '../features/auth/useAuth';
import { cambiarEstadoProducto, getFormulacion } from '../services/formulacionesService';
import { mensajeDeError } from '../services/errores';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const ROLES_GESTION = ['administrador', 'superadministrador'];

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
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

  return (
    <div className="flex flex-col gap-4">
      {isError && (
        <Alert variant="error">
          No se pudo cargar la formulación.{' '}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </Alert>
      )}
      {isLoading && (
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-24" />
          <Esqueleto className="h-64" />
        </div>
      )}

      {data && (
        <>
          <PageHeader
            titulo={data.producto}
            subtitulo={
              <>
                Versión {data.version} · {data.activa ? 'vigente' : 'anterior'} desde {fechaCorta(data.vigente_desde)}
                {data.vigente_hasta ? ` hasta ${fechaCorta(data.vigente_hasta)}` : ''}
                {!data.producto_activo && ' · Dado de baja'}
              </>
            }
            acciones={
              <>
                <BotonImprimir etiqueta="Ficha técnica" />
                {puedeGestionar && (
                  <Button type="button" onClick={() => setEditando(true)}>
                    <Pencil size={16} aria-hidden="true" />
                    {data.activa ? 'Editar formulación' : 'Usar como base'}
                  </Button>
                )}
                {puedeGestionar &&
                  (data.producto_activo ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        cambiarEstado.reset();
                        setAviso(null);
                        setConfirmandoBaja(true);
                      }}
                    >
                      <Power size={16} aria-hidden="true" />
                      Dar de baja
                    </Button>
                  ) : (
                    <Button type="button" variant="secondary" isLoading={cambiarEstado.isPending} onClick={reactivar}>
                      <RotateCcw size={16} aria-hidden="true" />
                      Reactivar producto
                    </Button>
                  ))}
              </>
            }
          />

          <Link to="/formulaciones" className="-mt-2 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-pizarra hover:underline print:hidden">
            <ArrowLeft size={15} aria-hidden="true" />
            Volver a formulaciones
          </Link>

          {aviso && <Alert variant={aviso.tipo}>{aviso.texto}</Alert>}

          {!data.activa && (
            <Alert variant="info">
              Estás viendo una versión anterior. No se usa en la producción ni en el ABC; el costo se calcula con los precios de hoy.
            </Alert>
          )}

          <div className={`grid grid-cols-2 gap-3 ${verCostos ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <Indicador etiqueta="Rinde" valor={data.rendimiento == null ? '—' : String(data.rendimiento)} detalle="unidades por lote" tono="azul" indice={0} />
            <Indicador
              etiqueta="Peso del lote"
              valor="—"
              numero={data.peso_lote_g / 1000}
              formato={(n) => `${numero.format(n)} kg`}
              detalle={data.rendimiento ? `${numero.format(data.peso_lote_g / data.rendimiento)} g por unidad` : undefined}
              tono="amarillo"
              indice={1}
            />
            {verCostos && data.costo_lote != null && (
              <Indicador etiqueta="Costo por lote" valor="—" numero={data.costo_lote} formato={(n) => pesos0.format(n)} tono="verde" indice={2} />
            )}
            {verCostos && (
              <Indicador etiqueta="Costo por unidad" valor={data.costo_unidad == null ? '—' : pesos2.format(data.costo_unidad)} tono="gris" indice={3} />
            )}
          </div>

          {verCostos && data.costo_incompleto && (
            <Alert variant="warning">
              <span className="inline-flex items-center gap-2">
                <TriangleAlert size={16} aria-hidden="true" />
                Hay un ingrediente sin costo (producto intermedio o materia prima sin precio). El costo total es parcial.
              </span>
            </Alert>
          )}

          <IngredientesReceta data={data} verCostos={verCostos} />
        </>
      )}

      {puedeGestionar && id && <HistorialVersiones formulacionId={id} />}

      {puedeGestionar && data && (
        <Modal isOpen={confirmandoBaja} onClose={() => setConfirmandoBaja(false)} title="Dar de baja el producto">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-grafito">
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