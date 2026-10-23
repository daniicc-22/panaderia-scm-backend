import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from './useAuth';
import { Input } from '../../components/ui/Input';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Card } from '../../components/ui/Card';

const esquemaLogin = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type FormularioLogin = z.infer<typeof esquemaLogin>;

export function LoginPage() {
  const { iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormularioLogin>({
    resolver: zodResolver(esquemaLogin),
  });

  async function onSubmit(datos: FormularioLogin) {
    setErrorLogin(null);
    setEnviando(true);
    try {
      await iniciarSesion(datos);
      const destino = (location.state as { from?: Location })?.from?.pathname ?? '/inicio';
      navigate(destino, { replace: true });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
      setErrorLogin(mensaje);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Panadería SCM</h1>
          <p className="text-sm text-gray-500">Inicia sesión para continuar</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {errorLogin && <Alert variant="error">{errorLogin}</Alert>}

            <Input
              id="email"
              type="email"
              label="Correo electrónico"
              placeholder="tucorreo@demo.local"
              error={errors.email?.message}
              {...register('email')}
            />

            <PasswordInput
              id="password"
              label="Contraseña"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" isLoading={enviando} className="mt-2">
              Iniciar sesión
            </Button>
          </form>
        </Card>

        <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-500">
          <p className="mb-1 font-medium text-gray-600">Usuarios de prueba:</p>
          <p>superadmin@demo.local — Demo123!</p>
          <p>admin@demo.local — Demo123!</p>
          <p>operario@demo.local — Demo123!</p>
        </div>
      </div>
    </div>
  );
}