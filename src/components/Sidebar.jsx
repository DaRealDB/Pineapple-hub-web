import NavItem from './NavItem';
import SidebarUserCard from './SidebarUserCard';
import { useAuth } from '../context/AuthContext';

/**
 * Collapsible sidebar. Toggle button in the header.
 *
 * @param {{ availability?: 'online' | 'offline' | null, collapsed?: boolean, onToggle?: () => void }} props
 */
export default function Sidebar({ availability, collapsed, onToggle }) {
  const { user, logout, isAuthenticated } = useAuth();
  const navItems = [
    { icon: 'precision_manufacturing', label: 'Live Grading', to: '/' },
    { icon: 'assignment', label: 'Operations Log', to: '/operations-log' },
    { icon: 'router', label: 'Devices', to: '/devices' },
    { icon: 'assessment', label: 'Reports', to: '/reports' },
  ];

  return (
    <aside className={`fixed left-0 top-0 h-full bg-surface-container border-r border-outline-variant flex flex-col py-lg z-50 transition-all ${collapsed ? 'w-16 px-sm' : 'w-60 px-md'}`}>
      {/* Header block with toggle */}
      <div className={`mb-xl ${collapsed ? 'px-0 text-center' : 'px-sm'}`}>
        <div className="flex items-center justify-between mb-sm">
          {!collapsed && (
            <h1 className="font-headline-sm text-headline-sm font-bold text-primary">
              Pineapple Hub
            </h1>
          )}
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-surface-container-high transition-colors text-on-surface-variant flex-shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-symbols-outlined text-xl">
              {collapsed ? 'menu_open' : 'menu'}
            </span>
          </button>
        </div>
        {!collapsed && (
          <>
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
          </>
        )}
        {collapsed && availability && (
          <span
            className={`inline-block w-2 h-2 rounded-full mt-sm ${
              availability === 'online'
                ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]'
                : 'bg-[#EF4444]'
            }`}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-xs">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={collapsed ? '' : item.label}
            to={item.to}
          />
        ))}
      </nav>

      {/* User footer */}
      {!collapsed && (
        <SidebarUserCard
          role={isAuthenticated ? user?.fullName : 'QA LEAD'}
          station={isAuthenticated ? user?.role?.toUpperCase() : 'STATION_04'}
          onLogout={isAuthenticated ? logout : undefined}
        />
      )}
      {collapsed && (
        <div className="flex justify-center">
          <span className="material-symbols-outlined text-on-surface-variant text-xl">account_circle</span>
        </div>
      )}
    </aside>
  );
}
