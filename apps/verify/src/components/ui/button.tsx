'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent text-sm font-medium whitespace-nowrap cursor-pointer select-none outline-none transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50',
        outline:
          'border-[var(--civic-border-component)] bg-transparent text-foreground hover:border-[var(--civic-border-strong)] hover:bg-[var(--civic-bg-component-hover)] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[var(--civic-bg-component-hover)] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        ghost:
          'text-foreground hover:bg-[var(--civic-bg-component-hover)] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-[3px] focus-visible:ring-destructive/20',
        link: 'text-accent-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3',
        xs: "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1 px-3',
        lg: 'h-10 px-4',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Spinner = () => (
  <svg
    data-slot="button-spinner"
    className="shrink-0 animate-spin"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.25" />
    <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  loading,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </ButtonPrimitive>
  );
}

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
type ButtonProps = React.ComponentProps<typeof Button>;

export { Button, buttonVariants };
export type { VariantProps, ButtonVariant, ButtonSize, ButtonProps };
