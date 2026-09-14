// @ts-nocheck
import React, { useState, useMemo, useRef } from 'react';
import { Icon, Button, Field, TextInput, Select, Alert, Stack, Panel } from './ui';
import { useReductoExtract } from '../hooks/useReductoExtract';

/* =========================================================================
   Apply-method picker + branch endpoints (phone schedule, paper upload).

   Sits between Welcome and Login. Three entry points:
     · Online → continues into the digital wizard (existing flow).
     · Phone  → branches to a scheduling page (terminal).
     · Paper  → branches to an upload + Reducto-extract page (terminal).

   phone-schedule and paper-upload auto-skip during normal forward
   navigation (see the `skip` predicates in app.tsx). They're only
   reachable via explicit goTo() from the picker. Both terminate with
   their own internal Done states — the wizard's bottom bar is hidden so
   they own the CTA.

   Ported from the State-X Medicaid prototype `screens-apply.jsx` (ENG-1745).
   The prototype's local OCR mock is replaced here by the real Reducto
   pipeline via `useReductoExtract` — there is no fabricated extraction
   data in this file.
   ========================================================================= */

// ─────────────────────────────────────────────────────────────────────────
// Apply-method picker
// ─────────────────────────────────────────────────────────────────────────
function StepApplyMethod({ ctx, goNext, goTo }) {
  const { data, setData } = ctx;
  const set = (m) => setData((prev) => ({ ...prev, _applyMethod: m }));
  const current = data._applyMethod;

  // pick(m, nav) writes the method flag and runs the navigation in one
  // click. setData is async but the next render flushes before the
  // wizard's skip-resolver effect runs, so the new step sees the updated
  // _applyMethod and doesn't bounce.
  const pick = (m, nav) => () => {
    set(m);
    nav();
  };

  return (
    <Stack gap={20}>
      {/* No inline back button — the wizard's chrome already covers it. */}
      <ol className="apply-methods">
        <li>
          <button
            type="button"
            className={'apply-card apply-card--recommended' + (current === 'online' ? ' active' : '')}
            onClick={pick('online', goNext)}
          >
            <div className="apply-card-ic apply-card-ic--filled">
              <Icon name="edit" size={24} />
            </div>
            <div className="apply-card-body">
              <div className="apply-card-title" style={{ fontSize: '17px' }}>
                Apply Online
              </div>
              <div className="apply-card-desc">Complete your application with step-by-step guidance.</div>
            </div>
            <div className="apply-card-cta" aria-hidden="true">
              <Icon name="arrowRight" size={18} />
            </div>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={'apply-card' + (current === 'phone' ? ' active' : '')}
            onClick={pick('phone', () => goTo('phone-schedule'))}
          >
            <div className="apply-card-ic">
              <Icon name="phone" size={24} />
            </div>
            <div className="apply-card-body">
              <div className="apply-card-title" style={{ fontSize: '17px' }}>
                Apply by Phone
              </div>
              <div className="apply-card-desc">
                Speak with a trained specialist who will complete your application over the phone.
              </div>
            </div>
            <div className="apply-card-cta" aria-hidden="true">
              <Icon name="arrowRight" size={18} />
            </div>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={'apply-card' + (current === 'paper' ? ' active' : '')}
            onClick={pick('paper', () => goTo('paper-upload'))}
          >
            <div className="apply-card-ic">
              <Icon name="upload" size={24} />
            </div>
            <div className="apply-card-body">
              <div className="apply-card-title" style={{ fontSize: '17px' }}>
                Upload Paper Application
              </div>
              <div className="apply-card-desc">
                Already filled out a paper application? Take photos or upload a scan — we'll read it and finish the form
                for you.
              </div>
            </div>
            <div className="apply-card-cta" aria-hidden="true">
              <Icon name="arrowRight" size={18} />
            </div>
          </button>
        </li>
      </ol>

      <div className="apply-methods-foot">
        <Icon name="shieldCheck" size={14} />
        <span>All three are free and lead to the same benefits.</span>
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Phone application scheduling
// ─────────────────────────────────────────────────────────────────────────
function StepPhoneSchedule({ ctx, goTo }) {
  const primary = ctx.data.primaryApplicant;
  const [date, setDate] = useState(null);
  const [slot, setSlot] = useState(null);
  const [phone, setPhone] = useState(primary.phone || '');
  const [lang, setLang] = useState('English');
  const [confirmed, setConfirmed] = useState(false);

  // Next 7 weekdays (Mon–Fri), skipping weekends. Computed once per mount;
  // close enough for a prototype — a real scheduler would query availability.
  const days = useMemo(() => {
    const out = [];
    const d = new Date();
    while (out.length < 7) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) out.push(new Date(d));
    }
    return out;
  }, []);
  const slots = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const canConfirm = !!date && !!slot && phone.length >= 10;

  if (confirmed) {
    return (
      <Stack gap={24}>
        <div className="branch-confirmed">
          <div className="branch-confirmed-ic">
            <Icon name="check" size={32} filled />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Phone application
            </div>
            <h2>Your call is scheduled</h2>
            <p>
              A specialist will call <strong>{phone}</strong> on <strong>{fmt(date)}</strong> at <strong>{slot}</strong>
              . We'll speak in <strong>{lang}</strong>.
            </p>
          </div>
        </div>

        <Panel title="What to have ready">
          <ol className="branch-checklist">
            <li>Social Security numbers for everyone applying</li>
            <li>A recent pay stub or last year's tax return</li>
            <li>Any health insurance information you currently have</li>
          </ol>
        </Panel>

        <Alert kind="neutral">
          We'll send a text reminder 24 hours before the call. If you miss it, we'll try again — and you can reschedule
          anytime by calling <strong>1-800-338-8366</strong>.
        </Alert>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => goTo('apply-method')}>
            <Icon name="arrowLeft" size={14} /> Choose a different way
          </Button>
          <Button variant="outline" onClick={() => alert('In a real app this would add a calendar reminder.')}>
            <Icon name="calendar" size={14} /> Add to calendar
          </Button>
          <Button variant="primary" onClick={() => goTo('welcome')}>
            Done <Icon name="check" size={14} />
          </Button>
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap={20}>
      <Alert kind="neutral" title="Phone applications · 1-800-338-8366">
        Schedule a 25-minute call. A specialist will fill out your application with you and submit it for you. Free, in
        many languages.
      </Alert>

      <Panel title="Pick a day">
        <div className="schedule-days">
          {days.map((d, i) => (
            <button
              key={i}
              type="button"
              className={'schedule-day' + (date && d.toDateString() === date.toDateString() ? ' on' : '')}
              onClick={() => {
                setDate(d);
                setSlot(null);
              }}
            >
              <div className="schedule-day-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className="schedule-day-num">{d.getDate()}</div>
              <div className="schedule-day-mon">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
            </button>
          ))}
        </div>
      </Panel>

      {date ? (
        <Panel title={`Times for ${fmt(date)}`}>
          <div className="schedule-times">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                className={'schedule-time' + (s === slot ? ' on' : '')}
                onClick={() => setSlot(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="How can we reach you?">
        <div className="grid-2">
          <Field label="Phone number" required>
            <TextInput type="tel" inputMode="tel" value={phone} onChange={setPhone} placeholder="(515) 555-0190" />
          </Field>
          <Field label="Language preference">
            <Select
              value={lang}
              onChange={setLang}
              options={['English', 'Español', 'Tiếng Việt', 'العربية', 'Bosanski', '中文', 'Français', 'Soomaali']}
            />
          </Field>
        </div>
      </Panel>

      <div
        style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <Button variant="ghost" onClick={() => goTo('apply-method')}>
          <Icon name="arrowLeft" size={14} /> Choose a different way
        </Button>
        <Button variant="primary" disabled={!canConfirm} onClick={() => setConfirmed(true)}>
          Confirm my appointment <Icon name="arrowRight" size={14} />
        </Button>
      </div>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Paper application upload + Reducto extraction
// ─────────────────────────────────────────────────────────────────────────
// Cosmetic progress labels shown while Reducto runs. These are UI copy, not
// extracted data — the actual fields below come entirely from the hook.
const PARSE_STAGES = [
  { label: 'Reading pages', hint: 'Recognizing text on each page.' },
  { label: 'Finding the basics', hint: 'Name, address, contact info.' },
  { label: 'Pulling income figures', hint: 'Pay stubs and other money.' },
  { label: 'Checking household', hint: 'People listed on your form.' },
];

// Format a File's byte size into a friendly "2.4 MB" / "640 KB" string.
function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StepPaperUpload({ ctx, goTo }) {
  const { setData } = ctx;
  const { extract } = useReductoExtract();
  const [stage, setStage] = useState('idle'); // idle | parsing | review | confirmed
  const [files, setFiles] = useState([]);
  const [parseIdx, setParseIdx] = useState(0);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);

  async function startParsing(uploaded) {
    setFiles([uploaded]);
    setStage('parsing');
    setParseIdx(0);
    setError(null);

    // Advance the visual checklist while we wait on the real extraction.
    // Caps at the last stage; the awaited result drives the real transition.
    let i = 0;
    const tick = setInterval(() => {
      i = Math.min(i + 1, PARSE_STAGES.length - 1);
      setParseIdx(i);
    }, 850);

    const { success, fields } = await extract(uploaded, 'APPLICATION_FORM');
    clearInterval(tick);
    setParseIdx(PARSE_STAGES.length);

    // The demo server's extractDocumentFields returns no fields (document
    // extraction is not wired) — degrade to manual entry instead of implying
    // the upload was unreadable.
    const af = fields?.applicationForm;
    const hasAnyField = !!af && Object.values(af).some((val) => val != null && val !== '');
    if (!success || !fields || !hasAnyField) {
      setError(
        "Automatic reading isn't available right now, so we couldn't fill in your form from the upload. You can apply online instead and enter your information yourself — it takes about 20 minutes.",
      );
      setStage('idle');
      setFiles([]);
      return;
    }
    setExtracted(fields);
    setStage('review');
  }

  // ── Confirmed state ─────────────────────────────────────────────────
  if (stage === 'confirmed') {
    return (
      <Stack gap={24}>
        <div className="branch-confirmed">
          <div className="branch-confirmed-ic">
            <Icon name="check" size={32} filled />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Paper application
            </div>
            <h2>Your application was submitted</h2>
            <p>We received your paper application. A caseworker will review it and reach out if anything's missing.</p>
          </div>
        </div>
        <Panel title="Application details">
          <div className="spec-list">
            <div className="row">
              <span className="k">Submitted</span>
              <span className="v">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div className="row">
              <span className="k">Pages received</span>
              <span className="v">{files.length}</span>
            </div>
          </div>
        </Panel>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => goTo('apply-method')}>
            <Icon name="arrowLeft" size={14} /> Choose a different way
          </Button>
          <Button variant="primary" onClick={() => goTo('welcome')}>
            Done <Icon name="check" size={14} />
          </Button>
        </div>
      </Stack>
    );
  }

  // ── Review state (after extraction) ─────────────────────────────────
  if (stage === 'review') {
    const af = extracted?.applicationForm || {};
    const fullName = [af.firstName, af.middleName, af.lastName].filter(Boolean).join(' ');
    const address = [af.street, af.apt, af.city, af.state, af.zip].filter(Boolean).join(', ');
    return (
      <Stack gap={20}>
        <Alert kind="success" title="We read your application">
          Review what we pulled from your photos. Edit anything that doesn't look right before submitting.
        </Alert>
        <Panel title="What we found">
          <div className="paper-extract">
            <PaperExtractRow k="Full name" v={fullName} />
            <PaperExtractRow k="Date of birth" v={af.dateOfBirth} />
            <PaperExtractRow k="SSN" v={af.ssn} />
            <PaperExtractRow k="Address" v={address} />
            <PaperExtractRow k="Phone" v={af.phone} />
            <PaperExtractRow k="Email" v={af.email} />
          </div>
        </Panel>
        <Panel title="Pages uploaded">
          <div className="paper-pages">
            {files.map((f, i) => (
              <div key={i} className="paper-page">
                <div className="paper-page-thumb">
                  <Icon name="file" size={20} />
                </div>
                <div className="paper-page-meta">
                  <div className="paper-page-name">{f.name}</div>
                  <div className="paper-page-size">{formatBytes(f.size)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Alert kind="info">
          Highlighted items need a caseworker to double-check. Submit when you're ready — you can come back later if you
          want to fix something first.
        </Alert>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Button
            variant="ghost"
            onClick={() => {
              setStage('idle');
              setFiles([]);
              setExtracted(null);
            }}
          >
            <Icon name="arrowLeft" size={14} /> Upload different photos
          </Button>
          <Button variant="primary" onClick={() => setStage('confirmed')}>
            Submit my application <Icon name="arrowRight" size={14} />
          </Button>
        </div>
      </Stack>
    );
  }

  // ── Parsing state ──────────────────────────────────────────────────
  if (stage === 'parsing') {
    return (
      <Stack gap={20}>
        <Alert kind="neutral" title="Reading your application…">
          This usually takes 10–30 seconds. We'll show you what we found so you can check it before submitting.
        </Alert>
        <Panel title="What's happening">
          <ol className="parse-stages" aria-live="polite" aria-busy={parseIdx < PARSE_STAGES.length}>
            {PARSE_STAGES.map((s, i) => {
              const state = i < parseIdx ? 'done' : i === parseIdx ? 'active' : 'pending';
              return (
                <li key={s.label} className={'parse-stage parse-stage--' + state}>
                  <div className="parse-stage-ic">
                    {state === 'done' ? (
                      <Icon name="check" size={14} />
                    ) : state === 'active' ? (
                      <Icon name="sparkles" size={14} />
                    ) : (
                      <span className="parse-stage-dot" />
                    )}
                  </div>
                  <div className="parse-stage-body">
                    <div className="parse-stage-label">{s.label}</div>
                    <div className="parse-stage-hint">{s.hint}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
      </Stack>
    );
  }

  // ── Idle state (upload zone) ────────────────────────────────────────
  return (
    <Stack gap={20}>
      <Alert kind="neutral" title="Already filled out a paper application?">
        Take a photo of every page or upload a scan. We'll read it and fill out the digital form for you so a caseworker
        can review it faster.
      </Alert>
      {error ? (
        <Alert kind="warning" title="We couldn't read your upload">
          {error}
          <div style={{ marginTop: 10 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setData((prev) => ({ ...prev, _applyMethod: 'online' }));
                goTo('login');
              }}
            >
              Apply online instead <Icon name="arrowRight" size={14} />
            </Button>
          </div>
        </Alert>
      ) : null}
      <PaperDropzone onUpload={startParsing} />
      <Panel title="Need a paper application?">
        <Stack gap={10}>
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            You can download and print the State-X HHS Medicaid paper form, or pick one up at any State-X HHS office,
            community center, or public library.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outline">
              <Icon name="download" size={14} /> Download paper form (PDF)
            </Button>
            <Button variant="outline">
              <Icon name="map" size={14} /> Find a location near you
            </Button>
          </div>
        </Stack>
      </Panel>
      <div>
        <Button variant="ghost" onClick={() => goTo('apply-method')}>
          <Icon name="arrowLeft" size={14} /> Choose a different way
        </Button>
      </div>
    </Stack>
  );
}

function PaperExtractRow({ k, v }) {
  // Reducto returns null for fields it couldn't read — surface those as
  // "Not found" and flag them for caseworker review rather than hiding them.
  const missing = v === null || v === undefined || v === '';
  return (
    <div className={'paper-extract-row' + (missing ? ' flagged' : '')}>
      <span className="k">{k}</span>
      <span className="v">{missing ? 'Not found' : v}</span>
      {missing ? <span className="paper-extract-tag">Needs review</span> : null}
    </div>
  );
}

function PaperDropzone({ onUpload }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const open = () => inputRef.current?.click();
  const handleFiles = (fileList) => {
    const file = fileList && fileList[0];
    if (file) onUpload(file);
  };

  // The dropzone div is a non-interactive container — drag-and-drop is a
  // pointer-only convenience and the real <Button> below is the sole
  // accessible control, providing both click and keyboard operation. We do
  // NOT attach onClick to the div: that would make a non-interactive element
  // interactive without keyboard support (jsx-a11y/no-static-element-
  // interactions) and nest an interactive div around the <button>. This
  // mirrors the FileUpload pattern in screens-e.tsx. (ENG-1745 review S2;
  // a11y activation ENG-1898)
  return (
    <div
      className={'paper-dropzone' + (over ? ' over' : '')}
      role="presentation"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        // `hidden` (display:none) removes this input from the a11y tree, so this
        // aria-label is not announced at runtime — the accessible control is the
        // visible "Choose file" <Button> below. The label is kept to satisfy
        // jsx-a11y/control-has-associated-label statically; it is harmless.
        aria-label="Upload a photo or scan of your paper application"
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="paper-dropzone-ic">
        <Icon name="upload" size={32} />
      </div>
      <div className="paper-dropzone-title">Drop a photo or scan here</div>
      <div className="paper-dropzone-desc">Or tap to choose a file · JPG, PNG, or PDF</div>
      <Button variant="primary" size="lg" onClick={open}>
        <Icon name="upload" size={14} /> Choose file
      </Button>
    </div>
  );
}

Object.assign(window, {
  StepApplyMethod,
  StepPhoneSchedule,
  StepPaperUpload,
});

export { StepApplyMethod, StepPhoneSchedule, StepPaperUpload };
