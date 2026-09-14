/**
 * NoticesMessagesTab — L4 of ENG-1708.
 *
 * Storyboard-ported timeline of inbound + outbound case communications
 * (Portal / SMS / Email / Mail / System). Renders:
 *   - Preferred-contact banner
 *   - RFI deadline banner (when an outbound message carries `rfiDeadline`)
 *     with urgency + response indicators driven by DEMO_TODAY.
 *   - Two-row filter (type: all / notices / messages; channel: dynamic)
 *   - Card list of messages, click-to-preview (delegated to parent via
 *     `onPreviewMessage`).
 *   - Inline reply form (channel pills + textarea + send), pre-selecting
 *     the applicant's preferred channel via `useState` initializer (the
 *     drawer remounts per case so a sync-on-prop-change effect is not
 *     needed; see `useReplyChannelDefault` in hooks.ts).
 *
 * Storyboard parity: /Downloads/CMS Demo Storyboard/src/components/CaseDetailsDrawer.jsx
 * ({tab === "messages" && (…)} block).
 *
 * Accessibility:
 *   - All filter pills are real <button type="button">.
 *   - Message cards are real <button> elements (whole-card click target).
 *   - Reply textarea has an associated <label> with `htmlFor`.
 *   - Status icons are decorative; SR text is provided alongside.
 *
 * Civic tokens: every color flows through `var(--civic-*)` — no ad-hoc hex.
 */

import { useState } from 'react';
import { Check, Clock, Mail, MessageSquare, Smartphone, FileText, type LucideIcon } from 'lucide-react';
import { DEMO_TODAY } from '../../../../data/demoToday';
import type { CaseMessage } from '../../../../data/case-details';
import type { DrawerTabProps } from '../types';
import { DrawerEmptyState } from '../DrawerEmptyState';

/** Filter row IDs — C.1 extracted; referenced from 3+ sites in the JSX. */
const MSG_TYPE_FILTER_ALL = 'all';
const MSG_TYPE_FILTER_NOTICES = 'notices';
const MSG_TYPE_FILTER_MESSAGES = 'messages';
type MsgTypeFilter = typeof MSG_TYPE_FILTER_ALL | typeof MSG_TYPE_FILTER_NOTICES | typeof MSG_TYPE_FILTER_MESSAGES;

const TYPE_FILTERS: ReadonlyArray<readonly [MsgTypeFilter, string]> = [
  [MSG_TYPE_FILTER_ALL, 'All'],
  [MSG_TYPE_FILTER_NOTICES, 'Notices'],
  [MSG_TYPE_FILTER_MESSAGES, 'Messages'],
];

/** Reply channel options. Pulled to top because referenced at 3+ sites. */
const REPLY_CHANNELS = ['Portal', 'Email', 'SMS'] as const;
type ReplyChannel = (typeof REPLY_CHANNELS)[number];

/** Multi-channel default for outbound notices (storyboard: collapses single
 * recorded channel into the standard 4-channel send display). */
export const OUTBOUND_CHANNELS = ['Mail', 'Portal', 'SMS', 'Email'] as const;
export type MessageChannel = (typeof OUTBOUND_CHANNELS)[number];

/** Role classification per message. */
type MessageRole = 'auto' | 'caseworker' | 'applicant';

function classifyRole(m: CaseMessage): MessageRole {
  if (m.direction === 'inbound') {
    if (m.channel === 'System') return 'auto';
    return 'applicant';
  }
  // outbound
  if (m.author && m.author !== 'System' && !/system|auto|rules engine/i.test(m.sender || '')) {
    return 'caseworker';
  }
  return 'auto';
}

function isNotice(m: CaseMessage): boolean {
  return classifyRole(m) === 'auto' || m.direction === 'outbound';
}

const ROLE_LABEL: Record<MessageRole, string> = {
  auto: 'Auto',
  caseworker: 'Caseworker',
  applicant: 'Applicant',
};

/** Channel pill background/foreground via Civic tokens (no ad-hoc hex). */
function channelPillStyle(channel: string): { backgroundColor: string; color: string } {
  switch (channel) {
    case 'Email':
      return { backgroundColor: 'var(--civic-info-bg)', color: 'var(--civic-info-text)' };
    case 'SMS':
      return { backgroundColor: 'var(--civic-plum-3)', color: 'var(--civic-plum-11)' };
    case 'Portal':
      return { backgroundColor: 'var(--civic-accent-bg)', color: 'var(--civic-accent-text)' };
    case 'Mail':
      return { backgroundColor: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' };
    case 'System':
      return { backgroundColor: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' };
    default:
      return { backgroundColor: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' };
  }
}

/** Lucide icon by channel name. */
const CHANNEL_ICON: Record<string, LucideIcon> = {
  Mail,
  Portal: FileText,
  SMS: Smartphone,
  Email: MessageSquare,
  System: FileText,
};

/** Preferred-contact derivation from the contact section's free-text preference. */
function derivePreferredChannel(preferred: string): ReplyChannel {
  if (/email/i.test(preferred)) return 'Email';
  if (/sms|text|phone/i.test(preferred)) return 'SMS';
  return 'Portal';
}

function derivePreferredDetail(preferred: string, email: string, phone: string): string {
  if (/email/i.test(preferred)) return email;
  if (/phone/i.test(preferred)) return phone;
  return preferred;
}

/** Parse an MM/DD/YYYY deadline against DEMO_TODAY. Returns null on parse failure. */
function rfiDaysRemaining(deadline: string): number | null {
  const parts = deadline.split('/').map((s) => Number(s));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [m, d, y] = parts as [number, number, number];
  const deadlineDate = new Date(Date.UTC(y, m - 1, d));
  return Math.ceil((deadlineDate.getTime() - DEMO_TODAY.getTime()) / 86_400_000);
}

interface NoticesMessagesTabProps extends DrawerTabProps {
  /** Open the per-message preview modal. Owned by the parent drawer so the
   * modal can layer above the drawer chrome and outlive the active tab. */
  onPreviewMessage: (message: CaseMessage, allChannels: ReadonlyArray<string>) => void;
}

export function NoticesMessagesTab({
  caseRow,
  details,
  hasRealDetails = true,
  onPreviewMessage,
}: NoticesMessagesTabProps) {
  const { contact, messages } = details;

  const [msgTypeFilter, setMsgTypeFilter] = useState<MsgTypeFilter>(MSG_TYPE_FILTER_ALL);
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const preferredChannel = derivePreferredChannel(contact.preferredContact);
  const preferredDetail = derivePreferredDetail(contact.preferredContact, contact.email, contact.phone);

  // The drawer remounts when the caseworker opens a different case (the
  // parent keys this subtree by caseId), so `preferredChannel` is stable
  // for the lifetime of this component — no sync-on-prop-change effect is
  // needed. `useState`'s initializer captures the preference on first
  // render and subsequent caseworker clicks own the state. See
  // `useReplyChannelDefault` in hooks.ts for the utility kept around for
  // a future drawer that survives a case-prop change in place.
  const [replyChannel, setReplyChannel] = useState<ReplyChannel>(preferredChannel);
  const [replyText, setReplyText] = useState('');

  // Distinct lowercase channels across the message set. Used to drive the
  // dynamic channel filter row; hidden when only one channel exists.
  const allChannels = Array.from(new Set(messages.map((m) => m.channel.toLowerCase())));

  const rfiMsg = messages.find((m) => Boolean(m.rfiDeadline));
  const daysRemaining = rfiMsg?.rfiDeadline ? rfiDaysRemaining(rfiMsg.rfiDeadline) : null;
  const rfiIsOverdue = daysRemaining !== null && daysRemaining < 0;
  // "Has the applicant sent an inbound reply yet?" — excludes the initial
  // submission inbound entry which is always present and isn't a response
  // to any RFI. Driven by the `isInitialSubmission` flag on the fixture
  // rather than a hardcoded message id (PR #1470 review S4).
  const hasInboundResponse = messages.some((m) => m.direction === 'inbound' && !m.isInitialSubmission);

  const msgsByType =
    msgTypeFilter === MSG_TYPE_FILTER_ALL
      ? messages
      : msgTypeFilter === MSG_TYPE_FILTER_NOTICES
        ? messages.filter((m) => isNotice(m))
        : messages.filter((m) => !isNotice(m) || classifyRole(m) === 'applicant');

  const filtered = msgsByType.filter((m) => channelFilter === 'all' || m.channel.toLowerCase() === channelFilter);

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    // Demo-only: no persistence. Storyboard parity.
    window.alert(`Reply sent via ${replyChannel}`);
    setReplyText('');
  };

  // All hooks above this line run unconditionally. Gate on hasRealDetails
  // here so we don't surface the fallback fixture's notices for a case
  // that has no real correspondence wired.
  if (!hasRealDetails) {
    return <DrawerEmptyState label="Messages & notices" caseRow={caseRow} />;
  }

  return (
    <div className="space-y-4">
      {/* Preferred contact summary */}
      <div className="flex items-center gap-2 text-xs px-1 flex-wrap">
        <span className="font-semibold uppercase tracking-wider" style={{ color: 'var(--civic-text-placeholder)' }}>
          Preferred contact
        </span>
        <span className="font-semibold" style={{ color: 'var(--civic-text-primary)' }}>
          {preferredChannel}
        </span>
        <span style={{ color: 'var(--civic-text-placeholder)' }}>·</span>
        <span style={{ color: 'var(--civic-text-secondary)' }}>{preferredDetail}</span>
        <span className="ml-auto" style={{ color: 'var(--civic-text-placeholder)' }}>
          Replies pre-select preferred channel
        </span>
      </div>

      {/* RFI banner */}
      {rfiMsg?.rfiDeadline && (
        <RfiBanner
          deadline={rfiMsg.rfiDeadline}
          daysRemaining={daysRemaining}
          isOverdue={rfiIsOverdue}
          hasResponse={hasInboundResponse}
        />
      )}

      {/* Filter rows */}
      <div className="space-y-2">
        <FilterRow
          label="Type"
          options={TYPE_FILTERS.map(([val, lbl]) => ({ value: val, label: lbl }))}
          selected={msgTypeFilter}
          onSelect={(v) => setMsgTypeFilter(v as MsgTypeFilter)}
        />
        {allChannels.length > 1 && (
          <FilterRow
            label="Channel"
            options={[{ value: 'all', label: 'All' }].concat(
              allChannels.map((ch) => ({ value: ch, label: ch.charAt(0).toUpperCase() + ch.slice(1) })),
            )}
            selected={channelFilter}
            onSelect={setChannelFilter}
          />
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div
            className="text-center py-10 text-sm border border-dashed rounded-md"
            style={{
              color: 'var(--civic-text-placeholder)',
              backgroundColor: 'var(--civic-bg-card)',
              borderColor: 'var(--civic-border-subtle)',
            }}
          >
            No messages match these filters.
          </div>
        ) : (
          filtered.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              onPreview={() => {
                const allMsgChannels = m.direction === 'outbound' ? [...OUTBOUND_CHANNELS] : [m.channel];
                onPreviewMessage(m, allMsgChannels);
              }}
            />
          ))
        )}
      </div>

      {/* Reply form */}
      <ReplyForm
        replyChannel={replyChannel}
        setReplyChannel={setReplyChannel}
        replyText={replyText}
        setReplyText={setReplyText}
        preferredChannel={preferredChannel}
        onSend={handleSendReply}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents (tab-local)
// ────────────────────────────────────────────────────────────────────────────

interface RfiBannerProps {
  deadline: string;
  daysRemaining: number | null;
  isOverdue: boolean;
  hasResponse: boolean;
}

function RfiBanner({ deadline, daysRemaining, isOverdue, hasResponse }: RfiBannerProps) {
  const bgVar = isOverdue ? 'var(--civic-destructive-bg)' : 'var(--civic-warning-bg)';
  const borderVar = isOverdue ? 'var(--civic-destructive-border)' : 'var(--civic-amber-6)';
  const headlineColor = isOverdue ? 'var(--civic-destructive-text)' : 'var(--civic-warning-text)';

  return (
    <div className="rounded-md border p-4" style={{ backgroundColor: bgVar, borderColor: borderVar }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" style={{ color: headlineColor }} />
          <div>
            <p className="text-sm font-semibold mb-0.5" style={{ color: headlineColor }}>
              RFI Deadline: {deadline}
            </p>
            {!isOverdue && hasResponse && (
              <p
                className="text-xs font-medium inline-flex items-center gap-1"
                style={{ color: 'var(--civic-success-text)' }}
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" /> Response received from applicant
              </p>
            )}
            {!isOverdue && !hasResponse && (
              <p className="text-xs" style={{ color: 'var(--civic-warning-text)' }}>
                Awaiting applicant documentation
              </p>
            )}
            {isOverdue && (
              <p className="text-xs" style={{ color: 'var(--civic-destructive-text)' }}>
                Past due — caseworker action required
              </p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <RfiStatusPill hasResponse={hasResponse} daysRemaining={daysRemaining} isOverdue={isOverdue} />
        </div>
      </div>
    </div>
  );
}

function RfiStatusPill({
  hasResponse,
  daysRemaining,
  isOverdue,
}: {
  hasResponse: boolean;
  daysRemaining: number | null;
  isOverdue: boolean;
}) {
  if (hasResponse) {
    return (
      <span
        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold border"
        style={{
          backgroundColor: 'var(--civic-success-bg)',
          color: 'var(--civic-success-text)',
          borderColor: 'var(--civic-green-6)',
        }}
      >
        Response Received
      </span>
    );
  }
  if (isOverdue) {
    return (
      <span
        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold border"
        style={{
          backgroundColor: 'var(--civic-destructive-bg)',
          color: 'var(--civic-destructive-text)',
          borderColor: 'var(--civic-destructive-border)',
        }}
      >
        OVERDUE
      </span>
    );
  }
  if (daysRemaining !== null && daysRemaining <= 3) {
    return (
      <span
        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold border"
        style={{
          backgroundColor: 'var(--civic-warning-bg)',
          color: 'var(--civic-warning-text)',
          borderColor: 'var(--civic-amber-6)',
        }}
      >
        URGENT: {daysRemaining}d left
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border"
      style={{
        backgroundColor: 'var(--civic-warning-bg)',
        color: 'var(--civic-warning-text)',
        borderColor: 'var(--civic-amber-6)',
      }}
    >
      {daysRemaining ?? '—'} days remaining
    </span>
  );
}

interface FilterRowProps {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string;
  onSelect: (value: string) => void;
}

function FilterRow({ label, options, selected, onSelect }: FilterRowProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="text-xs font-semibold uppercase tracking-wider w-16 flex-shrink-0"
        style={{ color: 'var(--civic-text-placeholder)' }}
      >
        {label}
      </span>
      {options.map(({ value, label: lbl }) => {
        const isActive = selected === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
            style={
              isActive
                ? {
                    backgroundColor: 'var(--civic-accent-solid)',
                    color: 'var(--civic-accent-on-solid)',
                    borderColor: 'transparent',
                  }
                : {
                    backgroundColor: 'var(--civic-bg-card)',
                    color: 'var(--civic-text-secondary)',
                    borderColor: 'var(--civic-border-subtle)',
                  }
            }
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

interface MessageCardProps {
  message: CaseMessage;
  onPreview: () => void;
}

function MessageCard({ message, onPreview }: MessageCardProps) {
  const role = classifyRole(message);
  const roleLabel = ROLE_LABEL[role];
  const isOut = message.direction === 'outbound';
  const railColor = isOut ? 'var(--civic-accent-solid)' : 'var(--civic-success-solid)';
  const channelsToShow = isOut ? [...OUTBOUND_CHANNELS] : [message.channel];

  return (
    <button
      type="button"
      onClick={onPreview}
      className="w-full text-left rounded-md border p-4 relative overflow-hidden transition-all hover:shadow-sm"
      style={{
        backgroundColor: 'var(--civic-bg-card)',
        borderColor: 'var(--civic-border-subtle)',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: railColor, opacity: 0.7 }}
      />
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isOut ? (
            <span className="text-xs" style={{ color: 'var(--civic-text-secondary)' }}>
              Sent via:
            </span>
          ) : (
            <ChannelPill channel={message.channel} />
          )}
          {isOut && channelsToShow.map((ch) => <ChannelPill key={ch} channel={ch} />)}
          <span className="text-xs" style={{ color: 'var(--civic-text-secondary)' }}>
            {isOut ? 'Outbound' : 'Inbound'}
          </span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border"
            style={{
              backgroundColor: 'var(--civic-bg-component)',
              color: 'var(--civic-text-secondary)',
              borderColor: 'var(--civic-border-subtle)',
            }}
          >
            {roleLabel}
          </span>
          <StatusIcon status={message.status} />
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs" style={{ color: 'var(--civic-text-secondary)' }}>
            {message.timestamp}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--civic-text-placeholder)' }}>
            {message.sender}
          </p>
        </div>
      </div>
      {message.subject && (
        <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--civic-text-primary)' }}>
          {message.subject}
        </p>
      )}
      <p className="text-sm leading-relaxed line-clamp-2" style={{ color: 'var(--civic-text-primary)' }}>
        {message.content}
      </p>
      <p className="text-xs font-medium mt-2" style={{ color: 'var(--civic-accent-text)' }}>
        View full content →
      </p>
    </button>
  );
}

function ChannelPill({ channel }: { channel: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={channelPillStyle(channel)}
    >
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {channel}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'delivered':
    case 'received':
    case 'sent':
      return (
        <span
          className="text-xs font-bold inline-flex items-center"
          style={{ color: 'var(--civic-success-text)' }}
          aria-label={`Status: ${status}`}
        >
          <Check className="w-3 h-3" aria-hidden="true" />
        </span>
      );
    case 'read':
      return (
        <span
          className="text-xs font-bold inline-flex items-center gap-0.5"
          style={{ color: 'var(--civic-info-text)' }}
          aria-label="Status: read"
        >
          <Check className="w-3 h-3" aria-hidden="true" />
          <Check className="w-3 h-3" aria-hidden="true" />
        </span>
      );
    case 'failed':
      return (
        <span
          className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--civic-destructive-bg)',
            color: 'var(--civic-destructive-text)',
          }}
        >
          Failed
        </span>
      );
    case 'scheduled':
      return (
        <span
          className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--civic-warning-bg)',
            color: 'var(--civic-warning-text)',
          }}
        >
          Scheduled
        </span>
      );
    case 'draft':
      return (
        <span
          className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--civic-bg-component)',
            color: 'var(--civic-text-secondary)',
          }}
        >
          Draft
        </span>
      );
    default:
      return null;
  }
}

interface ReplyFormProps {
  replyChannel: ReplyChannel;
  setReplyChannel: (ch: ReplyChannel) => void;
  replyText: string;
  setReplyText: (text: string) => void;
  preferredChannel: ReplyChannel;
  onSend: () => void;
}

function ReplyForm({
  replyChannel,
  setReplyChannel,
  replyText,
  setReplyText,
  preferredChannel,
  onSend,
}: ReplyFormProps) {
  const replyTextareaId = 'drawer-reply-textarea';
  return (
    <div
      className="rounded-md border p-4"
      style={{ backgroundColor: 'var(--civic-bg-card)', borderColor: 'var(--civic-border-subtle)' }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium" style={{ color: 'var(--civic-text-secondary)' }}>
          Reply via:
        </span>
        {REPLY_CHANNELS.map((ch) => {
          const isActive = replyChannel === ch;
          return (
            <button
              key={ch}
              type="button"
              onClick={() => setReplyChannel(ch)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={
                isActive
                  ? {
                      backgroundColor: 'var(--civic-accent-solid)',
                      color: 'var(--civic-accent-on-solid)',
                      borderColor: 'transparent',
                    }
                  : {
                      backgroundColor: 'var(--civic-bg-card)',
                      color: 'var(--civic-text-secondary)',
                      borderColor: 'var(--civic-border-subtle)',
                    }
              }
            >
              {ch}
              {ch === preferredChannel && <span className="ml-1 opacity-80">(preferred)</span>}
            </button>
          );
        })}
      </div>
      <label htmlFor={replyTextareaId} className="sr-only">
        Reply to applicant via {replyChannel}
      </label>
      <div className="flex gap-2">
        <textarea
          id={replyTextareaId}
          className="flex-1 text-sm rounded-md px-3 py-2 resize-none focus:outline-none border"
          style={{
            backgroundColor: 'var(--civic-bg-card)',
            borderColor: 'var(--civic-border-subtle)',
            color: 'var(--civic-text-primary)',
          }}
          placeholder="Type a reply to the applicant…"
          rows={2}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
        />
        <button
          type="button"
          disabled={!replyText.trim()}
          onClick={onSend}
          className="px-4 py-2 rounded-md text-sm font-semibold transition-opacity disabled:opacity-40 self-end"
          style={{
            backgroundColor: 'var(--civic-accent-solid)',
            color: 'var(--civic-accent-on-solid)',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
