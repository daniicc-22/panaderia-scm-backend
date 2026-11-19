import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { cambiarProducto } from '../../services/formulacionesService';
import { mensajeDeError } from '../../services/errores';
import type { FormulacionDetalle } from '../../types/formulacion.types';
import { validarNombreProducto, validarPrecioVenta, NOMBRE_PRODUCTO_MAX } from './esquemaVersion';

// Corrige el nombre del producto y fija su precio de venta (para el margen). No toca la receta ni crea versiones.
export function EditarProductoForm({ formulacion, onTerminar }: { formulacion: FormulacionDetalle; onTerminar: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(formulacion.producto);
  const [precio, setPrecio] = useState(formulacion.precio_venta == null ? '' : String(formulacion.precio_venta).replace('.', ','));
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [errorPrecio, setErrorPrecio] = useState<string | undefined>();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (cambios: Parameters<typeof cambiarProducto>[1]) => cambiarProducto(formulacion.id, cambios),
    onSuccess: async () => {
      // El nombre sale en la lista, el ABC, la producción y el historial
      await Promise.all(['formulaciones', 'formulacion', 'formulacion-versiones', 'clasificacion-abc', 'produccion'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      onTerminar();
    },
    onError: (e) => setErrorServidor(mensajeDeError(e, 'No se pudo guardar el producto.')),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorServidor(null);
    const n = validarNombreProducto(nombre);
    const p = formulacion.es_intermedio ? ({ ok: true, valor: null } as const) : validarPrecioVenta(precio);
    setErrorNombre(n.ok ? undefined : n.error);
    setErrorPrecio(p.ok ? undefined : p.error);
    if (!n.ok || !p.ok) return;

    const cambios: Parameters<typeof cambiarProducto>[1] = {};
    if (n.nombre !== formulacion.producto) cambios.nombre = n.nombre;
    if (!formulacion.es_intermedio && p.valor !== formulacion.precio_venta) cambios.precio_venta = p.valor;
    if (Object.keys(cambios).length === 0) return onTerminar();
    guardar.mutate(cambios);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Input id="edit-nombre" label="Nombre del producto" maxLength={NOMBRE_PRODUCTO_MAX} autoFocus value={nombre} onChange={(e) => { setNombre(e.target.value); setErrorNombre(undefined); }} error={errorNombre} />
      {!formulacion.es_intermedio && (
        <Input
          id="edit-precio"
          label="Precio de venta por unidad"
          inputMode="decimal"
          placeholder="Déjalo vacío si no quieres calcular el margen"
          value={precio}
          onChange={(e) => { setPrecio(e.target.value); setErrorPrecio(undefined); }}
          error={errorPrecio}
        />
      )}
      <Alert variant="info">Esto no cambia la receta ni crea una versión nueva. El nombre se actualiza en todas las versiones del producto.</Alert>
      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>Cancelar</Button>
        <Button type="submit" isLoading={guardar.isPending}>Guardar</Button>
      </div>
    </form>
  );
}
