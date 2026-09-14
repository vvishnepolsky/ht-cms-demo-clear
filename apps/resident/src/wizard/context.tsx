import React, { useState, useMemo, useCallback, useContext, useEffect, createContext } from 'react';
import type { WizardFormData, FormDataContextValue } from './form-data.types';

/* =========================================================================
   FormDataContext — single source of truth for the whole application.
   Everything is a controlled input bound to this state.
   ========================================================================= */

// State-X's two-letter code. The demo server's residency rule and the Verify
// Assist tenant (`VERIFY_ASSIST_TENANT_STATE=SX`) both use it, and the CLEAR
// demo identity (Jordan Rivera, Springfield, SX 55501) comes back with it as
// the ID's state — so it must be a selectable value in US_STATES below.
const CMS_DEMO_STATE = 'SX';

// The wizard's single source of truth is React state, but the CLEAR handoff
// navigates the browser away to the hosted Verify Assist flow and back, and
// "Save & exit" promises progress is kept on this device — so the form is
// mirrored to localStorage on every change and rehydrated on load.
const FORM_STORAGE_KEY = 'sx-wizard-form';

function readStoredForm(): WizardFormData | null {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as WizardFormData) : null;
  } catch {
    return null;
  }
}

/** Force a synchronous write of the form to localStorage (used right before
 * the CLEAR handoff navigates the browser away). */
function persistForm(data: WizardFormData): void {
  writeStoredForm(data);
}

function writeStoredForm(data: WizardFormData | null): void {
  try {
    if (data) localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(FORM_STORAGE_KEY);
  } catch {
    // Storage full / disabled — the in-memory form still works.
  }
}

// --- Initial state ---------------------------------------------------------
const INITIAL_FORM = {
  household: {
    county: '',
    applicationFor: '', // "myself" | "household" | "specific"
    existingCase: null,
    caseNumber: '',
    householdSize: 1,
  },
  primaryApplicant: {
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dob: '',
    ssn: '',
    noSSN: false,
    sex: '',
    streetAddress: '',
    aptUnit: '',
    city: '',
    state: CMS_DEMO_STATE,
    zip: '',
    homeless: false,
    mailingAddressSame: true,
    phone: '',
    phoneType: 'mobile',
    email: '',
    textReminders: true,
  },
  demographics: {
    race: [],
    ethnicity: '',
    veteran: null,
    pregnant: null,
    dueDate: '',
    expectedBabies: 1,
    disability: null,
    formerFosterYouth: null,
  },
  citizenship: {
    '0': {
      status: 'us_citizen',
      documentType: '',
      alienNumber: '',
      dateOfEntry: '',
      countryOfBirth: 'United States',
      hasSponsor: false,
      sponsorName: '',
      sponsorAddress: '',
      sponsorIncome: '',
      fiveYearResident: null,
      tribalMember: null,
      tribeName: '',
    },
  },
  taxFiling: {
    willFile: '',
    headOfHouseholdId: '0',
    filingJointlyWithId: '',
    taxDependentIds: [],
  },
  workRequirements: {}, // unused; kept for back-compat with legacy components
  nonMagiResources: {}, // ENG-1744: per-person resource/asset disclosures for ABD pathway
  nonMagiMedicareLtc: {}, // ENG-1744: per-person Medicare + long-term care for ABD pathway
  householdMembers: [],
  jobs: { '0': [] },
  otherIncome: [],
  projectedIncome: {
    expectedChange: 'same',
    changeDate: '',
    changeReason: [],
    changeReasonOther: '',
    lastTaxReturnAGI: '',
  },
  healthInsurance: {
    '0': {
      hasInsurance: '',
      insuranceType: '',
      companyName: '',
      policyNumber: '',
      coverageEndDate: '',
      lossReason: '',
      skipped: false,
    },
  },
  employerCoverage: {
    offered: null,
    memberId: '0',
    employerName: '',
    availableDate: '',
    employeePremium: '',
    familyPremium: '',
    coversWhat: [],
    enrollmentStatus: '',
    meetsMinimumValue: '',
    planYearStart: '',
    cobraAvailable: null,
  },
  retroactive: {
    hasBills: null,
    months: [],
    requestCoverage: null,
  },
  authorizedRep: {
    hasRep: null,
    name: '',
    relationship: '',
    phone: '',
    email: '',
    address: '',
    scope: [],
  },
  preferences: {
    noticeChannels: ['email'],
    renewalReminders: true,
    writtenLanguage: 'English',
    spokenLanguage: 'English',
    bestTimeToContact: 'anytime',
    preferredContactMethod: 'phone',
    alternatePhone: '',
    okToLeaveVoicemail: null,
    accessibilityNeeds: [],
  },
  eligibility: null,
  _bankConnected: false, // ENG-1684: set to true after Argyle bank mock completes
  _bankBalance: '', // ENG-1684: set to 'verified' after Argyle bank mock completes
  _incomeConfirmed: [],
  _payrollDocsByPerson: {},
  _argyleByPerson: {}, // per-person Argyle connection: { [memberId]: { provider: string; at: string } }
} satisfies WizardFormData;

// Seed a realistic starter so the Review screen has data to show even
// without filling every box. The user can edit any field — the seed is
// only used where they haven't typed anything.
//
// This sample is tuned to demonstrate the 5% income buffer:
//   • Annual household wages: $36,480 ($3,040/mo)
//   • Just $144.40 over the standard limit for a household of 3
//   • Buffer kicks in → all three qualify, including Aaliyah on the
//     children's pathway
const SAMPLE_SEED = {
  household: {
    county: 'Polk',
    applicationFor: 'household',
    existingCase: false,
    caseNumber: '',
    householdSize: 3,
  },
  primaryApplicant: {
    firstName: 'Jasmine',
    middleName: '',
    lastName: 'Carter',
    suffix: '',
    dob: '1991-08-04',
    ssn: '900454216',
    noSSN: false,
    sex: 'female',
    streetAddress: '1428 Forest Ave',
    aptUnit: '',
    city: 'Des Moines',
    state: CMS_DEMO_STATE,
    zip: '50314',
    homeless: false,
    mailingAddressSame: true,
    phone: '(515) 555-0142',
    phoneType: 'mobile',
    email: 'jasmine.carter@example.com',
    textReminders: true,
  },
  demographics: {
    race: ['black'],
    ethnicity: 'not_hispanic',
    veteran: false,
    pregnant: false,
    dueDate: '',
    expectedBabies: 1,
    disability: false,
    formerFosterYouth: false,
  },
  householdMembers: [
    {
      id: 'm1',
      firstName: 'Marcus',
      middleInitial: '',
      lastName: 'Carter',
      dob: '1989-11-15',
      relationship: 'spouse',
      sex: 'male',
      ssn: '900452107',
      applying: true,
      hasDisability: false,
      pregnant: null,
      dueDate: '',
      expectedBabies: 1,
    },
    {
      id: 'm2',
      firstName: 'Aaliyah',
      middleInitial: '',
      lastName: 'Carter',
      dob: '2017-09-22',
      relationship: 'child',
      sex: 'female',
      ssn: '900457783',
      applying: true,
      hasDisability: false,
      pregnant: null,
      dueDate: '',
      expectedBabies: 1,
    },
  ],
  jobs: {
    // Jasmine — primary, ABC Manufacturing, $2,000/mo
    '0': [
      {
        id: 'j1',
        employer: 'ABC Manufacturing',
        address: '2200 SE 14th St, Des Moines',
        phone: '(515) 555-0177',
        startDate: '2022-06-13',
        ongoing: true,
        endDate: '',
        payRate: '11.54',
        payType: 'gross',
        payFrequency: 'hourly',
        hoursPerWeek: '40',
        monthlyIncome: 2000,
        selfEmployed: false,
        businessName: '',
        businessType: '',
        grossRevenue: '',
        businessExpenses: '',
      },
    ],
    // Marcus — spouse, Metro Fulfillment Center, $1,040/mo (part-time)
    m1: [
      {
        id: 'j2',
        employer: 'Metro Fulfillment Center',
        address: '5950 NE 14th St, Des Moines',
        phone: '(515) 555-0188',
        startDate: '2024-03-04',
        ongoing: true,
        endDate: '',
        payRate: '12.00',
        payType: 'gross',
        payFrequency: 'hourly',
        hoursPerWeek: '20',
        monthlyIncome: 1040,
        selfEmployed: false,
        businessName: '',
        businessType: '',
        grossRevenue: '',
        businessExpenses: '',
      },
    ],
  },
  otherIncome: [],
  projectedIncome: {
    expectedChange: 'same',
    changeDate: '',
    changeReason: [],
    changeReasonOther: '',
    lastTaxReturnAGI: '35600',
  },
  citizenship: {
    '0': {
      status: 'us_citizen',
      documentType: '',
      alienNumber: '',
      dateOfEntry: '',
      countryOfBirth: 'United States',
      hasSponsor: false,
      sponsorName: '',
      sponsorAddress: '',
      sponsorIncome: '',
      fiveYearResident: null,
      tribalMember: false,
      tribeName: '',
    },
    m1: {
      status: 'us_citizen',
      documentType: '',
      alienNumber: '',
      dateOfEntry: '',
      countryOfBirth: 'United States',
      hasSponsor: false,
      sponsorName: '',
      sponsorAddress: '',
      sponsorIncome: '',
      fiveYearResident: null,
      tribalMember: false,
      tribeName: '',
    },
    m2: {
      status: 'us_citizen',
      documentType: '',
      alienNumber: '',
      dateOfEntry: '',
      countryOfBirth: 'United States',
      hasSponsor: false,
      sponsorName: '',
      sponsorAddress: '',
      sponsorIncome: '',
      fiveYearResident: null,
      tribalMember: false,
      tribeName: '',
    },
  },
  taxFiling: {
    willFile: 'yes',
    headOfHouseholdId: '0',
    filingJointlyWithId: 'm1',
    taxDependentIds: ['m2'],
  },
  healthInsurance: {
    '0': {
      hasInsurance: 'no',
      insuranceType: '',
      companyName: '',
      policyNumber: '',
      coverageEndDate: '',
      lossReason: '',
      skipped: false,
    },
    m1: {
      hasInsurance: 'no',
      insuranceType: '',
      companyName: '',
      policyNumber: '',
      coverageEndDate: '',
      lossReason: '',
      skipped: false,
    },
    m2: {
      hasInsurance: 'no',
      insuranceType: '',
      companyName: '',
      policyNumber: '',
      coverageEndDate: '',
      lossReason: '',
      skipped: false,
    },
  },
  employerCoverage: {
    offered: false,
    memberId: '0',
    employerName: '',
    availableDate: '',
    employeePremium: '',
    familyPremium: '',
    coversWhat: [],
    enrollmentStatus: '',
    meetsMinimumValue: '',
    planYearStart: '',
    cobraAvailable: null,
  },
} satisfies WizardFormData;

const FormDataContext = createContext<FormDataContextValue | null>(null);

function FormDataProvider({ children }: { children: React.ReactNode }) {
  // Rehydrate over INITIAL_FORM so fields added after a draft was saved still
  // have their defaults.
  const [data, setData] = useState<WizardFormData>(() => {
    const stored = readStoredForm();
    return stored ? { ...INITIAL_FORM, ...stored } : INITIAL_FORM;
  });

  useEffect(() => {
    writeStoredForm(data);
  }, [data]);

  const updateFormData = useCallback<FormDataContextValue['updateFormData']>((section, patch) => {
    setData((prev) => {
      const current = prev[section];
      const nextSection =
        typeof patch === 'function'
          ? patch(current)
          : Array.isArray(current)
            ? patch
            : { ...(current as object), ...(patch as object) };
      // Dynamic section write: TS cannot prove the computed-key assignment, but
      // `section` is `keyof WizardFormData` and `nextSection` is that section's
      // patched value — sound by construction. (`as object` lets the spreads
      // compile over the section union; neither is `as any`.)
      return { ...prev, [section]: nextSection } as WizardFormData;
    });
  }, []);

  const setPath = useCallback<FormDataContextValue['setPath']>((section, key, value) => {
    setData((prev) => ({ ...prev, [section]: { ...(prev[section] as object), [key]: value } }) as WizardFormData);
  }, []);

  const loadSample = useCallback(() => {
    setData((prev) => ({ ...prev, ...SAMPLE_SEED }));
  }, []);

  const resetForm = useCallback(() => {
    writeStoredForm(null);
    setData(INITIAL_FORM);
  }, []);

  const value = useMemo(
    () => ({
      data,
      setData,
      updateFormData,
      setPath,
      loadSample,
      resetForm,
    }),
    [data, updateFormData, setPath, loadSample, resetForm],
  );

  return <FormDataContext.Provider value={value}>{children}</FormDataContext.Provider>;
}

function useFormData() {
  const ctx = useContext(FormDataContext);
  if (!ctx) throw new Error('useFormData must be used inside FormDataProvider');
  return ctx;
}

// --- Static fixtures used across screens -----------------------------------

const IOWA_COUNTIES = [
  'Adair',
  'Adams',
  'Allamakee',
  'Appanoose',
  'Audubon',
  'Benton',
  'Black Hawk',
  'Boone',
  'Bremer',
  'Buchanan',
  'Buena Vista',
  'Butler',
  'Calhoun',
  'Carroll',
  'Cass',
  'Cedar',
  'Cerro Gordo',
  'Cherokee',
  'Chickasaw',
  'Clarke',
  'Clay',
  'Clayton',
  'Clinton',
  'Crawford',
  'Dallas',
  'Davis',
  'Decatur',
  'Delaware',
  'Des Moines',
  'Dickinson',
  'Dubuque',
  'Emmet',
  'Fayette',
  'Floyd',
  'Franklin',
  'Fremont',
  'Greene',
  'Grundy',
  'Guthrie',
  'Hamilton',
  'Hancock',
  'Hardin',
  'Harrison',
  'Henry',
  'Howard',
  'Humboldt',
  'Ida',
  'Iowa',
  'Jackson',
  'Jasper',
  'Jefferson',
  'Johnson',
  'Jones',
  'Keokuk',
  'Kossuth',
  'Lee',
  'Linn',
  'Louisa',
  'Lucas',
  'Lyon',
  'Madison',
  'Mahaska',
  'Marion',
  'Marshall',
  'Mills',
  'Mitchell',
  'Monona',
  'Monroe',
  'Montgomery',
  'Muscatine',
  "O'Brien",
  'Osceola',
  'Page',
  'Palo Alto',
  'Plymouth',
  'Pocahontas',
  'Polk',
  'Pottawattamie',
  'Poweshiek',
  'Ringgold',
  'Sac',
  'Scott',
  'Shelby',
  'Sioux',
  'Story',
  'Tama',
  'Taylor',
  'Union',
  'Van Buren',
  'Wapello',
  'Warren',
  'Washington',
  'Wayne',
  'Webster',
  'Winnebago',
  'Winneshiek',
  'Woodbury',
  'Worth',
  'Wright',
];

const US_STATES = [
  // State-X's single-state portal — applicants applying here are declaring
  // State-X residency. CMS_DEMO_STATE ('SX') is the value the residency rule
  // matches; a real US state below correctly denies.
  { value: CMS_DEMO_STATE, label: 'State-X' },
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
];

const WIZARD_RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'stepchild', label: 'Stepchild' },
  { value: 'foster_child', label: 'Foster child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'other_relative', label: 'Other relative' },
  { value: 'non_relative', label: 'Non-relative' },
];

// Non-MAGI (ABD) demo scenario — Robert Mitchell, age 78.
// Disability flag triggers the nm-resources / nm-medicare-ltc steps.
const SAMPLE_SEED_ABD: Partial<WizardFormData> = {
  household: {
    county: 'Polk',
    applicationFor: 'myself',
    existingCase: false,
    caseNumber: '',
    householdSize: 1,
  },
  primaryApplicant: {
    firstName: 'Robert',
    lastName: 'Mitchell',
    dob: '1948-03-22', // age 78
    ssn: '900453891',
    sex: 'male',
    streetAddress: '412 Oak Street',
    city: 'Des Moines',
    state: CMS_DEMO_STATE,
    zip: '50312',
    homeless: false,
    mailingAddressSame: true,
    phone: '(515) 555-0203',
    phoneType: 'mobile',
    email: 'robert.mitchell@example.com',
    textReminders: true,
  },
  demographics: {
    race: ['white'],
    ethnicity: 'not_hispanic',
    veteran: true,
    pregnant: false,
    disability: true, // routes to ABD / non-MAGI pathway
    formerFosterYouth: false,
  },
  householdMembers: [],
  citizenship: {
    '0': {
      status: 'us_citizen',
      countryOfBirth: 'United States',
      tribalMember: false,
    },
  },
  otherIncome: [
    {
      id: 'o_robert_ss',
      type: 'social_security_retirement',
      recipient: '0',
      amount: '950',
      frequency: 'monthly',
    },
  ],
  nonMagiResources: {
    '0': {
      hasChecking: false,
      checkingAmount: '',
      hasSavings: true,
      savingsAmount: '1800', // liquid savings account
    },
  },
  jobs: { '0': [] },
  projectedIncome: {
    expectedChange: 'same',
    changeDate: '',
    changeReason: [],
    changeReasonOther: '',
    lastTaxReturnAGI: '11400',
  },
  healthInsurance: {
    '0': { hasInsurance: 'yes', insuranceType: 'medicare', skipped: false },
  },
  taxFiling: { willFile: 'no', headOfHouseholdId: '0' },
  _incomeConfirmed: [],
  _payrollDocsByPerson: {},
  _argyleByPerson: {},
};

// Expose globals (each <script type=text/babel> gets its own scope)
Object.assign(window, {
  FormDataContext,
  FormDataProvider,
  useFormData,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  INITIAL_FORM,
  SAMPLE_SEED,
  SAMPLE_SEED_ABD,
});

export {
  FormDataContext,
  FormDataProvider,
  useFormData,
  CMS_DEMO_STATE,
  FORM_STORAGE_KEY,
  persistForm,
  INITIAL_FORM,
  IOWA_COUNTIES,
  US_STATES,
  WIZARD_RELATIONSHIPS,
  SAMPLE_SEED,
  SAMPLE_SEED_ABD,
};
