import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { animate, motion, useReducedMotion } from 'motion/react';
import {
  BookOpen,
  ChefHat,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Croissant,
  Flame,
  Maximize,
  Minimize,
  OctagonAlert,
  Package,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { getConteos } from '../../services/conteosService';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { getProducciones } from '../../services/produccionService';

// ---------- Reloj y pantalla completa ----------
function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

function usePantallaCompleta() {
  const [activa, setActiva] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const alCambiar = () => setActiva(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);
  const alternar = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return { activa, alternar, disponible: typeof document !== 'undefined' && !!document.documentElement.requestFullscreen };
}

// ---------- Número que sube al entrar ----------
function Cifra({ valor }: { valor: number }) {
  const reducido = useReducedMotion();
  const [mostrado, setMostrado] = useState(reducido ? valor : 0);
  useEffect(() => {
    if (reducido) return;
    const c = animate(0, valor, { duration: 1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setMostrado(Math.round(v)) });
    return () => c.stop();
  }, [valor, reducido]);
  return <>{(reducido ? valor : mostrado).toLocaleString('es-CO')}</>;
}

// ---------- Anillo de producción del día ----------
function Anillo({ hechas, objetivo }: { hechas: number; objetivo: number }) {
  const r = 84;
  const largo = 2 * Math.PI * r;
  const avance = objetivo > 0 ? Math.min(hechas / objetivo, 1) : 0;
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id="anillo-op" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E2AE45" />
          <stop offset="100%" stopColor="#A85C3E" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r={r} fill="none" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="16" />
      <motion.circle
        cx="100"
        cy="100"
        r={r}
        fill="none"
        stroke="url(#anillo-op)"
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={largo}
        initial={{ strokeDashoffset: largo }}
        animate={{ strokeDashoffset: largo * (1 - avance) }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

// ---------- Fondo: foto de la panadería (frontend/public/fondo-operario.jpg) ----------
const HARINA = Array.from({ length: 12 }, (_, i) => ({ izq: `${(i * 8.3 + 4) % 96}%`, retraso: `${(i * 0.6) % 5}s`, dur: `${6 + (i % 5)}s`, t: 4 + (i % 3) * 2 }));

function FondoPanaderia() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* La foto, apenas desenfocada para que las tarjetas de vidrio resalten.
          Si la foto no carga, queda un degradado cálido. */}
      <div
        className="absolute -inset-4 scale-105 bg-cover bg-center blur-[2px]"
        style={{ backgroundImage: "url('/fondo-operario.jpg'), linear-gradient(135deg, #5c3820 0%, #8a5530 50%, #3a2417 100%)" }}
      />
      {HARINA.map((h, i) => (
        <span
          key={i}
          className="absolute bottom-0 animate-flota rounded-full bg-[#fff8ec]"
          style={{ left: h.izq, width: h.t, height: h.t, opacity: 0.6, animationDelay: h.retraso, animationDuration: h.dur }}
        />
      ))}
      {/* Velo: más oscuro arriba (saludo y reloj) y suave al centro, para que todo se lea */}
      <div className="absolute inset-0 bg-linear-to-b from-[#1b120c]/70 via-[#1b120c]/35 to-[#1b120c]/55" />
    </div>
  );
}

// ---------- Botones de la derecha ----------
interface Accion {
  etiqueta: string;
  detalle: string;
  ruta: string;
  icono: LucideIcon;
  clase: string;
}

const VIDRIO = 'border border-white/25 backdrop-blur-md';

function BotonAccion({ a, i }: { a: Accion; i: number }) {
  return (
    <motion.li initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.32, ease: 'easeOut' }}>
      <motion.div whileHover={{ x: -4 }} whileTap={{ scale: 0.97 }}>
        <Link
          to={a.ruta}
          className={`group flex min-h-[76px] items-center gap-4 rounded-2xl px-5 py-3 shadow-[0_10px_24px_rgb(0_0_0_/_0.25)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-trigo ${a.clase}`}
        >
          <a.icono size={34} strokeWidth={1.9} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[22px] leading-tight font-semibold">{a.etiqueta}</span>
            <span className="block text-sm opacity-85">{a.detalle}</span>
          </span>
          <ChevronRight size={26} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </motion.div>
    </motion.li>
  );
}

const hoyLocal = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
const diaLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

// Inicio del operario: fondo de panadería, anillo con la producción del día, un estado que cambia
// según lo que pasa en la planta y los botones de las tareas a la derecha.
export function TableroOperario() {
  const { usuario } = useAuth();
  const nombre = usuario?.nombre?.split(' ')[0] ?? '';
  const ahora = useAhora();
  const completa = usePantallaCompleta();

  const producciones = useQuery({ queryKey: ['produccion', 'lista'], queryFn: () => getProducciones() });
  const alertas = useQuery({ queryKey: ['inventario', 'alertas'], queryFn: getAlertasVencimiento });
  const conteos = useQuery({ queryKey: ['conteos', 'lista'], queryFn: getConteos });

  const dia = useMemo(() => {
    const hoy = hoyLocal();
    const deHoy = (producciones.data ?? []).filter((p) => diaLocal(p.fecha) === hoy && p.estado !== 'cancelada');
    const hechas = deHoy.reduce((s, p) => s + (p.estado === 'finalizada' ? p.cantidad_producida ?? 0 : 0), 0);
    const objetivo = deHoy.reduce((s, p) => s + (p.cantidad_planificada ?? 0), 0);
    const enHorno = (producciones.data ?? []).filter((p) => p.estado === 'en_curso');
    return { hechas: Math.round(hechas), objetivo: Math.round(objetivo), enHorno, tandasHoy: deHoy.length };
  }, [producciones.data]);

  const vencidos = alertas.data?.resumen.vencidos ?? 0;
  const porVencer = alertas.data?.resumen.por_vencer ?? 0;
  const conteoAbierto = conteos.data?.items.find((c) => c.estado === 'en_curso');

  // Lo más importante primero
  const estado: { icono: LucideIcon; tono: string; titulo: string; texto: string; ruta?: string; accion?: string } =
    vencidos > 0
      ? { icono: OctagonAlert, tono: 'bg-critico-texto', titulo: '¡Ojo con la bodega!', texto: `${vencidos} ${vencidos === 1 ? 'insumo vencido' : 'insumos vencidos'}. Avísale al administrador.`, ruta: '/inventario', accion: 'Ver existencias' }
      : dia.enHorno.length > 0
        ? { icono: Flame, tono: 'bg-[#a85c3e]', titulo: '¡En el horno!', texto: `${dia.enHorno.length} ${dia.enHorno.length === 1 ? 'tanda en proceso' : 'tandas en proceso'}: ${dia.enHorno[0].producto}. Cuando salga, anota cuántas salieron.`, ruta: '/produccion', accion: 'Terminar tanda' }
        : conteoAbierto
          ? { icono: ClipboardCheck, tono: 'bg-pizarra', titulo: 'Conteo sin terminar', texto: `El conteo n.º ${conteoAbierto.numero} sigue abierto.`, ruta: `/conteos/${conteoAbierto.id}`, accion: 'Seguir contando' }
          : porVencer > 0
            ? { icono: TriangleAlert, tono: 'bg-[#c48a1c]', titulo: 'Usa primero lo que vence', texto: `${porVencer} ${porVencer === 1 ? 'insumo está por vencer' : 'insumos están por vencer'}.`, ruta: '/inventario', accion: 'Ver cuáles' }
            : { icono: CircleCheck, tono: 'bg-verde-bosque', titulo: dia.tandasHoy > 0 ? '¡Vas muy bien!' : '¡Todo en orden!', texto: dia.tandasHoy > 0 ? 'Sigue así, el proceso está al día.' : 'Cuando quieras, empieza la primera producción del día.' };

  const acciones: Accion[] = [
    {
      etiqueta: dia.enHorno.length > 0 ? 'Continuar producción' : 'Producir',
      detalle: dia.enHorno.length > 0 ? 'Terminar lo que está en el horno' : 'Elige una receta y los lotes',
      ruta: '/produccion',
      icono: ChefHat,
      clase: 'bg-[#a85c3e] text-white',
    },
    { etiqueta: 'Registrar merma', detalle: 'Algo se perdió o se dañó', ruta: '/mermas', icono: Trash2, clase: 'bg-critico-texto text-white' },
    { etiqueta: 'Recetas', detalle: 'Cuánto lleva cada pan', ruta: '/formulaciones', icono: BookOpen, clase: `bg-[#22374a]/85 text-white ${VIDRIO}` },
    { etiqueta: 'Existencias', detalle: 'Qué hay en bodega', ruta: '/inventario', icono: Package, clase: `bg-[#2f4a5e]/75 text-white ${VIDRIO}` },
    { etiqueta: 'Contar', detalle: 'Conteo físico', ruta: '/conteos', icono: ClipboardCheck, clase: `bg-[#f6e7c6]/90 text-[#6e4f10] ${VIDRIO}` },
  ];

  const h = ahora.getHours();
  const saludo = h >= 4 && h < 12 ? 'Buenos días' : h < 19 && h >= 12 ? 'Buenas tardes' : 'Buenas noches';
  const avance = dia.objetivo > 0 ? Math.round((Math.min(dia.hechas / dia.objetivo, 1)) * 100) : 0;

  return (
    // Ocupa toda la ventana; la foto pasa también por detrás de la barra de vidrio
    <div className="relative min-h-screen overflow-hidden pt-[76px] text-white">
      <FondoPanaderia />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Saludo, reloj y pantalla completa */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-lg text-[#f5e6cc]">
              {ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-display text-[40px] leading-tight font-semibold drop-shadow">
              {saludo}
              {nombre ? `, ${nombre}` : ''}
            </h1>
          </motion.div>
          <div className="flex items-center gap-3">
            <span className={`rounded-2xl bg-black/25 px-5 py-2 font-display text-[34px] leading-none font-semibold cifras ${VIDRIO}`}>
              {ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            {completa.disponible && (
              <button
                type="button"
                onClick={completa.alternar}
                aria-label={completa.activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
                title={completa.activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
                className={`inline-flex size-14 items-center justify-center rounded-2xl bg-black/25 text-white transition-colors hover:bg-black/40 ${VIDRIO}`}
              >
                {completa.activa ? <Minimize size={26} /> : <Maximize size={26} />}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(260px,1fr)_minmax(320px,1.1fr)] lg:items-center">
          {/* Anillo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="order-2 flex flex-col items-center lg:order-1"
          >
            <div className="relative aspect-square w-full max-w-[320px] rounded-full border border-white/20 bg-[#1b120c]/30 p-6 shadow-[0_20px_50px_rgb(0_0_0_/_0.35)] backdrop-blur-md">
              <Anillo hechas={dia.hechas} objetivo={dia.objetivo} />
              <div className="relative flex size-full flex-col items-center justify-center text-center text-white">
                <Croissant size={44} className="text-trigo" aria-hidden="true" />
                <p className="mt-1 text-lg font-semibold text-[#f5e6cc]">Producción de hoy</p>
                <p className="font-display text-[64px] leading-none font-semibold drop-shadow cifras">
                  <Cifra valor={dia.hechas} />
                </p>
                <p className="text-lg font-medium text-[#f5e6cc]">unidades</p>
              </div>
            </div>
            <span className="mt-4 rounded-full border border-white/20 bg-[#1b120c]/30 px-5 py-2 text-lg font-semibold text-white shadow-elevada backdrop-blur-md">
              {dia.objetivo > 0 ? (
                <>
                  Objetivo: <span className="cifras">{dia.objetivo.toLocaleString('es-CO')}</span> · {avance} %
                </>
              ) : (
                'Aún no hay producción hoy'
              )}
            </span>
          </motion.div>

          {/* Estado del momento */}
          <motion.div
            key={estado.titulo}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="order-3 rounded-3xl border border-white/20 bg-[#1b120c]/30 p-6 text-white shadow-[0_20px_50px_rgb(0_0_0_/_0.3)] backdrop-blur-md lg:order-2"
          >
            <div className="flex items-center gap-4">
              <span className={`inline-flex size-16 shrink-0 items-center justify-center rounded-full text-white ${estado.tono}`}>
                <estado.icono size={34} aria-hidden="true" />
              </span>
              <p className="font-display text-[30px] leading-tight font-semibold">{estado.titulo}</p>
            </div>
            <p className="mt-3 text-lg text-[#f5e6cc]">{estado.texto}</p>
            {/* Línea ondulada animada, como masa que se mueve */}
            <svg viewBox="0 0 220 24" className="mt-4 h-6 w-48" aria-hidden="true">
              <motion.path
                d="M2 12 C 30 0, 50 24, 80 12 S 130 0, 160 12 S 200 24, 218 12"
                fill="none"
                stroke="#E2AE45"
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
              />
            </svg>
            {estado.ruta && estado.accion && (
              <Link
                to={estado.ruta}
                className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-trigo px-5 text-lg font-semibold text-grafito active:scale-[0.97]"
              >
                {estado.accion}
                <ChevronRight size={22} aria-hidden="true" />
              </Link>
            )}
          </motion.div>

          {/* Acciones */}
          <ul className="order-1 flex flex-col gap-3 lg:order-3">
            {acciones.map((a, i) => (
              <BotonAccion key={a.ruta} a={a} i={i} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
