/**
 * DetailsSection -- reusable 3-column grid for displaying labeled key/value
 * pairs inside the expanded CaseHeader card.
 */

import type { ReactNode } from 'react';

export interface DetailField {
  /** Optional unique key; falls back to label if not provided. */
  id?: string;
  label: string;
  value: ReactNode;
}

export interface DetailsSectionProps {
  title: string;
  fields: DetailField[];
  /** When true the section spans full width instead of the default 3-col grid. */
  fullWidth?: boolean;
  className?: string;
}

export function DetailsSection({ title, fields, fullWidth = false, className }: DetailsSectionProps) {
  return (
    <div className={className}>
      <h4 className="text-sm font-semibold text-foreground mb-3">{title}</h4>
      {fullWidth ? (
        <dl className="space-y-2">
          {fields.map((f) => (
            <div key={f.id ?? f.label}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="text-sm mt-0.5">{f.value ?? <span className="text-muted-foreground">--</span>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          {fields.map((f) => (
            <div key={f.id ?? f.label}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="text-sm mt-0.5">{f.value ?? <span className="text-muted-foreground">--</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
