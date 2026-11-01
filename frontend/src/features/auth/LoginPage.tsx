import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, MotionConfig, motion, useAnimationControls } from 'motion/react';
import { CircleCheck, Eye, EyeOff, OctagonAlert } from 'lucide-react';
import { useAuth } from './useAuth';
import { Logo } from '../../components/brand/Logo';
import { env } from '../../app/config/env';

const esquemaLogin = z.object({
  email: z.string().min(1, 'Escribe tu correo').email('Ese correo no parece válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

type FormularioLogin = z.infer<typeof esquemaLogin>;
type Estado = 'listo' | 'horneando' | 'exito';

const PALABRAS = ['gestionar.', 'producir.', 'reducir desperdicios.'];

// Saludo según la hora de Colombia; incluye a todo el equipo (sin «panadero»)
function saludoDelMomento() {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return { momento: 'Buenos días', saludo: '¡Buenos días!', frase: 'El horno ya está caliente. Hora de empezar.' };
  if (h >= 12 && h < 18) return { momento: 'Buenas tardes', saludo: '¡Buenas tardes!', frase: 'Revisemos cómo va la producción de hoy.' };
  return { momento: 'Buenas noches', saludo: '¡Buenas noches!', frase: 'Dejemos todo listo para la hornada de mañana.' };
}

// Logo grande cuyas barras crecen como pan que leva
function LogoVivo() {
  return (
    <svg width="96" height="96" viewBox="0 0 48 48" role="img" aria-label="Logo Panadería SCM">
      <path d="M5 35 C5 20 13 13 24 13 C35 13 43 20 43 35 Z" fill="#F5F3EE" />
      <rect className="origin-bottom animate-crece [transform-box:fill-box]" x="14" y="26" width="5" height="7" rx="1.5" fill="#E2AE45" />
      <rect className="origin-bottom animate-crece [animation-delay:250ms] [transform-box:fill-box]" x="21.5" y="22" width="5" height="11" rx="1.5" fill="#E2AE45" />
      <rect className="origin-bottom animate-crece [animation-delay:500ms] [transform-box:fill-box]" x="29" y="18" width="5" height="15" rx="1.5" fill="#A85C3E" />
      <rect x="3" y="35" width="42" height="3.5" rx="1.75" fill="#E2AE45" />
    </svg>
  );
}

const GRANOS = [
  { izq: '6%', retraso: '0s', dur: '7s' }, { izq: '17%', retraso: '2.4s', dur: '8s' }, { izq: '28%', retraso: '1.1s', dur: '6.5s' },
  { izq: '41%', retraso: '3.6s', dur: '7.5s' }, { izq: '53%', retraso: '0.6s', dur: '9s' }, { izq: '64%', retraso: '2.9s', dur: '6.8s' },
  { izq: '76%', retraso: '1.8s', dur: '8.2s' }, { izq: '88%', retraso: '4.2s', dur: '7.2s' },
];

// Vitrina con panes que saltan a la repisa al cargar
function Vitrina() {
  const panes = [
    { x: '7%', w: 120, svg: <><ellipse cx="60" cy="36" rx="57" ry="21" fill="#C98A4E" /><path d="M24 30 l14 -9 M50 28 l14 -9 M76 28 l14 -9" stroke="#F5F3EE" strokeWidth="4" strokeLinecap="round" /></>, h: 58 },
    { x: '34%', w: 86, svg: <><path d="M4 70 C4 24 20 6 43 6 C66 6 82 24 82 70 Z" fill="#E2AE45" /><path d="M43 16 v40" stroke="#A85C3E" strokeWidth="4" strokeLinecap="round" /></>, h: 72 },
    { x: '56%', w: 96, svg: <><circle cx="27" cy="31" r="22" fill="#B86B3F" /><circle cx="66" cy="31" r="22" fill="#C98A4E" /><circle cx="46" cy="22" r="14" fill="#D9A06A" /></>, h: 54 },
    { x: '80%', w: 72, svg: <><path d="M6 46 C6 22 20 10 36 10 C52 10 66 22 66 46 Z" fill="#D9A06A" /><circle cx="26" cy="26" r="2.5" fill="#A85C3E" /><circle cx="40" cy="22" r="2.5" fill="#A85C3E" /><circle cx="46" cy="32" r="2.5" fill="#A85C3E" /></>, h: 52 },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 h-40" aria-hidden="true">
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[#1b2d3d]" />
      <div className="absolute inset-x-0 bottom-[94px] h-2 bg-terracota" />
      {panes.map((p, i) => (
        <motion.svg
          key={i}
          className="absolute bottom-[100px]"
          style={{ left: p.x }}
          width={p.w}
          height={p.h}
          viewBox={`0 0 ${p.w} ${p.h}`}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 + i * 0.25, type: 'spring', stiffness: 260, damping: 14 }}
        >
          {p.svg}
        </motion.svg>
      ))}
    </div>
  );
}

// Patrón de espigas del fondo del formulario
function PatronEspigas() {
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <pattern id="espigas" width="54" height="54" patternUnits="userSpaceOnUse">
          <g fill="#A86749">
            <path d="M27 44V18" stroke="#A86749" strokeWidth="2.4" strokeLinecap="round" />
            <ellipse cx="22" cy="24" rx="3.6" ry="6" transform="rotate(-30 22 24)" />
            <ellipse cx="32" cy="24" rx="3.6" ry="6" transform="rotate(30 32 24)" />
            <ellipse cx="22" cy="33" rx="3.6" ry="6" transform="rotate(-30 22 33)" />
            <ellipse cx="32" cy="33" rx="3.6" ry="6" transform="rotate(30 32 33)" />
            <ellipse cx="27" cy="14" rx="3.2" ry="5.4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#espigas)" />
    </svg>
  );
}

const CAMPO =
  'h-12 w-full rounded-lg border-[3px] bg-hueso px-4 text-[15px] text-grafito placeholder:text-gris-texto transition-colors focus:outline-hidden focus:border-trigo';

export function LoginPage() {
  const { iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('listo');
  const [verClave, setVerClave] = useState(false);
  const [palabra, setPalabra] = useState(0);
  const tarjeta = useAnimationControls();
  const { momento, saludo, frase } = saludoDelMomento();

  useEffect(() => {
    const id = setInterval(() => setPalabra((p) => (p + 1) % PALABRAS.length), 2600);
    return () => clearInterval(id);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormularioLogin>({ resolver: zodResolver(esquemaLogin) });

  const sacudir = () => tarjeta.start({ x: [0, -8, 8, -8, 8, 0], transition: { duration: 0.42 } });

  async function onSubmit(datos: FormularioLogin) {
    setErrorLogin(null);
    setEstado('horneando');
    try {
      await iniciarSesion(datos);
      setEstado('exito');
      const destino = (location.state as { from?: Location })?.from?.pathname ?? '/inicio';
      setTimeout(() => navigate(destino, { replace: true }), 600);
    } catch (err) {
      setErrorLogin(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      setEstado('listo');
      sacudir();
    }
  }

  const hayErrorCampo = !!errors.email || !!errors.password;
  const textoBoton = estado === 'horneando' ? 'Horneando tu sesión…' : estado === 'exito' ? '¡Listo! Entrando al panel' : 'Iniciar sesión';

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col font-sans lg:flex-row">
        {/* Panel de marca: solo en pantallas grandes (en celular el formulario va primero) */}
        <section className="relative hidden flex-1 overflow-hidden bg-azul-noche px-14 pt-14 pb-48 text-white lg:block">
          {GRANOS.map((g, i) => (
            <span
              key={i}
              className="absolute bottom-32 h-3 w-[7px] animate-flota rounded-full bg-trigo"
              style={{ left: g.izq, animationDelay: g.retraso, animationDuration: g.dur }}
              aria-hidden="true"
            />
          ))}
          <div className="relative flex items-center gap-4">
            <LogoVivo />
            <span className="font-display text-3xl font-semibold">Panadería SCM</span>
          </div>
          <div className="relative mt-16 max-w-lg">
            <p className="font-display text-[44px] leading-tight font-semibold">Inteligencia para</p>
            <div className="relative h-14 font-display text-[44px] leading-tight font-semibold text-trigo" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.span
                  key={palabra}
                  className="absolute left-0 whitespace-nowrap"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.35 }}
                >
                  {PALABRAS[palabra]}
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="mt-6 text-base leading-relaxed text-niebla">
              Inventario por lote, recetas estandarizadas y pedidos con EOQ, en un solo lugar.
            </p>
          </div>
          <Vitrina />
        </section>

        {/* Formulario */}
        <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-login-fondo px-4 py-10 sm:px-6">
          <PatronEspigas />

          <div className="relative mb-6 flex items-center gap-3 text-white lg:hidden">
            <Logo size={40} />
            <span className="font-display text-2xl font-semibold">Panadería SCM</span>
          </div>

          {/* La entrada va en el contenedor: la animación CSS no debe pisar la sacudida de Motion */}
          <div className="relative w-full max-w-md animate-entra">
          <motion.form
            animate={tarjeta}
            onSubmit={handleSubmit(onSubmit, sacudir)}
            noValidate
            className="relative w-full overflow-hidden rounded-2xl border-[3px] border-hueso shadow-login"
          >
            <div className="bg-trigo px-7 pt-7 pb-6 sm:px-9">
              <span className="inline-block rounded-full bg-azul-noche px-3 py-1 text-[13px] font-semibold text-white">{momento}</span>
              <h1 className="mt-3 font-display text-[32px] leading-tight font-semibold text-azul-noche">{saludo}</h1>
              <p className="mt-2 text-[15px] text-grafito">{frase}</p>
            </div>

            <div className="flex flex-col gap-4 bg-azul-noche px-7 pt-6 pb-7 text-white sm:px-9">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[13px] font-semibold">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="nombre@panaderia.com"
                  aria-invalid={!!errors.email}
                  className={`${CAMPO} ${errors.email || errorLogin ? 'border-trigo' : 'border-hueso'}`}
                  {...register('email')}
                />
                {errors.email && <span className="text-xs font-semibold text-trigo">{errors.email.message}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-[13px] font-semibold">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={verClave ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    aria-invalid={!!errors.password}
                    className={`${CAMPO} pr-24 ${errors.password || errorLogin ? 'border-trigo' : 'border-hueso'}`}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setVerClave((v) => !v)}
                    className="absolute top-1.5 right-1.5 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold text-azul-noche hover:bg-arena"
                  >
                    {verClave ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    {verClave ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {errors.password && <span className="text-xs font-semibold text-trigo">{errors.password.message}</span>}
              </div>

              <AnimatePresence>
                {errorLogin && !hayErrorCampo && (
                  <motion.p
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 rounded-lg bg-hueso px-3 py-2 text-sm font-semibold text-critico-texto"
                  >
                    <OctagonAlert size={18} className="shrink-0" aria-hidden="true" />
                    {errorLogin}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={estado !== 'listo'}
                className={`mt-1 inline-flex h-[52px] items-center justify-center gap-2.5 rounded-lg text-base font-semibold text-white transition-colors duration-200 active:scale-[0.98] disabled:cursor-wait ${
                  estado === 'exito' ? 'bg-verde-bosque' : 'bg-terracota hover:bg-[#93502f]'
                }`}
              >
                {estado === 'horneando' && (
                  <svg className="animate-hornea" width="30" height="22" viewBox="0 0 30 22" aria-hidden="true">
                    <ellipse cx="15" cy="14" rx="13" ry="7" fill="#E2AE45" />
                    <path d="M8 12 l4 -3 M14 11 l4 -3 M20 12 l3 -2" stroke="#A85C3E" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )}
                {estado === 'exito' && <CircleCheck size={20} aria-hidden="true" />}
                <span>{textoBoton}</span>
              </button>

              <p className="text-center text-xs text-niebla">
                Al ingresar aceptas el tratamiento de tus datos personales (Ley 1581 de 2012).
              </p>

              {env.apiMode === 'mock' && (
                <div className="rounded-lg bg-noche-tarjeta p-3 text-xs text-niebla">
                  <p className="mb-1 font-semibold text-white">Modo simulado · usuarios de prueba</p>
                  <p>superadmin@demo.local — Demo123!</p>
                  <p>admin@demo.local — Demo123!</p>
                  <p>operario@demo.local — Demo123!</p>
                </div>
              )}
            </div>
          </motion.form>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}
