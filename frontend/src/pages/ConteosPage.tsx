import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EliminarConteo } from '../features/conteos/EliminarConteo';
import { TendenciaExactitud } from '../features/conteos/TendenciaExactitud';
import { Indicador } from '../features/inicio/Panel';
import { COLOR_ESTADO_CONTEO, colorEri, ETIQUETA_ESTADO_CONTEO, formatoPorcentaje } from '../features/conteos/etiquetas';
import { formatoFechaIso } from '../features/inventario/formatos';
import { abrirConteo, getConteos } from '../services/conteosService';
import { mensajeDeError } from '../services/errores';
import type { ItemConteo } from '../types/conteo.types';

const numPct = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const CLAVE_OCULTAR = 'conteos_ocultar_descartados';
// Color del indicador según qué tan cerca está de la meta de exactitud
const TONO_ERI = { green: 'verde', yellow: 'amarillo', red: 'rojo', gray: 'gris' } as const;

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
  const conteosValidos = (datos?.items ?? []).filter((i) => i.estado === 'enviado' || i.estado === 'aplicado').length;
  const visibles = (datos?.items ?? []).filter((i) => !(ocultar && i.estado === 'descartado'));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Conteo físico"
        subtitulo="Compara lo que hay en la bodega con lo que dice el sistema"
        acciones={
          enCurso ? (
            <Link
              to={`/conteos/${enCurso.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-terracota px-4 text-sm font-semibold text-white hover:bg-[#93502f]"
            >
              Continuar el conteo n.º {enCurso.numero}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <Button
              type="button"
              disabled={!datos}
              onClick={() => {
                setError(null);
                setAbriendo(true);
              }}
            >
              Nuevo conteo
            </Button>
          )
        }
      />

      {conteos.isLoading ? (
        <LoadingState mensaje="Cargando conteos..." />
      ) : conteos.isError || !datos ? (
        <ErrorState onReintentar={() => conteos.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador indice={0} tono={TONO_ERI[colorEri(datos.ultimo_eri, datos.meta_eri)]} etiqueta="Exactitud del último conteo" valor={formatoPorcentaje(datos.ultimo_eri)} detalle={datos.ultimo_eri === null ? 'Aún sin conteos enviados' : datos.ultimo_eri >= datos.meta_eri ? 'Cumple la meta' : `Faltan ${numPct.format(datos.meta_eri - datos.ultimo_eri)} puntos para la meta`} />
            <Indicador indice={1} tono={TONO_ERI[colorEri(datos.promedio_eri, datos.meta_eri)]} etiqueta="Promedio de conteos" valor={formatoPorcentaje(datos.promedio_eri)} detalle={`${conteosValidos} ${conteosValidos === 1 ? 'conteo enviado' : 'conteos enviados'}`} />
            <Indicador indice={2} tono="azul" etiqueta="Meta de exactitud" valor={`${datos.meta_eri} %`} detalle="Stock físico frente al registrado" />
            <Indicador indice={3} tono={enCurso ? 'amarillo' : 'gris'} etiqueta="Conteo en curso" valor={enCurso ? `n.º ${enCurso.numero}` : 'Ninguno'} detalle={enCurso ? `${enCurso.resumen.lotes} lotes contados` : 'Abre uno para medir la exactitud'} />
          </div>
          <TendenciaExactitud />
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
              {visibles.map((c) => {
                const cuenta = c.estado === 'enviado' || c.estado === 'aplicado';
                const tono = cuenta ? colorEri(c.resumen.eri, datos.meta_eri) : 'gray';
                const colorEtiqueta = tono === 'green' ? 'text-exito-texto' : tono === 'yellow' ? 'text-atencion-texto' : tono === 'red' ? 'text-critico-texto' : 'text-grafito';
                return (
                  <li key={c.id} className={`flex items-stretch gap-2 ${c.estado === 'descartado' ? 'opacity-70' : ''}`}>
                    <Link to={`/conteos/${c.id}`} className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-tarjeta border border-linea bg-tabla p-3 hover:bg-arena focus-visible:outline-2 focus-visible:outline-trigo">
                      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-azul-suave text-azul-noche">
                        <ClipboardCheck size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base font-semibold text-azul-noche">Conteo n.º {c.numero}</span>
                          <Badge color={COLOR_ESTADO_CONTEO[c.estado]}>{ETIQUETA_ESTADO_CONTEO[c.estado]}</Badge>
                        </span>
                        <span className="block text-xs text-gris-texto">
                          {formatoFechaIso(c.creado_at)} · {c.creado_por} · {c.resumen.lotes} {c.resumen.lotes === 1 ? 'lote' : 'lotes'}
                        </span>
                        {cuenta && c.resumen.lotes > 0 && (
                          <span className="mt-0.5 block text-xs text-gris-texto">
                            {c.resumen.exactos} exactos
                            {c.resumen.faltantes > 0 && <> · <span className="font-semibold text-critico-texto">{c.resumen.faltantes} faltantes</span></>}
                            {c.resumen.sobrantes > 0 && <> · <span className="font-semibold text-atencion-texto">{c.resumen.sobrantes} sobrantes</span></>}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`cifras block font-display text-xl font-semibold ${colorEtiqueta}`}>
                          {cuenta ? formatoPorcentaje(c.resumen.eri) : '—'}
                        </span>
                        <span className="block text-xs text-gris-texto">{c.estado === 'descartado' ? 'no cuenta' : c.estado === 'en_curso' ? 'en proceso' : 'exactitud'}</span>
                      </span>
                      <ArrowRight size={16} aria-hidden="true" className="hidden shrink-0 text-gris-texto transition-transform group-hover:translate-x-0.5 sm:block" />
                    </Link>
                    {c.puede_eliminar && (
                      <button
                        type="button"
                        aria-label={`Eliminar el conteo n.º ${c.numero}`}
                        onClick={() => setPorEliminar(c)}
                        className="min-h-16 shrink-0 rounded-tarjeta border border-linea bg-tabla px-3 text-sm font-medium text-critico-texto hover:bg-critico-fondo"
                      >
                        Eliminar
                      </button>
                    )}
                  </li>
                );
              })}
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
