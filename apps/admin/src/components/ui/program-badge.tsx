import * as React from 'react';

export type ProgramId =
  | 'snap'
  | 'medicaid'
  | 'tanf'
  | 'wic'
  | 'chip'
  | 'unemployment'
  | 'housing'
  | 'child-services'
  | 'other';

type ProgramStyle = {
  subtle: React.CSSProperties;
  solid: React.CSSProperties;
  outline: React.CSSProperties;
  dot: string;
};

type ProgramConfig = {
  label: string;
  styles: ProgramStyle;
};

const PROGRAM_CONFIG: Record<ProgramId, ProgramConfig> = {
  snap: {
    label: 'SNAP',
    styles: {
      subtle: { background: 'var(--civic-plum-3)', color: 'var(--civic-plum-11)' },
      solid: { background: 'var(--civic-plum-9)', color: 'white' },
      outline: { border: '1px solid var(--civic-plum-6)', color: 'var(--civic-plum-11)' },
      dot: 'var(--civic-plum-9)',
    },
  },
  medicaid: {
    label: 'Medicaid',
    styles: {
      subtle: { background: 'var(--civic-blue-3)', color: 'var(--civic-blue-11)' },
      solid: { background: 'var(--civic-blue-9)', color: 'white' },
      outline: { border: '1px solid var(--civic-blue-6)', color: 'var(--civic-blue-11)' },
      dot: 'var(--civic-blue-9)',
    },
  },
  tanf: {
    label: 'TANF',
    styles: {
      subtle: { background: 'var(--civic-plum-3)', color: 'var(--civic-plum-11)' },
      solid: { background: 'var(--civic-plum-9)', color: 'white' },
      outline: { border: '1px solid var(--civic-plum-6)', color: 'var(--civic-plum-11)' },
      dot: 'var(--civic-plum-9)',
    },
  },
  wic: {
    label: 'WIC',
    styles: {
      subtle: { background: 'var(--civic-green-3)', color: 'var(--civic-green-11)' },
      solid: { background: 'var(--civic-green-9)', color: 'white' },
      outline: { border: '1px solid var(--civic-green-6)', color: 'var(--civic-green-11)' },
      dot: 'var(--civic-green-9)',
    },
  },
  chip: {
    label: 'CHIP',
    styles: {
      subtle: { background: 'var(--civic-blue-3)', color: 'var(--civic-blue-11)' },
      solid: { background: 'var(--civic-blue-9)', color: 'white' },
      outline: { border: '1px solid var(--civic-blue-6)', color: 'var(--civic-blue-11)' },
      dot: 'var(--civic-blue-9)',
    },
  },
  unemployment: {
    label: 'Unemployment',
    styles: {
      subtle: { background: 'var(--civic-orange-3)', color: 'var(--civic-orange-11)' },
      solid: { background: 'var(--civic-orange-6)', color: 'var(--civic-text-primary)' },
      outline: { border: '1px solid var(--civic-orange-6)', color: 'var(--civic-orange-11)' },
      dot: 'var(--civic-orange-6)',
    },
  },
  housing: {
    label: 'Housing',
    styles: {
      subtle: { background: 'var(--civic-amber-3)', color: 'var(--civic-amber-11)' },
      solid: { background: 'var(--civic-amber-9)', color: 'var(--civic-text-primary)' },
      outline: { border: '1px solid var(--civic-amber-6)', color: 'var(--civic-amber-11)' },
      dot: 'var(--civic-amber-9)',
    },
  },
  'child-services': {
    label: 'Child Services',
    styles: {
      subtle: { background: 'var(--civic-red-3)', color: 'var(--civic-red-11)' },
      solid: { background: 'var(--civic-red-9)', color: 'white' },
      outline: { border: '1px solid var(--civic-red-6)', color: 'var(--civic-red-11)' },
      dot: 'var(--civic-red-9)',
    },
  },
  other: {
    label: 'Other',
    styles: {
      subtle: { background: 'var(--civic-bg-component)', color: 'var(--civic-text-secondary)' },
      solid: { background: 'var(--civic-bg-component-hover)', color: 'var(--civic-text-primary)' },
      outline: { border: '1px solid var(--civic-border-subtle)', color: 'var(--civic-text-primary)' },
      dot: 'var(--civic-text-secondary)',
    },
  },
};

interface ProgramBadgeProps {
  program: ProgramId;
  variant?: 'subtle' | 'solid' | 'outline' | 'dot';
  className?: string;
}

/**
 * Use this to label which benefit program a case or record belongs to, such as SNAP, Medicaid, WIC, and others. Pass the program identifier and the label and color are applied automatically. Use it consistently everywhere program context appears so caseworkers can scan and recognize programs at a glance.
 */
function ProgramBadge({ program, variant = 'subtle', className }: ProgramBadgeProps) {
  const config = PROGRAM_CONFIG[program];
  const dotStyle: React.CSSProperties =
    variant === 'dot'
      ? { background: 'var(--civic-bg-component)', color: 'var(--civic-text-primary)' }
      : config.styles[variant];

  return (
    <span
      data-slot="program-badge"
      data-program={program}
      data-variant={variant}
      className={className}
      style={dotStyle}
    >
      {variant === 'dot' && (
        <span aria-hidden="true" data-slot="program-badge-dot" style={{ background: config.styles.dot }} />
      )}
      {config.label}
    </span>
  );
}

export { ProgramBadge };
