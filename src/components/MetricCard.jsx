/**
 * Icon + label + value metric card per BUILD_SPEC.md Shared Component Library > MetricCard.
 *
 * @param {{ icon?: string, label: string, value: string, unit?: string, color?: string, className?: string }} props
 */
export default function MetricCard({
  icon,
  label,
  value,
  unit,
  color = 'primary',
  className = '',
}) {
  return (
    <div className={`flex items-center gap-md ${className}`}>
      {icon && (
        <div
          className={`p-sm rounded bg-${color}/10 flex items-center justify-center`}
        >
          <span className={`material-symbols-outlined text-${color}`}>
            {icon}
          </span>
        </div>
      )}
      <div>
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          {label}
        </p>
        <p className="font-data-mono text-data-mono text-on-surface tabular-nums">
          {value}
          {unit && (
            <span className="text-xs text-on-surface-variant ml-0.5">
              {unit}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
