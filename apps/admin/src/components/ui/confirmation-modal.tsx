import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';

interface ConfirmationItem {
  label: string;
  value: string;
}

interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items?: ConfirmationItem[];
  primaryAction: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'destructive';
}

/**
 * The fastest way to ask a user to confirm before taking a destructive or significant action. Pass `title`, `description`, and a `primaryAction` with a label and callback. Use `variant="destructive"` to style the confirm button in red. If you need a completely custom layout, use AlertDialog directly instead.
 */
function ConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  items,
  primaryAction,
  secondaryAction,
  variant = 'default',
}: ConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {items && items.length > 0 && (
          <div data-slot="confirmation-modal-items">
            <dl data-slot="confirmation-modal-list">
              {items.map((item) => (
                <React.Fragment key={item.label}>
                  <dt data-slot="confirmation-modal-term">{item.label}</dt>
                  <dd data-slot="confirmation-modal-detail">{item.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}

        <DialogFooter>
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick} disabled={primaryAction.loading}>
              {secondaryAction.label}
            </Button>
          )}
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={primaryAction.onClick}
            disabled={primaryAction.loading}
            aria-busy={primaryAction.loading}
          >
            {primaryAction.loading ? (
              <span data-slot="confirmation-modal-loading">
                <span aria-hidden="true" data-slot="confirmation-modal-spinner" />
                {primaryAction.label}
              </span>
            ) : (
              primaryAction.label
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmationModal };
export type { ConfirmationModalProps, ConfirmationItem };
