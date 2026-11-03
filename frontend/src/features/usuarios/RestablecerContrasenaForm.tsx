import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { restablecerContrasena } from '../../services/usuariosService';
import { mensajeDeError } from '../../services/errores';
import type { UsuarioPanaderia } from '../../types/usuario.types';
import { esquemaRestablecer, type ValoresRestablecer } from './esquemaUsuario';

interface Props {
  usuario: UsuarioPanaderia;
  panaderiaId?: string;
  onTerminar: () => void;
}

export function RestablecerContrasenaForm({ usuario, panaderiaId, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValoresRestablecer>({ resolver: zodResolver(esquemaRestablecer), defaultValues: { password: '' } });

  const guardar = useMutation({
    mutationFn: (v: ValoresRestablecer) => restablecerContrasena(usuario.id, v.password, panaderiaId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      onTerminar();
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo restablecer la contraseña.')),
  });

  const enviar = handleSubmit((v) => {
    setErrorServidor(null);
    guardar.mutate(v);
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-grafito">
        Nueva contraseña para <span className="font-medium">{usuario.nombre}</span>
        {usuario.nombre_usuario ? ` (${usuario.nombre_usuario})` : ''}.
      </p>
      <PasswordInput id="rst-clave" label="Contraseña nueva" autoFocus autoComplete="new-password" error={errors.password?.message} {...register('password')} />
      <p className="text-xs text-gris-texto">Al entrar con ella, la persona tendrá que elegir una propia.</p>
      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" isLoading={guardar.isPending}>
          Guardar contraseña
        </Button>
      </div>
    </form>
  );
}
