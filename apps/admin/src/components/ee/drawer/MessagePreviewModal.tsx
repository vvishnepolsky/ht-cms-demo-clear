/**
 * MessagePreviewModal — L4 of ENG-1708.
 *
 * Two-layer modal that previews a single CaseMessage:
 *
 *   Outer modal: message subject, recipient line, full content, attachments,
 *                multi-channel delivery rows (Mail / Portal / SMS / Email)
 *                with click-to-preview per channel.
 *   Inner modal: opens when a channel row is clicked; renders the channel-
 *                styled view of the same payload (USPS-style letter / Portal
 *                inbox / SMS phone bubble / email client header).
 *
 * Storyboard parity:
 *   - Outer modal lives at CaseDetailsDrawer.jsx L553–641.
 *   - Inner channel modal replaces the storyboard's `window.DeliveryPreviewModal`
 *     global (shared.jsx L1057–1183) with a module-scoped component.
 *
 * Modal stacking: both modals are simple fixed-overlay components controlled
 * by the parent via two state slots (previewingMsg, previewingMsgChannel).
 * Clicks inside each modal call e.stopPropagation() so they do not bubble to
 * the outer backdrop close handler.
 *
 * Civic tokens: backgrounds and colors flow through `var(--civic-*)`. The
 * USPS letter / SMS phone renderings retain their physical-medium palette
 * (paper cream, phone graphite) because those are intentional skeuomorphic
 * surfaces, not chrome — kept as inline values matching the storyboard.
 */

import { useRef } from 'react';
import { FileText, Mail as MailIcon, MessageSquare, Smartphone, X } from 'lucide-react';
import type { CaseMessage } from '../../../data/case-details';
import type { DrawerCaseRow } from './types';
import { useFocusTrapAndRestore } from './hooks';
import { OUTBOUND_CHANNELS } from './tabs/NoticesMessagesTab';

export type ChannelKind = 'mail' | 'portal' | 'sms' | 'email';

export interface PreviewingChannel {
  kind: ChannelKind;
  ch: string;
  ts: string;
  to: string;
  subject?: string;
  body: string;
  attachment?: { label: string };
}

interface MessagePreviewModalProps {
  message: CaseMessage;
  allChannels: ReadonlyArray<string>;
  caseRow: DrawerCaseRow;
  applicantEmail: string;
  applicantPhone: string;
  applicantAddress: string;
  onClose: () => void;
  onSelectChannel: (channel: PreviewingChannel) => void;
}

interface ChannelMeta {
  kind: ChannelKind;
  status: string;
}

const CHANNEL_META: Record<string, ChannelMeta> = {
  Mail: { kind: 'mail', status: 'Mailed via USPS First-Class · Delivered in 3–5 days' },
  Portal: { kind: 'portal', status: 'Posted to State HHS Citizen Portal Inbox · Delivered instantly' },
  SMS: { kind: 'sms', status: 'Delivered via short code 75127' },
  Email: { kind: 'email', status: 'Delivered to applicant email on file' },
};

const CHANNEL_ICON_BY_KIND: Record<ChannelKind, typeof MailIcon> = {
  mail: MailIcon,
  portal: FileText,
  sms: Smartphone,
  email: MessageSquare,
};

/**
 * Outer modal — shows message detail + per-channel delivery rows.
 */
export function MessagePreviewModal({
  message,
  allChannels,
  caseRow,
  applicantEmail,
  applicantPhone,
  applicantAddress,
  onClose,
  onSelectChannel,
}: MessagePreviewModalProps) {
  const isOut = message.direction === 'outbound';
  const recipientLine = isOut
    ? `${caseRow.applicantName}${applicantPhone ? ` · ${applicantPhone}` : ''}${
        applicantEmail ? ` · ${applicantEmail}` : ''
      }`
    : caseRow.applicantName;

  const channels = allChannels.length > 0 ? allChannels : [...OUTBOUND_CHANNELS];

  // AC-003 parity with the drawer: trap focus inside the modal and restore
  // to the trigger on close. ESC dismissal is owned by the drawer's single
  // composite ESC handler (CaseDetailsDrawer), which prioritises closing the
  // innermost open overlay (channel modal → message modal → drawer). That
  // avoids the FIFO addEventListener ordering trap where stacked listeners
  // close the wrong layer.
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useFocusTrapAndRestore(contentRef, closeButtonRef);

  const buildChannelPayload = (ch: string): PreviewingChannel => {
    const meta = CHANNEL_META[ch] ?? { kind: 'portal' as ChannelKind, status: 'Delivered' };
    const toAddress =
      ch === 'Mail'
        ? `${caseRow.applicantName}\n${applicantAddress}`
        : ch === 'SMS'
          ? applicantPhone || 'Phone on file'
          : ch === 'Email'
            ? applicantEmail || 'Email on file'
            : `${caseRow.applicantName} (Portal ID)`;
    return {
      kind: meta.kind,
      ch,
      ts: message.timestamp,
      to: toAddress,
      subject: message.subject,
      body: message.content,
      attachment: message.attachments?.[0] ? { label: message.attachments[0].name } : undefined,
    };
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--civic-overlay-bg)' }}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className="rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--civic-bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-3 border-b"
          style={{ borderColor: 'var(--civic-border-subtle)' }}
        >
          <div className="min-w-0">
            <p
              id="message-preview-title"
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--civic-text-primary)' }}
            >
              {message.subject || (isOut ? 'Outbound notice' : 'Inbound message')}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--civic-text-secondary)' }}>
              {isOut ? 'Sent to' : 'From'} {recipientLine} · {message.timestamp}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close message preview"
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--civic-text-placeholder)' }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Full content */}
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--civic-border-subtle)' }}>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--civic-text-placeholder)' }}
            >
              Message content
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--civic-text-primary)' }}>
              {message.content}
            </p>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {message.attachments.map((att) => (
                  <div
                    key={att.name}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                    style={{
                      backgroundColor: 'var(--civic-bg-app)',
                      borderColor: 'var(--civic-border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <FileText
                        className="w-4 h-4"
                        aria-hidden="true"
                        style={{ color: 'var(--civic-text-secondary)' }}
                      />
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--civic-text-primary)' }}>
                          {att.name}
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--civic-text-placeholder)' }}>
                          {att.size}
                        </p>
                      </div>
                    </div>
                    {/* L3 wires this to DocumentViewer; for L4 we surface the
                     * attachment but defer the viewer wiring. */}
                    <span className="text-xs" style={{ color: 'var(--civic-text-placeholder)' }}>
                      Documents tab
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Multi-channel delivery */}
          {isOut && (
            <div className="px-5 py-4">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--civic-text-placeholder)' }}
              >
                Delivery channels — click to preview as received
              </p>
              <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--civic-border-subtle)' }}>
                {channels.map((ch) => {
                  const meta = CHANNEL_META[ch] ?? {
                    kind: 'portal' as ChannelKind,
                    status: 'Delivered',
                  };
                  const Icon = CHANNEL_ICON_BY_KIND[meta.kind];
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChannel(buildChannelPayload(ch));
                      }}
                      className="w-full grid grid-cols-12 items-center px-3 py-2.5 gap-2 text-left transition-colors border-b last:border-0"
                      style={{ borderColor: 'var(--civic-border-subtle)' }}
                    >
                      <div className="col-span-3 flex items-center gap-2">
                        <Icon
                          className="w-3.5 h-3.5"
                          aria-hidden="true"
                          style={{ color: 'var(--civic-text-secondary)' }}
                        />
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={channelKindToPillStyle(ch)}
                        >
                          {ch}
                        </span>
                      </div>
                      <p className="col-span-8 text-xs" style={{ color: 'var(--civic-text-secondary)' }}>
                        {meta.status}
                      </p>
                      <p className="col-span-1 text-xs text-right" style={{ color: 'var(--civic-info-text)' }}>
                        →
                      </p>
                    </button>
                  );
                })}
              </div>
              {message.deliveryTracking && (
                <div
                  className="mt-3 text-[11px] leading-relaxed rounded-lg border px-3 py-2"
                  style={{
                    color: 'var(--civic-text-secondary)',
                    backgroundColor: 'var(--civic-bg-app)',
                    borderColor: 'var(--civic-border-subtle)',
                  }}
                >
                  <DeliveryTrackingLine label="Sent" value={message.deliveryTracking.sent} />
                  {' · '}
                  <DeliveryTrackingLine label="Delivered" value={message.deliveryTracking.delivered} />
                  <span style={{ color: 'var(--civic-success-text)' }}> ✓✓</span>
                  {' · '}
                  <DeliveryTrackingLine label="Read" value={message.deliveryTracking.read} />
                  {' · '}
                  <DeliveryTrackingLine label="Response" value={message.deliveryTracking.response} />
                  {' · '}
                  <DeliveryTrackingLine label="Deadline" value={message.deliveryTracking.deadline} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryTrackingLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
        {label}:
      </span>{' '}
      {value}
    </>
  );
}

function channelKindToPillStyle(channel: string): { backgroundColor: string; color: string } {
  switch (channel) {
    case 'Email':
      return { backgroundColor: 'var(--civic-info-bg)', color: 'var(--civic-info-text)' };
    case 'SMS':
      return { backgroundColor: 'var(--civic-plum-3)', color: 'var(--civic-plum-11)' };
    case 'Portal':
      return { backgroundColor: 'var(--civic-accent-bg)', color: 'var(--civic-accent-text)' };
    case 'Mail':
    default:
      return { backgroundColor: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Inner channel modal — DeliveryPreviewModal (storyboard window-global port).
// ────────────────────────────────────────────────────────────────────────────

interface DeliveryPreviewModalProps {
  channel: PreviewingChannel;
  onClose: () => void;
}

const KIND_CHANNEL_DISPLAY_NAME: Record<ChannelKind, string> = {
  mail: 'USPS First-Class Mail',
  portal: 'State HHS Citizen Portal',
  sms: 'SMS (short code 75127)',
  email: 'Email',
};

/**
 * Channel-rendered preview of the same payload as the outer modal.
 * Replaces the storyboard's `window.DeliveryPreviewModal` global with a
 * proper imported component.
 */
export function DeliveryPreviewModal({ channel, onClose }: DeliveryPreviewModalProps) {
  const channelDisplayName = KIND_CHANNEL_DISPLAY_NAME[channel.kind];
  // AC-003: trap focus inside this (topmost) modal and restore to the outer
  // modal's previously-focused element on close. ESC dismissal is owned by
  // the drawer's single composite ESC handler (CaseDetailsDrawer), which
  // closes the innermost open layer first.
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useFocusTrapAndRestore(contentRef, closeButtonRef);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-preview-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--civic-overlay-bg)' }}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className="rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--civic-bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--civic-border-subtle)' }}
        >
          <div>
            <p
              id="channel-preview-title"
              className="text-sm font-semibold"
              style={{ color: 'var(--civic-text-primary)' }}
            >
              Delivered via {channelDisplayName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--civic-text-secondary)' }}>
              {channel.ts}
              {channel.to ? ` · to ${channel.to.replace(/\n/g, ', ')}` : ''}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close channel preview"
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--civic-text-placeholder)' }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {channel.kind === 'mail' && <MailChannelView channel={channel} />}
          {channel.kind === 'portal' && <PortalChannelView channel={channel} />}
          {channel.kind === 'sms' && <SmsChannelView channel={channel} />}
          {channel.kind === 'email' && <EmailChannelView channel={channel} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeuomorphic surfaces (mail / SMS phone). These are intentional design
 * artefacts of the physical medium and use literal RGB values rather than
 * Civic tokens — they would render as the wrong thing if themed.
 */
function MailChannelView({ channel }: { channel: PreviewingChannel }) {
  return (
    <div className="px-4 py-5" style={{ backgroundColor: '#e5e7eb' }}>
      <div
        style={{
          backgroundColor: '#fdfdf8',
          padding: '18px 20px',
          border: '1px solid #d1d5db',
          boxShadow: '0 6px 18px -6px rgba(15,23,42,0.18)',
          fontFamily: 'Georgia, serif',
          fontSize: 12,
          color: '#111827',
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: '#6b7280',
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          USPS First-Class · Window envelope
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingBottom: 10,
            borderBottom: '1px solid #9ca3af',
          }}
        >
          <div
            style={{
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            State Medicaid Member Services
            <br />
            1305 E Walnut St
            <br />
            Capital City, SX 00100
          </div>
          <div style={{ fontSize: 9, color: '#374151', textAlign: 'right' }}>
            FIRST-CLASS MAIL
            <br />
            U.S. POSTAGE PAID
            <br />
            DES MOINES, IA
            <br />
            PERMIT NO. 1195
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            padding: '8px 10px',
            border: '1.5px solid #111827',
            display: 'inline-block',
            minWidth: 220,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: '#6b7280',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Addressee
          </div>
          <div
            style={{
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 11,
              lineHeight: 1.5,
              marginTop: 2,
              whiteSpace: 'pre-line',
            }}
          >
            {channel.to}
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{channel.body}</p>
        {channel.attachment && (
          <p
            className="mt-3 text-xs font-medium"
            style={{ color: 'var(--civic-info-text)', fontFamily: 'system-ui, sans-serif' }}
          >
            Enclosed document: {channel.attachment.label}
          </p>
        )}
      </div>
    </div>
  );
}

function PortalChannelView({ channel }: { channel: PreviewingChannel }) {
  return (
    <div className="px-5 py-5" style={{ backgroundColor: 'var(--civic-bg-app)' }}>
      <div
        className="rounded-lg p-4 max-w-md mx-auto border"
        style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
      >
        <div
          className="flex items-center gap-2 pb-3 mb-3 border-b"
          style={{ borderColor: 'var(--civic-border-subtle)' }}
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: 'var(--civic-accent-solid)',
              color: 'var(--civic-accent-on-solid)',
            }}
          >
            IA
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
              State HHS Member Portal
            </p>
            <p className="text-[10px]" style={{ color: 'var(--civic-text-secondary)' }}>
              Inbox
            </p>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--civic-text-secondary)' }}>
            {channel.ts}
          </span>
        </div>
        {channel.subject && (
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--civic-text-primary)' }}>
            {channel.subject}
          </p>
        )}
        <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--civic-text-primary)' }}>
          {channel.body}
        </div>
        {channel.attachment && (
          <p
            className="mt-3 inline-flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded border"
            style={{
              color: 'var(--civic-info-text)',
              borderColor: 'var(--civic-blue-6)',
              backgroundColor: 'var(--civic-info-bg)',
            }}
          >
            {channel.attachment.label}
          </p>
        )}
      </div>
    </div>
  );
}

function SmsChannelView({ channel }: { channel: PreviewingChannel }) {
  return (
    <div className="px-5 py-6 flex justify-center" style={{ backgroundColor: 'var(--civic-bg-app)' }}>
      <div
        style={{
          width: 280,
          backgroundColor: '#1f2937',
          borderRadius: 28,
          padding: 16,
          color: '#fff',
          boxShadow: '0 12px 28px -12px rgba(15,23,42,0.45)',
        }}
      >
        <div style={{ textAlign: 'center', fontSize: 10, opacity: 0.7, marginBottom: 6 }}>State HHS · {channel.ts}</div>
        <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>From: 75127 (short code)</div>
        <div
          style={{
            background: '#e5e7eb',
            color: '#111827',
            borderRadius: 18,
            padding: '10px 14px',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {channel.body}
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, opacity: 0.5, marginTop: 4 }}>Delivered</div>
      </div>
    </div>
  );
}

function EmailChannelView({ channel }: { channel: PreviewingChannel }) {
  return (
    <div className="px-5 py-5" style={{ backgroundColor: 'var(--civic-bg-app)' }}>
      <div
        className="rounded-lg max-w-lg mx-auto overflow-hidden border"
        style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
      >
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: 'var(--civic-border-subtle)', backgroundColor: 'var(--civic-bg-app)' }}
        >
          <div className="grid grid-cols-[56px_1fr] gap-y-1 text-xs">
            <span style={{ color: 'var(--civic-text-secondary)' }}>From:</span>
            <span className="font-medium" style={{ color: 'var(--civic-text-primary)' }}>
              State HHS &lt;no-reply@state.gov/dhs&gt;
            </span>
            <span style={{ color: 'var(--civic-text-secondary)' }}>To:</span>
            <span style={{ color: 'var(--civic-text-primary)' }}>{channel.to}</span>
            <span style={{ color: 'var(--civic-text-secondary)' }}>Date:</span>
            <span style={{ color: 'var(--civic-text-primary)' }}>{channel.ts}</span>
            <span style={{ color: 'var(--civic-text-secondary)' }}>Subject:</span>
            <span className="font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
              {channel.subject ?? ''}
            </span>
          </div>
        </div>
        <div
          className="px-4 py-4 text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: 'var(--civic-text-primary)' }}
        >
          {channel.body}
        </div>
        {channel.attachment && (
          <div
            className="px-4 py-3 border-t"
            style={{
              borderColor: 'var(--civic-border-subtle)',
              backgroundColor: 'var(--civic-bg-app)',
            }}
          >
            <p
              className="inline-flex items-center gap-2 text-xs font-medium"
              style={{ color: 'var(--civic-info-text)' }}
            >
              Attachment: {channel.attachment.label}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
