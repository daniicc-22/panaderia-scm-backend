import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../features/auth/useAuth';
import { EliminarConteo } from '../features/conteos/EliminarConteo';
import { ContarLotes } from '../features/conteos/ContarLotes';
import { COLOR_ESTADO_CONTEO, ETIQUETA_ESTADO_CONTEO, formatoPorcentaje } from '../features/conteos/etiquetas';
import { ResultadoConteo } from '../features/conteos/ResultadoConteo';
import { formatoFechaIso } from '../features/inventario/formatos';
import { accionConteo, getConteo } from '../services/conteosService';
import { mensajeDeError } from '../services/errores';

type Accion = 'enviar' | 'devolver' | 'descartar' | 'aplicar';

const TEXTO: Record<Accion, { titulo: string; mensaje: string; boton: string; variante: 'primary' | 'danger' | 'secondary' }> = {
  enviar: {
    titulo: 'Enviar el conteo',
    mensaje: 'Un administrador lo revisará. Después de enviarlo ya no podrás cambiar lo contado.',
    boton: 'Enviar para revisión',
    variante: 'primary',
  },
  devolver: {
    titulo: 'Devolver para recontar',
    mensaje: 'El conteo vuelve a estar abierto para corregir lo que haga falta.',
    boton: 'Devolver',
    variante: 'secondary',
  },
  descartar: {
    titulo: 'Descartar el conteo',
    mensaje: 'Se cierra sin cambiar el inventario. Esta acción no se puede deshacer.',
    boton: 'Descartar',
    variante: 'danger',
  },
  aplicar: {
    titulo: 'Aprobar y ajustar el inventario',
    mensaje: 'Cada diferencia se registra como un ajuste del lote, con su motivo. Esta acción no se puede deshacer.',
    boton: 'Aprobar y ajustar',
    variante: 'primary',
  },
};

export function ConteoDetallePage() {
  const { id = '' } = useParams();
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [eliminando, setEliminando] = useState(false);
  const esGestion = usuario?.rol === 'administrador' || usuario?.rol === 'superadministrador';
  const [accion, setAccion] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aplicados, setAplicados] = useState<number | null>(null);

  const conteo = useQuery({
    queryKey: ['conteos', id],
    queryFn: () => getConteo(id),
    retry: (n, e) => !(axios.isAxiosError(e) && [400, 404].includes(e.response?.status ?? 0)) && n < 2,
  });

  const ejecutar = useMutation({
    mutationFn: (a: Accion) => accionConteo(id, a),
    onSuccess: async (nuevo, a) => {
      queryClient.setQueryData(['conteos', id], nuevo);
      await queryClient.invalidateQueries({ queryKey: ['conteos'] });
      // Aprobar cambia las existencias: el inventario y las alertas deben volver a pedirse
      if (a === 'aplicar') {
        setAplicados(nuevo.ajustes ?? 0);
        await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      }
      setAccion(null);
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo completar la acción.')),
  });

  if (conteo.isLoading) return <LoadingState mensaje="Cargando conteo..." />;
  if (conteo.isError || !conteo.data) {
    const noExiste = axios.isAxiosError(conteo.error) && [400, 404].includes(conteo.error.response?.status ?? 0);
    return noExiste ? (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="warning">Ese conteo no existe.</Alert>
        <Link to="/conteos" className="text-sm font-medium text-pizarra hover:underline">
          Volver a los conteos
        </Link>
      </div>
    ) : (
      <ErrorState onReintentar={() => conteo.refetch()} />
    );
  }

  const c = conteo.data;
  const texto = accion ? TEXTO[accion] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6">
        <Link to="/conteos" className="text-sm font-medium text-niebla hover:text-white hover:underline">
          ← Conteos
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Conteo n.º {c.numero}</h1>
          <Badge color={COLOR_ESTADO_CONTEO[c.estado]}>{ETIQUETA_ESTADO_CONTEO[c.estado]}</Badge>
        </div>
        <p className="mt-1 text-sm text-niebla">
          Abierto el {formatoFechaIso(c.creado_at)} por {c.creado_por}
          {c.observaciones ? ` · ${c.observaciones}` : ''}
        </p>
        {c.resuelto_at && c.resuelto_por && (
          <p className="mt-1 text-sm text-niebla">
            {c.estado === 'aplicado' ? 'Aprobado' : 'Descartado'} el {formatoFechaIso(c.resuelto_at)} por {c.resuelto_por}
          </p>
        )}
      </div>

      {aplicados !== null && c.estado === 'aplicado' && (
        <Alert variant="success">
          Conteo aplicado: {aplicados === 0 ? 'no hubo diferencias, el inventario no cambió.' : `se registraron ${aplicados} ${aplicados === 1 ? 'ajuste' : 'ajustes'} en el inventario.`}
        </Alert>
      )}
      {c.estado === 'enviado' && !esGestion && <Alert variant="info">Tu conteo está esperando la revisión de un administrador.</Alert>}
      {c.estado === 'enviado' && esGestion && (
        <Alert variant="info">Revisa las diferencias. Al aprobar, el inventario se ajusta a lo contado; si algo no cuadra, devuélvelo para recontar.</Alert>
      )}
      {c.estado === 'descartado' && <Alert variant="warning">Este conteo se descartó: el inventario no se modificó.</Alert>}
      {error && !accion && <Alert variant="error">{error}</Alert>}

      {c.puede_eliminar && (
        <div>
          <button type="button" className="min-h-11 text-sm font-medium text-critico-texto hover:underline" onClick={() => setEliminando(true)}>
            Eliminar este conteo
          </button>
        </div>
      )}

      {c.estado === 'en_curso' ? (
        <>
          <ContarLotes detalle={c} />
          <div className="flex flex-col gap-2 border-t border-linea pt-4 sm:flex-row sm:justify-end">
            {esGestion && (
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => { setError(null); setAccion('descartar'); }}>
                Descartar conteo
              </Button>
            )}
            <Button type="button" className="min-h-11" disabled={c.lineas.length === 0} onClick={() => { setError(null); setAccion('enviar'); }}>
              Enviar conteo ({c.lineas.length} {c.lineas.length === 1 ? 'lote' : 'lotes'})
            </Button>
          </div>
        </>
      ) : (
        <>
          <ResultadoConteo detalle={c} />
          {c.estado === 'enviado' && esGestion && (
            <div className="flex flex-col gap-2 border-t border-linea pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="danger" className="min-h-11" onClick={() => { setError(null); setAccion('descartar'); }}>
                Descartar
              </Button>
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => { setError(null); setAccion('devolver'); }}>
                Devolver para recontar
              </Button>
              <Button type="button" className="min-h-11" onClick={() => { setError(null); setAccion('aplicar'); }}>
                Aprobar y ajustar inventario
              </Button>
            </div>
          )}
        </>
      )}

      <EliminarConteo
        conteo={eliminando ? c : null}
        onCerrar={() => setEliminando(false)}
        onEliminado={() => {
          setEliminando(false);
          queryClient.removeQueries({ queryKey: ['conteos', id] });
          navigate('/conteos', { replace: true });
        }}
      />

      <Modal isOpen={accion !== null} onClose={() => !ejecutar.isPending && setAccion(null)} title={texto?.titulo}>
        {accion && texto && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gris-texto">{texto.mensaje}</p>
            {accion === 'aplicar' && (
              <p className="text-sm text-grafito">
                Exactitud de este conteo: <span className="font-semibold">{formatoPorcentaje(c.resumen.eri)}</span> · Diferencias:{' '}
                <span className="font-semibold">{c.resumen.faltantes + c.resumen.sobrantes}</span>
              </p>
            )}
            {error && <Alert variant="error">{error}</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" className="min-h-11" disabled={ejecutar.isPending} onClick={() => setAccion(null)}>
                Cancelar
              </Button>
              <Button type="button" variant={texto.variante} className="min-h-11" isLoading={ejecutar.isPending} onClick={() => { setError(null); ejecutar.mutate(accion); }}>
                {texto.boton}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
