import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { mensajeDeError } from '../../services/errores';
import { eliminarProduccion } from '../../services/produccionService';

interface Props {
  // null = cerrado
  produccion: { id: string; producto: string; fecha: string } | null;
  onCerrar: () => void;
  onEliminada: (mensaje: string) => void;
}

// Confirmación para borrar una producción registrada por error o de prueba.
// Lo que se descontó de las existencias vuelve a sus lotes, y el rastro desaparece.
export function EliminarProduccion({ produccion, onCerrar, onEliminada }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarProduccion(id),
    onSuccess: async (r) => {
      // Cambian existencias, reposición, mermas e indicadores: se refresca todo
      await queryClient.invalidateQueries();
      const mermas = r.mermas_eliminadas > 0 ? ` También se quitaron ${r.mermas_eliminadas} ${r.mermas_eliminadas === 1 ? 'merma ligada' : 'mermas ligadas'}.` : '';
      onEliminada(`Producción eliminada. Los insumos volvieron a ${r.lotes_repuestos} ${r.lotes_repuestos === 1 ? 'lote' : 'lotes'}.${mermas}`);
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo eliminar la producción.')),
  });

  function cerrar() {
    if (eliminar.isPending) return;
    setError(null);
    onCerrar();
  }

  return (
    <Modal isOpen={produccion !== null} onClose={cerrar} title="Eliminar producción">
      {produccion && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gris-texto">
            Vas a eliminar la producción de <span className="font-medium text-grafito">{produccion.producto}</span> del {produccion.fecha}. Úsalo solo para
            corregir un registro hecho por error o de prueba.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gris-texto">
            <li>Los insumos que se descontaron <span className="font-medium text-grafito">vuelven a sus lotes</span>.</li>
            <li>Se borran su pesaje y las mermas ligadas a ella.</li>
            <li>No queda historial de esta producción. No se puede deshacer.</li>
          </ul>
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
                eliminar.mutate(produccion.id);
              }}
            >
              Eliminar producción
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
