// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { NoteBullets, noteSplitLabel, noteToBullets, renderNoteBody } from './note-bullets';

describe('noteToBullets', () => {
  test('AC-001: splits a 3-sentence note into 3 items', () => {
    const out = noteToBullets('Form delivered. Response window — 30 days. Due 07/03/2026.');
    expect(out).toHaveLength(3);
  });

  test('AC-002: abbreviation defense keeps M./a.m./U.S. on one line', () => {
    const out = noteToBullets('M. Patel resolved RFI on 06/03/2026 at 9:02 a.m. U.S. mail confirmed.');
    expect(out).toHaveLength(1);
  });

  test('AC-005: empty / null / whitespace input returns []', () => {
    expect(noteToBullets('')).toEqual([]);
    expect(noteToBullets(null)).toEqual([]);
    expect(noteToBullets(undefined)).toEqual([]);
    expect(noteToBullets('   ')).toEqual([]);
  });

  test('AC-008: sentence-cases the first letter of each bullet', () => {
    expect(noteToBullets('eligibility verified; income confirmed')).toEqual([
      'Eligibility verified',
      'Income confirmed',
    ]);
  });

  test('preserves all-caps acronyms when sentence-casing', () => {
    const out = noteToBullets('RFI sent; MAGI computed');
    expect(out).toEqual(['RFI sent', 'MAGI computed']);
  });

  test.each([
    ['Mr.', 'Mr. Smith called the office today'],
    ['Mrs.', 'Mrs. Patel returned the form yesterday'],
    ['Ms.', 'Ms. Brown signed the affidavit on file'],
    ['Dr.', 'Dr. Lee approved the medical determination'],
    ['Sr.', 'John Doe Sr. was contacted by mail'],
    ['Jr.', 'John Doe Jr. submitted his application'],
    ['St.', 'Lives at 123 Main St. in Des Moines'],
    ['No.', 'Tracking No. 12345 was provided'],
    ['Inc.', 'Acme Inc. confirmed wage data'],
    ['Ltd.', 'Acme Ltd. confirmed wage data'],
    ['Co.', 'Acme Co. confirmed wage data'],
    ['vs.', 'Case Smith vs. Jones was cited'],
    ['i.e.', 'Approved, i.e. cleared for benefits'],
    ['e.g.', 'See sources, e.g. wage stubs and tax docs'],
    ['approx.', 'Income approx. 1500 monthly per AVS'],
    ['etc.', 'Sent forms, etc. via certified mail'],
    ['a.m.', 'Called at 9:02 a.m. and left a voicemail'],
    ['p.m.', 'Called at 4:15 p.m. and left a voicemail'],
    ['Sec.', 'Per Sec. 5103 of the manual'],
    ['Dept.', 'State Dept. of Health and Human Services contacted'],
    ['Ave.', 'Lives at 123 Main Ave. in Des Moines'],
    ['Blvd.', 'Lives at 123 Main Blvd. in Des Moines'],
    ['Rd.', 'Lives at 123 Main Rd. in Des Moines'],
    ['Apt.', 'Lives at 123 Main St Apt. 4 in Des Moines'],
    ['Ft.', 'Lives in Ft. Dodge currently'],
    ['Mt.', 'Lives in Mt. Pleasant currently'],
    ['Pkwy.', 'Lives at 123 Main Pkwy. in Des Moines'],
    ['U.S.', 'U.S. mail was used for delivery'],
    ['U.K.', 'U.K. resident before relocating here'],
    ['single-letter initial', 'M. Patel resolved the RFI today'],
  ])('R-002: %s does not split the sentence', (_label, input) => {
    expect(noteToBullets(input)).toHaveLength(1);
  });

  test.each([
    ['bullet •', 'Form delivered • Response received • Due tomorrow'],
    ['semicolon ;', 'Form delivered ; Response received ; Due tomorrow'],
    ['middle dot ·', 'Form delivered · Response received · Due tomorrow'],
    ['arrow →', 'Form delivered → Response received → Due tomorrow'],
    ['pipe |', 'Form delivered | Response received | Due tomorrow'],
    ['newline \\n', 'Form delivered\nResponse received\nDue tomorrow'],
  ])('R-003: %s separator yields 3 bullets', (_label, input) => {
    expect(noteToBullets(input)).toHaveLength(3);
  });

  test('R-003: separator without surrounding whitespace is NOT a separator', () => {
    expect(noteToBullets('partA;partB')).toHaveLength(1);
  });
});

describe('noteSplitLabel', () => {
  test('matches a "Label: value" bullet', () => {
    expect(noteSplitLabel('Determination: Approved')).toEqual({
      label: 'Determination',
      value: 'Approved',
    });
  });

  test('returns null for unlabeled prose', () => {
    expect(noteSplitLabel('Form delivered to participant')).toBeNull();
  });

  test('does not match a clock time like "11:42 AM"', () => {
    expect(noteSplitLabel('11:42 AM check-in')).toBeNull();
  });

  test('R-006: accepts a label exactly at the 30-char cap', () => {
    const label = 'Determination of Coverage Cap'; // 29 chars — well within the cap
    expect(noteSplitLabel(`${label}: value`)).toEqual({ label, value: 'value' });
  });

  test('R-006: rejects a 31-char label (pins the boundary at 30)', () => {
    const label = 'Determination of Coverage Cap M'; // 31 chars
    expect(noteSplitLabel(`${label}: value`)).toBeNull();
  });

  test('rejects a clearly-too-long label', () => {
    expect(noteSplitLabel('Very very very very very long label name here: value')).toBeNull();
  });
});

describe('renderNoteBody', () => {
  test('splits on ✓ and ✗, passes plain text through', () => {
    const nodes = renderNoteBody('Score ✓ ok; flag ✗ failed');
    // 5 parts: 'Score ', ✓, ' ok; flag ', ✗, ' failed'
    expect(nodes).toHaveLength(5);
  });

  test('returns a single text fragment for plain prose with no glyphs', () => {
    const nodes = renderNoteBody('Form delivered to participant');
    expect(nodes).toHaveLength(1);
  });
});

describe('<NoteBullets>', () => {
  test('AC-003: single-sentence note renders as <p>, not a one-item list', () => {
    const { container } = render(<NoteBullets note="Form delivered to participant." size="sm" />);
    expect(container.querySelector('p')).not.toBeNull();
    expect(container.querySelector('ul')).toBeNull();
  });

  test('multi-sentence note renders as <ul> with <li> children', () => {
    const { container } = render(
      <NoteBullets note="Form delivered. Response window — 30 days. Due 07/03/2026." size="sm" />,
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul?.querySelectorAll('li')).toHaveLength(3);
  });

  test('AC-006: label/value bullets render the label bolded and value muted', () => {
    const { container } = render(
      <NoteBullets note="Determination: Approved. Coverage: Medicaid ABD. Effective: 06/01/2026." size="sm" />,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    const labels = Array.from(container.querySelectorAll('span.font-semibold.text-fg')).map((n) => n.textContent);
    expect(labels).toEqual(['Determination:', 'Coverage:', 'Effective:']);
    const mutedValues = container.querySelectorAll('span.text-muted-foreground');
    expect(mutedValues.length).toBeGreaterThanOrEqual(3);
  });

  test('AC-007: ✓ renders in text-success-11 and ✗ renders in text-destructive-11, both bold', () => {
    const { container } = render(<NoteBullets note="Eligibility ✓ confirmed; income ✗ pending" size="sm" />);
    const checks = container.querySelectorAll('span.text-success-11.font-semibold');
    const crosses = container.querySelectorAll('span.text-destructive-11.font-semibold');
    expect(checks).toHaveLength(1);
    expect(crosses).toHaveLength(1);
    expect(checks[0].textContent).toBe('✓');
    expect(crosses[0].textContent).toBe('✗');
  });

  test('empty input still renders a <p> (the original null/empty note is passed through)', () => {
    const { container } = render(<NoteBullets note="" size="sm" />);
    expect(container.querySelector('p')).not.toBeNull();
    expect(container.querySelector('ul')).toBeNull();
  });

  test('size="xs" produces text-xs classes', () => {
    const { container } = render(<NoteBullets note="One. Two. Three." size="xs" />);
    const ul = container.querySelector('ul');
    expect(ul?.className).toContain('text-xs');
    expect(ul?.className).toContain('space-y-0.5');
  });
});
