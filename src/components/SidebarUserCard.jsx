/**
 * Sidebar user footer card per BUILD_SPEC.md Global Shell > Sidebar > User footer card.
 * Contains: 40×40px avatar, "QA LEAD" label, "STATION_04" station ID.
 *
 * @param {{ role?: string, station?: string, avatarUrl?: string }} props
 */
export default function SidebarUserCard({
  role = 'QA LEAD',
  station = 'STATION_04',
  avatarUrl = 'https://ui-avatars.com/api/?name=QA+Lead&size=40&background=06b6d4&color=fff',
}) {
  return (
    <div className="mt-auto pt-lg border-t border-outline-variant">
      <div className="flex items-center gap-md px-sm">
        <img
          className="w-10 h-10 rounded-full border border-primary/20"
          src={avatarUrl}
          alt="QA Lead avatar"
        />
        <div className="overflow-hidden">
          <p className="font-label-caps text-label-caps text-primary truncate">
            {role}
          </p>
          <p className="font-data-mono text-data-mono text-on-surface truncate">
            {station}
          </p>
        </div>
      </div>
    </div>
  );
}
