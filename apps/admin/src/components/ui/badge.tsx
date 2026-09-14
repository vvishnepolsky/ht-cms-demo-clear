import * as React from 'react';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
type BadgeSize = 'default' | 'sm';

interface BadgeProps extends React.ComponentProps<'span'> {
  /** Visual style: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' */
  variant?: BadgeVariant;
  /** Size preset: 'default' | 'sm' */
  size?: BadgeSize;
}

/**
 * A small label for generic categories, tags, or counts that don't have a dedicated badge component. If you're labeling a case status reach for StatusBadge; for a benefit program type reach for ProgramBadge. Use sparingly, because too many badges on one page lose their meaning.
 */
function Badge({ className, variant = 'default', size = 'default', ...props }: BadgeProps) {
  return <span data-slot="badge" data-variant={variant} data-size={size} className={className} {...props} />;
}

export { Badge, type BadgeProps, type BadgeVariant, type BadgeSize };
