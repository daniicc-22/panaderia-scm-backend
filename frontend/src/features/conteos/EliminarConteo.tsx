import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { eliminarConteo } from '../../services/conteosService';
import { mensajeDeError } from '../../services/errores';
import type { EstadoConteo } from '../../types/conteo.types';

interface Props {
  // null = cerrado
  conteo: { id: string; numero: number; estado: EstadoConteo } | null;
  onCerrar: () => void;
  onEliminado: () => void;
}

// Confirmación para borrar un conteo que salió mal. No toca el inventario: solo se borra el conteo y lo contado.
export function EliminarConteo({ conteo, onCerrar, onEliminado }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarConteo(id),
    onSuccess: async () => {
      // Solo la lista: el detalle del conteo borrado ya no existe y no debe volver a pedirse
      await queryClient.invalidateQueries({ queryKey: ['conteos', 'lista'] });
      onEliminado();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo eliminar el conteo.')),
  });

  function cerrar() {
    if (eliminar.isPending) return;
    setError(null);
    onCerrar();
  }

  return (
    <Modal isOpen={conteo !== null} onClose={cerrar} title={conteo ? `Eliminar el conteo n.º ${conteo.numero}` : 'Eliminar conteo'}>
      {conteo && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Se borra el conteo con todo lo que se contó en él. <span className="font-medium text-gray-900">El inventario no cambia.</span> Esta acción no se
            puede deshacer.
          </p>
          {conteo.estado === 'enviado' && <Alert variant="warning">Este conteo está esperando revisión.</Alert>}
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="min-h-11" disabled={eliminar.isPending} onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              className="min-h-11"
              isLoading={eliminar.isPending}
              onClick={() => {
                setError(null);
                eliminar.mutate(conteo.id);
              }}
            >
              Eliminar conteo
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
