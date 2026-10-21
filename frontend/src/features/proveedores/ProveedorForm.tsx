import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { crearProveedor, editarProveedor } from '../../services/proveedoresService';
import { mensajeDeError } from '../../services/errores';
import type { Proveedor } from '../../types/proveedor.types';
import {
  aDatosProveedor,
  esquemaProveedor,
  valoresDesdeProveedor,
  valoresVacios,
  type ValoresProveedor,
} from './esquemaProveedor';

interface Props {
  // Si viene un proveedor se edita; si no, se crea uno nuevo
  proveedor: Proveedor | null;
  onTerminar: () => void;
}

export function ProveedorForm({ proveedor, onTerminar }: Props) {
  const modoEdicion = proveedor !== null;
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValoresProveedor>({
    resolver: zodResolver(esquemaProveedor),
    defaultValues: proveedor ? valoresDesdeProveedor(proveedor) : valoresVacios,
  });

  const guardar = useMutation({
    mutationFn: async (valores: ValoresProveedor) => {
      const datos = aDatosProveedor(esquemaProveedor.parse(valores));
      return proveedor ? editarProveedor(proveedor.id, datos) : crearProveedor(datos);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      onTerminar();
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo guardar el proveedor.')),
  });

  const enviar = handleSubmit((valores) => {
    setErrorServidor(null);
    guardar.mutate(valores);
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Input id="prov-nombre" label="Nombre" maxLength={120} autoFocus error={errors.nombre?.message} {...register('nombre')} />
      <Input id="prov-contacto" label="Persona de contacto" placeholder="Opcional" error={errors.contacto?.message} {...register('contacto')} />
      <Input
        id="prov-telefono"
        label="Teléfono"
        inputMode="tel"
        placeholder="Opcional"
        error={errors.telefono?.message}
        {...register('telefono')}
      />
      <Input id="prov-direccion" label="Dirección" placeholder="Opcional" error={errors.direccion?.message} {...register('direccion')} />

      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          {modoEdicion ? 'Guardar cambios' : 'Crear proveedor'}
        </Button>
      </div>
    </form>
  );
}
