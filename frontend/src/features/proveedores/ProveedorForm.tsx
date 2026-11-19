import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Info, MapPin, Phone, Plus, Truck, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
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
  // Al crear, entrega el proveedor nuevo para poder indicar el siguiente paso
  onTerminar: (creado?: { id: string; nombre: string }) => void;
}

interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  opcional?: boolean;
  ayuda?: string;
  error?: string;
}

// Campo con ícono a la izquierda; la etiqueta dice si es opcional y la ayuda se cambia por el error si lo hay
const Campo = forwardRef<HTMLInputElement, CampoProps>(({ id, etiqueta, icono: Icono, opcional = false, ayuda, error, className = '', ...rest }, ref) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-grafito">
      {etiqueta}
      {opcional && <span className="text-xs font-normal text-gris-texto">Opcional</span>}
    </label>
    <div className="relative">
      <Icono size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
      <input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? `${id}-ayuda` : undefined}
        className={`min-h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm text-grafito transition-colors placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo ${
          error ? 'border-critico-texto' : 'border-borde-campo'
        } ${className}`}
        {...rest}
      />
    </div>
    {error ? (
      <span id={`${id}-ayuda`} className="text-xs font-medium text-critico-texto">
        {error}
      </span>
    ) : (
      ayuda && (
        <span id={`${id}-ayuda`} className="text-xs text-gris-texto">
          {ayuda}
        </span>
      )
    )}
  </div>
));
Campo.displayName = 'Campo';

export function ProveedorForm({ proveedor, onTerminar }: Props) {
  const modoEdicion = proveedor !== null;
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ValoresProveedor>({
    resolver: zodResolver(esquemaProveedor),
    defaultValues: proveedor ? valoresDesdeProveedor(proveedor) : valoresVacios,
  });

  const nombreEscrito = watch('nombre').trim();

  const guardar = useMutation({
    mutationFn: async (valores: ValoresProveedor) => {
      const datos = aDatosProveedor(esquemaProveedor.parse(valores));
      return proveedor ? editarProveedor(proveedor.id, datos) : crearProveedor(datos);
    },
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      onTerminar(modoEdicion ? undefined : { id: resultado.id, nombre: resultado.nombre });
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo guardar el proveedor.')),
  });

  const enviar = handleSubmit((valores) => {
    setErrorServidor(null);
    guardar.mutate(valores);
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      {/* Vista previa: se arma mientras escribes el nombre */}
      <div className="flex items-center gap-3 rounded-lg border border-linea bg-white p-3">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-lg bg-verde-suave font-display text-xl font-semibold text-verde-bosque">
          {nombreEscrito ? nombreEscrito.charAt(0).toUpperCase() : <Truck size={22} />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-grafito">{nombreEscrito || (modoEdicion ? 'Editar proveedor' : 'Nuevo proveedor')}</p>
          <p className="text-xs text-gris-texto">{modoEdicion ? 'Cambia los datos de este proveedor.' : 'Así aparecerá en tu lista de proveedores.'}</p>
        </div>
      </div>

      <Campo
        id="prov-nombre"
        etiqueta="Nombre del proveedor"
        icono={Truck}
        maxLength={120}
        autoFocus
        placeholder="Por ejemplo: Molinos del Sur"
        ayuda="Como lo conoces tú o como aparece en sus facturas."
        error={errors.nombre?.message}
        {...register('nombre')}
      />

      <fieldset className="flex flex-col gap-4 rounded-lg border border-linea p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wide text-gris-texto">Contacto</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="prov-contacto" etiqueta="Persona de contacto" icono={User} opcional placeholder="Nombre de quien atiende" error={errors.contacto?.message} {...register('contacto')} />
          <Campo
            id="prov-telefono"
            etiqueta="Teléfono"
            icono={Phone}
            opcional
            inputMode="tel"
            placeholder="Ej. 300 123 4567"
            error={errors.telefono?.message}
            {...register('telefono')}
          />
        </div>
        <Campo id="prov-direccion" etiqueta="Dirección" icono={MapPin} opcional placeholder="Calle, barrio o ciudad" error={errors.direccion?.message} {...register('direccion')} />
      </fieldset>

      {!modoEdicion && (
        <p className="flex items-start gap-2 rounded-lg bg-info-fondo p-3 text-xs text-azul-noche">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Al crearlo, el sistema te recuerda definir sus días de entrega y sus precios: con eso Reposición calcula cuándo y cuánto pedir.
        </p>
      )}

      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-linea pt-4">
        <Button type="button" variant="secondary" onClick={() => onTerminar()} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          {modoEdicion ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {modoEdicion ? 'Guardar cambios' : 'Crear proveedor'}
        </Button>
      </div>
    </form>
  );
}
