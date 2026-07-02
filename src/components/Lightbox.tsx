import React, { useEffect, useCallback } from 'react';
import './Lightbox.css';

interface LightboxProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const Lightbox: React.FC<LightboxProps> = ({ open, onClose, title, children }) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title">{title}</span>
          <button className="lightbox-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="lightbox-body">{children}</div>
      </div>
    </div>
  );
};

export default Lightbox;
