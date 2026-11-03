import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/feedback/ErrorState';
import { LoadingState } from '../../components/feedback/LoadingState';
import { getLotesMateria } from '../../services/inventarioService';
import { useAuth } from '../auth/useAuth';
import { CorregirLoteForm } from './CorregirLoteForm';
import { CorregirVencimientoForm } from './CorregirVencimientoForm';
import { COLOR_ESTADO, ETIQUETA_ESTADO, formatoCantidad, formatoCosto, formatoDinero, formatoFecha, formatoFechaIso, textoVencimiento } from './formatos';

interface Props {
  materiaId: string;
  hoy: string;
}

const ROTACION: Record<string, string> = {
  FEFO: 'Se usa primero lo que vence antes (FEFO).',
  FIFO: 'Se usa primero lo que llegó antes (FIFO).',
  ninguno: 'Sin orden de uso definido.',
};

export function LotesPanel({ materiaId, hoy }: Props) {
  const { usuario } = useAuth();
  const esGestion = usuario?.rol === 'administrador' || usuario?.rol === 'superadministrador';
  // Qué lote se está corrigiendo y qué se corrige de él; el aviso confirma el último cambio hecho
  const [corrigiendo, setCorrigiendo] = useState<{ id: string; que: 'cantidad' | 'fecha' } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventario', 'lotes', materiaId],
    queryFn: () => getLotesMateria(materiaId),
  });

  if (isLoading) return <LoadingState mensaje="Cargando lotes..." />;
  if (isError || !data) return <ErrorState onReintentar={() => refetch()} />;

  const { materia, resumen, lotes, criterio_rotacion } = data;
  const unidad = materia.unidad;
  const loteACorregir = lotes.find((l) => l.id === corrigiendo?.id);

  if (loteACorregir && corrigiendo?.que === 'fecha') {
    return (
      <CorregirVencimientoForm
        loteId={loteACorregir.id}
        codigoLote={loteACorregir.codigo_lote ?? null}
        nombre={materia.nombre}
        fechaActual={loteACorregir.fecha_vencimiento}
        onTerminar={(hecho) => {
          setCorrigiendo(null);
          if (hecho) {
            setAviso(
              `Lote ${hecho.codigo_lote ?? 'sin código'}: ${hecho.fecha_nueva ? `ahora vence el ${formatoFecha(hecho.fecha_nueva)}` : 'quedó sin fecha de vencimiento'}.`,
            );
          }
        }}
      />
    );
  }

  if (loteACorregir) {
    return (
      <CorregirLoteForm
        loteId={loteACorregir.id}
        codigoLote={loteACorregir.codigo_lote ?? null}
        nombre={materia.nombre}
        unidad={unidad}
        cantidadActual={loteACorregir.cantidad_disponible}
        onTerminar={(hecho) => {
          setCorrigiendo(null);
          if (hecho) {
            setAviso(
              `Lote ${hecho.codigo_lote ?? 'sin código'} corregido: de ${formatoCantidad(hecho.cantidad_anterior, unidad)} a ${formatoCantidad(hecho.cantidad_nueva, unidad)}.`,
            );
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso && <Alert variant="success">{aviso}</Alert>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gris-texto">
        <span>
          Existencias: <span className="font-semibold text-grafito">{formatoCantidad(resumen.stock, unidad)}</span>
        </span>
        {resumen.valor !== undefined && (
          <span>
            Valor: <span className="font-semibold text-grafito">{formatoDinero(resumen.valor)}</span>
          </span>
        )}
        <Badge color={COLOR_ESTADO[resumen.estado]}>{ETIQUETA_ESTADO[resumen.estado]}</Badge>
      </div>
      <p className="text-xs text-gris-texto">{criterio_rotacion ? ROTACION[criterio_rotacion] : 'Criterio de uso sin definir.'}</p>

      {lotes.length === 0 ? (
        <p className="py-6 text-center text-sm text-gris-texto">No hay lotes con existencias.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {lotes.map((l, i) => (
            <li key={l.id} className="rounded-lg border border-linea p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-grafito">
                    {i === 0 && lotes.length > 1 && <span className="mr-2 text-xs font-medium text-pizarra">Usar primero</span>}
                    Lote {l.codigo_lote ?? 'sin código'}
                  </p>
                  <p className="text-xs text-gris-texto">Entró el {formatoFechaIso(l.created_at)}</p>
                </div>
                <p className="text-sm font-medium text-grafito">{formatoCantidad(l.cantidad_disponible, unidad)}</p>
              </div>
              <p className="mt-1 text-xs text-gris-texto">
                {l.fecha_vencimiento ? `${formatoFecha(l.fecha_vencimiento)} · ` : ''}
                {textoVencimiento(hoy, l.fecha_vencimiento)}
                {l.costo_unitario !== undefined && ` · ${formatoCosto(l.costo_unitario)} por ${unidad}`}
              </p>
              {esGestion && (
                <div className="mt-1 flex flex-wrap gap-x-4">
                  <button
                    type="button"
                    className="min-h-11 text-sm font-medium text-pizarra hover:underline"
                    onClick={() => {
                      setAviso(null);
                      setCorrigiendo({ id: l.id, que: 'cantidad' });
                    }}
                  >
                    Corregir existencias
                  </button>
                  <button
                    type="button"
                    className="min-h-11 text-sm font-medium text-pizarra hover:underline"
                    onClick={() => {
                      setAviso(null);
                      setCorrigiendo({ id: l.id, que: 'fecha' });
                    }}
                  >
                    Cambiar vencimiento
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
