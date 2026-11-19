import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Info, TriangleAlert, Truck } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { guardarEntregaProveedor } from '../../services/proveedoresService';
import { mensajeDeError } from '../../services/errores';
import { leerNumero } from '../reposicion/unidades';
import { NOMBRE_DIA, ORDEN_SEMANA, textoDiasEntrega } from '../reposicion/etiquetas';
import type { Proveedor } from '../../types/proveedor.types';

interface Props {
  proveedor: Proveedor;
  onTerminar: () => void;
}

const INICIAL_DIA: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const ENTRE_SEMANA = [1, 2, 3, 4, 5];

// Calendario de entrega y pedido mínimo del proveedor: de aquí sale cuándo y cuánto pedir.
export function EntregaProveedorForm({ proveedor, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [dias, setDias] = useState<number[]>(proveedor.dias_entrega);
  const [hora, setHora] = useState(proveedor.hora_limite_pedido?.slice(0, 5) ?? '');
  const [minimo, setMinimo] = useState(proveedor.pedido_minimo === null ? '' : String(proveedor.pedido_minimo));
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: guardarEntregaProveedor.bind(null, proveedor.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
        queryClient.invalidateQueries({ queryKey: ['reposicion'] }),
      ]);
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo guardar el calendario de entrega.')),
  });

  const alternarDia = (d: number) => setDias((actual) => (actual.includes(d) ? actual.filter((x) => x !== d) : [...actual, d]));
  const valorMinimo = leerNumero(minimo);
  const minimoValido = valorMinimo !== null && !Number.isNaN(valorMinimo);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (valorMinimo !== null && Number.isNaN(valorMinimo)) {
      setError('El pedido mínimo debe ser un número (por ejemplo 750000).');
      return;
    }
    guardar.mutate({
      dias_entrega: [...dias].sort((a, b) => a - b),
      hora_limite_pedido: hora === '' ? null : hora,
      pedido_minimo: valorMinimo,
    });
  }

  const atajo =
    'inline-flex min-h-9 items-center rounded-full border border-borde-campo bg-white px-3 text-xs font-semibold text-azul-noche transition-colors hover:bg-arena';
  const campo =
    'min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo';

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="flex w-full flex-wrap items-center justify-between gap-2 text-sm font-semibold text-grafito">
          <span className="inline-flex items-center gap-2">
            <Truck size={16} aria-hidden="true" className="text-gris-texto" />
            ¿Qué días entrega?
          </span>
        </legend>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {ORDEN_SEMANA.map((d) => {
            const activo = dias.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={activo}
                onClick={() => alternarDia(d)}
                className={`flex min-h-16 flex-col items-center justify-center rounded-lg border text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trigo ${
                  activo ? 'border-verde-bosque bg-verde-bosque text-white' : 'border-borde-campo bg-white text-gris-texto hover:bg-arena'
                }`}
              >
                <span className="text-lg font-bold leading-none">{INICIAL_DIA[d]}</span>
                <span className="mt-1 text-[11px] font-medium capitalize">{NOMBRE_DIA[d].slice(0, 3)}</span>
                <span className="sr-only">{activo ? ' (entrega)' : ' (no entrega)'}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gris-texto">Atajos:</span>
          <button type="button" className={atajo} onClick={() => setDias(ENTRE_SEMANA)}>
            Lunes a viernes
          </button>
          <button type="button" className={atajo} onClick={() => setDias([...ORDEN_SEMANA])}>
            Todos los días
          </button>
          <button type="button" className={atajo} onClick={() => setDias([])}>
            Ninguno
          </button>
        </div>
        {dias.length === 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-atencion-fondo p-3 text-xs text-atencion-texto">
            <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            Sin ningún día marcado, el sistema avisa que falta el calendario y no calcula pedidos de este proveedor.
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="entrega-hora" className="flex items-baseline justify-between text-sm font-semibold text-grafito">
            Hora límite para pedir
            <span className="text-xs font-normal text-gris-texto">Opcional</span>
          </label>
          <div className="relative">
            <CalendarClock size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
            <input id="entrega-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={`${campo} pl-10`} />
          </div>
          <span className="text-xs text-gris-texto">
            {hora === ''
              ? 'Sin hora límite: un pedido cuenta como del mismo día a cualquier hora.'
              : 'Un pedido hecho después de esta hora cuenta como del día siguiente.'}
          </span>
          {hora !== '' && (
            <button type="button" onClick={() => setHora('')} className="self-start text-xs font-semibold text-azul-noche underline">
              Quitar la hora límite
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="entrega-minimo" className="flex items-baseline justify-between text-sm font-semibold text-grafito">
            Pedido mínimo
            <span className="text-xs font-normal text-gris-texto">Opcional</span>
          </label>
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gris-texto">
              $
            </span>
            <input
              id="entrega-minimo"
              inputMode="numeric"
              placeholder="Ej. 750000"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              className={`${campo} cifras pl-8`}
            />
          </div>
          <span className="text-xs text-gris-texto">{minimoValido ? `Se leerá como ${pesos.format(valorMinimo)}.` : 'En pesos, por pedido.'}</span>
        </div>
      </div>

      {/* Resumen: así queda el calendario antes de guardar */}
      <div className="rounded-lg border border-linea bg-white p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gris-texto">
          <Info size={13} aria-hidden="true" />
          Así quedará
        </p>
        <p className="text-sm text-grafito">
          {dias.length === 0 ? 'Entrega: sin definir' : `Entrega: ${textoDiasEntrega(dias)}`}
          {hora !== '' && ` · Pedir antes de las ${hora}`}
          {minimoValido && ` · Mínimo ${pesos.format(valorMinimo)}`}
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-linea pt-4">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          <Check size={16} aria-hidden="true" />
          Guardar calendario
        </Button>
      </div>
    </form>
  );
}
