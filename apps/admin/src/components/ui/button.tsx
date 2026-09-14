'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

interface ButtonProps extends ButtonPrimitive.Props {
  /** Visual style: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link' */
  variant?: ButtonVariant;
  /** Size preset: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg' */
  size?: ButtonSize;
  /** Show a loading spinner and disable interaction */
  loading?: boolean;
}

const Spinner = () => (
  <svg
    data-slot="button-spinner"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    style={{ animation: 'civic-spin 0.6s linear infinite' }}
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.25" />
    <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/**
 * The standard way to trigger an action. Use the default variant for the primary action on a view, the destructive variant for anything that can't be undone, and the outline or ghost variants for secondary options. Aim for one primary button per view, and write labels that say what will happen rather than just "Submit" or "OK".
 */
function Button({
  className,
  variant = 'default',
  size = 'default',
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      className={className}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize };
