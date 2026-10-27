// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { PatternChip } from './PatternChip';
import { useState, useRef, useEffect } from 'react';
import { useAuth }                    from '../context/AuthContext';
import { useHelp }                    from '../context/HelpContext';
import { useNavigate, useLocation }   from 'react-router-dom';
import { getRoleHome }                from '../utils/getRoleHome';
import styles from './Shell.module.css';

// Each nav item declares a `cap` (RBAC capability key) that gates its visibility,
// resolved against the caller's capability set (Phase 4). Items without a clean
// capability mapping fall back to a `roles` array.
// Rendering logic:
//   0 visible items → group hidden
//   1 visible item  → rendered as a plain link using that item's label
//   2+ visible items → rendered as dropdown using the group label
const NAV_GROUPS = [
  { label: 'Dashboard', path: '/dashboard', roles: null },
  { label: 'Knowledge', path: '/knowledge', cap: 'knowledge.query' },

  {
    label: 'Risk Management', dropdown: true,
    items: [
      { label: 'Current Risks',        path: '/risks/current',  cap: 'risk_heatmap.read' },
      { label: 'New Risks',            path: '/risks/future',   cap: 'risk_heatmap.read' },
      { label: 'Pending Review',       path: '/risks/pending',  cap: 'governance.review' },
      { label: 'Threats',              path: '/threats',        cap: 'threats.read' },
      { label: 'Security Actions',     path: '/actions',        cap: 'actions.read' },
      { label: 'Security Exceptions',  path: '/exceptions',     cap: 'exceptions.read' },
      { label: 'Assurance Findings',   path: '/findings',       cap: 'findings.read' },
      { label: 'Impact Tables',         path: '/impact-tables',      cap: 'bil.read' },
      { label: 'Business Departments', path: '/wizard/department',  roles: ['admin','security_consultant','ciso','risk_analyst'] },
      { type: 'divider' },
      { type: 'header', label: 'Security Meetings' },
      { label: 'All Meetings',    path: '/meetings',       cap: 'meetings.read' },
      { label: 'Plan Meeting',    path: '/meetings/plan',  cap: 'meetings.write' },
      { label: 'Acceptance Queue', path: '/acceptance-queue', cap: 'actions.adopt_queue' },
    ],
  },

  {
    label: 'Business Architecture', dropdown: true,
    items: [
      { label: 'Organisation',       path: '/departments', roles: null },
      { type: 'divider' },
      { label: 'Business Services',  path: '/services', cap: 'services.read' },
      { label: 'Information Assets', path: '/assets',   cap: 'assets.read' },
      { label: 'Systems',            path: '/systems',  cap: 'systems.read' },
      { label: 'Suppliers',          path: '/suppliers', cap: 'suppliers.read' },
      { type: 'divider' },
      { type: 'header', label: 'System Components' },
      { label: 'People & Groups',       path: '/people-groups', cap: 'components.read' },
      { label: 'Processes',             path: '/processes',     cap: 'components.read' },
      { label: 'Technology Components', path: '/technology',    cap: 'components.read' },
      { label: 'Facilities',            path: '/facilities',    cap: 'components.read' },
      // Also under Security Controls → Security Architecture: the patterns are
      // sets of components, so they are found from here too (owner, 2026-10-02).
      { label: 'System architecture patterns', path: '/architecture-patterns', cap: 'controls.read', pattern: 'pattern' },
    ],
  },

  {
    label: 'Security Controls', dropdown: true,
    items: [
      { label: 'Control Library',            path: '/controls',    cap: 'controls.read' },
      { label: 'Statement of Applicability', path: '/soa',         cap: 'controls.read' },
      { label: 'Scopes',                     path: '/scopes',      cap: 'controls.read' },
      { label: 'Policies & documents',       path: '/policies-documents', cap: 'components.read' },
      { label: 'Remediation roll-up',        path: '/remediation', cap: 'actions.read' },
      { type: 'divider' },
      { type: 'header', label: 'Security Architecture' },
      { label: 'Security solutions',            path: '/security-solutions',        cap: 'controls.read', pattern: 'solution' },
      { label: 'Systems architecture template', path: '/architecture-template',     cap: 'controls.read', pattern: 'template' },
      { label: 'Security pattern triggers',     path: '/security-pattern-triggers', cap: 'controls.read' },
      { label: 'System architecture patterns',  path: '/architecture-patterns',     cap: 'controls.read', pattern: 'pattern' },
    ],
  },

  {
    label: 'Setup', dropdown: true,
    items: [
      // Dept Setup has no single clean capability — kept role-based.
      { label: 'Objectives & standards', path: '/setup/control-sets', cap: 'controls.import' },
    ],
  },

  {
    label: 'Admin', dropdown: true,
    items: [
      { label: 'Account Management', path: '/admin/users',  cap: 'admin.manage' },
      { label: 'Access Control',     path: '/admin/rbac',   cap: 'admin.manage' },
      { label: 'Data Export',        path: '/admin/export', cap: 'admin.manage' },
      { label: 'Audit Log',          path: '/admin/audit',  cap: 'admin.manage' },
      { label: 'API Keys',           path: '/admin/api-keys', cap: 'admin.manage' },
      { label: 'Help Content',       path: '/admin/help',   cap: 'admin.manage' },
      { label: 'Colours & Fonts',    path: '/admin/colours', cap: 'admin.manage' },
    ],
  },

  {
    label: 'SIRO', dropdown: true,
    items: [
      { label: 'Review Cycles', path: '/siro/cycles', cap: 'siro.review' },
    ],
  },

  {
    label: 'Metrics & Reporting', dropdown: true,
    items: [
      { label: 'Metrics & Reporting', path: '/reporting', roles: null },
    ],
  },

];

function DropdownNavItem({ label, items, location, navigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = items.some(i => i.path && location.pathname.startsWith(i.path));

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={styles.dropdownWrap} ref={ref}>
      <button
        className={isActive ? styles.navLinkActive : styles.navLink}
        onClick={() => setOpen(o => !o)}
      >
        {label} <span className={styles.dropCaret}>▾</span>
      </button>
      {open && (
        <div className={styles.dropdownMenu}>
          {items.map((i, idx) => {
            if (i.type === 'divider') return <hr key={idx} className={styles.dropDivider} />;
            if (i.type === 'header')  return <div key={idx} className={styles.dropHeader}>{i.label}</div>;
            return (
              <button
                key={i.path}
                className={location.pathname.startsWith(i.path) ? styles.dropItemActive : styles.dropItem}
                onClick={() => { navigate(i.path, { state: { fromMenu: true } }); setOpen(false); }}
              >
                {i.pattern && <><PatternChip kind={i.pattern} iconOnly />{' '}</>}{i.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }) {
  const { user, logout, hasCapability } = useAuth();
  const { canEditHelp, editMode, setEditMode } = useHelp();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role;

  // An item is visible if its capability is held, or (legacy) its role matches.
  // Header/divider items are structural — always passed through.
  const itemVisible = (i) => i.type ? true : (i.cap ? hasCapability(i.cap) : (!i.roles || i.roles.includes(role)));

  function renderNavGroup(group) {
    if (!group.dropdown) {
      if (group.cap && !hasCapability(group.cap)) return null;
      if (group.roles && !group.roles.includes(role)) return null;
      const active = location.pathname.startsWith(group.path);
      return (
        <button
          key={group.path}
          className={active ? styles.navLinkActive : styles.navLink}
          onClick={() => navigate(group.path, { state: { fromMenu: true } })}
        >
          {group.label}
        </button>
      );
    }

    const visible = group.items.filter(itemVisible);
    if (visible.length === 0) return null;

    if (visible.length === 1) {
      const item = visible[0];
      const active = location.pathname.startsWith(item.path);
      return (
        <button
          key={group.label}
          className={active ? styles.navLinkActive : styles.navLink}
          onClick={() => navigate(item.path, { state: { fromMenu: true } })}
        >
          {item.label}
        </button>
      );
    }

    return (
      <DropdownNavItem
        key={group.label}
        label={group.label}
        items={visible}
        location={location}
        navigate={navigate}
      />
    );
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div
          className={styles.brand}
          onClick={() => navigate(getRoleHome(role))}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(getRoleHome(role))}
          style={{ cursor: 'pointer' }}
        >
          <span className={styles.brandMark}>▲</span>
          <span className={styles.brandName}>CIRKS</span>
          <span className={styles.brandSub}>Governance Console</span>
        </div>

        <nav className={styles.navLinks}>
          {NAV_GROUPS.map(group => renderNavGroup(group))}
        </nav>

        <nav className={styles.nav}>
          {canEditHelp && (
            <button
              className={styles.changeRoleBtn}
              onClick={() => setEditMode(e => !e)}
              title="Toggle in-app help editing — click any ⓘ to write its description"
              style={editMode ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : undefined}
            >
              {editMode ? '✓ Editing help' : '✎ Edit help'}
            </button>
          )}
          <span className={styles.badge}>
            {role?.replace(/_/g, ' ').toUpperCase()}
          </span>
          {user?.roles?.length > 1 && (
            <button
              className={styles.changeRoleBtn}
              onClick={() => navigate('/select-role')}
            >
              Change Role
            </button>
          )}
          <span className={styles.userEmail}>{user?.email}</span>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Sign out
          </button>
        </nav>
      </header>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
