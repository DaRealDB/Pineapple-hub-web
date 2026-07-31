/**
 * Reusable status/grade pill component.
 * Props per BUILD_SPEC.md Shared Component Library > StatusPill.
 *
 * Variants: online | offline | verified | flagged | pending | grade-a | grade-b | rejected
 *
 * @param {{ variant: 'online' | 'offline' | 'verified' | 'flagged' | 'pending' | 'grade-a' | 'grade-b' | 'rejected', label?: string, className?: string }} props
 */
export default function StatusPill({ variant, label, className = '' }) {
  const variantStyles = {
    online:
      'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]',
    offline:
      'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]',
    verified:
      'border-transparent text-[#10B981]',
    flagged:
      'border-transparent text-[#EF4444]',
    pending:
      'border-transparent text-tertiary',
    'grade-a':
      'bg-primary/10 border-primary text-primary',
    'grade-b':
      'border-on-surface-variant text-on-surface-variant',
    rejected:
      'bg-error/10 border-error text-error',
  };

  const dotVariants = ['online', 'offline'];

  const showDot = dotVariants.includes(variant);

  return (
    <span
      className={`inline-flex items-center px-xs py-[2px] rounded uppercase font-bold text-[10px] border ${variantStyles[variant] || ''} ${className}`}
    >
      {showDot && (
        <span
          className={`w-2 h-2 rounded-full mr-1.5 ${
            variant === 'online' ? 'bg-[#10B981]' : 'bg-[#EF4444]'
          }`}
        />
      )}
      {label || variant}
    </span>
  );
}
