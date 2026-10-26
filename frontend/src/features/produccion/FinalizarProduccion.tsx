import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { finalizarProduccion } from '../../services/produccionService';
import { mensajeDeError } from '../../services/errores';
import type { ProduccionFinalizada } from '../../types/produccion.types';
import { PRODUCIDA_MAX, leerProducida } from './pesos';

interface Props {
  id: string;
  planificada: number | null;
  onCerrar: () => void;
  onFinalizada: (r: ProduccionFinalizada) => void;
}

const CAMPO =
  'min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm';

// Cierra una producción en curso con lo que realmente salió del horno
export function FinalizarProduccion({ id, planificada, onCerrar, onFinalizada }: Props) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | null>(null);

  const finalizar = useMutation({
    mutationFn: (cantidad: number) => finalizarProduccion(id, cantidad),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['produccion'] });
      onFinalizada(r);
    },
  });

  function enviar() {
    const cantidad = leerProducida(texto);
    if (cantidad === null) {
      return setErrorCampo(`Escribe una cantidad mayor que 0 y hasta ${PRODUCIDA_MAX.toLocaleString('es-CO')}.`);
    }
    setErrorCampo(null);
    finalizar.mutate(cantidad);
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`prod-${id}`} className="text-sm font-medium text-gray-700">
          ¿Cuántas unidades salieron?
        </label>
        <input
          id={`prod-${id}`}
          className={CAMPO}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErrorCampo(null);
            finalizar.reset();
          }}
        />
        {planificada !== null && <span className="text-xs text-gray-500">Se esperaban {planificada.toLocaleString('es-CO')} unidades.</span>}
        {errorCampo && <span className="text-xs text-red-600">{errorCampo}</span>}
      </div>
      {finalizar.isError && <Alert variant="error">{mensajeDeError(finalizar.error, 'No se pudo cerrar la producción.')}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" className="min-h-11" onClick={onCerrar} disabled={finalizar.isPending}>
          Cancelar
        </Button>
        <Button type="button" className="min-h-11" isLoading={finalizar.isPending} onClick={enviar}>
          Cerrar producción
        </Button>
      </div>
    </div>
  );
}
