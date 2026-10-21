import { useEffect, type ReactNode } from 'react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div
        className={`max-h-full w-full overflow-y-auto rounded-lg bg-white p-6 shadow-lg ${size === 'lg' ? 'max-w-4xl' : 'max-w-md'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}