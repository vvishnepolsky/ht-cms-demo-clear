/**
 * Mapbox Address Autofill — shared config for the CMS demo resident app.
 * Mirrors the pattern in apps/missouri/resident/src/lib/mapbox-autofill.ts
 * but without state-level filtering (CMS demo covers all US states).
 *
 * Token is optional — when VITE_MAPBOX_ACCESS_TOKEN is absent or empty,
 * callers fall back to plain text inputs.
 */

export const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '';

export const US_AUTOFILL_OPTIONS = {
  country: 'us',
} as const;
