import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';

export function formatRecipientLine(phone: string | null, email: string | null): string | null {
  if (phone) return `${phone} · SMS`;
  if (email) return `${email} · Email`;
  return null;
}

export interface ArgyleSendDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  expiryNote?: string;
  loading: boolean;
}

export function ArgyleSendDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  recipientPhone,
  recipientEmail,
  expiryNote,
  loading,
}: ArgyleSendDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const recipientLine = formatRecipientLine(recipientPhone, recipientEmail);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  const busy = loading || confirming;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {(recipientLine || expiryNote) && (
          <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-0.5 border border-border">
            {recipientLine && (
              <p>
                <span className="font-medium">Send to:</span> {recipientLine}
              </p>
            )}
            {expiryNote && <p className="text-muted-foreground">{expiryNote}</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Sending…' : 'Confirm & Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
