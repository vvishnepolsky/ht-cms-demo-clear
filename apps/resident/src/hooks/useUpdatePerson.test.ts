import { describe, it, expect } from 'vitest';
import { buildUpdatePersonInput, type PersonalInfoFormState } from './useUpdatePerson';

const BASE_FORM: PersonalInfoFormState = {
  firstName: 'Jasmine',
  middleName: '',
  lastName: 'Washington',
  suffix: '',
  dob: '1991-08-04',
  ssn: '',
  noSSN: false,
  street: '123 Main St',
  apt: '',
  city: 'Des Moines',
  state: 'IA',
  zip: '50309',
  mailingStreet: '',
  mailingApt: '',
  mailingCity: '',
  mailingState: '',
  mailingZip: '',
  phone: '5155550100',
  phoneType: 'MOBILE',
  email: 'jasmine@example.com',
  preferredLanguage: 'en',
};

describe('buildUpdatePersonInput', () => {
  it('forwards a populated dob as dateOfBirth', () => {
    const input = buildUpdatePersonInput(BASE_FORM, 'person-uuid-123');
    expect(input.dateOfBirth).toBe('1991-08-04');
  });

  it('omits dateOfBirth when dob is an empty string', () => {
    // Regression guard for the ENG-1800 fix: the identity-service isoDateField
    // rejects '', so an empty dob must be coerced to undefined before sending.
    const input = buildUpdatePersonInput({ ...BASE_FORM, dob: '' }, 'person-uuid-123');
    expect(input.dateOfBirth).toBeUndefined();
  });

  it('omits ssn when noSSN is true', () => {
    const input = buildUpdatePersonInput({ ...BASE_FORM, noSSN: true, ssn: '123456789' }, 'person-uuid-123');
    expect(input.ssn).toBeUndefined();
  });

  it('strips non-digit characters from ssn', () => {
    const input = buildUpdatePersonInput({ ...BASE_FORM, ssn: '123-45-6789' }, 'person-uuid-123');
    expect(input.ssn).toBe('123456789');
  });

  it('concatenates street and apt when apt is provided', () => {
    const input = buildUpdatePersonInput({ ...BASE_FORM, apt: 'Apt 4B' }, 'person-uuid-123');
    expect(input.addresses?.[0]?.line?.[0]).toBe('123 Main St Apt 4B');
  });

  it('omits addresses when street is empty', () => {
    const input = buildUpdatePersonInput({ ...BASE_FORM, street: '' }, 'person-uuid-123');
    expect(input.addresses).toBeUndefined();
  });

  it('defaults preferredLanguage to en when not provided', () => {
    const input = buildUpdatePersonInput({ ...BASE_FORM, preferredLanguage: undefined }, 'person-uuid-123');
    expect(input.preferredLanguage).toBe('en');
  });

  it('omits optional string fields when empty', () => {
    const input = buildUpdatePersonInput({ ...BASE_FORM, middleName: '', suffix: '' }, 'person-uuid-123');
    expect(input.middleName).toBeUndefined();
    expect(input.suffix).toBeUndefined();
  });
});
