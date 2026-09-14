import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hydrateSectionsToSessionStorage } from '../section-hydration';

const mockSetItem = vi.fn();
const mockGetItem = vi.fn();

vi.stubGlobal('sessionStorage', {
  setItem: mockSetItem,
  getItem: mockGetItem,
  removeItem: vi.fn(),
  clear: vi.fn(),
});

describe('hydrateSectionsToSessionStorage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes known section data to the mapped sessionStorage key', () => {
    hydrateSectionsToSessionStorage([
      { sectionKey: 'personalInfo', isComplete: true, data: { firstName: 'Jane', lastName: 'Doe' } },
    ]);
    expect(mockSetItem).toHaveBeenCalledWith(
      'personal-info-draft',
      JSON.stringify({ firstName: 'Jane', lastName: 'Doe' }),
    );
  });

  it('skips unknown sectionKeys without throwing', () => {
    expect(() =>
      hydrateSectionsToSessionStorage([
        { sectionKey: 'unknownFutureSection', isComplete: true, data: { foo: 'bar' } },
      ] as Parameters<typeof hydrateSectionsToSessionStorage>[0]),
    ).not.toThrow();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('skips sections with empty data objects', () => {
    hydrateSectionsToSessionStorage([{ sectionKey: 'demographics', isComplete: true, data: {} }]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('skips snapScreening (no sessionStorage mapping)', () => {
    hydrateSectionsToSessionStorage([{ sectionKey: 'snapScreening', isComplete: true, data: { answers: ['yes'] } }]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('hydrates multiple sections independently', () => {
    hydrateSectionsToSessionStorage([
      { sectionKey: 'personalInfo', isComplete: true, data: { firstName: 'Jane' } },
      { sectionKey: 'household', isComplete: true, data: { size: 3 } },
      { sectionKey: 'demographics', isComplete: false, data: { gender: 'F' } },
    ]);
    expect(mockSetItem).toHaveBeenCalledTimes(3);
    expect(mockSetItem).toHaveBeenCalledWith('personal-info-draft', JSON.stringify({ firstName: 'Jane' }));
    expect(mockSetItem).toHaveBeenCalledWith('household-draft', JSON.stringify({ size: 3 }));
    expect(mockSetItem).toHaveBeenCalledWith('demographics-draft', JSON.stringify({ gender: 'F' }));
  });

  it('swallows QuotaExceededError and continues with remaining sections', () => {
    mockSetItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() =>
      hydrateSectionsToSessionStorage([
        { sectionKey: 'personalInfo', isComplete: true, data: { firstName: 'Jane' } },
        { sectionKey: 'household', isComplete: true, data: { size: 3 } },
      ]),
    ).not.toThrow();
    expect(mockSetItem).toHaveBeenCalledTimes(2);
  });

  it('skips non-object data values', () => {
    hydrateSectionsToSessionStorage([
      { sectionKey: 'personalInfo', isComplete: true, data: null as unknown as Record<string, unknown> },
    ]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
