import { useRef } from 'react';
import { useEscapeKeyToClose, useFocusTrapAndRestore } from './drawer/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NoticeRecipient {
  name: string;
  lines: string[];
}

export interface NoticeCallout {
  title?: string;
  body: React.ReactNode;
}

export interface NoticeTable {
  headers: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
}

export interface NoticeSection {
  heading?: string;
  body?: string | string[] | React.ReactNode;
  table?: NoticeTable;
  callout?: NoticeCallout;
}

export interface NoticeOfDecisionModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  language?: string;
  formId: string;
  noticeDate: string;
  caseId: string;
  recipient: NoticeRecipient;
  appDate?: string;
  letterNumber?: string;
  subject?: string;
  greeting?: string;
  paragraphs?: string[];
  sections?: NoticeSection[];
  signoff?: string;
  hideTopAccess?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TAGLINES = [
  {
    lang: 'es',
    label: 'Spanish',
    text: 'Usted puede recibir esta carta en otro idioma, en letras grandes, o en otro formato accesible. Llame al 1-800-555-0142 (TTY: 711).',
  },
  {
    lang: 'vi',
    label: 'Vietnamese',
    text: 'Quý vị có thể nhận lá thư này bằng ngôn ngữ khác hoặc ở định dạng dễ tiếp cận. Gọi 1-800-555-0142 (TTY: 711).',
  },
  {
    lang: 'zh',
    label: 'Chinese',
    text: '您可以获取本通知的其他语言版本、大字版本或其他可访问格式。请致电 1-800-555-0142 (TTY: 711)。',
  },
  {
    lang: 'ar',
    label: 'Arabic',
    text: 'يمكنك الحصول على هذه الرسالة بلغة أخرى أو بخط كبير أو بصيغة يسهل الوصول إليها. اتصل بالرقم 1-800-555-0142 (TTY: 711).',
  },
  {
    lang: 'so',
    label: 'Somali',
    text: 'Waxaad ku heli kartaa warqaddan luqad kale, far waaweyn, ama qaab kale oo lagu gaari karo. Wac 1-800-555-0142 (TTY: 711).',
  },
  {
    lang: 'fr',
    label: 'French',
    text: 'Vous pouvez recevoir cette lettre dans une autre langue, en gros caractères, ou dans un autre format accessible. Appelez le 1-800-555-0142 (ATS : 711).',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function NoticeOfDecisionModal(props: NoticeOfDecisionModalProps) {
  if (!props.open) return null;
  return <NoticeOfDecisionModalInner {...props} />;
}

function NoticeOfDecisionModalInner({
  onClose,
  title = 'Notice of Decision',
  language = 'English',
  formId,
  noticeDate,
  caseId,
  recipient,
  appDate,
  letterNumber,
  subject,
  greeting,
  paragraphs,
  sections,
  signoff,
  hideTopAccess = false,
}: NoticeOfDecisionModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEscapeKeyToClose(onClose);
  useFocusTrapAndRestore(containerRef, closeButtonRef);

  const topAccessEN =
    "You can get this letter in another language, in large print, or in another way that's best for you. Call us at 1-800-555-0142 (TTY: 711). The call is free.";
  const topAccessAlt =
    language && /fran/i.test(language)
      ? "Vous pouvez recevoir cette lettre dans une autre langue, en gros caractères, ou dans un autre format. Appelez le 1-800-555-0142 (ATS : 711). L'appel est gratuit."
      : 'Usted puede recibir esta carta en otro idioma, en letras grandes, o en otro formato accesible. Llámenos al 1-800-555-0142 (TTY: 711). La llamada es gratis.';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — ${formId}`}
        className="bg-card rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-card">
          <div>
            <p className="text-sm font-semibold text-fg">{title}</p>
            <p className="text-xs text-muted mt-0.5">
              {formId}
              {language ? ` · ${language}` : ''}
              {noticeDate ? ` · Mailed ${noticeDate}` : ''}
              {caseId ? ` · ${caseId}` : ''}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-placeholder hover:text-fg text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Paper area — dark zinc surround */}
        <div className="overflow-y-auto px-6 py-6" style={{ backgroundColor: '#3f3f46' }}>
          {/* Paper */}
          <div
            style={{
              backgroundColor: '#fdfdf8',
              margin: '0 auto',
              maxWidth: 680,
              padding: '32px 40px 36px',
              boxShadow: '0 1px 0 rgba(15,23,42,0.06), 0 18px 40px -12px rgba(15,23,42,0.45)',
              border: '1px solid #d4d4d8',
              fontFamily: "Georgia, 'Times New Roman', serif",
              color: '#111827',
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            {/* Masthead */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              {/* Circular seal */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  border: '2px solid #111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textAlign: 'center',
                  lineHeight: 1.1,
                  flexShrink: 0,
                  fontFamily: 'Georgia, serif',
                  background: '#fdfdf8',
                }}
              >
                STATE
                <br />
                MEDICAID
                <br />
                AGENCY
              </div>
              {/* Agency name + address */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.3, fontFamily: 'Georgia, serif' }}>
                  STATE MEDICAID AGENCY
                </div>
                <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>
                  Department of Health &amp; Human Services
                </div>
                <div style={{ fontSize: 10.5, color: '#374151', marginTop: 6, fontStyle: 'italic' }}>
                  321 Any Road · Any City, Any State 00100 · 1-800-555-0142 · medicaid.state.gov
                </div>
              </div>
            </div>

            {/* Top language-access tagline */}
            {!hideTopAccess && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  background: '#f3f4ed',
                  border: '1px solid #d4d4d8',
                  fontSize: 10.5,
                  color: '#374151',
                  lineHeight: 1.45,
                }}
              >
                <div>{topAccessEN}</div>
                <div style={{ marginTop: 6 }}>{topAccessAlt}</div>
              </div>
            )}

            {/* Black horizontal rule */}
            <div style={{ marginTop: 18, height: 2, background: '#111827' }} />

            {/* Recipient + letter meta (two-column grid) */}
            <div
              style={{
                marginTop: 14,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                alignItems: 'flex-start',
              }}
            >
              {/* Left: recipient address (monospace) */}
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: '#111827',
                }}
              >
                {recipient.name}
                {recipient.lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
              {/* Right: letter metadata */}
              <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.55, fontFamily: 'Georgia, serif' }}>
                {appDate && (
                  <div>
                    <b style={{ color: '#111827' }}>Application date:</b> {appDate}
                  </div>
                )}
                {noticeDate && (
                  <div>
                    <b style={{ color: '#111827' }}>Letter date:</b> {noticeDate}
                  </div>
                )}
                {letterNumber && (
                  <div>
                    <b style={{ color: '#111827' }}>Letter number:</b> {letterNumber}
                  </div>
                )}
                {formId && (
                  <div>
                    <b style={{ color: '#111827' }}>Form:</b> {formId}
                  </div>
                )}
                {caseId && (
                  <div>
                    <b style={{ color: '#111827' }}>Case ID:</b> {caseId}
                  </div>
                )}
              </div>
            </div>

            {/* Subject block */}
            {subject && (
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderTop: '1px solid #9ca3af',
                  borderBottom: '1px solid #9ca3af',
                  fontWeight: 700,
                  textAlign: 'center',
                  letterSpacing: 0.5,
                  fontSize: 13.5,
                }}
              >
                {subject}
              </div>
            )}

            {/* Body — sections mode (preferred) */}
            {sections && (
              <div style={{ marginTop: 14 }}>
                {greeting && <p style={{ marginTop: 0, marginBottom: 12 }}>{greeting}</p>}
                {sections.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      marginTop: i === 0 ? 0 : 18,
                      paddingTop: i === 0 ? 0 : 12,
                      borderTop: i === 0 ? 'none' : '1px solid #d4d4d8',
                    }}
                  >
                    {s.heading && (
                      <div
                        style={{
                          fontWeight: 700,
                          letterSpacing: 0.6,
                          fontSize: 11.5,
                          textTransform: 'uppercase',
                          color: '#111827',
                          marginBottom: 8,
                        }}
                      >
                        {s.heading}
                      </div>
                    )}
                    {Array.isArray(s.body)
                      ? (s.body as string[]).map((line, j) => (
                          <p key={j} style={{ marginTop: j === 0 ? 0 : 8 }}>
                            {line}
                          </p>
                        ))
                      : s.body && <p style={{ marginTop: 0 }}>{s.body}</p>}
                    {s.table && (
                      <table
                        style={{
                          width: '100%',
                          marginTop: s.body ? 10 : 0,
                          borderCollapse: 'collapse',
                          fontSize: 11.5,
                          color: '#111827',
                        }}
                      >
                        <thead>
                          <tr style={{ background: '#f3f4ed' }}>
                            {s.table.headers.map((h, j) => (
                              <th
                                key={j}
                                style={{
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderBottom: '1px solid #9ca3af',
                                  fontWeight: 700,
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {s.table.rows.map((row, ri) => (
                            <tr key={ri}>
                              {row.map((cell, ci) => (
                                <td
                                  key={ci}
                                  style={{
                                    padding: '6px 8px',
                                    borderBottom: '1px solid #e5e7eb',
                                    verticalAlign: 'top',
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {s.callout && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          background: '#eef2ff',
                          border: '1px solid #c7d2fe',
                          borderLeft: '3px solid #4f46e5',
                          fontSize: 11.5,
                          color: '#1e1b4b',
                          lineHeight: 1.5,
                        }}
                      >
                        {s.callout.title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.callout.title}</div>}
                        {s.callout.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Body — legacy paragraphs mode */}
            {!sections && (
              <>
                {greeting && <p style={{ marginTop: 14 }}>{greeting}</p>}
                {(paragraphs ?? []).map((p, i) => (
                  <p key={i} style={{ marginTop: 10 }}>
                    {p}
                  </p>
                ))}
              </>
            )}

            {/* Signoff */}
            {signoff && (
              <div style={{ marginTop: 24 }}>
                <p style={{ margin: 0 }}>Sincerely,</p>
                <p style={{ margin: 0 }}>{signoff}</p>
              </div>
            )}

            {/* Bottom multilingual access taglines (federally required §435.905(b)) */}
            <div
              style={{
                marginTop: 28,
                paddingTop: 14,
                borderTop: '1px solid #d4d4d8',
                fontSize: 10.5,
                color: '#374151',
                lineHeight: 1.5,
              }}
            >
              {DEFAULT_TAGLINES.map((t, i) => (
                <div key={i} style={{ marginTop: i === 0 ? 0 : 6 }}>
                  <b style={{ color: '#111827' }}>{t.label}:</b> {t.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
