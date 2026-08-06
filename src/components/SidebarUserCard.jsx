/**
 * Sidebar user footer card per BUILD_SPEC.md Global Shell > Sidebar > User footer card.
 * Contains: 40×40px avatar, user name label, station/role ID, optional logout button.
 * Falls back to a "QA LEAD" / "STATION_04" placeholder when unauthenticated.
 *
 * @param {{
 *   role?: string,
 *   station?: string,
 *   avatarUrl?: string,
 *   onLogout?: () => void,
 * }} props
 */
export default function SidebarUserCard({
  role,
  station = 'STATION_04',
  avatarUrl,
  onLogout,
}) {
  return (
    <div className="mt-auto pt-lg border-t border-outline-variant">
      <div className="flex items-center gap-md px-sm">
        <img
          className="w-10 h-10 rounded-full border border-primary/20"
          src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(role || 'User')}&size=40&background=06b6d4&color=fff`}
          alt={`${role || 'User'} avatar`}
        />
        <div className="overflow-hidden flex-1">
          <p className="font-label-caps text-label-caps text-primary truncate">
            {role || 'QA LEAD'}
          </p>
          <p className="font-data-mono text-data-mono text-on-surface truncate">
            {station}
          </p>
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-on-surface-variant hover:text-error transition-colors"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        )}
      </div>
    </div>
  );
}
