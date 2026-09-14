'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Use this to label a standalone input that isn't inside a Form. Connecting it to the input via the for attribute ensures screen readers announce the label correctly. If the input lives inside a Form, use FormLabel instead since it automatically handles error state styling.
 */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium leading-tight text-foreground cursor-default',
        'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
