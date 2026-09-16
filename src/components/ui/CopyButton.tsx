import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  iconOnly?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = 'Copy Link',
  copiedLabel = 'Copied!',
  className,
  iconOnly = false
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for iframe or insecure context
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200",
        copied
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80 hover:text-white",
        className
      )}
      title={copied ? copiedLabel : label}
      aria-label={copied ? copiedLabel : label}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in-50 duration-200" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white" />
      )}
      {!iconOnly && (
        <span>{copied ? copiedLabel : label}</span>
      )}
    </button>
  );
};
