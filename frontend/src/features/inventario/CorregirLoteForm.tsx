import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { MOTIVOS } from '../conteos/etiquetas';
import { corregirLote } from '../../services/inventarioService';
import { mensajeDeError } from '../../services/errores';
import type { CorreccionLote } from '../../types/inventario.types';
import { aNumero } from './esquemaEntrada';
import { formatoCantidad } from './formatos';

interface Props {
  loteId: string;
  codigoLote: string | null;
  nombre: string;
  unidad: string;
  cantidadActual: number;
  onTerminar: (hecho?: CorreccionLote) => void;
}

const CANTIDAD_MAX = 1_000_000;
const CAMPO = 'min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm';

// Para cuando el registro quedó mal (p. ej. se digitó un peso equivocado). No sobrescribe: deja un ajuste con su motivo.
export function CorregirLoteForm({ loteId, codigoLote, nombre, unidad, cantidadActual, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const enGramos = unidad === 'g';
  const [unidadEntrada, setUnidadEntrada] = useState<string>(enGramos ? 'kg' : unidad);
  const factor = enGramos && unidadEntrada === 'kg' ? 1000 : 1;

  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('error_registro');
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);

  const nueva = Math.round(aNumero(texto) * factor * 1000) / 1000;
  const valida = texto.trim() !== '' && Number.isFinite(nueva) && nueva >= 0 && nueva <= CANTIDAD_MAX;
  const dif = valida ? Math.round((nueva - cantidadActual) * 1000) / 1000 : 0;
  const motivosPosibles = MOTIVOS.filter((m) => !(dif > 0 && m.valor === 'vencimiento'));

  const guardar = useMutation({
    mutationFn: () => corregirLote(loteId, { cantidad_nueva: nueva, motivo, ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}) }),
    onSuccess: async (hecho) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['inventario'] }), queryClient.invalidateQueries({ queryKey: ['conteos'] })]);
      onTerminar(hecho);
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo corregir el lote.')),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valida) return setError(`Escribe una cantidad entre 0 y ${CANTIDAD_MAX.toLocaleString('es-CO')} ${unidad}.`);
    if (dif === 0) return setError('Esa es la misma cantidad que ya tiene el sistema.');
    if (motivo === 'otro' && observaciones.trim().length < 3) return setError('Con el motivo "Otro" explica qué pasó en las observaciones.');
    guardar.mutate();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="text-sm text-gris-texto">
        <p className="font-medium text-grafito">
          {nombre} · Lote {codigoLote ?? 'sin código'}
        </p>
        <p>
          El sistema dice <span className="font-semibold text-grafito">{formatoCantidad(cantidadActual, unidad)}</span>.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cantidad-real" className="text-sm font-medium text-grafito">
          ¿Cuánto hay realmente?
        </label>
        <div className="flex gap-2">
          <input
            id="cantidad-real"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
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
              }}
              className="min-h-11 rounded-md border border-borde-campo px-2 text-base sm:text-sm"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
            </select>
          ) : (
            <span className="flex min-h-11 items-center px-1 text-sm text-gris-texto">{unidad}</span>
          )}
        </div>
        {valida && dif !== 0 && (
          <p className="text-xs text-gris-texto">
            Se registrará un ajuste de {dif > 0 ? '+' : '−'}
            {formatoCantidad(Math.abs(dif), unidad)}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="motivo-correccion" className="text-sm font-medium text-grafito">
          Motivo
        </label>
        <select id="motivo-correccion" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CAMPO}>
          {motivosPosibles.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="obs-correccion" className="text-sm font-medium text-grafito">
          Observaciones {motivo === 'otro' ? '' : '(opcional)'}
        </label>
        <textarea id="obs-correccion" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={300} rows={2} className={CAMPO} />
      </div>

      <p className="text-xs text-gris-texto">La corrección queda en el historial del lote con tu nombre y el motivo.</p>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="secondary" className="min-h-11" disabled={guardar.isPending} onClick={() => onTerminar()}>
          Cancelar
        </Button>
        <Button type="submit" className="min-h-11" isLoading={guardar.isPending}>
          Corregir existencias
        </Button>
      </div>
    </form>
  );
}
