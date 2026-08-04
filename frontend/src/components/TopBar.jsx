/**
 * Sticky top bar per BUILD_SPEC.md Global Shell > TopBar.
 * Variants: "default" | "devices" | "reports"
 *
 * Dimensions: full width offset 240px (ml-60), 64px height (h-16), sticky top.
 * Background: surface with backdrop-blur-md. Border bottom: outline-variant.
 *
 * @param {{ variant?: 'default' | 'devices' | 'reports', connectionState?: string }} props
 */
export default function TopBar({ variant = 'default', connectionState }) {
  const isLive = connectionState === 'connected';

  return (
    <header className="sticky top-0 z-40 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant flex justify-between items-center h-16 px-lg ml-60">
      {/* Left side — breadcrumb */}
      <div className="flex items-center gap-md">
        <div className="flex flex-col">
          <span className="font-label-caps text-label-caps text-on-surface-variant tracking-widest">
            Bukidnon Corp. &gt; Plant 1 &gt; Grading Line B
          </span>
        </div>
      </div>

      {/* Right side — varies by variant */}
      <div className="flex items-center gap-lg">
        {variant === 'reports' ? (
          /* Reports variant: QA_MANAGER_01 pill, no bell/avatar */
          <div className="flex items-center gap-sm bg-surface-container-high px-sm py-xs rounded border border-outline-variant">
            <span className="material-symbols-outlined text-primary">
              account_circle
            </span>
            <span className="font-label-caps text-label-caps text-on-surface">
              QA_MANAGER_01
            </span>
          </div>
        ) : (
          /* Default & devices variant: notification bell + account circle */
          <>
            <div className="relative">
              <span className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors duration-200 cursor-pointer">
                notifications
              </span>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#EF4444] rounded-full" />
            </div>
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors duration-200 cursor-pointer">
              account_circle
            </span>
          </>
        )}

        {/* Connection state indicator (all variants) */}
        <div className="flex items-center gap-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isLive
                ? 'bg-[#10B981] animate-pulse'
                : connectionState === 'offline' || connectionState === 'error'
                  ? 'bg-[#EF4444]'
                  : 'bg-tertiary'
            }`}
          />
          <span className="font-label-caps text-[10px] text-on-surface-variant">
            {isLive
              ? 'MQTT LIVE'
              : connectionState === 'connecting'
                ? 'MQTT CONNECTING'
                : 'MQTT OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  );
}
