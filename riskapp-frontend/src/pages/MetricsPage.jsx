// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { HelpDot } from '../components/HelpDot';
import styles from './SiroReportPage.module.css';

// Metrics & Reporting: the reports a person may read. Reports are added role by
// role (docs/reporting-siro.md is the first); each is listed here behind the
// capability that guards it.
const REPORTS = [
  {
    path: '/reporting/department', cap: 'reports.department', title: 'My department',
    body: 'For the Information Asset Owner: whether your department\u2019s information risk is being managed, your security obligations and actions, the risks on shared systems other departments own, your reputational risks, and the improvements made, with evidence. Admin, CISO and SIRO can read any department\u2019s.',
  },
  {
    path: '/reporting/systems', cap: 'reports.department', title: 'My systems',
    body: 'For the Information Asset Manager: the state of each of your department\u2019s systems, and a report for each one \u2014 its risks and who they affect, the actions helping it, its compliance with each standard, the value of what was spent and what to fund next, risk reduction over time, and every decision made on it. With your own record.',
  },
  {
    path: '/reporting/analyst', cap: 'risks.write', title: 'My work',
    body: 'For the risk analyst: what to work on next, the security actions built, the quality of the risks and judgements recorded, the difference made, where control changes bring the greatest benefit, and the departments to work with. The CISO sees the team or one analyst.',
  },
  {
    path: '/reporting/unknown', cap: 'reports.read', title: 'Where unknown risk is hiding',
    body: 'Everything CIRKS cannot yet measure, organisation-wide: objectives whose effect nobody has judged, threats not assessed, systems with no threat or no information, unrated assets and controls, risks past review. Each with who can put it right.',
  },
  {
    path: '/reporting/board', cap: 'reports.read', title: 'Board summary',
    body: 'Information risk on one page, in pictures: risks against the thresholds, a heat map now and after committed work, compliance with each standard, control coverage and quality, remediation, and each department in a line. Printable for the board.',
  },
  {
    path: '/reporting/siro', cap: 'reports.read', title: 'SIRO report',
    body: 'For the Senior Information Risk Owner: the decisions waiting for them, the risks accepted on the organisation’s behalf, and how risks stand against the thresholds, by department. Printable for the board.',
  },
  {
    path: '/reporting/ciso', cap: 'reports.read', title: 'CISO report',
    body: 'For the Chief Information Security Officer: which risks the business has agreed, where investment removes the most risk (with costs where they are estimated), and which departments share risk, for joint cases.',
  },
];

export function MetricsPage() {
  const { hasCapability } = useAuth();
  const mine = REPORTS.filter((r) => hasCapability(r.cap));
  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div>
          <h1 className={styles.title}>Insights <HelpDot k="metrics.title" placement="bottom" /></h1>
          <p className={styles.desc}>Reports drawn from the live register. More are being added, role by role.</p>
        </div>
        {mine.length === 0 ? (
          <p className={styles.empty}>There are no reports for your role yet.</p>
        ) : (
          <div className={styles.cards}>
            {mine.map((r) => (
              <Link key={r.path} to={r.path} className={styles.card}>
                <span className={styles.subTitle}>{r.title} →</span>
                <span className={styles.statLabel}>{r.body}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
