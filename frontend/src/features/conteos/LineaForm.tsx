import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { guardarLinea, quitarLinea, comoPideMotivo } from '../../services/conteosService';
import { mensajeDeError } from '../../services/errores';
import { aNumero } from '../inventario/esquemaEntrada';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import type { LineaConteo, MotivoDiferencia, PideMotivo } from '../../types/conteo.types';
import { MOTIVOS } from './etiquetas';

export interface LoteElegido {
  lote_id: string;
  nombre: string;
  unidad: string;
  codigo_lote: string | null;
  fecha_vencimiento: string | null;
}

interface Props {
  conteoId: string;
  lote: LoteElegido;
  // Lo ya contado de este lote, si se está corrigiendo
  linea?: LineaConteo;
  onTerminar: () => void;
}

const CANTIDAD_MAX = 1_000_000;
const CAMPO = 'min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm';

const aTexto = (n: number) => String(n).replace('.', ',');

// El panadero cuenta sin ver lo que dice el sistema. Solo si hay diferencia se le pide explicarla.
export function LineaForm({ conteoId, lote, linea, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const enGramos = lote.unidad === 'g';
  const [unidadEntrada, setUnidadEntrada] = useState<string>(enGramos ? 'kg' : lote.unidad);
  const factor = enGramos && unidadEntrada === 'kg' ? 1000 : 1;

  const [texto, setTexto] = useState(linea ? aTexto(linea.cantidad_contada / factor) : '');
  const [motivo, setMotivo] = useState<MotivoDiferencia | ''>(linea?.motivo ?? '');
  const [observaciones, setObservaciones] = useState(linea?.observaciones ?? '');
  const [pide, setPide] = useState<PideMotivo | null>(
    linea && linea.diferencia !== 0
      ? { requiere_motivo: true, cantidad_sistema: linea.cantidad_sistema, diferencia: linea.diferencia, error: '' }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  const cantidad = Math.round(aNumero(texto) * factor * 1000) / 1000;
  const valida = texto.trim() !== '' && Number.isFinite(cantidad) && cantidad >= 0 && cantidad <= CANTIDAD_MAX;

  async function refrescar() {
    await queryClient.invalidateQueries({ queryKey: ['conteos'] });
  }

  const guardar = useMutation({
    mutationFn: () =>
      guardarLinea(conteoId, {
        lote_id: lote.lote_id,
        cantidad_contada: cantidad,
        ...(motivo ? { motivo } : {}),
        ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      }),
    onSuccess: async () => {
      await refrescar();
      onTerminar();
    },
    onError: (e) => {
      const p = comoPideMotivo(e);
      if (p) {
        setPide(p);
        setError(p.error);
        return;
      }
      setError(mensajeDeError(e, 'No se pudo guardar lo contado.'));
    },
  });

  const quitar = useMutation({
    mutationFn: () => quitarLinea(conteoId, lote.lote_id),
    onSuccess: async () => {
      await refrescar();
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo quitar el lote del conteo.')),
  });

  const ocupado = guardar.isPending || quitar.isPending;
  const sobra = pide !== null && pide.diferencia > 0;
  const motivosPosibles = MOTIVOS.filter((m) => !(sobra && m.valor === 'vencimiento'));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valida) {
      setError(`Escribe una cantidad entre 0 y ${CANTIDAD_MAX.toLocaleString('es-CO')}.`);
      return;
    }
    guardar.mutate();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="text-sm text-gris-texto">
        <p className="font-medium text-grafito">
          Lote {lote.codigo_lote ?? 'sin código'}
        </p>
        <p>{lote.fecha_vencimiento ? `Vence el ${formatoFecha(lote.fecha_vencimiento)}` : 'Sin fecha de vencimiento'}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cantidad-contada" className="text-sm font-medium text-grafito">
          ¿Cuánto hay en este lote?
        </label>
        <div className="flex gap-2">
          <input
            id="cantidad-contada"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPide(null);
              setError(null);
            }}
            className={CAMPO}
            placeholder="0"
          />
          {enGramos ? (
            <select
              aria-label="Unidad"
              value={unidadEntrada}
              onChange={(e) => {
                setUnidadEntrada(e.target.value);
                setTexto('');
                setPide(null);
              }}
              className="min-h-11 rounded-md border border-borde-campo px-2 text-base sm:text-sm"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
            </select>
          ) : (
            <span className="flex min-h-11 items-center px-1 text-sm text-gris-texto">{lote.unidad}</span>
          )}
        </div>
        <p className="text-xs text-gris-texto">Cuenta lo que ves en la bodega, sin mirar lo que dice el sistema.</p>
      </div>

      {pide && (
        <div className="flex flex-col gap-3 rounded-lg border border-[#f1d9a6] bg-atencion-fondo p-3">
          <p className="text-sm text-atencion-texto">
            El sistema decía <span className="font-semibold">{formatoCantidad(pide.cantidad_sistema, lote.unidad)}</span>: hay una diferencia de{' '}
            <span className="font-semibold">
              {pide.diferencia > 0 ? '+' : '−'}
              {formatoCantidad(Math.abs(pide.diferencia), lote.unidad)}
            </span>
            . Cuéntanos qué pasó.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="motivo" className="text-sm font-medium text-grafito">
              Motivo
            </label>
            <select id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDiferencia | '')} className={CAMPO}>
              <option value="">Elige un motivo</option>
              {motivosPosibles.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="obs" className="text-sm font-medium text-grafito">
              Observaciones {motivo === 'otro' ? '' : '(opcional)'}
            </label>
            <textarea
              id="obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              maxLength={300}
              rows={2}
              className={CAMPO}
            />
          </div>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {linea ? (
          <Button type="button" variant="secondary" className="min-h-11" disabled={ocupado} onClick={() => quitar.mutate()}>
            Quitar del conteo
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" className="min-h-11" isLoading={guardar.isPending} disabled={ocupado}>
          {pide ? 'Guardar con motivo' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
