import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'default';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    
    // 150-220ms ease-out, Lift 2px on hover, Scale 98% on pressed
    const baseStyles = "inline-flex items-center justify-center font-bold tracking-wide transition-all duration-200 ease-out hover:-translate-y-[2px] active:scale-[0.98] active:translate-y-0 focus:outline-none disabled:opacity-50 disabled:pointer-events-none rounded-lg";
    
    const variants = {
      primary: "bg-yoru-accent text-[#030407] hover:bg-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_15px_rgba(255,255,255,0.15)]",
      secondary: "border border-white/10 bg-yoru-surface-elevated text-yoru-text hover:bg-white/10 hover:border-white/20 shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_15px_rgba(0,0,0,0.4)]",
      outline: "border border-white/20 bg-transparent text-white hover:bg-white/10 hover:border-white/30",
      ghost: "hover:bg-yoru-surface-elevated text-yoru-text-muted hover:text-white",
      danger: "bg-yoru-error/10 text-yoru-error hover:bg-yoru-error hover:text-white",
      destructive: "bg-yoru-error text-white hover:bg-yoru-error/90 shadow-[0_4px_10px_rgba(239,68,68,0.2)]",
    };
    
    const sizes = {
      sm: "px-4 py-2 text-xs",
      md: "px-6 py-2.5 text-sm",
      default: "px-6 py-2.5 text-sm",
      lg: "px-8 py-3.5 text-base",
      icon: "min-w-[44px] min-h-[44px] p-2.5", // minimum 44px touch target
    };
    
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
