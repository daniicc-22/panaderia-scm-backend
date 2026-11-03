import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NumeroAnimado } from '../../components/ui/NumeroAnimado';

interface PanelProps {
  titulo: string;
  subtitulo?: string;
  // Enlace o botón a la derecha del título
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Panel en azul noche (gráficos y bloques de identidad). */
  oscuro?: boolean;
}

// Tarjeta común del Inicio: mismo borde, espaciado y encabezado en todas las secciones
export function Panel({ titulo, subtitulo, accion, children, className = '', oscuro = false }: PanelProps) {
  const fondo = oscuro ? 'bg-azul-noche text-white' : 'border border-linea bg-tabla';
  return (
    <section className={`animate-entra rounded-tarjeta p-4 sm:p-5 ${fondo} ${className}`} aria-label={titulo}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={`text-base font-semibold ${oscuro ? 'text-white' : 'text-azul-noche'}`}>{titulo}</h2>
          {subtitulo && <p className={`text-sm ${oscuro ? 'text-niebla' : 'text-gris-texto'}`}>{subtitulo}</p>}
        </div>
        {accion && <div className="shrink-0 text-sm">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-azul-noche">{titulo}</h2>
      {children}
    </div>
  );
}

type Tono = 'azul' | 'verde' | 'amarillo' | 'rojo' | 'gris';

interface IndicadorProps {
  etiqueta: string;
  /** Texto a mostrar cuando no hay número para animar (por ejemplo, "—"). */
  valor: string;
  /** Si se da, la cifra cuenta desde 0 hasta este número. */
  numero?: number;
  formato?: (n: number) => string;
  detalle?: string;
  tono?: Tono;
  /** Al hacer clic, lleva a esta ruta. */
  enlace?: string;
  /** Posición en la fila: escalona la entrada (70 ms por tarjeta). */
  indice?: number;
}

// Bloques sólidos de la paleta (nivel de color 2). El color identifica, no avisa:
// "rojo" (terracota) no significa error; los problemas van en Requiere atención.
const TONO: Record<Tono, { caja: string; etiqueta: string; cifra: string }> = {
  azul: { caja: 'bg-azul-noche', etiqueta: 'text-niebla', cifra: 'text-white' },
  amarillo: { caja: 'bg-trigo', etiqueta: 'text-[#4a3509]', cifra: 'text-grafito' },
  verde: { caja: 'bg-verde-bosque', etiqueta: 'text-verde-suave', cifra: 'text-white' },
  rojo: { caja: 'bg-terracota', etiqueta: 'text-terracota-suave', cifra: 'text-white' },
  gris: { caja: 'bg-pizarra', etiqueta: 'text-niebla', cifra: 'text-white' },
};

export function Indicador({ etiqueta, valor, numero, formato, detalle, tono = 'gris', enlace, indice = 0 }: IndicadorProps) {
  const t = TONO[tono];
  const contenido = (
    <>
      <p className={`text-xs font-medium sm:text-sm ${t.etiqueta}`}>{etiqueta}</p>
      <p className={`mt-1 font-display text-2xl font-semibold sm:text-3xl ${t.cifra}`}>
        {numero !== undefined ? <NumeroAnimado valor={numero} formato={formato} /> : <span className="cifras">{valor}</span>}
      </p>
      {detalle && <p className={`mt-1 text-xs ${t.etiqueta}`}>{detalle}</p>}
    </>
  );
  const clases = `block animate-entra rounded-tarjeta p-4 sm:p-5 ${t.caja}`;
  const retraso = { animationDelay: `${indice * 70}ms` };

  if (enlace) {
    return (
      <Link
        to={enlace}
        style={retraso}
        className={`${clases} transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-elevada focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trigo`}
      >
        {contenido}
      </Link>
    );
  }
  return (
    <div style={retraso} className={clases}>
      {contenido}
    </div>
  );
}
