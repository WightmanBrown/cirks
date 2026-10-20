#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Misty Isles — the operational story, after db/isms-cycle.js.
//
//   node db/dataset/misty-isles/story-cycle.js --base http://localhost:3000/api/v1
//
// isms-cycle.js raises and judges risks generically: each control is judged from
// its status alone, and a risk takes the best judgement among its controls. On an
// estate that mostly works that produces a calm register — the story's deliberate
// problems (docs/dataset/misty-isles-architecture.md §6) do not bite. This script
// makes them bite, and gives the organisation a year of history:
//
//   1. the analyst identifies and raises the risks the problems create, and judges
//      every control on them as the story says (e.g. patching cannot help an
//      Exchange server that no longer receives patches), with the reason written
//      into the risk's rationale; the CISO validates them;
//   2. a backlog of freshly raised risks, left awaiting validation;
//   3. gap-driven actions on the worst risks, most accepted, some items done;
//   4. exceptions: the Prison system's Windows 7 (accepted until replacement) and
//      one that has lapsed and sits in the breach queue;
//   5. a year of review cycles and SWG meetings, each planned, run, closed and
//      minuted through the API.
//
// Everything a user can do is done through the REAL API as the persona who would
// do it. Two things have no API and are written directly, each marked SQL: review
// cycles (nothing creates them yet — the ISO audit-pack work on the roadmap), and
// moving the history back to the dates it happened (the API stamps "now").
//
// Idempotent: every phase checks for what it already made.

require('dotenv').config();
const jwt = require('jsonwebtoken');
const { pool, query } = require('../../../src/db/pool');

let BASE = 'http://localhost:3000/api/v1';
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--base') BASE = process.argv[++i].replace(/\/$/, '');

const log = (...a) => console.log(...a);
const phase = (t) => log(`\n── ${t} ${'─'.repeat(Math.max(4, 66 - t.length))}`);
let failed = 0;
async function api(token, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) { const e = new Error(`${method} ${path} → ${res.status} ${json.error || text.slice(0, 160)}`); e.status = res.status; throw e; }
  return json;
}
async function tolerate(fn, label) {
  try { return await fn(); } catch (err) {
    if (err.status === 409) { log(`   · ${label} — already exists`); return null; }
    failed++; log(`   ✗ ${label} — ${err.message}`); return null;
  }
}
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function personas() {
  const { rows } = await query(`SELECT DISTINCT ON (role) id, email, full_name, role FROM users WHERE is_active ORDER BY role, created_at`);
  const p = Object.fromEntries(rows.map((r) => [r.role, r]));
  const tok = (u) => jwt.sign({ sub: u.id, email: u.email, role: u.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '2h' });
  return { p, t: { analyst: tok(p.risk_analyst), ciso: tok(p.ciso), secretary: tok(p.meeting_secretary), siro: tok(p.siro) } };
}
const one = async (sql, params) => (await query(sql, params)).rows[0];

// ── 1. The risks the story's problems create ───────────────────────────────────
// [system, threat, target residual c/i/a (capped at the threat inherent), why]
const STORY_RISKS = [
  ['MIG Corporate Email', 'Phishing targeting user credentials', [5, 1, 1],
    'Mailboxes sit on an Exchange 2019 server out of support since October 2025, without modern authentication or MFA for Outlook on the web. Credential phishing is the most likely route in and nothing on the server limits it.'],
  ['MIG Corporate Email', 'Exploitation of an unpatched vulnerability', [4, 4, 4],
    'Exchange 2019 no longer receives security updates. Patching (PR.PS-02) cannot help, and the server faces the internet.'],
  ['MIG Corporate Email', 'Exploitation of a public-facing application', [4, 4, 3],
    'Outlook on the web is published directly; with the server out of support, a public exploit would not be patched.'],
  ['Water Distribution', 'Ransomware', [3, 5, 5],
    'The last quarterly restore test of the historian failed, so backups cannot be relied on to recover the control system. A ransomware event would stop water distribution until the vendor rebuilds it.'],
  ['Approach radar', 'Malware infection', [3, 4, 3],
    'The Wazuh agents on the radar hosts are two versions behind the manager and the vendor has not certified the upgrade, so detection on the radar is weaker than elsewhere.'],
  ['Pupil/student records system', 'Phishing targeting user credentials', [4, 1, 1],
    'Teaching staff log in with passwords alone and are frequent phishing targets; the records are highly sensitive.'],
  ['Medical Records System', 'Ransomware', [3, 4, 4],
    'Clinical systems cannot be taken offline for patching during the day, so windows are infrequent; backups are good, which keeps this from the top of the scale.'],
  ['Criminal Records and Firearms Licensing System', 'Unauthorised data modification', [2, 4, 2],
    'Mid-migration from OSSEC to CrowdStrike: the retiring agent is no longer tuned and the new one is not yet fully deployed, so tampering could go unnoticed.'],
  ['Prison Management System', 'Exploitation of an unpatched vulnerability', [4, 4, 4],
    'Runs on Windows 7 with a Microsoft Access database. No security updates and no endpoint protection can be installed until the 2027 replacement.'],
  ['Student Desktop', 'Malware infection', [3, 4, 3],
    'CrowdStrike is on only some of the shared lab PCs; the rest await re-imaging.'],
];

async function storyRisks({ t }) {
  phase('1. The analyst raises the risks the story\'s problems create');
  const made = [];
  for (const [sysName, threatName, target, why] of STORY_RISKS) {
    const s = await one(`SELECT id FROM systems WHERE name = $1`, [sysName]);
    const th = await one(`SELECT id, probability_c pc, probability_i pi, probability_a pa FROM threats WHERE name = $1`, [threatName]);
    if (!s || !th) { failed++; log(`   ✗ ${sysName} / ${threatName} — not found`); continue; }
    await tolerate(() => api(t.analyst, 'POST', `/threats/${th.id}/systems`, { system_id: s.id }), `identify ${threatName} on ${sysName}`);
    let risk = await one(`SELECT id FROM risks WHERE system_id = $1 AND threat_id = $2 AND is_active`, [s.id, th.id]);
    if (!risk) {
      risk = await tolerate(() => api(t.analyst, 'POST', '/risks', {
        system_id: s.id, threat_id: th.id, probability_c: th.pc, probability_i: th.pi, probability_a: th.pa,
        rationale: why, review_date: day(90), treatment_decision: 'mitigate' }), `raise ${threatName} on ${sysName}`);
    }
    if (!risk?.id) continue;
    // Judge every control that counters the threat here to what the story says it
    // achieves: a risk takes the best of its controls, so all must be judged.
    const cap = [th.pc, th.pi, th.pa];
    const [c, i, a] = target.map((v, k) => Math.min(v, cap[k]));
    const { rows: controls } = await query(`
      SELECT c.id FROM control_threats ct JOIN controls c ON c.id = ct.control_id
        JOIN system_controls sc ON sc.control_id = c.id AND sc.system_id = $1 AND sc.status <> 'not_applicable'
       WHERE ct.threat_id = $2`, [s.id, th.id]);
    // A validated risk is the CISO's to re-judge; the analyst may not edit it.
    const { validation_status: vs } = await one(`SELECT validation_status FROM risks WHERE id = $1`, [risk.id]);
    const judge = vs === 'validated' ? t.ciso : t.analyst;
    for (const ctl of controls) {
      await tolerate(() => api(judge, 'PUT', `/risks/${risk.id}/controls/${ctl.id}/probability`,
        { probability_c: c, probability_i: i, probability_a: a }), `judge a control on ${threatName} / ${sysName}`);
    }
    made.push({ id: risk.id, label: `${threatName} — ${sysName}` });
  }
  // The CISO validates what is waiting from this phase.
  const pending = new Set(((await api(t.ciso, 'GET', '/governance/risks/pending')).risks || []).map((r) => r.risk_id || r.id));
  let validated = 0;
  for (const r of made) {
    if (!pending.has(r.id)) continue;
    if (await tolerate(() => api(t.ciso, 'POST', `/governance/risks/${r.id}/validate`, { action: 'validate' }), `validate ${r.label}`)) validated++;
  }
  const { rows } = await query(`SELECT r.risk_score, s.name, t.name AS threat FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
    WHERE r.id = ANY($1) ORDER BY r.risk_score DESC`, [made.map((m) => m.id)]);
  for (const r of rows) log(`   ${String(r.risk_score).padStart(2)}  ${r.threat} — ${r.name}`);
  log(`   ✓ ${made.length} story risks, ${validated} validated`);
}

// ── 2. A validation backlog ──────────────────────────────────────────────────────
async function backlog({ t }) {
  phase('2. New threat intelligence: zero-day risks raised, awaiting validation');
  const th = await one(`SELECT id, probability_c pc, probability_i pi, probability_a pa FROM threats WHERE name = 'Zero-day exploitation'`);
  // Ten in all: a re-run tops up to ten, it does not raise ten more.
  const { n: have } = await one(`SELECT count(*)::int AS n FROM risks WHERE threat_id = $1 AND is_active`, [th.id]);
  const { rows: systems } = await query(`
    SELECT s.id, s.name FROM systems s WHERE s.is_active AND GREATEST(s.impact_c, s.impact_i, s.impact_a) >= 3
      AND NOT EXISTS (SELECT 1 FROM risks r WHERE r.system_id = s.id AND r.threat_id = $1 AND r.is_active)
     ORDER BY s.name LIMIT $2`, [th.id, Math.max(0, 10 - have)]);
  for (const s of systems) {
    await tolerate(() => api(t.analyst, 'POST', `/threats/${th.id}/systems`, { system_id: s.id }), `identify zero-day on ${s.name}`);
    await tolerate(() => api(t.analyst, 'POST', '/risks', {
      system_id: s.id, threat_id: th.id, probability_c: th.pc, probability_i: th.pi, probability_a: th.pa,
      rationale: 'Raised after the SOC\'s threat-intelligence feed reported active exploitation of a zero-day in a product this system depends on. Awaiting validation.',
      review_date: day(30), treatment_decision: 'mitigate' }), `raise zero-day on ${s.name}`);
  }
  // The analyst judges their coverage before submitting. Against a zero-day a
  // working control helps less than usual — patching cannot help at all — so an
  // operational control lowers the likelihood by one step, not two.
  const { rows: toJudge } = await query(`
    SELECT r.id, r.system_id FROM risks r
     WHERE r.is_active AND r.threat_id = $1 AND r.validation_status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM risk_control_probability p WHERE p.risk_id = r.id)`, [th.id]);
  let judged = 0;
  for (const r of toJudge) {
    const { rows: controls } = await query(`
      SELECT c.id, sc.status FROM control_threats ct JOIN controls c ON c.id = ct.control_id
        JOIN system_controls sc ON sc.control_id = c.id AND sc.system_id = $1 AND sc.status IN ('operational', 'degraded')
       WHERE ct.threat_id = $2`, [r.system_id, th.id]);
    for (const c of controls) {
      const v = (x) => Math.max(1, x - (c.status === 'operational' ? 1 : 0));
      if (await tolerate(() => api(t.analyst, 'PUT', `/risks/${r.id}/controls/${c.id}/probability`,
        { probability_c: v(th.pc), probability_i: v(th.pi), probability_a: v(th.pa) }), 'judge a zero-day control')) judged++;
    }
  }
  log(`   ✓ ${systems.length} raised, ${judged} control judgements, left awaiting the CISO's validation`);
}

// ── 3. Actions on the worst risks ────────────────────────────────────────────────
async function actions({ t }) {
  phase('3. Gap-driven actions on the worst risks');
  const { rows: risks } = await query(`
    SELECT r.id, r.risk_score, s.name AS system_name, t.name AS threat_name
      FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
     WHERE r.is_active AND r.validation_status = 'validated' AND r.risk_score >= 12
       AND NOT EXISTS (SELECT 1 FROM security_action_risks sar WHERE sar.risk_id = r.id)
     ORDER BY r.risk_score DESC, s.name LIMIT 30`);
  const built = [];
  for (const r of risks) {
    const cand = await tolerate(() => api(t.analyst, 'GET', `/risks/${r.id}/action-items/candidates`), `candidates for ${r.threat_name} / ${r.system_name}`);
    if (!cand) continue;
    const items = [
      ...(cand.components || []).filter((c) => !c.already_in_open_action)
        .map((c) => ({ element_type: 'component', component_id: c.component_id, comment: `Bring ${c.name} to an operational state on this system.` })),
      ...(cand.controls || []).filter((c) => !c.already_in_open_action).slice(0, 2)
        .map((c) => ({ element_type: 'control', control_id: c.control_id,
          comment: c.on_system ? `Remediate ${c.title}: currently ${c.system_status} here.` : `Deploy ${c.title} on this system.` })),
    ];
    if (!items.length) continue;
    const a = await tolerate(() => api(t.analyst, 'POST', `/risks/${r.id}/actions/from-gap`, { title: `Treat “${r.threat_name}” on ${r.system_name}`, items }),
      `action for ${r.threat_name} / ${r.system_name}`);
    if (a?.id) built.push({ risk: r, id: a.id });
  }
  // Accept all but three (the acceptance queue is never empty in a live ISMS).
  const accept = built.slice(0, Math.max(0, built.length - 3));
  for (const b of accept) await tolerate(() => api(t.ciso, 'POST', `/risks/${b.risk.id}/actions/${b.id}/accept`, {}), `accept ${b.id}`);
  // Work lands on the first third: their first item completes — but never on the
  // story's own problems, which are still open (§6 of the sheet).
  const storyIds = new Set((await query(`
    SELECT r.id FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
     WHERE (s.name, t.name) IN (${STORY_RISKS.map((_, k) => `($${2 * k + 1}, $${2 * k + 2})`).join(', ')})`,
    STORY_RISKS.flatMap(([sys, th]) => [sys, th]))).rows.map((r) => r.id));
  const workable = accept.filter((b) => !storyIds.has(b.risk.id));
  let done = 0;
  for (const b of workable.slice(0, Math.ceil(workable.length / 2))) {
    const list = await tolerate(() => api(t.ciso, 'GET', `/risks/${b.risk.id}/actions`), 'read actions');
    const item = (Array.isArray(list) ? list.find((x) => x.id === b.id) : null)?.items?.find((i) => i.status !== 'completed');
    if (!item) continue;
    const body = item.element_type === 'control' ? { probability_c: item.target_p_c ?? 2, probability_i: item.target_p_i ?? 2, probability_a: item.target_p_a ?? 2 } : {};
    if (await tolerate(() => api(t.ciso, 'POST', `/risks/${b.risk.id}/action-items/${item.id}/complete`, body), `complete ${item.id}`)) done++;
  }
  log(`   ✓ ${built.length} actions proposed, ${accept.length} accepted, ${done} items completed`);
  return accept.map((b) => b.id);
}

// ── 4. Exceptions ────────────────────────────────────────────────────────────────
async function exceptions({ t }) {
  phase('4. Exceptions: the Prison system, and one that lapsed');
  const pick = async (sys, threat) => one(`SELECT r.id FROM risks r JOIN systems s ON s.id = r.system_id JOIN threats t ON t.id = r.threat_id
    WHERE s.name = $1 AND t.name = $2 AND r.is_active`, [sys, threat]);
  const prison = await pick('Prison Management System', 'Exploitation of an unpatched vulnerability');
  if (prison) await tolerate(() => api(t.ciso, 'POST', `/risks/${prison.id}/exceptions`, {
    justification: 'Windows 7 and Microsoft Access cannot be patched or given endpoint protection. The replacement system is funded and due in 2027; until then the host is isolated on its own VLAN and reviewed quarterly.',
    expires_at: day(180), review_cadence: 'quarterly' }), 'accept the Prison system risk');
  const lapsing = await pick('Student Desktop', 'Malware infection');
  const already = lapsing && await one(`SELECT 1 FROM exceptions WHERE risk_id = $1`, [lapsing.id]);
  if (lapsing && !already) {
    const made = await tolerate(() => api(t.ciso, 'POST', `/risks/${lapsing.id}/exceptions`, {
      justification: 'Accepted while the lab PCs were re-imaged over the summer; to be revisited when term started.',
      expires_at: day(1), review_cadence: 'monthly' }), 'accept the student desktop risk (will lapse)');
    if (made) {
      // SQL: the lapse happened three weeks ago; the sweep then puts it in the breach queue.
      await query(`UPDATE exceptions SET expires_at = CURRENT_DATE - 21, accepted_at = now() - interval '120 days' WHERE risk_id = $1 AND status = 'active'`, [lapsing.id]);
      await query(`SELECT expire_overdue_exceptions()`);
    }
  }
  log('   ✓ done');
}

// ── 5. A year of review cycles and SWG meetings ──────────────────────────────────
async function history({ p, t }) {
  phase('5. A year of review cycles and SWG meetings');
  // SQL: nothing in CIRKS creates a review cycle yet (the ISO audit-pack work).
  const quarters = [[-364, -274], [-273, -183], [-182, -92], [-91, 0]];
  const cycles = [];
  for (const [k, [a, b]] of quarters.entries()) {
    const start = day(a); const end = day(b + (k === 3 ? 91 : 0));
    const name = `Review cycle ${start.slice(0, 7)} to ${end.slice(0, 7)}`;
    let c = await one(`SELECT id FROM review_cycles WHERE start_date = $1`, [start]);
    if (!c) {
      c = await one(`INSERT INTO review_cycles (name, description, status, start_date, end_date, created_by)
        VALUES ($1, 'Quarterly information risk review.', $2, $3, $4, $5) RETURNING id`,
        [name, k === 3 ? 'active' : 'draft', start, end, p.ciso.id]);
    }
    cycles.push({ id: c.id, start, end, meetingDay: k === 3 ? null : b - 10, closed: k < 3 });
  }
  // The meetings of the three closed cycles, planned, run and minuted through the API.
  for (const cy of cycles.filter((c) => c.closed)) {
    const exists = await one(`SELECT id FROM working_group_meetings WHERE linked_cycle_id = $1`, [cy.id]);
    if (exists) continue;
    const m = await tolerate(() => api(t.secretary, 'POST', '/meetings', {
      meeting_date: day(cy.meetingDay), chaired_by: p.ciso.id, linked_cycle_id: cy.id, target_duration_min: 90 }), `plan the meeting of ${cy.start}`);
    const id = m?.meeting?.id; if (!id) continue;
    await tolerate(() => api(t.secretary, 'POST', `/meetings/${id}/agenda/generate`, {}), 'agenda');
    for (const who of [p.ciso, p.risk_analyst, p.siro]) {
      await tolerate(() => api(t.secretary, 'POST', `/meetings/${id}/attendees`, { user_id: who.id, role_at_meeting: who.role === 'ciso' ? 'chair' : 'member' }), 'attendee');
    }
    const agenda = await tolerate(() => api(t.secretary, 'GET', `/meetings/${id}/agenda`), 'read agenda');
    for (const it of (agenda?.items || [])) {
      await tolerate(() => api(t.secretary, 'POST', `/meetings/${id}/agenda/items/${it.id}/decision`,
        { decision_text: 'Discussed and noted. Actions, where any, are recorded against the item.' }), 'decision');
    }
    await tolerate(() => api(t.secretary, 'POST', `/meetings/${id}/close`, { quorate: true, quorate_notes: 'Chair, SIRO and risk analyst present.' }), 'close');
    await tolerate(() => api(t.secretary, 'PATCH', `/meetings/${id}/minutes`, {
      minutes_body: 'The Security Working Group reviewed the information risk position for the quarter, the actions in progress and the exceptions in force. The minutes record each decision against its agenda item.' }), 'minutes');
    await tolerate(() => api(t.secretary, 'POST', `/meetings/${id}/issue-minutes`, {}), 'issue minutes');
    // SQL: the meeting happened on its date, not today.
    await query(`UPDATE working_group_meetings SET planned_at = meeting_date - interval '21 days', agenda_generated_at = meeting_date - interval '14 days',
                   closed_at = meeting_date + interval '11 hours', minutes_issued_at = meeting_date + interval '4 days', created_at = meeting_date - interval '21 days'
                 WHERE id = $1`, [id]);
    await query(`UPDATE meeting_agenda_items SET decision_recorded_at = (SELECT meeting_date + interval '10 hours' FROM working_group_meetings WHERE id = $1)
                 WHERE meeting_id = $1 AND decision_recorded_at IS NOT NULL`, [id]);
  }
  // SQL: a closed cycle is frozen and approved (the SIRO signs it off).
  for (const cy of cycles.filter((c) => c.closed)) {
    await query(`UPDATE review_cycles SET status = 'completed', frozen_at = end_date + interval '5 days', frozen_by = $2,
                   approved_at = end_date + interval '9 days', approved_by = $3, analyst_ready = true, analyst_ready_at = end_date, analyst_ready_by = $4
                 WHERE id = $1`, [cy.id, p.ciso.id, p.siro.id, p.risk_analyst.id]);
  }
  // The meetings isms-cycle.js made (recent issued, forthcoming) belong to the current cycle.
  const current = cycles[3].id;
  await query(`UPDATE working_group_meetings SET linked_cycle_id = $1 WHERE linked_cycle_id IS NULL`, [current]);
  await query(`UPDATE review_cycles SET status = 'active' WHERE id = $1`, [current]);
  log(`   ✓ ${cycles.length} review cycles, meetings for the three closed ones`);
}

// SQL: spread accepted actions across the year, and make one overdue.
async function spreadActions(accepted) {
  phase('6. Spreading the actions across the year');
  for (const [k, id] of accepted.entries()) {
    const ago = 20 + ((k * 37) % 300);
    await query(`UPDATE security_actions SET created_at = now() - make_interval(days => $2 + 7), accepted_at = now() - make_interval(days => $2),
                   target_date = (now() - make_interval(days => $2))::date + 120 WHERE id = $1`, [id, ago]);
  }
  log(`   ✓ ${accepted.length} actions dated across the past year; those older than 120 days read overdue`);
}

async function main() {
  const who = await personas();
  await api(who.t.ciso, 'GET', '/org/phase');
  await storyRisks(who);
  await backlog(who);
  const accepted = await actions(who);
  await exceptions(who);
  await history(who);
  if (accepted.length) await spreadActions(accepted);

  phase('Summary');
  const { rows } = await query(`
    SELECT 'risks' k, count(*)::text v FROM risks WHERE is_active
    UNION ALL SELECT 'awaiting validation', count(*)::text FROM risks WHERE is_active AND validation_status = 'pending'
    UNION ALL SELECT 'catastrophic / critical', (count(*) FILTER (WHERE risk_score >= 25))::text || ' / ' || (count(*) FILTER (WHERE risk_score BETWEEN 20 AND 24))::text FROM risks WHERE is_active
    UNION ALL SELECT 'security actions', count(*)::text FROM security_actions
    UNION ALL SELECT 'exceptions active / expired', (count(*) FILTER (WHERE status = 'active'))::text || ' / ' || (count(*) FILTER (WHERE status = 'expired'))::text FROM exceptions
    UNION ALL SELECT 'review cycles', count(*)::text FROM review_cycles
    UNION ALL SELECT 'SWG meetings', count(*)::text FROM working_group_meetings`);
  for (const r of rows) log(`   ${r.k.padEnd(28)} ${r.v}`);
  log(`\n${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end().catch(() => {}));
