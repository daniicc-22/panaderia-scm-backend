import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../features/auth/useAuth';
import { esquemaCambioContrasena, type ValoresCambioContrasena } from '../features/auth/esquemaContrasena';
import { cambiarContrasena } from '../services/cuentaService';
import { mensajeDeError } from '../services/errores';

export function CambiarContrasenaPage() {
  const { usuario, actualizarUsuario } = useAuth();
  const navigate = useNavigate();
  const obligatorio = usuario?.debe_cambiar_password === true;
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ValoresCambioContrasena>({
    resolver: zodResolver(esquemaCambioContrasena),
    defaultValues: { actual: '', nueva: '', confirmar: '' },
  });

  const guardar = useMutation({
    mutationFn: (v: ValoresCambioContrasena) => cambiarContrasena({ actual: v.actual, nueva: v.nueva }),
    onSuccess: () => {
      actualizarUsuario({ debe_cambiar_password: false });
      reset();
      if (obligatorio) navigate('/inicio', { replace: true });
      else setListo(true);
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo cambiar la contraseña.')),
  });

  const enviar = handleSubmit((v) => {
    setErrorServidor(null);
    setListo(false);
    guardar.mutate(v);
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Cambiar contraseña</h1>
        <p className="text-sm text-gray-500">
          {obligatorio
            ? 'La contraseña que te dieron es temporal. Elige una propia para continuar.'
            : 'Usa una contraseña que solo tú conozcas.'}
        </p>
      </div>

      <Card>
        <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          {listo && <Alert variant="success">Contraseña cambiada.</Alert>}
          {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

          <PasswordInput id="cc-actual" label="Contraseña actual" autoComplete="current-password" error={errors.actual?.message} {...register('actual')} />
          <PasswordInput id="cc-nueva" label="Contraseña nueva" autoComplete="new-password" error={errors.nueva?.message} {...register('nueva')} />
          <PasswordInput id="cc-confirmar" label="Repite la contraseña nueva" autoComplete="new-password" error={errors.confirmar?.message} {...register('confirmar')} />
          <p className="text-xs text-gray-500">Mínimo 10 caracteres, con letras y números.</p>

          <Button type="submit" isLoading={guardar.isPending}>
            Guardar contraseña
          </Button>
        </form>
      </Card>
    </div>
  );
}
