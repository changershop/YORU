import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { Button } from './Button';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false
}) => {
  if (!isOpen) return null;

  const iconConfig = {
    danger: {
      icon: AlertTriangle,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/20',
      confirmClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25'
    },
    warning: {
      icon: AlertCircle,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      confirmClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/25'
    },
    info: {
      icon: Info,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
      confirmClass: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
    }
  }[variant];

  const Icon = iconConfig.icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-[#0c0e17] border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden"
        >
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-xl border shrink-0 ${iconConfig.bg} ${iconConfig.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1.5 pr-4">
              <h3 className="text-base font-bold text-white">{title}</h3>
              <p className="text-xs text-yoru-text-muted leading-relaxed">{message}</p>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-zinc-400 hover:text-white p-1 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="text-xs border-white/10 text-zinc-300 hover:text-white"
            >
              {cancelText}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onConfirm();
              }}
              disabled={isLoading}
              className={`text-xs font-semibold px-4 shadow-lg ${iconConfig.confirmClass}`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
