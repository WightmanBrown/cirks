'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState } from 'react';
import { downloadAdminExport } from '../api';
import { Shell }      from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import styles from './DataExportPage.module.css';

// Datasets grouped as they appear on the page. `key` is the export endpoint slug.
export const GROUPS = [
  {
    title: 'Account management',
    helpKey: 'data_export.group.accounts',
    datasets: [
      { key: 'users',        label: 'Users',        desc: 'Accounts with primary role, department, active flag and 2FA status.' },
      { key: 'user-roles',   label: 'User roles',   desc: 'Additional (secondary) role grants, by user email.' },
      { key: 'departments',  label: 'Departments',  desc: 'Department names, descriptions and owner email.' },
    ],
  },
  {
    title: 'Threats & controls',
    helpKey: 'data_export.group.threats_controls',
    datasets: [
      { key: 'threats',               label: 'Threats',                    desc: 'Threat catalogue with category, source, per-dimension probability and baseline.' },
      { key: 'controls',              label: 'Controls',                   desc: 'Control objectives: type, reference, how each is delivered (organisation, group or per system), baseline flag, maturity rating and owner. Status is derived, so not exported.' },
      { key: 'control-threats',       label: 'Control — threat links',     desc: 'Which threats each control addresses.' },
      { key: 'control-component-links', label: 'Control — component links', desc: 'PPITF components attached to each control.' },
      { key: 'delivery-patterns',       label: 'Security solutions',       desc: 'The valid ways of delivering control objectives — a set of parts, or provided by the supplier.' },
      { key: 'delivery-pattern-objectives', label: 'Security solution objectives', desc: 'Which control objectives each security solution delivers. One solution can deliver several.' },
      { key: 'delivery-pattern-parts',  label: 'Security solution parts',  desc: 'Each solution\u2019s parts and where each must be: on the system, on a named security service, or once for the organisation.' },
      { key: 'architecture-rules', label: 'Architecture rules', desc: 'Security solutions the security architecture requires, the document each comes from, and the components that trigger it — one row per trigger.' },
      { key: 'membership-groups', label: 'Membership groups', desc: 'What every system must record about itself (network zone, hosting, operating system…): each group\u2019s members and any triggers, one row each.' },
      { key: 'system-builds', label: 'System builds', desc: 'Sets of components applied to a system as a copy — one row per component.' },
      { key: 'solution-choices', label: 'Security solution choices', desc: 'The security solution chosen for a control objective on each system, and who chose it.' },
    ],
  },
  {
    title: 'PPITF components',
    helpKey: 'data_export.group.components',
    datasets: [
      { key: 'components',              label: 'Component library',          desc: 'All PPITF components: name, type, status, scope (once for the organisation or per system), host name, and a policy or document\u2019s kind, version, owner, approval and review dates.' },
      { key: 'component-ip-addresses',  label: 'Component IP addresses',     desc: 'IP addresses recorded against host components, used by SOC enrichment.' },
    ],
  },
  {
    title: 'Information assets',
    helpKey: 'data_export.group.assets',
    datasets: [
      { key: 'information-assets',   label: 'Information assets',  desc: 'Asset metadata: name, department, owner, manager (IAM), shared and active flags.' },
      { key: 'asset-impact-ratings', label: 'Asset impact ratings', desc: 'Per-table CIA ratings (1dBIL level + per-dimension overrides). This is the primary CIA source data.' },
    ],
  },
  {
    title: 'Systems',
    helpKey: 'data_export.group.systems',
    datasets: [
      { key: 'systems',           label: 'Systems',                  desc: 'System metadata: name, department, owner and active status.' },
      { key: 'system-assets',     label: 'System — asset links',     desc: 'Which information assets are linked to each system.' },
      { key: 'system-components', label: 'System — component links', desc: 'PPITF components linked to each system, with optional role and per-system status.' },
      { key: 'system-threats',    label: 'System — threat exposure',  desc: 'Which threats each system is exposed to. Half of the risk surface (a risk is system × threat).' },
      { key: 'system-controls',   label: 'System — control links',    desc: 'Controls deployed on each system with their per-system status — the gap signal behind security actions — and the reason for any exclusion.' },
    ],
  },
  {
    title: 'Business services',
    helpKey: 'data_export.group.services',
    datasets: [
      { key: 'business-services',       label: 'Business services',       desc: 'Service metadata: name, department, owner department, shared flag and active status.' },
      { key: 'business-service-systems', label: 'Service — system links',  desc: 'Which systems compose each service. A service\u2019s information assets are derived from these (v104), not linked directly.' },
    ],
  },
  {
    title: 'Impact tables',
    helpKey: 'data_export.group.impact_tables',
    datasets: [
      { key: 'impact-tables',          label: 'Impact tables',          desc: 'Table metadata: name, scope, department, mandatory and published flags.' },
      { key: 'impact-table-bil-levels', label: '1dBIL level statements', desc: 'Business impact level descriptions (BIL 1–5) for each table. All rows exported, including blanks.' },
      { key: 'impact-table-cia-levels', label: '3dBIL CIA statements',   desc: 'CIA dimension statements per level for each table. All 15 rows per table exported, including blanks.' },
    ],
  },
  {
    title: 'Statement of Applicability',
    helpKey: 'data_export.group.soa',
    datasets: [
      { key: 'soa-entries',      label: 'SoA decisions',        desc: 'For each control objective: applicable or not, why (drivers and justification), how it is implemented, and its owner.' },
      { key: 'scopes',           label: 'Scopes',               desc: 'Named sets of systems an objective can be narrowed to (e.g. the cardholder data environment).' },
      { key: 'scope-systems',    label: 'Scope — system links', desc: 'Which systems are in each scope.' },
      { key: 'soa-entry-scopes', label: 'Objective — scope links', desc: 'Objectives narrowed to a scope; an objective with none applies organisation-wide.' },
    ],
  },
  {
    title: 'Suppliers',
    helpKey: 'data_export.group.suppliers',
    datasets: [
      { key: 'suppliers',                label: 'Suppliers',               desc: 'Supplier names and notes.' },
      { key: 'supplier-relationships',   label: 'Supplier relationships',  desc: 'Each relationship: supplier type, contracting department, what it touches, contract and status.' },
      { key: 'supplier-type-objectives', label: 'Supplier control sets',   desc: 'Which control objectives each supplier type is expected to meet.' },
      { key: 'supplier-evidence',        label: 'Supplier evidence',       desc: 'Assurance reports and contract terms, with their dates and the objectives each covers.' },
    ],
  },
  {
    title: 'Access control',
    helpKey: 'data_export.group.access_control',
    datasets: [
      { key: 'role-permissions', label: 'Role permissions', desc: 'The capability matrix: role → capability → scope.' },
      { key: 'sod-rules',        label: 'Separation-of-duties rules', desc: 'Each SoD rule and whether it is enabled.' },
      { key: 'access-settings',  label: 'Access settings',  desc: 'Org-wide access flags (e.g. department isolation).' },
      { key: 'capabilities',     label: 'Capabilities (reference)', desc: 'The capability catalogue — reference for validating an import.' },
    ],
  },
];

export function DataExportPage() {
  const [format, setFormat]   = useState('csv');
  const [busy, setBusy]       = useState(null);   // dataset key currently downloading
  const [error, setError]     = useState(null);

  async function handleDownload(dataset) {
    setBusy(dataset); setError(null);
    try {
      const { blob, filename } = await downloadAdminExport(dataset, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Could not export ${dataset}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <BackButton />
          <h1 className={styles.heading}>Data Export <HelpDot k="data_export.title" placement="bottom" /></h1>
        </div>
        <p className={styles.intro}>
          Export access-control and account-management data as spreadsheets. Files use
          human-readable keys (email, department name, role) rather than internal IDs, so
          they can seed a freshly-initialised instance.
        </p>

        <div className={styles.formatRow}>
          <span className={styles.formatLabel}>Format</span>
          <div className={styles.toggle}>
            {['csv', 'tsv'].map((f) => (
              <button
                key={f}
                type="button"
                className={format === f ? `${styles.toggleBtn} ${styles.toggleBtnActive}` : styles.toggleBtn}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.downloadAllRow}>
          <button
            className={styles.downloadAllBtn}
            disabled={busy === 'all'}
            onClick={() => handleDownload('all')}
          >
            {busy === 'all' ? 'Exporting…' : `Download all (${format.toUpperCase()} archive)`}
          </button>
          <span className={styles.downloadAllHint}>
            All {GROUPS.reduce((n, g) => n + g.datasets.length, 0)} datasets in a single .zip
          </span>
        </div>

        {GROUPS.map((group) => (
          <section key={group.title} className={styles.card}>
            <h2 className={styles.cardTitle}>{group.title} <HelpDot k={group.helpKey} placement="bottom" /></h2>
            <table className={styles.table}>
              <tbody>
                {group.datasets.map((d) => (
                  <tr key={d.key}>
                    <td className={styles.dsName}>{d.label}</td>
                    <td className={styles.dsDesc}>{d.desc}</td>
                    <td className={styles.dsAction}>
                      <button
                        className={styles.downloadBtn}
                        disabled={busy === d.key}
                        onClick={() => handleDownload(d.key)}
                      >
                        {busy === d.key ? 'Exporting…' : `Download .${format}`}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Shell>
  );
}
