// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
/**
 * pages/DashboardPage.jsx
 *
 * Personal dashboard — landing page for all authenticated roles.
 * Renders a widget grid scoped to the user's active role.
 * Widget content is stubbed for non-CISO roles — filled out as slices are built.
 * Role switcher lives in Shell — not rendered here.
 */
import { useAuth }              from '../context/AuthContext';
import { Shell }                from '../components/Shell';
import { RiskHeatmapWidget }    from '../components/RiskHeatmapWidget';
import { AnalystSignalsWidget } from '../components/AnalystSignalsWidget';
import { SiroCycleWidget }              from '../components/SiroCycleWidget';
import { SiroActionsWidget }            from '../components/SiroActionsWidget';
import { SiroImpactTablesWidget }       from '../components/SiroImpactTablesWidget';
import { ControlEffectivenessWidget }   from '../components/ControlEffectivenessWidget';
import { CisoCiaWidget }               from '../components/CisoCiaWidget';
import { AssetsWidget }                from '../components/AssetsWidget';
import { ServicesWidget }              from '../components/ServicesWidget';
import { SystemsWidget }               from '../components/SystemsWidget';
import { MyRisksWidget }               from '../components/MyRisksWidget';
import { AdminSetupWidget }            from '../components/AdminSetupWidget';
import { UserManagementWidget }        from '../components/UserManagementWidget';
import { ExceptionsWidget }            from '../components/ExceptionsWidget';
import { ExceptionBreachWidget }       from '../components/ExceptionBreachWidget';
import { VerificationStatsWidget }    from '../components/VerificationStatsWidget';
import { MyActionsWidget }            from '../components/MyActionsWidget';
import { SecretaryMeetingsWidget }       from '../components/SecretaryMeetingsWidget';
import { SecretaryAgendaPrepWidget }     from '../components/SecretaryAgendaPrepWidget';
import { SecretaryActionProgressWidget } from '../components/SecretaryActionProgressWidget';
import { SwgSummaryWidget }              from '../components/SwgSummaryWidget';
import { GoOperationalWidget }           from '../components/GoOperationalWidget';
import { DashboardGrid }                 from '../components/DashboardGrid';
import styles from './DashboardPage.module.css';
import { HelpDot } from '../components/HelpDot';

// ── Stub widget ───────────────────────────────────────────────────────────────

function StubWidget({ title, description, helpKey, helpPlacement = 'bottom' }) {
  return (
    <div className={styles.widget}>
      <div className={styles.widgetHeader}>
        <span className={styles.widgetTitle}>{title}{helpKey && <HelpDot k={helpKey} placement={helpPlacement} />}</span>
        <span className={styles.widgetBadge}>COMING SOON</span>
      </div>
      <p className={styles.widgetBody}>{description}</p>
    </div>
  );
}

// ── Widget registry ───────────────────────────────────────────────────────────
// Replace StubWidget entries with real components as slices are built.

const ROLE_WIDGETS = {
  ciso: [
    <MyActionsWidget            key="my-actions" />,
    <CisoCiaWidget              key="cia" />,
    <VerificationStatsWidget    key="sap" />,
    <ExceptionBreachWidget      key="exception-breach" role="ciso" />,
    <ExceptionsWidget           key="exceptions" role="ciso" />,
    <SwgSummaryWidget           key="swg" />,
    <RiskHeatmapWidget          key="heatmap" />,
  ],
  risk_analyst: [
    <MyActionsWidget              key="my-actions" />,
    <AnalystSignalsWidget         key="signals" />,
    <VerificationStatsWidget      key="verification" />,
    <ExceptionsWidget             key="exceptions" role="risk_analyst" />,
    <SwgSummaryWidget             key="swg" />,
    <RiskHeatmapWidget            key="heatmap" />,
    <ControlEffectivenessWidget   key="controls" />,
  ],
  siro: [
    <MyActionsWidget          key="my-actions" />,
    <SiroCycleWidget          key="cycle"  />,
    <SiroActionsWidget        key="sap"    />,
    <SiroImpactTablesWidget   key="tables" />,
    <ExceptionBreachWidget    key="exception-breach" role="siro" />,
    <ExceptionsWidget         key="exceptions" role="siro" />,
    <SwgSummaryWidget         key="swg" />,
  ],
  information_asset_manager: [
    <MyActionsWidget   key="my-actions" />,
    <MyRisksWidget     key="my-risks" />,
    <AssetsWidget      key="assets" />,
    <ServicesWidget    key="services" />,
    <SystemsWidget     key="systems" />,
    <ExceptionsWidget  key="exceptions" role="information_asset_manager" />,
    <SwgSummaryWidget  key="swg" />,
  ],
  information_asset_owner: [
    <MyActionsWidget   key="my-actions" />,
    <MyRisksWidget     key="my-risks" />,
    <AssetsWidget      key="assets" />,
    <ServicesWidget    key="services" />,
    <SystemsWidget     key="systems" />,
    <ExceptionsWidget  key="exceptions" role="information_asset_owner" />,
    <SwgSummaryWidget  key="swg" />,
  ],
  meeting_secretary: [
    <MyActionsWidget                key="my-actions" />,
    <SecretaryMeetingsWidget        key="meetings"  />,
    <SecretaryAgendaPrepWidget      key="prep"      />,
    <SecretaryActionProgressWidget  key="progress"  />,
  ],
  security_consultant: [
    <MyActionsWidget key="my-actions" />,
    <GoOperationalWidget key="handover" />,
    <StubWidget key="controls" title="Control Set" helpKey="widget.control_set_stub"           description="Seed and manage the control library." />,
    <SwgSummaryWidget key="swg" />,
  ],
  security_architect: [
    <MyActionsWidget   key="my-actions" />,
    <SystemsWidget     key="systems" />,
    <SwgSummaryWidget  key="swg" />,
  ],
  admin: [
    <MyActionsWidget       key="my-actions" />,
    <AdminSetupWidget      key="setup" />,
    <UserManagementWidget  key="users" />,
    <SwgSummaryWidget      key="swg" />,
  ],
};

function getWidgets(role) {
  return ROLE_WIDGETS[role] ?? [
    <StubWidget key="default" title="Dashboard" helpKey="widget.dashboard_stub" description="Your widgets will appear here." />,
  ];
}

// ── Role display label ────────────────────────────────────────────────────────

function roleLabel(role, user) {
  const labels = {
    ciso:                      'CISO',
    risk_analyst:              'Risk Analyst',
    siro:                      'SIRO',
    information_asset_manager: 'Information Asset Manager',
    information_asset_owner:   'Information Asset Owner',
    meeting_secretary:         'Meeting Secretary',
    security_consultant:       'Security Consultant',
    security_architect:        'Security Architect',
    admin:                     'Administrator',
  };
  const base = labels[role] ?? role;
  // Append department for any role that has one (IAO, IAM, dept-scoped analysts, etc.)
  if (user?.department_name) {
    return `${base} — ${user.department_name}`;
  }
  return base;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div className={styles.greeting}>
            <h1 className={styles.greetingName}>
              {user?.full_name ?? user?.email} <HelpDot k="dashboard.title" placement="bottom" />
            </h1>
            <span className={styles.greetingRole}>
              {roleLabel(user?.role, user)}
            </span>
          </div>
        </div>

        <DashboardGrid widgets={getWidgets(user?.role)} />
      </div>
    </Shell>
  );
}