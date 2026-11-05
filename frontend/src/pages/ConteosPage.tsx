import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EliminarConteo } from '../features/conteos/EliminarConteo';
import { COLOR_ESTADO_CONTEO, colorEri, ETIQUETA_ESTADO_CONTEO, formatoPorcentaje } from '../features/conteos/etiquetas';
import { formatoFechaIso } from '../features/inventario/formatos';
import { abrirConteo, getConteos } from '../services/conteosService';
import { mensajeDeError } from '../services/errores';
import type { ItemConteo } from '../types/conteo.types';

const CLAVE_OCULTAR = 'conteos_ocultar_descartados';

// Preferencia de este navegador; si el almacenamiento no está disponible, simplemente no se recuerda
function leerOcultar(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTAR) === '1';
  } catch {
    return false;
  }
}

export function ConteosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });
  const [abriendo, setAbriendo] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocultar, setOcultar] = useState(leerOcultar);
  const [porEliminar, setPorEliminar] = useState<ItemConteo | null>(null);

  function cambiarOcultar(valor: boolean) {
    setOcultar(valor);
    try {
      localStorage.setItem(CLAVE_OCULTAR, valor ? '1' : '0');
    } catch {
      // sin almacenamiento: el cambio vale solo para esta sesión
    }
  }

  const abrir = useMutation({
    mutationFn: () => abrirConteo(observaciones.trim() || undefined),
    onSuccess: async (c) => {
      await queryClient.invalidateQueries({ queryKey: ['conteos'] });
      navigate(`/conteos/${c.id}`);
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo abrir el conteo.')),
  });

  const datos = conteos.data;
  const enCurso = datos?.items.find((i) => i.estado === 'en_curso');
  const descartados = datos?.items.filter((i) => i.estado === 'descartado').length ?? 0;
  const visibles = (datos?.items ?? []).filter((i) => !(ocultar && i.estado === 'descartado'));

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Conteo físico</h1>
          <p className="mt-1 text-sm text-niebla">Compara lo que hay en la bodega con lo que dice el sistema</p>
        </div>
        {enCurso ? (
          <Link
            to={`/conteos/${enCurso.id}`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-terracota px-4 py-2 text-sm font-medium text-white hover:bg-[#93502f] sm:w-auto"
          >
            Continuar el conteo n.º {enCurso.numero}
          </Link>
        ) : (
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={!datos}
            onClick={() => {
              setError(null);
              setAbriendo(true);
            }}
          >
            Nuevo conteo
          </Button>
        )}
      </div>

      {conteos.isLoading ? (
        <LoadingState mensaje="Cargando conteos..." />
      ) : conteos.isError || !datos ? (
        <ErrorState onReintentar={() => conteos.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Medida titulo="Último" valor={formatoPorcentaje(datos.ultimo_eri)} color={colorEri(datos.ultimo_eri, datos.meta_eri)} />
            <Medida titulo="Promedio" valor={formatoPorcentaje(datos.promedio_eri)} color={colorEri(datos.promedio_eri, datos.meta_eri)} />
            <Medida titulo="Meta" valor={`${datos.meta_eri} %`} color="gray" />
          </div>
          <p className="-mt-2 text-xs text-gris-texto">
            Exactitud del inventario: qué tanto coincide lo contado con lo registrado. Solo cuentan los conteos ya enviados.
          </p>

          {descartados > 0 && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-grafito">
              <input type="checkbox" checked={ocultar} onChange={(e) => cambiarOcultar(e.target.checked)} className="h-5 w-5" />
              Ocultar los conteos descartados ({descartados})
            </label>
          )}

          {visibles.length === 0 ? (
            <EmptyState
              titulo={datos.items.length === 0 ? 'Aún no hay conteos' : 'No hay conteos para mostrar'}
              mensaje={datos.items.length === 0 ? 'Abre el primero para medir qué tan exacto está tu inventario.' : 'Solo hay conteos descartados y están ocultos.'}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {visibles.map((c) => (
                <li key={c.id} className="flex items-stretch gap-2">
                  <Link to={`/conteos/${c.id}`} className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-tarjeta border border-linea bg-tabla p-3 hover:bg-arena">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-grafito">Conteo n.º {c.numero}</span>
                        <Badge color={COLOR_ESTADO_CONTEO[c.estado]}>{ETIQUETA_ESTADO_CONTEO[c.estado]}</Badge>
                      </span>
                      <span className="block text-xs text-gris-texto">
                        {formatoFechaIso(c.creado_at)} · {c.creado_por} · {c.resumen.lotes} {c.resumen.lotes === 1 ? 'lote' : 'lotes'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-semibold text-grafito">
                        {c.estado === 'en_curso' || c.estado === 'descartado' ? '—' : formatoPorcentaje(c.resumen.eri)}
                      </span>
                      <span className="block text-xs text-gris-texto">{c.estado === 'descartado' ? 'no cuenta' : 'exactitud'}</span>
                    </span>
                  </Link>
                  {c.puede_eliminar && (
                    <button
                      type="button"
                      aria-label={`Eliminar el conteo n.º ${c.numero}`}
                      onClick={() => setPorEliminar(c)}
                      className="min-h-14 shrink-0 rounded-tarjeta border border-linea bg-tabla px-3 text-sm font-medium text-critico-texto hover:bg-critico-fondo"
                    >
                      Eliminar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <EliminarConteo conteo={porEliminar} onCerrar={() => setPorEliminar(null)} onEliminado={() => setPorEliminar(null)} />

      <Modal isOpen={abriendo} onClose={() => setAbriendo(false)} title="Nuevo conteo">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            abrir.mutate();
          }}
        >
          <p className="text-sm text-gris-texto">
            Vas a contar los lotes que hay en la bodega. Mientras cuentas, sigue registrando entradas y producciones con normalidad.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="obs-conteo" className="text-sm font-medium text-grafito">
              Nota (opcional)
            </label>
            <input
              id="obs-conteo"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              maxLength={300}
              placeholder="Ej.: conteo de fin de mes"
              className="min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base sm:text-sm"
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" className="min-h-11" isLoading={abrir.isPending}>
            Empezar a contar
          </Button>
        </form>
      </Modal>
    </div>
  );
}

function Medida({ titulo, valor, color }: { titulo: string; valor: string; color: 'green' | 'yellow' | 'red' | 'gray' }) {
  const clases = { green: 'border-[#c5dccb] bg-exito-fondo', yellow: 'border-[#f1d9a6] bg-atencion-fondo', red: 'border-[#f0c3c0] bg-critico-fondo', gray: 'border-linea bg-tabla' }[color];
  return (
    <div className={`rounded-lg border p-3 ${clases}`}>
      <p className="text-xs text-gris-texto">{titulo}</p>
      <p className="text-xl font-semibold text-grafito">{valor}</p>
    </div>
  );
}
