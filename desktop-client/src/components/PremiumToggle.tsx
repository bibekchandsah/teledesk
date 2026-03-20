import React from 'react';

interface PremiumToggleProps {
  label?: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  iconOn?: React.ReactNode;
  iconOff?: React.ReactNode;
}

const PremiumToggle: React.FC<PremiumToggleProps> = ({
  label,
  description,
  checked,
  onChange,
  iconOn,
  iconOff,
}) => {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 4px' }}>
      {(label || description) && (
        <div style={{ flex: 1, marginRight: 16 }}>
          {label && <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{label}</div>}
          {description && <div style={{ color: 'var(--text-secondary)', fontSize: 12, opacity: 0.8 }}>{description}</div>}
        </div>
      )}
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 50,
          height: 28,
          borderRadius: 14,
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-tertiary)',
          position: 'relative',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: checked ? '0 0 15px rgba(99, 102, 241, 0.3)' : 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 24 : 2,
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#fff',
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
          }}
        >
          {checked ? iconOn : iconOff}
        </div>
      </div>
    </label>
  );
};

export default PremiumToggle;
