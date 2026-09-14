import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { formatSSN } from '../lib/ssn';

interface Props {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function SSNInput({ value, onChange, placeholder = '123-45-6789', disabled = false, id }: Props) {
  const [visible, setVisible] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.replace(/\D/g, '').slice(0, 9));
  };

  return (
    <div
      className={'input' + (disabled ? ' disabled' : '')}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}
    >
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        inputMode="numeric"
        autoComplete="off"
        value={visible ? formatSSN(value) : value}
        onChange={!disabled ? handleChange : undefined}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          height: '100%',
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      />
      {!disabled && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide SSN' : 'Show SSN'}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            color: 'var(--color-muted-foreground)',
          }}
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
