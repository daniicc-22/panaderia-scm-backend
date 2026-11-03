import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  // 'lg' para contenido con tablas; por defecto el diálogo es angosto
  size?: 'md' | 'lg';
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, size = 'md', children }: ModalProps) {
  // Escape cierra el diálogo
  useEffect(() => {
    if (!isOpen) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-[entra_160ms_ease-out_both] items-center justify-center bg-grafito/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`max-h-full w-full animate-entra overflow-y-auto rounded-xl bg-hueso shadow-xl ${size === 'lg' ? 'max-w-4xl' : 'max-w-md'}`}
      >
        <div className="flex items-center justify-between gap-3 bg-azul-noche px-6 py-4">
          {title && <h2 className="font-display text-lg font-semibold text-white">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-niebla transition-colors hover:bg-noche-tarjeta hover:text-white"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
