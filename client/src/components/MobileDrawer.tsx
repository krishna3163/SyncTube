import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
  ariaDescribedBy?: string;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  badge,
  ariaDescribedBy,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scrolling when drawer is open on mobile
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Touch drag-to-dismiss gesture handling
  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY > 0) {
      // Only permit dragging downwards to close
      currentYRef.current = e.touches[0].clientY;
      setDragOffsetY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const deltaY = currentYRef.current - startYRef.current;
    if (deltaY > 120) {
      onClose();
    }
    setDragOffsetY(0);
  };

  if (!isOpen) return null;

  return (
    <div
      className="mobile-drawer-portal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby={ariaDescribedBy}
    >
      {/* Dimmed glass backdrop */}
      <div
        className="mobile-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sliding Sheet */}
      <div
        ref={drawerRef}
        className={`mobile-drawer-sheet ${isDragging ? 'is-dragging' : ''}`}
        style={{
          transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
        }}
      >
        {/* Swipe grab handle */}
        <div
          className="mobile-drawer-handle-zone"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="mobile-drawer-handle" />
        </div>

        {/* Header bar */}
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-title-row">
            {icon && <span className="mobile-drawer-icon">{icon}</span>}
            <h2 className="mobile-drawer-title">{title}</h2>
            {badge && <div className="mobile-drawer-badge">{badge}</div>}
          </div>
          <button
            type="button"
            className="mobile-drawer-close-btn"
            onClick={onClose}
            aria-label={`Close ${title} drawer`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="mobile-drawer-body">
          {children}
        </div>
      </div>
    </div>
  );
};
