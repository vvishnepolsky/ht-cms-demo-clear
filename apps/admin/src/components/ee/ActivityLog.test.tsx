/**
 * ActivityLog tests — buildSessionEntry branch coverage (ENG-1748)
 *
 * buildSessionEntry is a pure helper that produces an ActivityLogEntry shape
 * keyed by `kind`. Each branch sets a distinct (icon, actorRole, text) tuple.
 * These tests pin the dds_referred and dds_confirmed branches added in
 * ENG-1748 so downstream consumers (workspace activity panel) can rely on
 * the shape and copy.
 */
import { describe, it, expect } from 'vitest';
import { buildSessionEntry, DDS_KIND_REFERRED, DDS_KIND_CONFIRMED } from './ActivityLog';

describe('buildSessionEntry — DDS branches (ENG-1748)', () => {
  describe(`kind: '${DDS_KIND_REFERRED}'`, () => {
    it('returns an entry with rfi icon and caseworker actor role', () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_REFERRED, caseworkerName: 'Sarah Johnson' });

      expect(entry.icon).toBe('rfi');
      expect(entry.actorRole).toBe('caseworker');
      expect(entry.actor).toBe('Sarah Johnson');
    });

    it('text mentions DDS referral packet and the caseworker name', () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_REFERRED, caseworkerName: 'Sarah Johnson' });

      expect(entry.text).toContain('DDS referral packet sent');
      expect(entry.text).toContain('Sarah Johnson');
      expect(entry.text).toContain('case held pending disability determination');
    });

    it(`produces a stable id prefixed with session-${DDS_KIND_REFERRED}-`, () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_REFERRED, caseworkerName: 'Sarah Johnson' });

      expect(entry.id).toMatch(/^session-dds_referred-\d+$/);
    });

    it('timestamp is a parseable ISO string', () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_REFERRED, caseworkerName: 'Sarah Johnson' });

      expect(Number.isNaN(new Date(entry.timestamp).getTime())).toBe(false);
    });
  });

  describe(`kind: '${DDS_KIND_CONFIRMED}'`, () => {
    it('returns an entry with determined icon and caseworker actor role', () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_CONFIRMED, caseworkerName: 'Sarah Johnson' });

      expect(entry.icon).toBe('determined');
      expect(entry.actorRole).toBe('caseworker');
      expect(entry.actor).toBe('Sarah Johnson');
    });

    it('text mentions DDS confirmed disability, ABD category, and notice queued', () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_CONFIRMED, caseworkerName: 'Sarah Johnson' });

      expect(entry.text).toContain('DDS confirmed disability');
      expect(entry.text).toContain('ABD category assigned');
      expect(entry.text).toContain('Sarah Johnson');
      expect(entry.text).toContain('eligibility notice queued');
    });

    it(`produces a stable id prefixed with session-${DDS_KIND_CONFIRMED}-`, () => {
      const entry = buildSessionEntry({ kind: DDS_KIND_CONFIRMED, caseworkerName: 'Sarah Johnson' });

      expect(entry.id).toMatch(/^session-dds_confirmed-\d+$/);
    });

    it(`uses a different icon from ${DDS_KIND_REFERRED} so the timeline visually distinguishes them`, () => {
      const referred = buildSessionEntry({ kind: DDS_KIND_REFERRED, caseworkerName: 'Sarah Johnson' });
      const confirmed = buildSessionEntry({ kind: DDS_KIND_CONFIRMED, caseworkerName: 'Sarah Johnson' });

      expect(confirmed.icon).not.toBe(referred.icon);
    });
  });
});
