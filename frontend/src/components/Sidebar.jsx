import NavItem from './NavItem';
import SidebarUserCard from './SidebarUserCard';

/**
 * 240px fixed sidebar per BUILD_SPEC.md Global Shell > Sidebar.
 * Background: surface-container, right border outline-variant.
 * Contains header block, 6 nav items, and user footer card.
 *
 * @param {{ availability?: 'online' | 'offline' | null, pipelineStatus?: object }} props
 */
export default function Sidebar({ availability, pipelineStatus }) {
  const navItems = [
    { icon: 'precision_manufacturing', label: 'Live Grading', to: '/' },
    { icon: 'assignment', label: 'Operations Log', to: '/operations-log' },
    { icon: 'analytics', label: 'Analytics', to: '/analytics' },
    { icon: 'router', label: 'Devices', to: '/devices' },
    { icon: 'document_scanner', label: 'OCR Pipeline', to: '/ocr-pipeline' },
    { icon: 'assessment', label: 'Reports', to: '/reports' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-surface-container border-r border-outline-variant flex flex-col py-lg px-md z-50">
      {/* Header block */}
      <div className="mb-xl px-sm">
        <h1 className="font-headline-sm text-headline-sm font-bold text-primary">
          Pineapple Hub
        </h1>
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          Bukidnon Operations
        </p>
        {availability && (
          <div className="flex items-center gap-xs mt-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                availability === 'online'
                  ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]'
                  : 'bg-[#EF4444]'
              }`}
            />
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
              Scale {availability === 'online' ? 'Online' : 'Offline'}
            </span>
          </div>
        )}
        {pipelineStatus && (
          <div className="flex items-center gap-xs mt-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                pipelineStatus.fps >= 25
                  ? 'bg-[#06b6d4] shadow-[0_0_8px_#06b6d4]'
                  : 'bg-[#F59E0B]'
              }`}
            />
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
              OCR {pipelineStatus.fps >= 25 ? 'Active' : 'Degraded'}
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-xs">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            to={item.to}
          />
        ))}
      </nav>

      {/* User footer */}
      <SidebarUserCard />
    </aside>
  );
}
