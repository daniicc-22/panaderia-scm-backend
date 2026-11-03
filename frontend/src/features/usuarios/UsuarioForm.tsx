import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Select } from '../../components/ui/Select';
import { crearUsuario } from '../../services/usuariosService';
import { mensajeDeError } from '../../services/errores';
import { esquemaUsuario, type ValoresUsuario } from './esquemaUsuario';

interface Props {
  // Solo el superadministrador puede elegir el rol; el administrador siempre crea operarios
  puedeElegirRol: boolean;
  panaderiaId?: string;
  onTerminar: (creado: string) => void;
}

export function UsuarioForm({ puedeElegirRol, panaderiaId, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValoresUsuario>({
    resolver: zodResolver(esquemaUsuario),
    defaultValues: { nombre: '', nombre_usuario: '', email: '', password: '', rol: 'operario' },
  });

  const guardar = useMutation({
    mutationFn: (valores: ValoresUsuario) => {
      const v = esquemaUsuario.parse(valores);
      return crearUsuario(
        { nombre: v.nombre, nombre_usuario: v.nombre_usuario, password: v.password, rol: puedeElegirRol ? v.rol : 'operario', ...(v.email ? { email: v.email } : {}) },
        panaderiaId,
      );
    },
    onSuccess: async (creado) => {
      await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      onTerminar(creado.nombre);
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo crear el usuario.')),
  });

  const enviar = handleSubmit((valores) => {
    setErrorServidor(null);
    guardar.mutate(valores);
  });

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Input id="usr-nombre" label="Nombre de la persona" maxLength={100} autoFocus error={errors.nombre?.message} {...register('nombre')} />
      <Input
        id="usr-usuario"
        label="Usuario para entrar"
        placeholder="por ejemplo: maria.lopez"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={errors.nombre_usuario?.message}
        {...register('nombre_usuario')}
      />
      <Input id="usr-email" type="email" label="Correo (opcional)" placeholder="Opcional" error={errors.email?.message} {...register('email')} />
      {puedeElegirRol && (
        <Select id="usr-rol" label="Rol" {...register('rol')}>
          <option value="operario">Operario</option>
          <option value="administrador">Administrador</option>
        </Select>
      )}
      <PasswordInput
        id="usr-clave"
        label="Contraseña inicial"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <p className="text-xs text-gray-500">
        Mínimo 10 caracteres con letras y números. Entrégasela a la persona: al entrar por primera vez tendrá que cambiarla.
      </p>
      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="submit" isLoading={guardar.isPending}>
          Crear usuario
        </Button>
      </div>
    </form>
  );
}
