'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Compliance as a by-product — the CISO's C7 (docs/reporting-ciso.md). Is the
// evidence an auditor will ask for already there, because the work produced
// it? One line per piece of evidence, each naming the ISO/IEC 27001:2022
// clause it supports, each DERIVED from the record and never ticked by hand.
// What is complete is evidence normal work produced; what is not is the work
// still to do before the audit. The frozen face of this is the ISO audit pack
// (docs/iso-27001-audit-pack.md, designed).

const { query } = require('../db/pool');
const { RISKS_SQL } = require('./riskRows');
const { FINDINGS, OPEN_ACTION } = require('./owners');
const { fetchSoaRows, resolveView } = require('../routes/soa');

const MONTHS = 12;

// complete / part / none, or n/a when there is nothing to measure.
const stateOf = (met, of) => (of === 0 ? 'na' : met >= of ? 'complete' : met === 0 ? 'none' : 'part');

const line = (key, clause, title, met, of, detail, link, extra = {}) =>
  ({ key, clause, title, met, of, state: stateOf(met, of), detail, link, ...extra });

const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function computeAudit() {
  const answered = (k) => `(EXISTS (SELECT 1 FROM security_actions a WHERE a.origin = '${k.origin}' AND a.subject_type = '${k.subject}'
                                       AND a.subject_id = f.${k.key} AND ${OPEN_ACTION})
                         OR EXISTS (SELECT 1 FROM exceptions x WHERE x.origin = '${k.origin}' AND x.subject_type = '${k.subject}'
                                       AND x.subject_id = f.${k.key} AND x.status = 'active'))`;
  const [{ rows: [cfg] }, { rows: [soa] }, { rows: [version] }, { rows: stds }, { rows: [risk] }, { rows: risks },
         { rows: meetings }, { rows: docs }, { rows: [suppliers] }, { rows: findings }, { rows: captures }] = await Promise.all([
    query(`SELECT mandatory_action_score, meeting_target_interval_days, meeting_max_interval_days FROM org_config LIMIT 1`),
    query(`SELECT COUNT(*)::int AS objectives,
                  COUNT(se.control_id) FILTER (WHERE se.applicable IS NOT NULL)::int AS decided,
                  COUNT(*) FILTER (WHERE se.applicable IS NOT NULL AND COALESCE(btrim(se.justification), '') <> '')::int AS reasoned,
                  COUNT(*) FILTER (WHERE se.applicable IS FALSE AND COALESCE(btrim(se.justification), '') = '')::int AS excluded_no_reason
             FROM controls c LEFT JOIN soa_entries se ON se.control_id = c.id`),
    query(`SELECT v.version_no, v.approved_at, u.full_name AS approved_by_name,
                  (SELECT COUNT(*) FROM soa_entries se WHERE se.updated_at > v.approved_at)::int AS changed_since
             FROM soa_versions v LEFT JOIN users u ON u.id = v.approved_by
            ORDER BY v.version_no DESC LIMIT 1`),
    query(`SELECT s.code, s.name, COUNT(sc.id)::int AS n
             FROM standards s LEFT JOIN standard_controls sc ON sc.standard_id = s.id
            WHERE s.is_enabled GROUP BY s.code, s.name, s.sort_index ORDER BY s.sort_index, s.name`),
    query(`SELECT COUNT(*)::int AS active,
                  COUNT(*) FILTER (WHERE validation_status::text = 'validated')::int AS validated,
                  COUNT(*) FILTER (WHERE review_date >= CURRENT_DATE)::int AS in_review_date
             FROM risks WHERE is_active`),
    query(RISKS_SQL),
    query(`SELECT meeting_date, closed_at, minutes_issued_at FROM working_group_meetings
            WHERE closed_at IS NOT NULL ORDER BY meeting_date DESC`),
    query(`SELECT c.id, c.name, c.document_kind, c.document_owner_id, c.document_approved_on, c.document_next_review,
                  v.stated_status::text AS stated_status, v.review_overdue
             FROM control_components c LEFT JOIN v_component_state v ON v.component_id = c.id
            WHERE c.component_type = 'information' AND c.document_kind IS NOT NULL ORDER BY c.name`),
    query(`SELECT (SELECT COUNT(*) FROM supplier_relationships WHERE status IN ('active', 'exiting'))::int AS live,
                  (SELECT COUNT(*) FROM v_supplier_assurance_findings)::int AS unevidenced`),
    query(FINDINGS.map((k) => `SELECT '${k.kind}' AS kind, COUNT(*)::int AS holding,
                                      COUNT(*) FILTER (WHERE ${answered(k)})::int AS answered
                                 FROM ${k.view} f`).join(' UNION ALL ')),
    query(`SELECT period FROM metric_snapshots WHERE metric_key = 'board.headline'
            AND captured_at >= now() - interval '${MONTHS} months' ORDER BY period`),
  ]);

  const action = cfg.mandatory_action_score;
  const lines = [];

  // ── 6.1.2 / 8.2 Risk assessment ────────────────────────────────────────────
  lines.push(line('risks_validated', '6.1.2, 8.2', 'Risks assessed and validated',
    risk.validated, risk.active,
    `${risk.validated} of ${plural(risk.active, 'active risk')} validated by the CISO; ${risk.active - risk.validated} waiting or returned.`,
    '/risks/current'));
  lines.push(line('risks_reviewed', '6.1.2, 8.2', 'Risks reviewed by their review date',
    risk.in_review_date, risk.active,
    `${risk.active - risk.in_review_date} past their review date.`, '/reporting/unknown'));

  // ── 6.1.3 / 8.3 Risk treatment ─────────────────────────────────────────────
  const high = risks.filter((r) => r.score != null && r.score >= action);
  const treated = high.filter((r) => r.has_open_action || r.has_active_exception);
  lines.push(line('risks_treated', '6.1.3, 8.3', `Risks scoring ${action} or higher have a treatment in hand`,
    treated.length, high.length,
    `${treated.length} of ${high.length} have an open security action or a current exception; ${high.length - treated.length} have neither.`,
    '/reporting/ciso'));

  // ── 6.1.3 d) Statement of Applicability ────────────────────────────────────
  lines.push(line('soa_decided', '6.1.3 d)', 'Every control objective has an applicability decision',
    soa.decided, soa.objectives,
    `${soa.decided} of ${plural(soa.objectives, 'objective')} decided applicable or not.`, '/soa'));
  lines.push(line('soa_reasons', '6.1.3 d)', 'Every applicability decision gives its reason',
    soa.reasoned, soa.decided,
    `${soa.decided - soa.reasoned} decisions have no reason recorded${soa.excluded_no_reason ? `, ${soa.excluded_no_reason} of them exclusions` : ''}. The standard asks for the reason for including each control as well as for excluding it.`,
    '/soa'));
  lines.push(line('soa_approved', '6.1.3 d), 7.5.3', 'The Statement of Applicability is approved, and current',
    version && version.changed_since === 0 ? 1 : 0, 1,
    version
      ? `Version ${version.version_no} approved ${day(version.approved_at)}${version.approved_by_name ? ` by ${version.approved_by_name}` : ''}; ${version.changed_since ? `${plural(version.changed_since, 'entry', 'entries')} changed since, so it needs approving again` : 'nothing has changed since'}.`
      : 'No version has ever been approved: the auditor’s artefact does not exist yet. Approve one on the Statement of Applicability page.',
    '/soa', { approved: version ? { version_no: version.version_no, approved_at: version.approved_at, changed_since: version.changed_since } : null }));

  // ── Each standard switched on: its requirements, by the SoA's own rule ─────
  for (const s of stds) {
    if (s.n === 0) {
      lines.push(line(`standard:${s.code}`, 'Standard', `${s.name}: requirements met`, 0, 0,
        'Its requirements are not loaded, so nothing can be measured against it yet.', '/setup/control-sets', { standard: s.code }));
      continue;
    }
    const rows = await fetchSoaRows(await resolveView(s.code));
    const t = { covered: 0, partial: 0, gap: 0, excluded: 0 };
    for (const r of rows) t[r.requirement_state] = (t[r.requirement_state] || 0) + 1;
    const of = rows.length - t.excluded;
    lines.push(line(`standard:${s.code}`, 'Standard', `${s.name}: requirements met`, t.covered, of,
      `${t.covered} met, ${t.partial} partly, ${t.gap} not met${t.excluded ? `; ${t.excluded} excluded` : ''}. A requirement is met only when every objective mapped to it is in place.`,
      `/soa/${encodeURIComponent(s.code)}`, { standard: s.code, tally: t }));
  }

  // ── 9.1 Monitoring and measurement ─────────────────────────────────────────
  const firstCapture = captures[0]?.period;
  const monthsSince = (() => {
    if (!firstCapture) return 0;
    const [y, m] = firstCapture.split('-').map(Number);
    const now = new Date();
    return Math.min(MONTHS, (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m) + 1);
  })();
  lines.push(line('measurement', '9.1', 'The headline measures are captured every month',
    captures.length, monthsSince,
    firstCapture ? `Captured in ${plural(captures.length, 'month')} of the ${monthsSince} since ${firstCapture}, by CIRKS itself.` : 'Nothing captured yet: CIRKS captures the headline measures once a month after it starts.',
    '/reporting/board'));

  // ── 9.3 Management review ──────────────────────────────────────────────────
  const year = meetings.filter((m) => new Date(m.meeting_date) >= new Date(Date.now() - 365 * 864e5));
  const expected = Math.max(1, Math.round(365 / cfg.meeting_target_interval_days));
  const last = meetings[0];
  const sinceLast = last ? Math.floor((Date.now() - new Date(last.meeting_date).getTime()) / 864e5) : null;
  const overdue = sinceLast == null || sinceLast > cfg.meeting_max_interval_days;
  lines.push(line('review_held', '9.3', 'The Security Working Group meets on cadence',
    overdue ? Math.min(year.length, expected - 1) : Math.min(year.length, expected), expected,
    `${plural(year.length, 'meeting')} held in the last 12 months, against one every ${cfg.meeting_target_interval_days} days. ${last ? `The last was ${plural(sinceLast, 'day')} ago${overdue ? `, more than the ${cfg.meeting_max_interval_days}-day limit` : ''}.` : 'None has been held.'}`,
    '/meetings'));
  const issued = meetings.filter((m) => m.minutes_issued_at).length;
  lines.push(line('review_minutes', '9.3.3', 'Minutes issued for every meeting held',
    issued, meetings.length,
    meetings.length ? `${issued} of ${plural(meetings.length, 'meeting')} held have their minutes issued.` : 'No meeting has been held.',
    '/meetings'));

  // ── 5.2, 7.5 Policies and documented information ───────────────────────────
  const good = (d) => d.stated_status === 'operational' && d.document_owner_id && d.document_approved_on && !d.review_overdue;
  const why = (d) => [d.stated_status !== 'operational' && 'not published', !d.document_owner_id && 'no owner',
    !d.document_approved_on && 'no approval recorded', d.review_overdue && 'past its review date'].filter(Boolean);
  const notYet = docs.filter((d) => !good(d)).map((d) => ({ id: d.id, name: d.name, document_kind: d.document_kind, why: why(d) }));
  lines.push(line('documents', '5.2, 7.5', 'Policies, standards and procedures published, owned, approved and in date',
    docs.length - notYet.length, docs.length,
    docs.length ? `${docs.length - notYet.length} of ${plural(docs.length, 'document')} are; ${notYet.length} ${notYet.length === 1 ? 'is' : 'are'} not.` : 'No policy, standard or procedure is recorded.',
    '/policies-documents', { rows: notYet }));

  // ── Annex A 5.19–5.22 Suppliers ────────────────────────────────────────────
  lines.push(line('suppliers', 'Annex A 5.19–5.22', 'Live supplier relationships evidenced',
    suppliers.live - suppliers.unevidenced, suppliers.live,
    `${suppliers.live - suppliers.unevidenced} of ${plural(suppliers.live, 'live relationship')} have current evidence for every objective expected of them.`,
    '/findings'));

  // ── 10.2 Nonconformity and corrective action ───────────────────────────────
  const holding = findings.reduce((a, f) => a + f.holding, 0);
  const done = findings.reduce((a, f) => a + f.answered, 0);
  lines.push(line('findings', '10.2', 'Findings answered by an action or an exception',
    done, holding,
    holding ? `${done} of ${plural(holding, 'finding')} answered; ${holding - done} waiting.` : 'No finding holds.',
    '/findings', { by_kind: findings }));

  const counted = lines.filter((l) => l.state !== 'na');
  return {
    generated_at: new Date().toISOString(),
    thresholds: { action },
    headline: {
      lines: counted.length,
      complete: counted.filter((l) => l.state === 'complete').length,
      soa_approved: !!version,
    },
    lines,
  };
}

module.exports = { computeAudit, stateOf };
