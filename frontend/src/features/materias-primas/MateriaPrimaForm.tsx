import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { crearMateriaPrima, editarMateriaPrima } from '../../services/materiasPrimasService';
import { mensajeDeError } from '../../services/errores';
import type { CatalogosMateriaPrima, MateriaPrima } from '../../types/materiaPrima.types';
import {
  aCambios,
  aDatosNuevos,
  crearEsquema,
  valoresDesdeMateria,
  valoresVacios,
  type ValoresFormulario,
} from './esquemaMateriaPrima';

interface Props {
  // Si viene una materia prima se edita; si no, se crea una nueva
  materia: MateriaPrima | null;
  catalogos: CatalogosMateriaPrima;
  onTerminar: () => void;
}

export function MateriaPrimaForm({ materia, catalogos, onTerminar }: Props) {
  const modoEdicion = materia !== null;
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValoresFormulario>({
    resolver: zodResolver(crearEsquema(modoEdicion)),
    defaultValues: materia ? valoresDesdeMateria(materia) : valoresVacios,
  });

  const guardar = useMutation({
    mutationFn: async (valores: ValoresFormulario) => {
      const validados = crearEsquema(modoEdicion).parse(valores);
      if (materia) return editarMateriaPrima(materia.id, aCambios(validados));
      return crearMateriaPrima(aDatosNuevos(validados));
    },
    onSuccess: async () => {
      // El catálogo alimenta formulaciones y ABC: se vuelven a pedir
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['materias-primas'] }),
        queryClient.invalidateQueries({ queryKey: ['formulaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['formulacion'] }),
        queryClient.invalidateQueries({ queryKey: ['clasificacion-abc'] }),
      ]);
      onTerminar();
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo guardar la materia prima.')),
  });

  const enviar = handleSubmit((valores) => {
    setErrorServidor(null);
    guardar.mutate(valores);
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      {modoEdicion && (
        <p className="text-sm text-gray-500">
          Código <span className="font-medium text-gray-800">{materia.codigo}</span> · el código y la unidad base no se
          pueden cambiar.
        </p>
      )}

      <Input id="mp-nombre" label="Nombre" maxLength={120} autoFocus error={errors.nombre?.message} {...register('nombre')} />

      <Select
        id="mp-unidad"
        label="Unidad base"
        disabled={modoEdicion}
        error={errors.unidad_base_id?.message}
        {...register('unidad_base_id')}
      >
        <option value="">Selecciona una unidad</option>
        {catalogos.unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre} ({u.codigo})
          </option>
        ))}
      </Select>

      <Select id="mp-categoria" label="Categoría" error={errors.categoria_id?.message} {...register('categoria_id')}>
        <option value="">Sin categoría</option>
        {catalogos.categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>

      <Select
        id="mp-rotacion"
        label="Criterio de rotación"
        error={errors.criterio_rotacion?.message}
        {...register('criterio_rotacion')}
      >
        <option value="">Sin definir</option>
        <option value="FIFO">FIFO (primero en entrar, primero en salir)</option>
        <option value="FEFO">FEFO (primero en vencer, primero en salir)</option>
        <option value="ninguno">Ninguno</option>
      </Select>

      <Input
        id="mp-lead"
        label="Tiempo de entrega del proveedor (días)"
        inputMode="decimal"
        placeholder="Opcional"
        error={errors.lead_time_dias?.message}
        {...register('lead_time_dias')}
      />

      <Select
        id="mp-variabilidad"
        label="¿El peso por unidad varía?"
        error={errors.variabilidad_peso_unitario?.message}
        {...register('variabilidad_peso_unitario')}
      >
        <option value="">Sin definir</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </Select>

      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          {modoEdicion ? 'Guardar cambios' : 'Crear materia prima'}
        </Button>
      </div>
    </form>
  );
}
