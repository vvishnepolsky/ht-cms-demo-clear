/**
 * CaseProgressStepper tests — connector hairline visibility regression (ENG-1941).
 *
 * The connecting line between stepper indicators (Verify → Evaluate → Determine)
 * went invisible after commit 5c8cb7b02 swapped the pending connector color to an
 * undefined CSS token `var(--civic-border-default)` with no fallback. The 1px line
 * then painted nothing. These tests guard the inline backgroundColor of each
 * connector so the line can never silently vanish again.
 *
 * Pure render tests — no Apollo, no router, no mutations.
 *
 * Robert Mitchell's scenario is the Non-MAGI IN_REVIEW case, which derives:
 *   verify = complete, evaluate = active, determine = pending
 * so the Evaluate → Determine connector follows a non-complete step (the bug repro).
 */
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CaseProgressStepper } from './CaseProgressStepper';

// The undefined token that caused the regression — connectors must never use it.
const UNDEFINED_TOKEN = 'var(--civic-border-default)';

function renderConnectors() {
  // Non-MAGI IN_REVIEW = Robert Mitchell's scenario.
  const { container } = render(<CaseProgressStepper status="IN_REVIEW" isNonMagi />);
  // The connector hairline is the only element with the `h-px` class.
  return Array.from(container.querySelectorAll<HTMLElement>('.h-px'));
}

describe('CaseProgressStepper — DDS validated state', () => {
  it('marks Verify AND Evaluate complete with Determine active once ddsValidated', () => {
    const { container } = render(<CaseProgressStepper status="IN_REVIEW" isNonMagi ddsValidated />);
    // Complete steps render the green check circle (svg check inside a solid
    // circle); with ddsValidated both Verify and Evaluate are complete.
    const checkCircles = container.querySelectorAll('svg path[d="M5 13l4 4L19 7"]');
    expect(checkCircles.length).toBe(2);
    // Determine is the active (aria-current) step.
    const active = container.querySelector('[aria-current="step"]');
    expect(active?.textContent).toMatch(/Determine/);
  });

  it('keeps Evaluate active (not complete) before validation', () => {
    const { container } = render(<CaseProgressStepper status="IN_REVIEW" isNonMagi />);
    const checkCircles = container.querySelectorAll('svg path[d="M5 13l4 4L19 7"]');
    expect(checkCircles.length).toBe(1); // Verify only
  });
});

describe('CaseProgressStepper connector line (ENG-1941)', () => {
  it('renders every connector with a non-empty, defined background (regression)', () => {
    const connectors = renderConnectors();
    expect(connectors.length).toBeGreaterThan(0);
    for (const connector of connectors) {
      const bg = connector.style.backgroundColor;
      expect(bg).toBeTruthy();
      expect(bg).not.toBe(UNDEFINED_TOKEN);
      expect(bg).not.toContain('--civic-border-default');
    }
  });

  it('uses the success token for a connector following a complete step', () => {
    const connectors = renderConnectors();
    // Verify (complete) → Evaluate connector is the first one.
    expect(connectors[0].style.backgroundColor).toContain('--civic-success-solid');
  });

  it('uses a defined border token (with literal fallback) for a non-complete step', () => {
    const connectors = renderConnectors();
    // Evaluate (active) → Determine connector is the second one — the bug repro.
    const bg = connectors[1].style.backgroundColor;
    expect(bg).toContain('--civic-border-strong');
    expect(bg).toContain('#d1d5db');
  });

  it('renders exactly steps.length - 1 connectors (last step has none)', () => {
    // Three steps → two connectors.
    expect(renderConnectors()).toHaveLength(2);
  });
});
