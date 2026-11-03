import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { crearPanaderia } from '../../services/panaderiasService';
import { mensajeDeError } from '../../services/errores';
import type { NuevaPanaderia, PanaderiaCreada, UsuarioInicial } from '../../types/panaderia.types';
import { esquemaPanaderia, VALORES_INICIALES, type ValoresPanaderia } from './esquemaPanaderia';

const aUsuario = (u: ValoresPanaderia['administrador']): UsuarioInicial => ({
  nombre: u.nombre,
  nombre_usuario: u.nombre_usuario,
  password: u.password,
  ...(u.email ? { email: u.email } : {}),
});

export function aNuevaPanaderia(v: ValoresPanaderia): NuevaPanaderia {
  return {
    nombre: v.nombre,
    ...(v.ciudad ? { ciudad: v.ciudad } : {}),
    ...(v.direccion ? { direccion: v.direccion } : {}),
    ...(v.telefono ? { telefono: v.telefono } : {}),
    administrador: aUsuario(v.administrador),
    ...(v.con_operario ? { operario: aUsuario(v.operario) } : {}),
  };
}

interface Props {
  onTerminar: (creada: PanaderiaCreada) => void;
}

export function PanaderiaForm({ onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ValoresPanaderia>({ resolver: zodResolver(esquemaPanaderia), defaultValues: VALORES_INICIALES });
  const conOperario = watch('con_operario');

  const guardar = useMutation({
    mutationFn: (v: ValoresPanaderia) => crearPanaderia(aNuevaPanaderia(esquemaPanaderia.parse(v))),
    onSuccess: async (creada) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['panaderias'] }),
        queryClient.invalidateQueries({ queryKey: ['usuarios-panaderias'] }),
      ]);
      onTerminar(creada);
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo crear la panadería.')),
  });

  const enviar = handleSubmit((v) => {
    setErrorServidor(null);
    guardar.mutate(v);
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-grafito">La panadería</legend>
        <Input id="pan-nombre" label="Nombre" autoFocus maxLength={100} error={errors.nombre?.message} {...register('nombre')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="pan-ciudad" label="Ciudad (opcional)" placeholder="Pasto" error={errors.ciudad?.message} {...register('ciudad')} />
          <Input id="pan-telefono" label="Teléfono (opcional)" inputMode="tel" error={errors.telefono?.message} {...register('telefono')} />
        </div>
        <Input id="pan-direccion" label="Dirección (opcional)" error={errors.direccion?.message} {...register('direccion')} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-linea pt-4">
        <legend className="mb-1 text-sm font-semibold text-grafito">Administrador</legend>
        <Input id="adm-nombre" label="Nombre de la persona" error={errors.administrador?.nombre?.message} {...register('administrador.nombre')} />
        <Input
          id="adm-usuario"
          label="Usuario para entrar"
          placeholder="por ejemplo: laura.gomez"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          error={errors.administrador?.nombre_usuario?.message}
          {...register('administrador.nombre_usuario')}
        />
        <Input id="adm-email" type="email" label="Correo (opcional)" error={errors.administrador?.email?.message} {...register('administrador.email')} />
        <PasswordInput id="adm-clave" label="Contraseña inicial" autoComplete="new-password" error={errors.administrador?.password?.message} {...register('administrador.password')} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-linea pt-4">
        <legend className="mb-1 text-sm font-semibold text-grafito">Operario</legend>
        <label className="flex items-center gap-2 text-sm text-grafito">
          <input type="checkbox" {...register('con_operario')} />
          Crear también un operario
        </label>
        {conOperario && (
          <>
            <Input id="ope-nombre" label="Nombre de la persona" error={errors.operario?.nombre?.message} {...register('operario.nombre')} />
            <Input
              id="ope-usuario"
              label="Usuario para entrar"
              placeholder="por ejemplo: pedro.ruiz"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              error={errors.operario?.nombre_usuario?.message}
              {...register('operario.nombre_usuario')}
            />
            <Input id="ope-email" type="email" label="Correo (opcional)" error={errors.operario?.email?.message} {...register('operario.email')} />
            <PasswordInput id="ope-clave" label="Contraseña inicial" autoComplete="new-password" error={errors.operario?.password?.message} {...register('operario.password')} />
          </>
        )}
      </fieldset>

      <p className="text-xs text-gris-texto">
        Contraseñas de mínimo 10 caracteres con letras y números. Cada persona tendrá que cambiarla al entrar por primera vez y solo verá esta
        panadería.
      </p>
      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" isLoading={guardar.isPending}>
          Crear panadería
        </Button>
      </div>
    </form>
  );
}
