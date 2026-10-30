import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { guardarEntregaProveedor } from '../../services/proveedoresService';
import { mensajeDeError } from '../../services/errores';
import { leerNumero } from '../reposicion/unidades';
import { NOMBRE_DIA, ORDEN_SEMANA } from '../reposicion/etiquetas';
import type { Proveedor } from '../../types/proveedor.types';

interface Props {
  proveedor: Proveedor;
  onTerminar: () => void;
}

// Calendario de entrega y pedido mínimo del proveedor: de aquí sale cuándo y cuánto pedir.
export function EntregaProveedorForm({ proveedor, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [dias, setDias] = useState<number[]>(proveedor.dias_entrega);
  const [hora, setHora] = useState(proveedor.hora_limite_pedido ?? '');
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

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valorMinimo = leerNumero(minimo);
    if (Number.isNaN(valorMinimo)) {
      setError('El pedido mínimo debe ser un número (por ejemplo 750000).');
      return;
    }
    guardar.mutate({
      dias_entrega: [...dias].sort((a, b) => a - b),
      hora_limite_pedido: hora === '' ? null : hora,
      pedido_minimo: valorMinimo,
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-gray-700">Días en que entrega</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ORDEN_SEMANA.map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm capitalize text-gray-700">
              <input type="checkbox" checked={dias.includes(d)} onChange={() => alternarDia(d)} />
              {NOMBRE_DIA[d]}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">Sin ningún día marcado, el sistema avisa que falta el calendario y no calcula pedidos.</p>
      </fieldset>

      <Input
        id="entrega-hora"
        label="Hora límite para pedir (opcional)"
        type="time"
        value={hora}
        onChange={(e) => setHora(e.target.value)}
      />
      <p className="-mt-3 text-xs text-gray-500">
        Si un pedido se hace después de esta hora cuenta como del día siguiente. Déjala vacía si el proveedor no tiene hora límite.
      </p>

      <Input
        id="entrega-minimo"
        label="Pedido mínimo por pedido, en pesos (opcional)"
        inputMode="numeric"
        placeholder="Ej. 750000"
        value={minimo}
        onChange={(e) => setMinimo(e.target.value)}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
