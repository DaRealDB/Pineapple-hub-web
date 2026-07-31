import { NavLink } from 'react-router-dom';

/**
 * Single sidebar navigation item.
 * Props per BUILD_SPEC.md Global Shell > Sidebar > Navigation items.
 *
 * @param {{ icon: string, label: string, to: string }} props
 */
export default function NavItem({ icon, label, to }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-md px-md py-sm rounded transition-colors duration-150 font-body-md text-body-md ${
          isActive
            ? 'bg-secondary-container text-on-secondary-container font-bold'
            : 'text-on-surface-variant hover:bg-surface-container-high'
        }`
      }
    >
      <span className="material-symbols-outlined">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
