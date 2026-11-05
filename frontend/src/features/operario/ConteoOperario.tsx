import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import axios from 'axios';
import { ArrowLeft, CircleCheck, ClipboardCheck, Clock, House, Play, Send, SkipForward } from 'lucide-react';
import { MOTIVOS } from '../conteos/etiquetas';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import { accionConteo, comoPideMotivo, getConteo, getLotesPorContar, guardarLinea } from '../../services/conteosService';
import { mensajeDeError } from '../../services/errores';
import type { DetalleConteo, LineaConteo, LoteContable, MotivoDiferencia, PideMotivo } from '../../types/conteo.types';
import { aNumero } from './numeros';
import { BandaSeccion, CargandoGrande, MensajeGrande, OpcionGrande } from './ui';

type Fila = LoteContable & { linea?: LineaConteo };
type Vista = 'lista' | 'contar' | 'enviar' | 'enviado';

const CANTIDAD_MAX = 1_000_000;
const BOTON =
  'inline-flex min-h-18 items-center justify-center gap-3 rounded-xl px-6 text-2xl font-semibold shadow-elevada disabled:opacity-40 active:scale-[0.98]';

function Diferencia({ linea, unidad }: { linea: LineaConteo; unidad: string }) {
  if (linea.diferencia === 0) return <span className="rounded-lg bg-exito-fondo px-3 py-1 text-base font-semibold text-exito-texto">Exacto</span>;
  const falta = linea.diferencia < 0;
  return (
    <span className={`rounded-lg px-3 py-1 text-base font-semibold ${falta ? 'bg-critico-fondo text-critico-texto' : 'bg-atencion-fondo text-atencion-texto'}`}>
      {falta ? 'Faltan ' : 'Sobran '}
      {formatoCantidad(Math.abs(linea.diferencia), unidad)}
    </span>
  );
}

// Contar un lote: el operario escribe lo que ve, sin saber lo que dice el sistema. Si no coincide, se le pide el motivo.
function ContarUnLote({ conteoId, fila, numero, total, onGuardado, onSaltar, onVolver }: {
  conteoId: string;
  fila: Fila;
  numero: number;
  total: number;
  onGuardado: () => void;
  onSaltar?: () => void;
  onVolver: () => void;
}) {
  const queryClient = useQueryClient();
  const enGramos = fila.unidad === 'g';
  const [enKilos, setEnKilos] = useState(enGramos);
  const factor = enGramos && enKilos ? 1000 : 1;
  const [texto, setTexto] = useState(fila.linea ? String(fila.linea.cantidad_contada / factor).replace('.', ',') : '');
  const [pide, setPide] = useState<PideMotivo | null>(null);
  const [motivo, setMotivo] = useState<MotivoDiferencia | null>(fila.linea?.motivo ?? null);
  const [observaciones, setObservaciones] = useState(fila.linea?.observaciones ?? '');

  const cantidad = Math.round(aNumero(texto) * factor * 1000) / 1000;
  const valida = texto.trim() !== '' && Number.isFinite(cantidad) && cantidad >= 0 && cantidad <= CANTIDAD_MAX;
  const faltaExplicar = pide !== null && (!motivo || (motivo === 'otro' && observaciones.trim() === ''));

  const guardar = useMutation({
    mutationFn: () =>
      guardarLinea(conteoId, {
        lote_id: fila.lote_id,
        cantidad_contada: cantidad,
        ...(motivo ? { motivo } : {}),
        ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conteos'] });
      onGuardado();
    },
    onError: (e) => {
      const p = comoPideMotivo(e);
      if (p) setPide(p);
    },
  });
  const errorTexto = guardar.isError && !comoPideMotivo(guardar.error) ? mensajeDeError(guardar.error, 'No se pudo guardar lo contado.') : null;
  const sobra = pide !== null && pide.diferencia > 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-borde-campo bg-[#fff] px-4 text-lg font-semibold text-grafito active:scale-[0.97]"
        >
          <ArrowLeft size={22} aria-hidden="true" />
          Lista
        </button>
        <span className="rounded-full bg-azul-suave px-3 py-1 text-base font-semibold text-azul-noche">
          Lote {numero} de {total}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-arena" aria-hidden="true">
        <motion.div className="h-3 rounded-full bg-pizarra" initial={false} animate={{ width: `${(numero / Math.max(total, 1)) * 100}%` }} />
      </div>

      <div className="rounded-2xl bg-pizarra px-5 py-6 text-center text-white shadow-elevada">
        <p className="font-display text-[36px] leading-tight font-semibold">{fila.nombre}</p>
        <p className="mt-1 text-lg text-niebla">
          Lote {fila.codigo_lote ?? 'sin código'} · {fila.fecha_vencimiento ? `vence ${formatoFecha(fila.fecha_vencimiento)}` : 'sin vencimiento'}
        </p>
      </div>

      <h2 className="text-center font-display text-[30px] leading-tight font-semibold text-azul-noche">¿Cuánto hay?</h2>
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-[#c3d0dc] bg-azul-suave px-5 py-6">
        <label htmlFor="op-contado" className="sr-only">Cantidad contada</label>
        <div className="flex w-full max-w-md items-center gap-3">
          <input
            id="op-contado"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPide(null);
              guardar.reset();
            }}
            placeholder="0"
            className="min-h-20 min-w-0 flex-1 rounded-xl border-2 border-pizarra/40 bg-[#fff] px-4 text-center font-display text-[44px] font-semibold text-azul-noche cifras focus:border-pizarra focus:outline-hidden"
          />
          {!enGramos && <span className="text-2xl font-semibold text-grafito">{fila.unidad}</span>}
        </div>
        {enGramos && (
          <div className="grid w-full max-w-md grid-cols-2 gap-3" role="radiogroup" aria-label="Unidad">
            {[
              { kilos: true, texto: 'Kilos' },
              { kilos: false, texto: 'Gramos' },
            ].map((u) => (
              <button
                key={u.texto}
                type="button"
                role="radio"
                aria-checked={enKilos === u.kilos}
                onClick={() => {
                  setEnKilos(u.kilos);
                  setPide(null);
                }}
                className={`min-h-14 rounded-xl border-2 text-xl font-semibold ${
                  enKilos === u.kilos ? 'border-pizarra bg-pizarra text-white' : 'border-borde-campo bg-[#fff] text-grafito'
                }`}
              >
                {u.texto}
              </button>
            ))}
          </div>
        )}
        <p className="text-center text-base text-gris-texto">Cuenta lo que ves en la bodega.</p>
      </div>

      {pide && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 rounded-2xl border-2 border-[#f1d9a6] bg-atencion-fondo p-4">
          <p className="text-center text-xl font-semibold text-atencion-texto">
            No coincide con el sistema ({pide.diferencia > 0 ? 'sobran' : 'faltan'} {formatoCantidad(Math.abs(pide.diferencia), fila.unidad)}). ¿Qué pasó?
          </p>
          {MOTIVOS.filter((m) => !(sobra && m.valor === 'vencimiento')).map((m) => (
            <OpcionGrande key={m.valor} seccion="contar" titulo={m.etiqueta} seleccionada={motivo === m.valor} onElegir={() => setMotivo(m.valor)} />
          ))}
          {motivo === 'otro' && (
            <label className="flex flex-col gap-2">
              <span className="text-lg font-semibold text-grafito">Cuéntalo en pocas palabras</span>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                maxLength={300}
                rows={2}
                className="rounded-xl border-2 border-borde-campo bg-[#fff] px-4 py-3 text-lg text-grafito focus:border-pizarra focus:outline-hidden"
              />
            </label>
          )}
        </motion.div>
      )}

      {errorTexto && <MensajeGrande tono="rojo">{errorTexto}</MensajeGrande>}

      <button
        type="button"
        disabled={!valida || faltaExplicar || guardar.isPending}
        onClick={() => guardar.mutate()}
        className={`${BOTON} bg-[#a85c3e] text-white`}
      >
        <CircleCheck size={28} aria-hidden="true" />
        {guardar.isPending ? 'Guardando…' : 'Guardar y seguir'}
      </button>
      {onSaltar && (
        <button type="button" onClick={onSaltar} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-borde-campo bg-[#fff] text-lg font-semibold text-grafito">
          <SkipForward size={22} aria-hidden="true" />
          Saltar este lote por ahora
        </button>
      )}
    </>
  );
}

const ESTADO_CERRADO = {
  enviado: { tono: 'amarillo' as const, texto: 'Enviado. Un administrador lo está revisando.' },
  aplicado: { tono: 'verde' as const, texto: 'Revisado y aplicado al inventario.' },
  descartado: { tono: 'gris' as const, texto: 'Este conteo se descartó. El inventario no cambió.' },
};

// Conteo lote por lote para el operario
export function ConteoOperario() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>('lista');
  const [actualId, setActualId] = useState<string | null>(null);
  const [saltados, setSaltados] = useState<string[]>([]);

  const conteo = useQuery({
    queryKey: ['conteos', id],
    queryFn: () => getConteo(id),
    retry: (n, e) => !(axios.isAxiosError(e) && [400, 404].includes(e.response?.status ?? 0)) && n < 2,
  });
  const c: DetalleConteo | undefined = conteo.data;
  const lotes = useQuery({ queryKey: ['conteos', id, 'lotes'], queryFn: () => getLotesPorContar(id), enabled: c?.estado === 'en_curso' });

  const filas = useMemo<Fila[]>(() => {
    const porLote = new Map((c?.lineas ?? []).map((l) => [l.lote_id, l]));
    const base: Fila[] = (lotes.data?.items ?? []).map((i) => ({ ...i, contado: porLote.has(i.lote_id), linea: porLote.get(i.lote_id) }));
    for (const l of c?.lineas ?? []) {
      if (!base.some((b) => b.lote_id === l.lote_id)) {
        base.push({ lote_id: l.lote_id, codigo_lote: l.codigo_lote, fecha_vencimiento: l.fecha_vencimiento, materia_prima_id: l.materia_prima_id ?? '', codigo: l.codigo, nombre: l.nombre, unidad: l.unidad, contado: true, linea: l });
      }
    }
    return base.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [lotes.data, c?.lineas]);

  const pendientes = filas.filter((f) => !f.contado);
  const contados = filas.filter((f) => f.contado);
  const total = filas.length;
  const actual = filas.find((f) => f.lote_id === actualId) ?? null;

  // Siguiente lote por contar, dejando para el final los que se saltaron
  function siguiente(excepto: string[]): Fila | undefined {
    const libres = pendientes.filter((f) => !excepto.includes(f.lote_id));
    return libres.find((f) => !saltados.includes(f.lote_id)) ?? libres[0];
  }

  function contar(f: Fila) {
    setActualId(f.lote_id);
    setVista('contar');
  }

  const enviar = useMutation({
    mutationFn: () => accionConteo(id, 'enviar'),
    onSuccess: async (nuevo) => {
      queryClient.setQueryData(['conteos', id], nuevo);
      await queryClient.invalidateQueries({ queryKey: ['conteos'] });
      setVista('enviado');
    },
  });

  const banda = (
    <BandaSeccion
      seccion="contar"
      icono={ClipboardCheck}
      titulo={c ? `Conteo n.º ${c.numero}` : 'Conteo'}
      ayuda={c?.estado === 'en_curso' ? 'Cuenta lote por lote.' : undefined}
      volver={{ ruta: '/conteos', texto: 'Conteos' }}
    />
  );

  if (conteo.isLoading) {
    return (
      <div className="flex flex-col pb-10">
        {banda}
        <div className="mx-auto mt-4 w-full max-w-3xl"><CargandoGrande /></div>
      </div>
    );
  }
  if (conteo.isError || !c) {
    return (
      <div className="flex flex-col pb-10">
        {banda}
        <div className="mx-auto mt-4 w-full max-w-3xl">
          <MensajeGrande tono="rojo">No se pudo abrir este conteo.</MensajeGrande>
        </div>
      </div>
    );
  }

  const contenido = (() => {
    if (vista === 'enviado') {
      return (
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-exito-fondo px-6 py-10 text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
            <CircleCheck size={88} className="text-verde-bosque" aria-hidden="true" />
          </motion.span>
          <p className="font-display text-[32px] leading-tight font-semibold text-exito-texto">¡Conteo enviado!</p>
          <p className="text-xl text-grafito">Un administrador lo revisará. ¡Gracias por contar!</p>
          <Link to="/inicio" className="inline-flex min-h-16 w-full max-w-sm items-center justify-center gap-2 rounded-xl border-2 border-azul-noche bg-[#fff] px-6 text-xl font-semibold text-azul-noche">
            <House size={24} aria-hidden="true" />
            Ir al inicio
          </Link>
        </div>
      );
    }

    if (c.estado !== 'en_curso') {
      const e = ESTADO_CERRADO[c.estado];
      return (
        <>
          <MensajeGrande tono={e.tono}>{e.texto}</MensajeGrande>
          <ul className="flex flex-col gap-3 rounded-2xl bg-azul-suave/70 p-3">
            {c.lineas.map((l) => (
              <li key={l.lote_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-l-8 border-l-pizarra bg-[#fff] px-5 py-4">
                <span className="min-w-0">
                  <span className="block text-xl font-semibold text-grafito">{l.nombre}</span>
                  <span className="block text-base text-gris-texto">Lote {l.codigo_lote ?? 'sin código'} · contaste {formatoCantidad(l.cantidad_contada, l.unidad)}</span>
                </span>
                <Diferencia linea={l} unidad={l.unidad} />
              </li>
            ))}
          </ul>
        </>
      );
    }

    if (vista === 'contar' && actual) {
      const numero = contados.length + (actual.contado ? 0 : 1);
      const otro = siguiente([actual.lote_id]);
      return (
        <ContarUnLote
          key={actual.lote_id}
          conteoId={id}
          fila={actual}
          numero={Math.min(numero, total)}
          total={total}
          onVolver={() => setVista('lista')}
          onSaltar={
            !actual.contado && otro
              ? () => {
                  setSaltados((s) => [...s, actual.lote_id]);
                  setActualId(otro.lote_id);
                }
              : undefined
          }
          onGuardado={() => {
            const sig = siguiente([actual.lote_id]);
            if (sig && !actual.contado) setActualId(sig.lote_id);
            else setVista('lista');
          }}
        />
      );
    }

    if (vista === 'enviar') {
      const exactos = c.lineas.filter((l) => l.diferencia === 0).length;
      return (
        <>
          <h2 className="text-center font-display text-[30px] leading-tight font-semibold text-azul-noche">¿Enviar el conteo?</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-exito-fondo p-4 text-exito-texto">
              <p className="font-display text-[36px] leading-none font-semibold cifras">{exactos}</p>
              <p className="text-lg font-semibold">exactos</p>
            </div>
            <div className="rounded-2xl bg-atencion-fondo p-4 text-atencion-texto">
              <p className="font-display text-[36px] leading-none font-semibold cifras">{c.lineas.length - exactos}</p>
              <p className="text-lg font-semibold">con diferencia</p>
            </div>
          </div>
          {pendientes.length > 0 && (
            <MensajeGrande tono="amarillo">
              Te faltan {pendientes.length} {pendientes.length === 1 ? 'lote' : 'lotes'} por contar. Puedes enviarlo así o seguir contando.
            </MensajeGrande>
          )}
          <p className="text-center text-lg text-gris-texto">Después de enviarlo ya no podrás cambiar lo contado.</p>
          {enviar.isError && <MensajeGrande tono="rojo">{mensajeDeError(enviar.error, 'No se pudo enviar el conteo.')}</MensajeGrande>}
          <button type="button" disabled={enviar.isPending} onClick={() => enviar.mutate()} className={`${BOTON} bg-verde-bosque text-white`}>
            <Send size={28} aria-hidden="true" />
            {enviar.isPending ? 'Enviando…' : 'Enviar al administrador'}
          </button>
          <button type="button" onClick={() => setVista('lista')} className="min-h-14 rounded-xl border-2 border-borde-campo bg-[#fff] text-lg font-semibold text-grafito">
            Seguir contando
          </button>
        </>
      );
    }

    // Lista
    const sig = siguiente([]);
    return (
      <>
        <div className="rounded-2xl bg-azul-noche px-5 py-5 text-white shadow-elevada">
          <div className="mb-2 flex items-end justify-between">
            <p className="text-xl font-semibold">Llevas contados</p>
            <p className="font-display text-[34px] leading-none font-semibold text-trigo cifras">
              {contados.length} <span className="text-xl text-niebla">de {total}</span>
            </p>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-[#34495b]" aria-hidden="true">
            <motion.div className="h-4 rounded-full bg-trigo" initial={false} animate={{ width: total === 0 ? '0%' : `${(contados.length / total) * 100}%` }} />
          </div>
        </div>

        {lotes.isLoading && <CargandoGrande />}
        {lotes.isSuccess && total === 0 && <MensajeGrande>No hay lotes con existencias para contar.</MensajeGrande>}

        {sig ? (
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => contar(sig)}
            className="flex min-h-24 items-center gap-4 rounded-2xl bg-[#a85c3e] px-6 py-5 text-left text-white shadow-elevada"
          >
            <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-current/15">
              <Play size={32} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[28px] leading-tight font-semibold">{contados.length === 0 ? 'Empezar a contar' : 'Contar el siguiente'}</span>
              <span className="block text-lg opacity-90">{sig.nombre} · lote {sig.codigo_lote ?? 'sin código'}</span>
            </span>
          </motion.button>
        ) : (
          total > 0 && <MensajeGrande tono="verde">¡Ya contaste todos los lotes! Ahora envíalo.</MensajeGrande>
        )}

        {c.lineas.length > 0 && (
          <button type="button" onClick={() => setVista('enviar')} className={`${BOTON} bg-verde-bosque text-white`}>
            <Send size={28} aria-hidden="true" />
            Enviar al administrador
          </button>
        )}

        {pendientes.length > 0 && (
          <div className="rounded-2xl border-2 border-[#c3d0dc] bg-azul-suave p-3">
            <p className="flex items-center gap-2 px-2 pt-1 pb-3 text-lg font-semibold text-azul-noche">
              <Clock size={22} aria-hidden="true" /> Por contar ({pendientes.length})
            </p>
            <ul className="flex flex-col gap-2">
              {pendientes.map((f) => (
                <li key={f.lote_id}>
                  <button type="button" onClick={() => contar(f)} className="flex min-h-18 w-full items-center justify-between gap-3 rounded-xl border-l-8 border-l-grafico-neutro bg-[#fff] px-5 py-3 text-left active:scale-[0.99]">
                    <span className="min-w-0">
                      <span className="block text-xl font-semibold text-grafito">{f.nombre}</span>
                      <span className="block text-base text-gris-texto">Lote {f.codigo_lote ?? 'sin código'}{f.fecha_vencimiento ? ` · vence ${formatoFecha(f.fecha_vencimiento)}` : ''}</span>
                    </span>
                    <span className="text-base font-semibold text-pizarra">Contar</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {contados.length > 0 && (
          <div className="rounded-2xl border-2 border-[#c7dacb] bg-verde-suave p-3">
            <p className="flex items-center gap-2 px-2 pt-1 pb-3 text-lg font-semibold text-exito-texto">
              <CircleCheck size={22} aria-hidden="true" /> Contados ({contados.length}) · toca uno para corregirlo
            </p>
            <ul className="flex flex-col gap-2">
              {contados.map((f) => (
                <li key={f.lote_id}>
                  <button type="button" onClick={() => contar(f)} className="flex min-h-18 w-full flex-wrap items-center justify-between gap-3 rounded-xl border-l-8 border-l-verde-bosque bg-[#fff] px-5 py-3 text-left active:scale-[0.99]">
                    <span className="min-w-0">
                      <span className="block text-xl font-semibold text-grafito">{f.nombre}</span>
                      <span className="block text-base text-gris-texto">
                        Lote {f.codigo_lote ?? 'sin código'} · contaste {f.linea ? formatoCantidad(f.linea.cantidad_contada, f.unidad) : ''}
                      </span>
                    </span>
                    {f.linea && <Diferencia linea={f.linea} unidad={f.unidad} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  })();

  return (
    <div className="flex flex-col pb-10">
      {banda}
      <div className="mx-auto mt-4 w-full max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={vista === 'contar' ? `contar-${actualId}` : vista}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-4"
          >
            {contenido}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
