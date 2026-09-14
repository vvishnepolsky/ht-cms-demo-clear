interface DraftSection {
  sectionKey: string;
  isComplete: boolean;
  data: Record<string, unknown>;
}
import { SECTION_KEY_TO_SESSION_KEY } from './session-keys';

/**
 * Writes completed section data back to sessionStorage so screens can pre-fill
 * from the draft on mount (ENG-1313).
 *
 * Only sections present in SECTION_KEY_TO_SESSION_KEY are hydrated.
 * Unknown sectionKeys, empty data objects, and JSON serialization errors are
 * silently skipped — a failed hydration must never block resume navigation.
 */
export function hydrateSectionsToSessionStorage(sections: DraftSection[]): void {
  for (const section of sections) {
    const storageKey = SECTION_KEY_TO_SESSION_KEY[section.sectionKey as keyof typeof SECTION_KEY_TO_SESSION_KEY];
    if (!storageKey) continue;

    const data = section.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    if (Object.keys(data).length === 0) continue;

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Swallow QuotaExceededError and other storage errors — draft hydration must never block resume.
    }
  }
}
