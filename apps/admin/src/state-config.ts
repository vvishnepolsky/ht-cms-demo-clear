/**
 * Single source of truth for the demo's "state-of-X" branding. Every
 * user-facing string that names an agency, a phone number, an email
 * domain, or a county routes through here. Edit this file once to
 * re-skin the entire prototype for a different state.
 *
 * Ported from /Downloads/CMS Demo Storyboard/src/state-config.jsx to
 * typed ESM. The storyboard pattern relied on `Object.assign(window, ...)`;
 * here we export `STATE` as a typed module so consumers import it
 * explicitly and TypeScript narrows correctly.
 */

export interface StateConfig {
  // Display
  name: string;
  shortName: string;
  agency: string;
  agencyShort: string;
  agencyAlt: string;
  medicaid: string;
  appTitle: string;

  // Contact channels
  phone: string;
  fax: string;
  tty: string;
  emailDomain: string;
  webDomain: string;
  portalDomain: string;
  imeUrl: string;

  // Mailing address
  address1: string;
  cityZip: string;
  fullAddress: string;

  // County labels — map to neutral letters so the demo doesn't read as state-specific.
  counties: Record<string, string>;

  // Form-ID prefix. State-X uses "A-XXXX".
  formPrefix: string;
}

export const STATE: StateConfig = {
  name: 'State X',
  shortName: 'State X',
  agency: 'State Health & Human Services',
  agencyShort: 'State HHS',
  agencyAlt: 'State Department of Health & Human Services',
  medicaid: 'State Medicaid',
  appTitle: 'State Eligibility & Enrollment',

  phone: '1-800-555-0142',
  fax: '1-855-555-0143',
  tty: '711',
  emailDomain: 'state.gov',
  webDomain: 'medicaid.state.gov',
  portalDomain: 'portal.state.gov',
  imeUrl: 'state.gov/medicaid',

  address1: '321 Any Road',
  cityZip: 'Any City, State 00100',
  fullAddress: 'State Medicaid Agency · 321 Any Road, Any City, State 00100',

  counties: {
    Polk: 'County A',
    Dubuque: 'County B',
    Scott: 'County C',
    'Black Hawk': 'County D',
    Johnson: 'County E',
    Linn: 'County F',
    Woodbury: 'County G',
  },

  formPrefix: 'A',
};
