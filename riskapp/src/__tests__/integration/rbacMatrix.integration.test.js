'use strict';
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// CHARACTERIZATION of the CURRENT RBAC contract (Phase 0 of the configurable-RBAC
// plan, docs/configurable-rbac-plan.md). Every expectation is derived from the
// route guards/controllers in code — NOT from the CLAUDE.md API table, which has
// drifted. This is the safety net for the upcoming migration onto a can() resolver:
// it must stay green before and after each refactor step.
//
// Method: hit each endpoint with a bogus id + empty body and a token for each role.
//   - "admitted" (role in the guard): assert NOT 401 and NOT 403 (may be 400/404/422
//     from the handler — that just proves it got past auth).
//   - "forbidden": assert 403 (the requireRole middleware, or the controller for the
//     few controller-scoped endpoints, blocks it).
// requireRole runs before the handler, so denied→403 holds without valid data.

const { app, request, tokenFor } = require('./helpers');

const ALL = ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro', 'secretary', 'soc'];
const U = '00000000-0000-0000-0000-000000000000'; // bogus uuid
const T = '1';                                     // bogus numeric (impact-tables)

// [ method, path, allowedRoleKeys ]   denied = ALL - allowed
const MATRIX = [
  // ── governance (ciso-only / siro-only; note: admin NOT included) ──
  ['get',  '/api/v1/governance/risks/pending', ['ciso']],
  ['post', `/api/v1/governance/risks/${U}/validate`, ['ciso']],
  ['get',  '/api/v1/governance/sap/overdue', ['ciso']],
  ['get',  '/api/v1/governance/sap/actions', ['ciso']],
  ['get',  '/api/v1/governance/siro/cycles/pending', ['siro']],
  ['get',  '/api/v1/governance/siro/cycles', ['siro']],
  ['get',  `/api/v1/governance/siro/cycles/${U}`, ['siro']],
  ['post', `/api/v1/governance/siro/cycles/${U}/approve`, ['siro']],
  ['get',  '/api/v1/governance/siro/actions/pending', ['siro']],
  ['get',  '/api/v1/governance/siro/actions', ['siro']],
  ['get',  '/api/v1/governance/siro/impact-tables/published', ['siro']],

  // ── operations ──
  ['get',  '/api/v1/operations/probability-signals', ['analyst']],
  ['get',  '/api/v1/operations/my-risk-trends', ['iam', 'owner']],
  // controller-scoped (no requireRole): getCurrentRisks/getFutureRisks define the
  // contract — ciso/analyst/secretary (all risks), iam (dept), owner (own); everyone
  // else (incl. admin, consultant, siro) gets 403 from the controller.
  // admin added v109 — it held risks.read but not risk_heatmap.read, so the one
  // page an administrator could not open was the risk register.
  ['get',  '/api/v1/operations/risk-heatmap/current', ['admin', 'ciso', 'analyst', 'secretary', 'iam', 'owner', 'soc']],
  ['get',  '/api/v1/operations/risk-heatmap/future',  ['admin', 'ciso', 'analyst', 'secretary', 'iam', 'owner', 'soc']],

  // ── controls ──
  // controls.read now incl. iam + owner (v84 — catalogue access for control owners)
  ['get',  '/api/v1/controls', ['analyst', 'ciso', 'consultant', 'admin', 'iam', 'owner', 'soc']],
  ['post', '/api/v1/controls/import', ['admin']],
  ['post', '/api/v1/controls', ['analyst', 'ciso', 'admin']],
  ['get',  `/api/v1/controls/${U}/components`, ['analyst', 'ciso', 'consultant', 'admin', 'iam', 'owner', 'soc']],
  ['post', `/api/v1/controls/${U}/components`, ['analyst', 'ciso', 'admin']],
  ['patch',`/api/v1/controls/${U}/components/${U}`, ['analyst', 'ciso', 'admin']],
  ['delete',`/api/v1/controls/${U}/components/${U}`, ['analyst', 'ciso', 'admin']],
  ['post', `/api/v1/controls/${U}/threats`, ['analyst', 'ciso', 'admin']],
  ['delete',`/api/v1/controls/${U}/threats/${U}`, ['analyst', 'ciso', 'admin']],
  ['patch',`/api/v1/controls/${U}/rate`, ['analyst', 'ciso', 'admin']],
  // maturity-cap (now owner-assignment only; the v83 ceiling was retired): route guard
  // is controls.read, owner assignment needs controls.write inside. An empty body 400s
  // (owner_user_id required) before the write gate, so all read roles pass; non-read 403.
  ['patch',`/api/v1/controls/${U}/maturity-cap`, ['analyst', 'ciso', 'consultant', 'admin', 'iam', 'owner', 'soc']],
  ['patch',`/api/v1/controls/${U}`, ['analyst', 'ciso', 'admin']],
  ['get',  `/api/v1/controls/${U}`, ['analyst', 'ciso', 'consultant', 'admin', 'iam', 'owner', 'soc']],

  // ── assets (canView incl. owner; canCreate excludes owner; canAdmin = ciso/admin) ──
  ['get',  '/api/v1/assets', ['analyst', 'ciso', 'consultant', 'iam', 'owner', 'admin', 'soc']],
  ['post', '/api/v1/assets', ['ciso', 'admin', 'consultant', 'iam']],
  ['get',  `/api/v1/assets/${U}`, ['analyst', 'ciso', 'consultant', 'iam', 'owner', 'admin', 'soc']],
  ['put',  `/api/v1/assets/${U}`, ['ciso', 'admin', 'consultant', 'iam']],
  ['put',  `/api/v1/assets/${U}/rate`, ['ciso', 'admin', 'consultant', 'iam']],
  ['delete',`/api/v1/assets/${U}`, ['ciso', 'admin']],
  ['get',  `/api/v1/assets/${U}/suggested-impact-tables`, ['analyst', 'ciso', 'consultant', 'iam', 'owner', 'admin', 'soc']],
  ['post', `/api/v1/assets/${U}/impact-tables`, ['ciso', 'admin', 'consultant', 'iam']],
  ['delete',`/api/v1/assets/${U}/impact-tables/${U}`, ['ciso', 'admin', 'consultant', 'iam']],

  // ── bil (denyIAMOnOrgScope 404s IAM on a missing table, so IAM stays admitted) ──
  ['get',  '/api/v1/bil/reference', ['analyst', 'ciso', 'consultant', 'iam', 'siro', 'admin', 'owner', 'soc']],
  ['get',  '/api/v1/bil/impact-tables', ['analyst', 'ciso', 'consultant', 'iam', 'siro', 'admin', 'owner', 'soc']],
  ['post', '/api/v1/bil/impact-tables', ['analyst', 'ciso', 'admin', 'iam']],
  ['get',  `/api/v1/bil/impact-tables/${T}`, ['analyst', 'ciso', 'consultant', 'iam', 'siro', 'admin', 'owner', 'soc']],
  ['put',  `/api/v1/bil/impact-tables/${T}`, ['analyst', 'ciso', 'admin', 'iam']],
  ['put',  `/api/v1/bil/impact-tables/${T}/bil-levels`, ['analyst', 'ciso', 'admin', 'iam']],
  ['put',  `/api/v1/bil/impact-tables/${T}/cia-levels`, ['analyst', 'ciso', 'admin', 'iam']],
  ['delete',`/api/v1/bil/impact-tables/${T}`, ['analyst', 'ciso', 'admin', 'iam']],
  // v103: the CISO may flag a scale mandatory — they publish the org-scope
  // tables and mandatory-ness is the instrument that makes one binding.
  ['patch',`/api/v1/bil/impact-tables/${T}/mandatory`, ['ciso', 'siro', 'admin']],
  // NB: POST /bil/impact-tables/:id/publish and PUT .../rows/:rowId/cia are
  // controller-scoped (custom guard / in-handler) — covered by bilPublish test.

  // ── components ──
  ['get',  '/api/v1/components', ['analyst', 'ciso', 'consultant', 'admin', 'iam', 'soc']],
  ['post', '/api/v1/components', ['analyst', 'ciso', 'admin', 'iam']],

  // ── graph ──

  // ── services ──
  ['get',  '/api/v1/services', ['analyst', 'ciso', 'consultant', 'iam', 'owner', 'admin', 'soc']],
  ['get',  '/api/v1/services/shared', ['analyst', 'ciso', 'consultant', 'iam', 'owner', 'admin', 'soc']],
  ['post', '/api/v1/services', ['analyst', 'ciso', 'admin', 'consultant', 'iam']],
  ['get',  `/api/v1/services/${U}`, ['analyst', 'ciso', 'consultant', 'iam', 'owner', 'admin', 'soc']],
  // v104: a service is composed of SYSTEMS. The available-information-assets /
  // information-assets endpoints are gone; an asset reaches a service by being in
  // one of its systems, so there is nothing to link from the asset side either.
  ['get',  `/api/v1/services/${U}/available-systems`, ['analyst', 'ciso', 'admin', 'consultant', 'iam']],
  // POST/DELETE /services/:id/impact-tables retired in v99 (derived from asset ratings).
  ['post', `/api/v1/services/${U}/systems`, ['analyst', 'ciso', 'admin', 'consultant', 'iam']],
  ['delete',`/api/v1/services/${U}/systems/${U}`, ['analyst', 'ciso', 'admin', 'consultant', 'iam']],
  ['put',  `/api/v1/services/${U}`, ['analyst', 'ciso', 'admin', 'consultant', 'iam']],
  ['post', `/api/v1/services/${U}/transfer`, ['admin', 'ciso']],
  ['delete',`/api/v1/services/${U}`, ['analyst', 'ciso', 'admin', 'consultant']],
  ['post', `/api/v1/services/${U}/adopt`, ['analyst', 'ciso', 'iam', 'admin', 'consultant']],
  ['delete',`/api/v1/services/${U}/adopt`, ['analyst', 'ciso', 'iam', 'admin']],

  // ── systems (canView incl. owner+secretary; canAdmin = ciso/admin) ──
  ['get',  '/api/v1/systems', ['ciso', 'admin', 'analyst', 'consultant', 'iam', 'owner', 'secretary', 'soc']],
  ['post', '/api/v1/systems', ['ciso', 'admin', 'analyst', 'consultant', 'iam']],
  ['get',  `/api/v1/systems/${U}`, ['ciso', 'admin', 'analyst', 'consultant', 'iam', 'owner', 'secretary', 'soc']],
  ['put',  `/api/v1/systems/${U}`, ['ciso', 'admin', 'analyst', 'consultant', 'iam']],
  ['delete',`/api/v1/systems/${U}`, ['ciso', 'admin']],
  ['post', `/api/v1/systems/${U}/components`, ['ciso', 'admin', 'analyst', 'consultant', 'iam']],
  ['delete',`/api/v1/systems/${U}/components/${U}`, ['ciso', 'admin', 'analyst', 'consultant', 'iam']],
  ['post', `/api/v1/systems/${U}/information-assets`, ['ciso', 'admin', 'analyst', 'consultant', 'iam']],
  ['delete',`/api/v1/systems/${U}/information-assets/${U}`, ['ciso', 'admin', 'analyst', 'consultant', 'iam']],
  ['get',  `/api/v1/systems/${U}/available-information-assets`, ['ciso', 'admin', 'analyst', 'consultant', 'iam']],

  // ── threats ──
  ['get',  '/api/v1/threats', ['analyst', 'ciso', 'consultant', 'iam', 'admin', 'owner', 'siro', 'soc']],
  ['get',  `/api/v1/threats/${U}`, ['analyst', 'ciso', 'consultant', 'iam', 'admin', 'owner', 'siro', 'soc']],
  ['post', '/api/v1/threats', ['ciso', 'analyst', 'consultant', 'admin']],
  ['put',  `/api/v1/threats/${U}`, ['ciso', 'analyst', 'consultant', 'admin']],
  ['delete',`/api/v1/threats/${U}`, ['ciso', 'analyst', 'consultant', 'admin']],

  // ── exceptions — read-visible to EVERYONE (deliberate transparency); unscoped.
  //    Write (accept/renew/revoke) stays seat-gated + SoD on the risk routes. ──
  ['get',  '/api/v1/exceptions/active', ['ciso', 'analyst', 'admin', 'siro', 'owner', 'iam', 'consultant', 'secretary', 'soc']],
  ['get',  '/api/v1/exceptions/stats', ['ciso', 'analyst', 'admin', 'siro', 'owner', 'iam', 'consultant', 'secretary', 'soc']],

  // ── actions ──
  ['get',  '/api/v1/actions/acceptance-queue', ['ciso', 'siro', 'admin']],
  ['get',  '/api/v1/actions/stats', ['ciso', 'analyst', 'admin', 'siro', 'owner', 'iam', 'soc']],
  // explicit 8-role requireRole list (every role that can OWN an action) — excludes
  // soc_analyst, a pure enrichment consumer with no actions.
  ['get',  '/api/v1/actions/my-inprogress', ['ciso', 'analyst', 'admin', 'siro', 'iam', 'owner', 'consultant', 'secretary']],
  ['get',  '/api/v1/actions/org-inprogress', ['secretary', 'ciso', 'admin']],
  ['patch',`/api/v1/actions/${U}/progress`, ['ciso', 'analyst', 'admin', 'iam', 'owner', 'consultant', 'secretary']], // siro excluded
  // scoped list + detail — actions.read holders (RACI "informed" audience); dept-scoped server-side
  ['get',  '/api/v1/actions', ['ciso', 'analyst', 'admin', 'siro', 'owner', 'iam', 'soc']],
  ['get',  `/api/v1/actions/${U}`, ['ciso', 'analyst', 'admin', 'siro', 'owner', 'iam', 'soc']],
  // v134 — an action that is not about a risk is accepted and completed as a
  // whole. Accept = actions.adopt, exactly who accepts a risk action. Complete is
  // a custom gate (owner / ciso / analyst / admin) evaluated after the lookup, so
  // with a bogus id every role reaches the 404; the gate itself is pinned in
  // ratingIncompleteFinding.integration.test.js.
  ['post', `/api/v1/actions/${U}/accept`, ['ciso', 'admin']],
  ['post', `/api/v1/actions/${U}/complete`, ALL],

  // ── findings (v134) ──
  // Read = findings.read (v135 — the exceptions.read audience, since the SWG
  // reviews both), scoped server-side; raise = findings.act (ciso, analyst, and
  // IAM/IAO for their own department — the seat gate 404s the bogus id).
  ['get',  '/api/v1/findings/rating-incomplete', ALL],
  ['get',  '/api/v1/findings/soa-summary', ALL],
  ['post', `/api/v1/findings/rating-incomplete/${U}/actions`, ['ciso', 'analyst', 'iam', 'owner']],
  // v136 — ACCEPTING a finding is the risk-exception authority (exceptions.accept /
  // exceptions.revoke: admin, ciso, siro), not the raising one.
  ['post', `/api/v1/findings/rating-incomplete/${U}/exceptions`, ['admin', 'ciso', 'siro']],
  ['patch',`/api/v1/findings/exceptions/${U}/revoke`, ['admin', 'ciso', 'siro']],
  // v138 — the component-record finding, same authorities, subject = system.
  ['get',  '/api/v1/findings/component-record', ALL],
  ['post', `/api/v1/findings/component-record/${U}/actions`, ['ciso', 'analyst', 'iam', 'owner']],
  ['post', `/api/v1/findings/component-record/${U}/exceptions`, ['admin', 'ciso', 'siro']],
  // ── suppliers (v142) ──
  // Read = suppliers.read (the exceptions.read audience); write = suppliers.write
  // (governance + analyst roles org-wide, IAM/IAO for their own department).
  ['get',  '/api/v1/suppliers', ALL],
  ['get',  `/api/v1/suppliers/${U}`, ALL],
  ['get',  `/api/v1/suppliers/relationships?system_id=${U}`, ALL],
  ['post', '/api/v1/suppliers', ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  ['patch',`/api/v1/suppliers/${U}`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  ['post', `/api/v1/suppliers/${U}/relationships`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  ['patch',`/api/v1/suppliers/relationships/${U}`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  // v143 — the per-type control sets: read with suppliers, edited with the control catalogue.
  ['get',  '/api/v1/suppliers/objectives', ALL],
  ['post', '/api/v1/suppliers/objectives', ['admin', 'ciso', 'analyst']],
  ['delete',`/api/v1/suppliers/objectives/all/${U}`, ['admin', 'ciso', 'analyst']],
  // v145 — delivery patterns are library work: controls.write (admin, ciso, analyst).
  ['post',  `/api/v1/controls/${U}/patterns`, ['admin', 'ciso', 'analyst']],
  ['patch', `/api/v1/controls/${U}/patterns/${U}`, ['admin', 'ciso', 'analyst']],
  ['delete',`/api/v1/controls/${U}/patterns/${U}`, ['admin', 'ciso', 'analyst']],
  ['post',  `/api/v1/controls/${U}/patterns/${U}/parts`, ['admin', 'ciso', 'analyst']],
  ['delete',`/api/v1/controls/${U}/patterns/${U}/parts/${U}`, ['admin', 'ciso', 'analyst']],
  // v148 — the security architecture library is library work (controls.write);
  // reading it follows the catalogue (controls.read).
  ['get',   '/api/v1/architecture', ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'soc']],
  ['post',  '/api/v1/architecture/rules', ['admin', 'ciso', 'analyst']],
  ['delete',`/api/v1/architecture/rules/${U}`, ['admin', 'ciso', 'analyst']],
  ['post',  `/api/v1/architecture/groups/${U}/members`, ['admin', 'ciso', 'analyst']],
  ['post',  '/api/v1/architecture/builds', ['admin', 'ciso', 'analyst']],
  // …while choosing a solution and applying a build are edits to the system.
  ['get',   `/api/v1/systems/${U}/security`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'secretary', 'soc']],
  ['put',   `/api/v1/systems/${U}/solution-choices/${U}`, ['admin', 'ciso', 'analyst', 'iam', 'consultant']],
  ['post',  `/api/v1/systems/${U}/builds/${U}/apply`, ['admin', 'ciso', 'analyst', 'iam', 'consultant']],
  // v144 — evidence is recorded with suppliers.write (seat-gated; the bogus id 404s for IAM/IAO).
  ['post', `/api/v1/suppliers/relationships/${U}/evidence`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  ['patch',`/api/v1/suppliers/evidence/${U}`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  ['delete',`/api/v1/suppliers/evidence/${U}`, ['admin', 'ciso', 'analyst', 'iam', 'owner', 'consultant', 'siro']],
  // …and its finding, with the same authorities as the other findings.
  ['get',  '/api/v1/findings/supplier-assurance', ALL],
  ['post', `/api/v1/findings/supplier-assurance/${U}/actions`, ['ciso', 'analyst', 'iam', 'owner']],
  ['post', `/api/v1/findings/supplier-assurance/${U}/exceptions`, ['admin', 'ciso', 'siro']],
  // v140 — a document has no department, so under isolation only the org-wide
  // findings.act holders (ciso, analyst) raise it.
  ['get',  '/api/v1/findings/document-review', ALL],
  ['post', `/api/v1/findings/document-review/${U}/actions`, ['ciso', 'analyst']],
  ['post', `/api/v1/findings/document-review/${U}/exceptions`, ['admin', 'ciso', 'siro']],

  // ── risks ──
  ['get',  `/api/v1/risks/${U}`, ['ciso', 'analyst', 'admin', 'iam', 'owner', 'secretary', 'soc']],
  ['post', '/api/v1/risks', ['ciso', 'analyst', 'admin']],
  ['post', `/api/v1/risks/${U}/components`, ['ciso', 'analyst', 'admin']],
  ['delete',`/api/v1/risks/${U}/components/${U}`, ['ciso', 'analyst', 'admin']],
  ['post', `/api/v1/risks/${U}/controls`, ['ciso', 'analyst', 'admin']],
  ['delete',`/api/v1/risks/${U}/controls/${U}`, ['ciso', 'analyst', 'admin']],
  ['patch',`/api/v1/risks/${U}/treatment`, ['ciso', 'analyst', 'admin']],
  ['put',  `/api/v1/risks/${U}`, ['ciso', 'analyst', 'admin']],
  // v100 — retiring a risk records WHY (no_longer_applies | raised_in_error);
  // replaces the old DELETE /risks/:id, which captured nothing.
  ['post', `/api/v1/risks/${U}/retire`, ['ciso', 'admin']],                    // risks.delete
  // Threat identification: declaring an exposure is a risk-register act, so it
  // is gated on risks.write rather than threats.write.
  ['post', `/api/v1/threats/${U}/systems`, ['ciso', 'analyst', 'admin']],
  ['delete',`/api/v1/threats/${U}/systems/${U}`, ['ciso', 'analyst', 'admin']],
  // Gap-driven actions (v96/v97). The free-form propose/attach/target/edit routes
  // and the adopt→start→complete→verify chain are RETIRED; an action is built from
  // the coverage gap and drains item by item.
  ['get',  `/api/v1/risks/${U}/action-items/candidates`, ['ciso', 'analyst', 'admin']],
  ['post', `/api/v1/risks/${U}/actions/from-gap`, ['ciso', 'analyst', 'admin']],
  ['get',  `/api/v1/risks/${U}/actions`, ['ciso', 'analyst', 'admin', 'iam', 'owner', 'secretary', 'soc']],
  ['patch',`/api/v1/risks/${U}/action-items/${U}`, ['ciso', 'analyst', 'admin']],
  // accept = actions.adopt (the CISO's freeze-and-snapshot act).
  ['post', `/api/v1/risks/${U}/actions/${U}/accept`, ['ciso', 'admin']],
  // complete-item deliberately has NO capability guard: the gate is in-handler and
  // admits ciso/risk_analyst/admin OR the SYSTEM OWNER, who may hold no risks.write
  // at all. It also looks the item up first, so a bogus id 404s for every role
  // before the gate is reached — meaning this harness (bogus id + empty body)
  // cannot characterize it. Listed as all-admitted to assert only that the route
  // is reachable and never 401/403s at the route layer; the real gate is covered
  // by the endpoint's own behaviour (403 'Only the CISO, a risk analyst, or the
  // system owner can complete an item.').
  ['post', `/api/v1/risks/${U}/action-items/${U}/complete`, ALL],
  ['get',  `/api/v1/risks/${U}/residual-history`, ['ciso', 'analyst', 'admin', 'iam', 'owner', 'secretary', 'soc']],
  // Accepting a risk above appetite is a GOVERNANCE act, not a departmental one
  // (v107, docs/risk-ownership.md): the party who lives with the risk must not
  // sign it off. The IAO owns every risk in their department and is Consulted,
  // not an acceptor; the analyst assesses but does not accept. Revocation
  // follows acceptance so a decision and its reversal share one authority.
  ['post', `/api/v1/risks/${U}/exceptions`, ['ciso', 'admin', 'siro']], // canAccept
  ['patch',`/api/v1/risks/${U}/exceptions/${U}/renew`, ['ciso', 'admin', 'siro']],
  ['patch',`/api/v1/risks/${U}/exceptions/${U}/revoke`, ['ciso', 'admin', 'siro']],
  ['get',  `/api/v1/risks/${U}/exceptions`, ['ciso', 'analyst', 'admin', 'iam', 'owner', 'secretary', 'soc']],
  ['delete',`/api/v1/risks/${U}/actions/${U}`, ['ciso', 'analyst', 'admin']],
  // DELETE /api/v1/risks/:id retired in v100 — replaced by POST /risks/:id/retire
  // (above), which requires a reason. An ending with no recorded reason is what
  // let my-risk-trends count typos as achievements.

  // ── meetings ──
  ['get',  '/api/v1/meetings', ['secretary', 'ciso', 'siro', 'analyst', 'admin']],
  ['post', '/api/v1/meetings', ['secretary']],
  ['get',  '/api/v1/meetings/cycles/available', ['secretary']],
  ['get',  '/api/v1/meetings/users/available', ['secretary', 'admin']],
  ['get',  `/api/v1/meetings/${U}`, ['secretary', 'ciso', 'siro', 'analyst', 'admin', 'owner', 'iam', 'consultant']],
  ['patch',`/api/v1/meetings/${U}`, ['secretary']],
  ['get',  `/api/v1/meetings/${U}/agenda`, ['secretary', 'ciso', 'siro', 'analyst', 'admin', 'owner', 'iam', 'consultant']],
  ['post', `/api/v1/meetings/${U}/agenda/generate`, ['secretary']],
  ['post', `/api/v1/meetings/${U}/agenda/items`, ['secretary']],
  ['patch',`/api/v1/meetings/${U}/agenda/items/${U}`, ['secretary']],
  ['delete',`/api/v1/meetings/${U}/agenda/items/${U}`, ['secretary']],
  ['post', `/api/v1/meetings/${U}/agenda/reorder`, ['secretary']],
  ['post', `/api/v1/meetings/${U}/agenda/items/${U}/decision`, ['secretary', 'ciso', 'siro', 'admin']],
  ['post', `/api/v1/meetings/${U}/attachments`, ['secretary', 'ciso', 'siro', 'analyst', 'admin']], // canRead
  ['get',  `/api/v1/meetings/${U}/attachments`, ['secretary', 'ciso', 'siro', 'analyst', 'admin', 'owner', 'iam', 'consultant']],
  ['get',  `/api/v1/meetings/${U}/attachments/${U}/download`, ['secretary', 'ciso', 'siro', 'analyst', 'admin', 'owner', 'iam', 'consultant']],
  ['delete',`/api/v1/meetings/${U}/attachments/${U}`, ['secretary', 'ciso', 'siro', 'analyst', 'admin']], // canRead
  ['get',  `/api/v1/meetings/${U}/pack`, ['secretary', 'ciso', 'siro', 'analyst', 'admin', 'owner', 'iam', 'consultant']],
  ['post', `/api/v1/meetings/${U}/attendees`, ['secretary', 'admin']],
  ['delete',`/api/v1/meetings/${U}/attendees/${U}`, ['secretary', 'admin']],
  ['patch',`/api/v1/meetings/${U}/attendees/${U}`, ['secretary', 'admin']],
  ['post', `/api/v1/meetings/${U}/close`, ['secretary']],
  ['patch',`/api/v1/meetings/${U}/minutes`, ['secretary']],
  ['post', `/api/v1/meetings/${U}/issue-minutes`, ['secretary']],
  ['patch',`/api/v1/meetings/${U}/section-timeboxes`, ['secretary']],

  // ── knowledge (knowledge.query — org-wide roles + IAM/IAO since v88) ──
  ['get',  '/api/v1/knowledge/enrich', ['admin', 'ciso', 'analyst', 'consultant', 'soc', 'iam', 'owner']],
  ['get',  '/api/v1/knowledge/search?q=ad', ['admin', 'ciso', 'analyst', 'consultant', 'soc', 'iam', 'owner']],
  // graph seed needs systems.read too → soc (knowledge.query only) 403s on the seed
  ['get',  `/api/v1/knowledge/graph/system/${U}`, ['admin', 'ciso', 'analyst', 'consultant', 'iam', 'owner', 'soc']],

  // ── departments (canManage = admin/ciso) ──
  ['post', '/api/v1/departments', ['admin', 'ciso']],
  ['patch',`/api/v1/departments/${U}`, ['admin', 'ciso']],
  ['delete',`/api/v1/departments/${U}`, ['admin', 'ciso']],

  // ── users (canView) ──
  ['get',  '/api/v1/users', ['ciso', 'admin', 'consultant', 'iam', 'analyst']],

  // ── admin (router-level requireRole('admin')) ──
  ['get',  '/api/v1/admin/setup-status', ['admin']],
  ['get',  '/api/v1/admin/users', ['admin']],
  ['patch',`/api/v1/admin/users/${U}`, ['admin']],

  // ── admin data export (CSV/TSV) — admin.manage ──
  ['get',  '/api/v1/admin/export/users', ['admin']],
  ['get',  '/api/v1/admin/export/user-roles', ['admin']],
  ['get',  '/api/v1/admin/export/departments', ['admin']],
  ['get',  '/api/v1/admin/export/role-permissions', ['admin']],
  ['get',  '/api/v1/admin/export/sod-rules', ['admin']],
  ['get',  '/api/v1/admin/export/access-settings', ['admin']],
  ['get',  '/api/v1/admin/export/capabilities', ['admin']],
  ['get',  '/api/v1/admin/export/all', ['admin']],
  ['get',  '/api/v1/admin/export/threats', ['admin']],
  ['get',  '/api/v1/admin/export/controls', ['admin']],
  ['get',  '/api/v1/admin/export/control-threats', ['admin']],
  ['get',  '/api/v1/admin/export/control-component-links', ['admin']],
  ['get',  '/api/v1/admin/export/information-assets', ['admin']],
  ['get',  '/api/v1/admin/export/asset-impact-ratings', ['admin']],
  ['get',  '/api/v1/admin/export/systems', ['admin']],
  ['get',  '/api/v1/admin/export/system-assets', ['admin']],
  ['get',  '/api/v1/admin/export/system-components', ['admin']],
  ['get',  '/api/v1/admin/export/business-services', ['admin']],
  ['get',  '/api/v1/admin/export/business-service-assets', ['admin']],
  ['get',  '/api/v1/admin/export/impact-tables', ['admin']],
  ['get',  '/api/v1/admin/export/impact-table-bil-levels', ['admin']],
  ['get',  '/api/v1/admin/export/impact-table-cia-levels', ['admin']],
];

describe('RBAC route-guard contract (characterization)', () => {
  for (const [method, path, allowed] of MATRIX) {
    const denied = ALL.filter((r) => !allowed.includes(r));
    describe(`${method.toUpperCase()} ${path}`, () => {
      for (const role of allowed) {
        test(`${role} admitted`, async () => {
          const res = await request(app)[method](path)
            .set('Authorization', `Bearer ${tokenFor(role)}`)
            .send({});
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(403);
        });
      }
      for (const role of denied) {
        test(`${role} forbidden`, async () => {
          const res = await request(app)[method](path)
            .set('Authorization', `Bearer ${tokenFor(role)}`)
            .send({});
          expect(res.status).toBe(403);
        });
      }
    });
  }
});

// Endpoints with no role guard — any authenticated user is admitted.
const ANY_AUTH = [
  ['get', '/api/v1/departments'],
  ['get', '/api/v1/users/me/dashboard-layout'],
  ['put', '/api/v1/users/me/dashboard-layout'],
  ['get', '/api/v1/users/me/view-mode'],
  ['put', '/api/v1/users/me/view-mode'],
  ['get', '/api/v1/meetings/swg-summary'],
  ['get', `/api/v1/meetings/${U}/published-minutes`],
  ['get', `/api/v1/meetings/${U}/calendar.ics`],
];

describe('any-authenticated endpoints', () => {
  for (const [method, path] of ANY_AUTH) {
    for (const role of ['owner', 'secretary', 'admin']) {
      test(`${role} admitted ${method.toUpperCase()} ${path}`, async () => {
        const res = await request(app)[method](path)
          .set('Authorization', `Bearer ${tokenFor(role)}`)
          .send({});
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    }
  }
});

test('a request with no token is rejected 401', async () => {
  const res = await request(app).get('/api/v1/services');
  expect(res.status).toBe(401);
});
