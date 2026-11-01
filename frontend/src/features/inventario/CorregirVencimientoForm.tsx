import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { corregirVencimiento } from '../../services/inventarioService';
import { mensajeDeError } from '../../services/errores';
import type { VencimientoCorregido } from '../../types/inventario.types';
import { fechaReal } from './esquemaEntrada';
import { formatoFecha } from './formatos';

interface Props {
  loteId: string;
  codigoLote: string | null;
  nombre: string;
  fechaActual: string | null;
  onTerminar: (hecho?: VencimientoCorregido) => void;
}

// Para cuando la fecha de vencimiento quedó mal escrita al registrar la entrada
export function CorregirVencimientoForm({ loteId, codigoLote, nombre, fechaActual, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(fechaActual ?? '');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () => corregirVencimiento(loteId, fecha === '' ? null : fecha),
    onSuccess: async (hecho) => {
      // Cambia el estado de los lotes y las alertas
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      onTerminar(hecho);
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo cambiar la fecha de vencimiento.')),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fecha !== '' && !fechaReal(fecha)) return setError('Escribe una fecha válida.');
    if (fecha === (fechaActual ?? '')) return setError('Esa ya es la fecha de vencimiento del lote.');
    guardar.mutate();
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div className="text-sm text-gris-texto">
        <p className="font-medium text-grafito">
          {nombre} · Lote {codigoLote ?? 'sin código'}
        </p>
        <p>{fechaActual ? `Vence el ${formatoFecha(fechaActual)}.` : 'Sin fecha de vencimiento.'}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="nuevo-vencimiento" className="text-sm font-medium text-grafito">
          Fecha de vencimiento correcta
        </label>
        <input
          id="nuevo-vencimiento"
          type="date"
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            setError(null);
          }}
          className="min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm"
        />
        <p className="text-xs text-gris-texto">Déjala vacía solo si el insumo no vence. Los insumos que se usan por vencimiento (FEFO) siempre llevan fecha.</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="secondary" className="min-h-11" disabled={guardar.isPending} onClick={() => onTerminar()}>
          Cancelar
        </Button>
        <Button type="submit" className="min-h-11" isLoading={guardar.isPending}>
          Guardar fecha
        </Button>
      </div>
    </form>
  );
}
