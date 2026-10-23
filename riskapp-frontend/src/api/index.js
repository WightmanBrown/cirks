// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// riskapp-frontend/src/api/index.js
import client from './client';

export async function login(email, password, totp_code) {
  const { data } = await client.post('/auth/login', { email, password, totp_code });
  return data;
}

export async function refresh(refresh_token) {
  const { data } = await client.post('/auth/refresh', { refresh_token });
  return data;
}

export async function logout(refresh_token) {
  await client.post('/auth/logout', { refresh_token });
}

export async function switchRole(role) {
  const { data } = await client.post('/auth/switch-role', { role });
  return data;
}

export async function getPendingRisks(filters = {}) {
  const params = {};
  if (filters.status)        params.status        = filters.status;
  if (filters.department_id) params.department_id = filters.department_id;
  const { data } = await client.get('/governance/risks/pending', { params });
  return data;
}

export async function validateRisk(id, body) {
  const { data } = await client.post(`/governance/risks/${id}/validate`, body);
  return data;
}

export async function getOverdueActionCount() {
  const { data } = await client.get('/governance/sap/overdue');
  return data;
}

export async function getProbabilitySignals() {
  const { data } = await client.get('/operations/probability-signals');
  return data;
}


export async function getRiskHeatmap() {
  const { data } = await client.get('/operations/risk-heatmap');
  return data;
}

export async function getCurrentRisks() {
  const { data } = await client.get('/operations/risk-heatmap/current');
  return data;
}

export async function getFutureRisks() {
  const { data } = await client.get('/operations/risk-heatmap/future');
  return data;
}

export async function getMyRiskTrends() {
  const { data } = await client.get('/operations/my-risk-trends');
  return data;
}

export async function getRisk(id) {
  const { data } = await client.get(`/risks/${id}`);
  return data;
}

export async function createRisk(body) {
  const { data } = await client.post('/risks', body);
  return data;
}

// Derived control/component gap for a (system, threat) pair — powers the
// Register-Risk gap panel before the risk exists. Returns { controls[] (each with
// nested components[]), summary }.
export async function getRiskGap(system_id, threat_id, risk_id) {
  const { data } = await client.get('/risks/gap', { params: { system_id, threat_id, risk_id } });
  return data;
}

// Per-control residual attack probability once this control is considered (the
// Threat Coverage panel picker). Value must be ≤ the threat inherent — the API
// 400s otherwise. The DB derives risks.probability_* = MIN over the DEPLOYED
// controls of COALESCE(judged, threat inherent), a degraded control worsened by
// one rung (0095, 0115).
export async function setRiskControlProbability(riskId, controlId, { probability_c, probability_i, probability_a }) {
  const { data } = await client.put(
    `/risks/${riskId}/controls/${controlId}/probability`,
    { probability_c, probability_i, probability_a }
  );
  return data;
}

// Per-system status of a deployed control / component (per-system status model).
// `not_applicable` REQUIRES a reason — the API refuses it otherwise (0118),
// because "this control treats the threat, so why is it not here?" is exactly
// what an auditor asks.
export async function setSystemControlStatus(systemId, controlId, status, exclusionReason) {
  await client.patch(`/systems/${systemId}/controls/${controlId}`, {
    status, ...(exclusionReason ? { exclusion_reason: exclusionReason } : {}),
  });
}
export async function setSystemComponentStatus(systemId, componentId, status) {
  await client.patch(`/systems/${systemId}/components/${componentId}`, { status });
}

export async function updateRisk(id, body) {
  const { data } = await client.put(`/risks/${id}`, body);
  return data;
}

export async function archiveRisk(id) {
  await client.delete(`/risks/${id}`);
}

export async function resubmitRisk(id) {
  await client.post(`/risks/${id}/resubmit`);
}

export async function discardRisk(id, body) {
  await client.post(`/risks/${id}/discard`, body || {});
}

export async function getReturnedToMe() {
  const { data } = await client.get('/risks/returned-mine');
  return data;
}

export async function linkRiskComponent(riskId, componentId) {
  await client.post(`/risks/${riskId}/components`, { component_id: componentId });
}

export async function unlinkRiskComponent(riskId, componentId) {
  await client.delete(`/risks/${riskId}/components/${componentId}`);
}

export async function getThreats(q, category) {
  const params = {};
  if (q)        params.q = q;
  if (category) params.category = category;
  const { data } = await client.get('/threats', { params });
  return data.threats || [];
}

export async function getThreat(id) {
  const { data } = await client.get(`/threats/${id}`);
  return data;
}

// Control catalogue for a threat (everything linked via control_threats) —
// powers the "suggested controls" block on the risk-detail mitigating-controls
// dialog and the "mitigating controls" section on the threat detail page.
export async function getThreatControls(id) {
  const { data } = await client.get(`/threats/${id}/controls`);
  return data.controls || [];
}

// Curate the catalogue from the threat side: declare/undeclare that a control
// mitigates this threat (writes control_threats; does not deploy on any system).
export async function linkThreatControl(threatId, controlId, notes) {
  const { data } = await client.post(`/threats/${threatId}/controls`, { control_id: controlId, notes });
  return data;
}

export async function unlinkThreatControl(threatId, controlId) {
  await client.delete(`/threats/${threatId}/controls/${controlId}`);
}

// Identify that a threat applies to a system, without assessing it. Unlinking
// is refused by the API once any risk has existed for the pair — an assessed
// exposure ends through its risk, not by removing the link.
export async function identifyThreatOnSystem(threatId, systemId) {
  const { data } = await client.post(`/threats/${threatId}/systems`, { system_id: systemId });
  return data;
}

export async function unidentifyThreatOnSystem(threatId, systemId) {
  await client.delete(`/threats/${threatId}/systems/${systemId}`);
}

// Retire a risk with a recorded reason. Replaces the old DELETE, which captured
// nothing and left management information unable to tell an achievement from a
// mistake. `reason` is 'no_longer_applies' | 'raised_in_error'.
export async function retireRisk(riskId, reason, notes) {
  await client.post(`/risks/${riskId}/retire`, { reason, notes });
}

export async function createThreat(body) {
  const { data } = await client.post('/threats', body);
  return data;
}

export async function updateThreat(id, body) {
  await client.put(`/threats/${id}`, body);
}

export async function archiveThreat(id) {
  await client.delete(`/threats/${id}`);
}

export async function getSecurityActions(filters = {}) {
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.mine)   params.mine = 1;
  const { data } = await client.get('/actions', { params });
  return data;
}

export async function getSecurityActionDetail(id) {
  const { data } = await client.get(`/actions/${id}`);
  return data;
}

export async function getSiroCyclePending() {
  const { data } = await client.get('/governance/siro/cycles/pending');
  return data;
}

export async function getSiroCycles() {
  const { data } = await client.get('/governance/siro/cycles');
  return data;
}

export async function getSiroActionPending() {
  const { data } = await client.get('/governance/siro/actions/pending');
  return data;
}

export async function getSiroCycleDetail(id) {
  const { data } = await client.get(`/governance/siro/cycles/${id}`);
  return data;
}

export async function approveSiroCycle(id) {
  const { data } = await client.post(`/governance/siro/cycles/${id}/approve`);
  return data;
}

export async function getSiroPublishedImpactTables() {
  const { data } = await client.get('/governance/siro/impact-tables/published');
  return data;
}

export async function getControl(id) {
  const { data } = await client.get(`/controls/${id}`);
  return data;
}

export async function rateControl(id, { effectiveness, effectiveness_notes }) {
  const { data } = await client.patch(`/controls/${id}/rate`, { effectiveness, effectiveness_notes });
  return data;
}

export async function updateControl(id, body) {
  const { data } = await client.patch(`/controls/${id}`, body);
  return data;
}

// Set a control's maturity ceiling (+ reason) and responsible owner.
export async function updateControlMaturityCap(id, body) {
  const { data } = await client.patch(`/controls/${id}/maturity-cap`, body);
  return data;
}

export async function createControl(body) {
  const { data } = await client.post('/controls', body);
  return data;
}

export async function importControls(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/controls/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ── Standards (control sets) — v87 Phase B ────────────────────────────────────
export async function getStandards() {
  const { data } = await client.get('/standards');
  return data;
}
export async function setStandardEnabled(id, is_enabled) {
  const { data } = await client.patch(`/standards/${id}`, { is_enabled });
  return data;
}
export async function importStandardControls(id, file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post(`/standards/${id}/controls/import`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
export async function importControlMappings(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/standards/mappings/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getControls(filters = {}) {
  const params = {};
  if (filters.q)            params.q            = filters.q;
  if (filters.framework)    params.framework    = filters.framework;
  if (filters.type)         params.type         = filters.type;
  if (filters.status)       params.status       = filters.status;
  if (filters.needs_rating) params.needs_rating = filters.needs_rating;
  const { data } = await client.get('/controls', { params });
  return data;
}

// ── Statement of Applicability (SoA) ──────────────────────────────────────────
export async function getSoa(framework = 'all') {
  const { data } = await client.get('/soa', { params: { framework } });
  return data;
}
export async function updateSoaEntry(controlId, body) {
  const { data } = await client.patch(`/soa/${controlId}`, body);
  return data;
}
// ── Scopes (v126): where a control objective applies ─────────────────────────
export async function getScopes() {
  const { data } = await client.get('/scopes');
  return data;
}
export async function getScope(id) {
  const { data } = await client.get(`/scopes/${id}`);
  return data;
}
export async function createScope(body) {
  const { data } = await client.post('/scopes', body);
  return data;
}
export async function updateScope(id, body) {
  const { data } = await client.patch(`/scopes/${id}`, body);
  return data;
}
export async function deleteScope(id) {
  const { data } = await client.delete(`/scopes/${id}`);
  return data;
}
export async function addScopeSystems(id, systemIds) {
  const { data } = await client.post(`/scopes/${id}/systems`, { system_ids: systemIds });
  return data;
}
export async function removeScopeSystem(id, systemId) {
  const { data } = await client.delete(`/scopes/${id}/systems/${systemId}`);
  return data;
}

// Decide several objectives at once — the SoA register's one editing act.
export async function setDeliveryBulk(controlIds, delivery) {
  const { data } = await client.post('/controls/delivery', { control_ids: controlIds, delivery });
  return data;
}
export async function decideSoaBulk(body) {
  const { data } = await client.post('/soa/decisions', body);
  return data;
}
export async function downloadSoaExport(framework = 'all') {
  const { data, headers } = await client.get('/soa/export', { responseType: 'blob', params: { framework } });
  const disposition = headers['content-disposition'] || '';
  const match = disposition.match(/filename="([^"]+)"/);
  return { blob: data, filename: match ? match[1] : 'statement-of-applicability.csv' };
}
export async function getSoaCoverage(framework) {
  const { data } = await client.get('/soa/coverage', { params: framework ? { framework } : {} });
  return data;
}
// Withdrawing a control from use (v131): ask what it would do, then do it.
export async function previewControlWithdrawal(controlId) {
  const { data } = await client.get(`/controls/${controlId}/withdrawal`);
  return data;
}
export async function withdrawControlFromUse(controlId, reason) {
  const { data } = await client.post(`/controls/${controlId}/withdraw`, { reason });
  return data;
}

// What the SoA contradicts (v130) — derived; optionally for one control objective.
export async function getSoaFindings(controlId) {
  const { data } = await client.get('/soa/findings', { params: controlId ? { control_id: controlId } : {} });
  return data;
}
export async function getSoaVersions() {
  const { data } = await client.get('/soa/versions');
  return data;
}
export async function createSoaVersion(note) {
  const { data } = await client.post('/soa/versions', { note });
  return data;
}
export async function downloadSoaVersionExport(versionId) {
  const { data, headers } = await client.get(`/soa/versions/${versionId}/export`, { responseType: 'blob' });
  const disposition = headers['content-disposition'] || '';
  const match = disposition.match(/filename="([^"]+)"/);
  return { blob: data, filename: match ? match[1] : 'statement-of-applicability.csv' };
}

export async function linkControlThreat(controlId, body) {
  const { data } = await client.post(`/controls/${controlId}/threats`, body);
  return data;
}

export async function unlinkControlThreat(controlId, threatLinkId) {
  await client.delete(`/controls/${controlId}/threats/${threatLinkId}`);
}

export async function linkRiskControl(riskId, controlId, maturity) {
  // Upserts the control onto the risk's system (system_controls); maturity is the
  // control↔system rating (control-maturity model). Calling again updates maturity.
  await client.post(`/risks/${riskId}/controls`, {
    control_id: controlId,
    ...(maturity != null ? { maturity } : {}),
  });
}

export async function unlinkRiskControl(riskId, controlId) {
  await client.delete(`/risks/${riskId}/controls/${controlId}`);
}

export async function getRiskGraph(id) {
  const { data } = await client.get(`/graph/risk/${id}`);
  return data;
}

export async function getControlComponents(controlId) {
  const { data } = await client.get(`/controls/${controlId}/components`);
  return data;
}

export async function createControlComponent(controlId, body) {
  const { data } = await client.post(`/controls/${controlId}/components`, body);
  return data;
}

export async function updateControlComponent(controlId, componentId, body) {
  const { data } = await client.patch(`/controls/${controlId}/components/${componentId}`, body);
  return data;
}

export async function unlinkControlComponent(controlId, componentId) {
  await client.delete(`/controls/${controlId}/components/${componentId}`);
}

export async function searchComponents(q, type) {
  const params = {};
  if (q)    params.q    = q;
  if (type) params.type = type;
  const { data } = await client.get('/components', { params });
  return data;
}

export async function listComponents(type) {
  const params = { all: '1' };
  if (type) params.type = type;
  const { data } = await client.get('/components', { params });
  return data.components || [];
}

export async function getComponent(id) {
  const { data } = await client.get(`/components/${id}`);
  return data.component;
}

export async function createComponent(body) {
  const { data } = await client.post('/components', body);
  return data;
}

export async function updateComponent(id, body) {
  const { data } = await client.patch(`/components/${id}`, body);
  return data;
}

export async function addComponentIp(componentId, body) {
  const { data } = await client.post(`/components/${componentId}/ips`, body);
  return data;
}

export async function removeComponentIp(componentId, ipId) {
  await client.delete(`/components/${componentId}/ips/${ipId}`);
}

// Knowledge enrichment — resolve an IP/hostname to its system(s) + risk/impact
export async function enrichKnowledge(q) {
  const { data } = await client.get('/knowledge/enrich', { params: { q } });
  return data;
}

// Architecture search — text search across services, assets, systems, components
export async function searchArchitecture(q) {
  const { data } = await client.get('/knowledge/search', { params: { q } });
  return data;
}

// Walkable graph — one-hop neighbours of a node { root, nodes, edges }
export async function getGraphNeighbors(type, id) {
  const { data } = await client.get(`/knowledge/graph/${type}/${id}`);
  return data;
}

// Machine API keys (admin) — mint / list / revoke. The plaintext key is only
// present on the create response.
export async function getApiKeys() {
  const { data } = await client.get('/admin/api-keys');
  return data;
}
export async function createApiKey(body) {
  const { data } = await client.post('/admin/api-keys', body);
  return data;
}
export async function revokeApiKey(id) {
  const { data } = await client.delete(`/admin/api-keys/${id}`);
  return data;
}

// Business Services
export async function getBusinessServices({ for_dept } = {}) {
  const params = for_dept ? { for_dept } : {};
  const { data } = await client.get('/services', { params });
  return data;
}

export async function getSharedServices({ for_dept } = {}) {
  const params = for_dept ? { for_dept } : {};
  const { data } = await client.get('/services/shared', { params });
  return data;
}

export async function getBusinessService(id) {
  const { data } = await client.get(`/services/${id}`);
  return data;
}

export async function createBusinessService(body) {
  const { data } = await client.post('/services', body);
  return data;
}

export async function updateBusinessService(id, body) {
  const { data } = await client.put(`/services/${id}`, body);
  return data;
}

export async function deleteBusinessService(id) {
  await client.delete(`/services/${id}`);
}

export async function adoptService(id, department_id) {
  const body = department_id ? { department_id } : {};
  const { data } = await client.post(`/services/${id}/adopt`, body);
  return data;
}

// addServiceImpactTable / removeServiceImpactTable were removed in v99 — a
// service's impact tables are derived from the tables its information assets
// are rated against, and the endpoints they called no longer exist.


// v104: a business service is composed of SYSTEMS. Each candidate carries
// own_asset_count — how many assets the SERVICE'S department holds in it — so
// the picker can group by what a choice actually does: >0 contributes impact
// and probability, 0 contributes probability only.
export async function getServiceAvailableSystems(serviceId) {
  const { data } = await client.get(`/services/${serviceId}/available-systems`);
  return data;
}

export async function linkServiceSystem(serviceId, system_id) {
  await client.post(`/services/${serviceId}/systems`, { system_id });
}

export async function unlinkServiceSystem(serviceId, systemId) {
  await client.delete(`/services/${serviceId}/systems/${systemId}`);
}

export async function unadoptService(id) {
  await client.delete(`/services/${id}/adopt`);
}

export async function transferService(id, department_id) {
  const { data } = await client.post(`/services/${id}/transfer`, { department_id });
  return data;
}

// Departments
export async function getDepartments() {
  const { data } = await client.get('/departments');
  return data;
}

export async function getDepartment(id) {
  const { data } = await client.get(`/departments/${id}`);
  return data;
}

// Accepts a plain name string (legacy callers) or a patch object.
export async function createDepartment(payload) {
  const body = typeof payload === 'string' ? { name: payload } : payload;
  const { data } = await client.post('/departments', body);
  return data;
}

export async function updateDepartment(id, patch) {
  const body = typeof patch === 'string' ? { name: patch } : patch;
  const { data } = await client.patch(`/departments/${id}`, body);
  return data;
}

export async function deleteDepartment(id) {
  await client.delete(`/departments/${id}`);
}

// BIL Reference & Impact Tables
export async function getBilReference() {
  const { data } = await client.get('/bil/reference');
  return data;
}

export async function getImpactTables({ dept_id } = {}) {
  const params = dept_id ? { dept_id } : {};
  const { data } = await client.get('/bil/impact-tables', { params });
  return data;
}

export async function createImpactTable(body) {
  const { data } = await client.post('/bil/impact-tables', body);
  return data;
}

export async function getImpactTable(id) {
  const { data } = await client.get(`/bil/impact-tables/${id}`);
  return data;
}

export async function updateImpactTable(id, body) {
  const { data } = await client.put(`/bil/impact-tables/${id}`, body);
  return data;
}

export async function updateImpactTableBilLevels(id, levels) {
  const { data } = await client.put(`/bil/impact-tables/${id}/bil-levels`, { levels });
  return data;
}

export async function updateImpactTableCiaLevels(id, levels) {
  const { data } = await client.put(`/bil/impact-tables/${id}/cia-levels`, { levels });
  return data;
}

export async function unpublishImpactTable(id) {
  const { data } = await client.post(`/bil/impact-tables/${id}/unpublish`);
  return data;
}

export async function deleteImpactTable(id) {
  const { data } = await client.delete(`/bil/impact-tables/${id}`);
  return data;
}

export async function publishImpactTable(tableId) {
  const { data } = await client.post(`/bil/impact-tables/${tableId}/publish`);
  return data;
}

export async function setImpactTableMandatory(tableId, mandatory) {
  const { data } = await client.patch(`/bil/impact-tables/${tableId}/mandatory`, { mandatory });
  return data;
}

// Dashboard layout (per-user UI preference)
export async function getDashboardLayout() {
  const { data } = await client.get('/users/me/dashboard-layout');
  return data.layout;
}

export async function putDashboardLayout(layout) {
  const { data } = await client.put('/users/me/dashboard-layout', { layout });
  return data.layout;
}

export async function getViewMode() {
  const { data } = await client.get('/users/me/view-mode');
  return data.view_mode;
}

export async function putViewMode(view_mode) {
  await client.put('/users/me/view-mode', { view_mode });
}

// Configurable-RBAC: the caller's resolved capability set for their active role,
// plus the org's department-isolation flag. Drives nav + route visibility.
export async function getMyCapabilities() {
  const { data } = await client.get('/users/me/capabilities');
  return data; // { role, department_id, department_isolation, capabilities: [{ key, scope }] }
}

// ── Admin RBAC configuration (admin.manage only) ─────────────────────────────
export async function getAdminRbac() {
  const { data } = await client.get('/admin/rbac');
  return data; // { roles, capabilities, matrix, sod_rules, department_isolation }
}

export async function putRolePermissions(role, grants) {
  const { data } = await client.put(`/admin/rbac/role-permissions/${role}`, { grants });
  return data;
}

export async function patchSodRule(key, enabled) {
  const { data } = await client.patch(`/admin/rbac/sod-rules/${encodeURIComponent(key)}`, { enabled });
  return data;
}

export async function patchDepartmentIsolation(enabled) {
  const { data } = await client.patch('/admin/rbac/department-isolation', { enabled });
  return data;
}

// Account management (admin.manage)
export async function createUser(payload) {
  const { data } = await client.post('/admin/users', payload);
  return data;
}
export async function resetUserPassword(userId, password) {
  const { data } = await client.post(`/admin/users/${userId}/reset-password`, { password });
  return data;
}
export async function resetUserTotp(userId) {
  const { data } = await client.post(`/admin/users/${userId}/reset-totp`);
  return data;
}

// Account → roles: grant/revoke an additional role on a user account.
export async function addUserRole(userId, role) {
  const { data } = await client.post(`/admin/users/${userId}/roles`, { role });
  return data; // { id, additional_roles }
}

export async function removeUserRole(userId, role) {
  const { data } = await client.delete(`/admin/users/${userId}/roles/${role}`);
  return data; // { id, additional_roles }
}

// Information Assets
// `mine` asks for the caller's OWN assets rather than everything they are
// permitted to see. The two differ whenever department isolation is off, and the
// dashboard's possessive widgets want the first (see routes/assets: ?mine=1).
export async function getAssets({ mine } = {}) {
  const { data } = await client.get('/assets', { params: mine ? { mine: 1 } : {} });
  return data;
}

export async function createAsset(body) {
  const { data } = await client.post('/assets', body);
  return data;
}

export async function getAsset(id) {
  const { data } = await client.get(`/assets/${id}`);
  return data;
}

export async function updateAsset(id, body) {
  await client.put(`/assets/${id}`, body);
}

export async function deactivateAsset(id) {
  await client.delete(`/assets/${id}`);
}

export async function rateAsset(assetId, ratings) {
  await client.put(`/assets/${assetId}/rate`, { ratings });
}

// linkAssetService / unlinkAssetService removed in v104: a service composes
// SYSTEMS, so an asset reaches a service by being placed in one of that
// service's systems. Use linkSystemInformationAsset.


// Impact tables already in use by the asset's services' other assets
// (Service → assets → impact tables), surfaced as suggestions.
export async function getSuggestedImpactTables(assetId) {
  const { data } = await client.get(`/assets/${assetId}/suggested-impact-tables`);
  return data;
}

// Link impact tables to an asset (rated_level = NULL → linked but unrated).
export async function linkAssetImpactTables(assetId, table_ids) {
  await client.post(`/assets/${assetId}/impact-tables`, { table_ids });
}

export async function unlinkAssetImpactTable(assetId, tableId) {
  await client.delete(`/assets/${assetId}/impact-tables/${tableId}`);
}

// Systems
export async function getSystems({ mine } = {}) {
  const { data } = await client.get('/systems', { params: mine ? { mine: 1 } : {} });
  return data;
}

export async function getSystem(id) {
  const { data } = await client.get(`/systems/${id}`);
  return data;
}

// ── System control posture (control-maturity model) ───────────────────────────
export async function getSystemControls(systemId) {
  const { data } = await client.get(`/systems/${systemId}/controls`);
  return data;
}
export async function addSystemControl(systemId, controlId, maturity) {
  await client.post(`/systems/${systemId}/controls`, {
    control_id: controlId,
    ...(maturity != null ? { maturity } : {}),
  });
}
export async function removeSystemControl(systemId, controlId) {
  await client.delete(`/systems/${systemId}/controls/${controlId}`);
}

export async function createSystem(body) {
  const { data } = await client.post('/systems', body);
  return data;
}

export async function updateSystem(id, body) {
  await client.put(`/systems/${id}`, body);
}

export async function deactivateSystem(id) {
  await client.delete(`/systems/${id}`);
}

export async function linkSystemComponent(systemId, component_id, role) {
  const { data } = await client.post(`/systems/${systemId}/components`, { component_id, role });
  return data;
}

export async function unlinkSystemComponent(systemId, componentId) {
  await client.delete(`/systems/${systemId}/components/${componentId}`);
}

export async function linkSystemInformationAsset(systemId, asset_id) {
  await client.post(`/systems/${systemId}/information-assets`, { asset_id });
}

export async function unlinkSystemInformationAsset(systemId, assetId) {
  await client.delete(`/systems/${systemId}/information-assets/${assetId}`);
}

export async function getAvailableInformationAssets(systemId) {
  const { data } = await client.get(`/systems/${systemId}/available-information-assets`);
  return data;
}

// Users list (for owner dropdowns)
export async function getUsers() {
  const { data } = await client.get('/users');
  return data;
}

export async function patchRiskTreatment(riskId, body) {
  const { data } = await client.patch(`/risks/${riskId}/treatment`, body);
  return data;
}

// Proposed security actions on a risk
export async function createRiskAction(riskId, body) {
  const { data } = await client.post(`/risks/${riskId}/actions`, body);
  return data;
}

// ── Gap-driven security actions (docs/security-actions.md) ──────────────────
// Candidate items derived from the risk's coverage gap (controls/components not
// operational), each with change_kind, default/library owner, and control target.
export async function getActionItemCandidates(riskId) {
  const { data } = await client.get(`/risks/${riskId}/action-items/candidates`);
  return data;
}
// Create one action from selected candidates. items: [{ element_type, control_id|
// component_id, owner_user_id?, comment?, target_p_c/i/a? }].
export async function createGapAction(riskId, body) {
  const { data } = await client.post(`/risks/${riskId}/actions/from-gap`, body);
  return data;
}
// The risk's gap-driven actions, each with its items.
export async function getRiskActions(riskId) {
  const { data } = await client.get(`/risks/${riskId}/actions`);
  return data;
}
// CISO accepts an action: freezes it + snapshots the current risk baseline.
export async function acceptAction(riskId, actionId) {
  const { data } = await client.post(`/risks/${riskId}/actions/${actionId}/accept`);
  return data;
}
// Complete one item incrementally: flips the element operational; for a control
// pass the confirmed residual { probability_c, probability_i, probability_a }.
export async function completeActionItem(riskId, itemId, body = {}) {
  const { data } = await client.post(`/risks/${riskId}/action-items/${itemId}/complete`, body);
  return data;
}
// Edit an item while the action is still proposed.
export async function updateActionItem(riskId, itemId, body) {
  const { data } = await client.patch(`/risks/${riskId}/action-items/${itemId}`, body);
  return data;
}
// ── Assurance findings (docs/assurance-findings.md) ──────────────────────────
// Assets not rated against every mandatory impact table (v134), each with the
// open action answering it, if any.
// kind: 'rating-incomplete' (assets, v134) | 'component-record' (systems, v138).
export async function getFindings(kind) {
  const { data } = await client.get(`/findings/${kind}`);
  return data;
}
export async function raiseFindingAction(kind, subjectId, body = {}) {
  const { data } = await client.post(`/findings/${kind}/${subjectId}/actions`, body);
  return data;
}
export async function acceptFinding(kind, subjectId, body) {
  const { data } = await client.post(`/findings/${kind}/${subjectId}/exceptions`, body);
  return data;
}
export const getRatingFindings = () => getFindings('rating-incomplete');
// Components implied on more than one system, and whether each is recorded as
// existing once for the organisation or per system (v137). Answer with
// updateComponent(id, { instantiation }).
export async function getComponentInstantiation() {
  const { data } = await client.get('/findings/component-instantiation');
  return data;
}
// Counts of the Statement of Applicability findings, by type (rows live on /soa).
export async function getSoaFindingSummary() {
  const { data } = await client.get('/findings/soa-summary');
  return data;
}
// Raise a proposed action against the finding on one asset.
// body: { owner_user_id?, target_date?, description? }
export const raiseRatingAction = (assetId, body = {}) => raiseFindingAction('rating-incomplete', assetId, body);
// Accept a finding until a date, for a reason (v136) — the alternative to acting.
// body: { justification, expires_at: 'YYYY-MM-DD', review_cadence, notes? }
export const acceptRatingFinding = (assetId, body) => acceptFinding('rating-incomplete', assetId, body);
export async function revokeFindingAcceptance(exceptionId, notes) {
  const { data } = await client.patch(`/findings/exceptions/${exceptionId}/revoke`, { notes });
  return data;
}
// Accept / complete an action that is NOT about a risk. A risk action is accepted
// on its risk (acceptAction) and completes item by item.
export async function acceptSubjectAction(actionId) {
  const { data } = await client.post(`/actions/${actionId}/accept`);
  return data;
}
export async function completeSubjectAction(actionId) {
  const { data } = await client.post(`/actions/${actionId}/complete`);
  return data;
}

// Org-wide roll-up of open items by library owner. mine=true → only my elements.
export async function getActionRollUp(mine = false) {
  const { data } = await client.get('/actions/roll-up', { params: mine ? { mine: 1 } : {} });
  return data;
}

export async function updateRiskAction(riskId, actionId, body) {
  await client.patch(`/risks/${riskId}/actions/${actionId}`, body);
}

export async function deleteRiskAction(riskId, actionId) {
  await client.delete(`/risks/${riskId}/actions/${actionId}`);
}

// Action attachments
export async function linkActionControl(riskId, actionId, body) {
  await client.post(`/risks/${riskId}/actions/${actionId}/controls`, body);
}
export async function unlinkActionControl(riskId, actionId, controlId) {
  await client.delete(`/risks/${riskId}/actions/${actionId}/controls/${controlId}`);
}
export async function linkActionComponent(riskId, actionId, body) {
  await client.post(`/risks/${riskId}/actions/${actionId}/components`, body);
}
export async function unlinkActionComponent(riskId, actionId, componentId) {
  await client.delete(`/risks/${riskId}/actions/${actionId}/components/${componentId}`);
}

// Risk exceptions
export async function getRiskExceptions(riskId) {
  const { data } = await client.get(`/risks/${riskId}/exceptions`);
  return data;
}
export async function createRiskException(riskId, body) {
  const { data } = await client.post(`/risks/${riskId}/exceptions`, body);
  return data;
}
export async function renewRiskException(riskId, exceptionId, body) {
  const { data } = await client.patch(`/risks/${riskId}/exceptions/${exceptionId}/renew`, body);
  return data;
}
export async function revokeRiskException(riskId, exceptionId, body) {
  const { data } = await client.patch(`/risks/${riskId}/exceptions/${exceptionId}/revoke`, body || {});
  return data;
}

// Cross-risk exception views
export async function getActiveExceptions(params = {}) {
  const { data } = await client.get('/exceptions/active', { params });
  return data;
}
export async function getExceptionStats(params = {}) {
  const { data } = await client.get('/exceptions/stats', { params });
  return data;
}
// Breach queue: exceptions auto-expired past their review date (v75).
export async function getEscalatedExceptions(params = {}) {
  const { data } = await client.get('/exceptions/escalated', { params });
  return data;
}

// Org setup→operational phase
export async function getOrgPhase() {
  const { data } = await client.get('/org/phase');
  return data;
}
export async function goOperational() {
  const { data } = await client.post('/org/go-operational');
  return data;
}

// Admin setup status
export async function getSetupStatus() {
  const { data } = await client.get('/admin/setup-status');
  return data;
}

// Admin user management
export async function getAdminUsers() {
  const { data } = await client.get('/admin/users');
  return data;
}
// Audit-log viewer. params: { entity_type, action, user, q, from, to, limit, offset }
export async function getAuditLog(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  );
  const { data } = await client.get('/admin/audit', { params: clean });
  return data;
}
export async function patchAdminUser(id, updates) {
  const { data } = await client.patch(`/admin/users/${id}`, updates);
  return data;
}

// Action lifecycle. Gap-driven actions move proposed -> planned (CISO accept,
// see acceptAction) -> completed, one ITEM at a time (completeActionItem); the
// old adopt/start/complete/verify chain is retired.
export async function getResidualHistory(riskId) {
  const { data } = await client.get(`/risks/${riskId}/residual-history`);
  return data;
}
export async function getAcceptanceQueue() {
  const { data } = await client.get('/actions/acceptance-queue');
  return data;
}
export async function getActionStats() {
  const { data } = await client.get('/actions/stats');
  return data;
}export async function getMeetings() {
  const { data } = await client.get('/meetings');
  return data;
}
export async function getMeeting(id) {
  const { data } = await client.get(`/meetings/${id}`);
  return data;
}
// SWG visibility for every authenticated role (issued minutes are the sealed record).
export async function getSwgSummary() {
  const { data } = await client.get('/meetings/swg-summary');
  return data;
}
export async function getPublishedMinutes(id) {
  const { data } = await client.get(`/meetings/${id}/published-minutes`);
  return data;
}
// Fetch the .ics through the authenticated client (token is in localStorage, not
// a cookie, so a plain href download would be unauthenticated). Returns a Blob.
export async function downloadMeetingIcal(id) {
  const { data } = await client.get(`/meetings/${id}/calendar.ics`, { responseType: 'blob' });
  return data;
}
// Admin data export (CSV/TSV/ZIP). Returns { blob, filename } where filename
// is taken from the server's Content-Disposition header so the ZIP gets its
// date-stamped name and individual files get the correct extension.
export async function downloadAdminExport(dataset, format = 'csv') {
  const { data, headers } = await client.get(`/admin/export/${dataset}`, {
    params: { format },
    responseType: 'blob',
  });
  const disposition = headers['content-disposition'] || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `${dataset}.${format}`;
  return { blob: data, filename };
}
export async function planMeeting(body) {
  const { data } = await client.post('/meetings', body);
  return data;
}
export async function patchMeeting(id, body) {
  const { data } = await client.patch(`/meetings/${id}`, body);
  return data;
}
export async function updateSectionTimeboxes(meetingId, sectionTimeboxes) {
  const { data } = await client.patch(`/meetings/${meetingId}/section-timeboxes`, { section_timeboxes: sectionTimeboxes });
  return data;
}
export async function getAvailableCycles() {
  const { data } = await client.get('/meetings/cycles/available');
  return data;
}
export async function getAvailableUsers() {
  const { data } = await client.get('/meetings/users/available');
  return data;
}
export async function addAttendee(meetingId, body) {
  const { data } = await client.post(`/meetings/${meetingId}/attendees`, body);
  return data;
}
export async function removeAttendee(meetingId, attendeeId) {
  await client.delete(`/meetings/${meetingId}/attendees/${attendeeId}`);
}
export async function patchAttendee(meetingId, attendeeId, body) {
  const { data } = await client.patch(`/meetings/${meetingId}/attendees/${attendeeId}`, body);
  return data;
}
export async function getAgenda(meetingId) {
  const { data } = await client.get(`/meetings/${meetingId}/agenda`);
  return data;
}
export async function generateAgenda(meetingId) {
  const { data } = await client.post(`/meetings/${meetingId}/agenda/generate`);
  return data;
}
export async function addAgendaItem(meetingId, body) {
  const { data } = await client.post(`/meetings/${meetingId}/agenda/items`, body);
  return data;
}
export async function updateAgendaItem(meetingId, itemId, body) {
  const { data } = await client.patch(`/meetings/${meetingId}/agenda/items/${itemId}`, body);
  return data;
}
export async function deleteAgendaItem(meetingId, itemId) {
  await client.delete(`/meetings/${meetingId}/agenda/items/${itemId}`);
}
export async function reorderAgendaItems(meetingId, items) {
  const { data } = await client.post(`/meetings/${meetingId}/agenda/reorder`, { items });
  return data;
}
export async function getMyInProgressActions() {
  const { data } = await client.get('/actions/my-inprogress');
  return data;
}

export async function getOrgInProgressActions() {
  const { data } = await client.get('/actions/org-inprogress');
  return data;
}
// Appends a progress note (0116) — it no longer overwrites a single field.
// `itemId` files it against one remediation item; omit it for a note about the
// action as a whole.
export async function updateActionProgress(actionId, progress_notes, itemId) {
  const { data } = await client.patch(`/actions/${actionId}/progress`, {
    progress_notes, ...(itemId ? { item_id: itemId } : {}),
  });
  return data;
}
export async function getMeetingPack(meetingId) {
  const { data } = await client.get(`/meetings/${meetingId}/pack`);
  return data;
}
export async function listAttachments(meetingId, agendaItemId) {
  const params = agendaItemId ? `?item_id=${agendaItemId}` : '';
  const { data } = await client.get(`/meetings/${meetingId}/attachments${params}`);
  return data;
}
export async function uploadAttachment(meetingId, formData) {
  const { data } = await client.post(`/meetings/${meetingId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
export async function downloadAttachment(meetingId, aid) {
  const { data } = await client.get(`/meetings/${meetingId}/attachments/${aid}/download`, {
    responseType: 'blob',
  });
  return data;
}
export async function deleteAttachment(meetingId, aid) {
  await client.delete(`/meetings/${meetingId}/attachments/${aid}`);
}
export async function recordDecision(meetingId, itemId, body) {
  const { data } = await client.post(`/meetings/${meetingId}/agenda/items/${itemId}/decision`, body);
  return data;
}
export async function assignPresenter(meetingId, attendeeId, agendaItemId) {
  const { data } = await client.patch(`/meetings/${meetingId}/attendees/${attendeeId}`, {
    presenting_agenda_item_id: agendaItemId || null,
  });
  return data;
}

export async function closeMeeting(meetingId, body) {
  const { data } = await client.post(`/meetings/${meetingId}/close`, body);
  return data;
}

export async function updateMinutes(meetingId, minutes_body) {
  const { data } = await client.patch(`/meetings/${meetingId}/minutes`, { minutes_body });
  return data;
}

export async function issueMinutes(meetingId) {
  const { data } = await client.post(`/meetings/${meetingId}/issue-minutes`);
  return data;
}

// ── Contextual help (in-app tooltips) ──────────────────────────────────────────
export async function getHelp(locale = 'en') {
  const { data } = await client.get('/help', { params: { locale } });
  return data;
}

export async function saveHelp(key, body) {
  // body: { title?, body, placement?, locale? } — empty body clears that locale's text.
  const { data } = await client.put(`/help/${encodeURIComponent(key)}`, body);
  return data;
}

export async function registerHelpKey(key, placement, page_hint) {
  const { data } = await client.post('/help/keys', { key, placement, page_hint });
  return data;
}

export async function getHelpCoverage() {
  const { data } = await client.get('/help/coverage');
  return data;
}

// ── Suppliers (v142): who they are, and what each relationship touches ─────────
export async function getSuppliers() {
  const { data } = await client.get('/suppliers');
  return data.suppliers || [];
}
export async function getSupplier(id) {
  const { data } = await client.get(`/suppliers/${id}`);
  return data;
}
export async function createSupplier(body) {
  const { data } = await client.post('/suppliers', body);
  return data;
}
export async function updateSupplier(id, body) {
  const { data } = await client.patch(`/suppliers/${id}`, body);
  return data;
}
export async function deleteSupplier(id) {
  await client.delete(`/suppliers/${id}`);
}
// { system_id } or { component_id }
export async function getSupplierRelationships(params) {
  const { data } = await client.get('/suppliers/relationships', { params });
  return data.relationships || [];
}
export async function createSupplierRelationship(supplierId, body) {
  const { data } = await client.post(`/suppliers/${supplierId}/relationships`, body);
  return data;
}
export async function updateSupplierRelationship(relationshipId, body) {
  const { data } = await client.patch(`/suppliers/relationships/${relationshipId}`, body);
  return data;
}
export async function deleteSupplierRelationship(relationshipId) {
  await client.delete(`/suppliers/relationships/${relationshipId}`);
}
// The control objectives each kind of relationship is expected to meet (v143).
export async function getSupplierObjectiveSets() {
  const { data } = await client.get('/suppliers/objectives');
  return data.sets;
}
export async function addSupplierObjective(appliesTo, controlId) {
  const { data } = await client.post('/suppliers/objectives', { applies_to: appliesTo, control_id: controlId });
  return data;
}
export async function removeSupplierObjective(appliesTo, controlId) {
  await client.delete(`/suppliers/objectives/${appliesTo}/${controlId}`);
}
// Assurance evidence (v144): a report or contract terms covering expected objectives.
export async function createSupplierEvidence(relationshipId, body) {
  const { data } = await client.post(`/suppliers/relationships/${relationshipId}/evidence`, body);
  return data;
}
export async function updateSupplierEvidence(evidenceId, body) {
  const { data } = await client.patch(`/suppliers/evidence/${evidenceId}`, body);
  return data;
}
export async function deleteSupplierEvidence(evidenceId) {
  await client.delete(`/suppliers/evidence/${evidenceId}`);
}

// ── Security solutions (v145 delivery patterns, shared since v147) ───────────
export async function getComponentRecordedOn(componentId) {
  const { data } = await client.get('/controls/solutions/recorded-on', { params: { component_id: componentId } });
  return data.systems;
}
export async function listSecuritySolutions() {
  const { data } = await client.get('/controls/solutions');
  return data.solutions;
}
// Choose CIRKS itself as this objective's security solution (lib/cirksDelivers.js).
export async function chooseCirksForControl(controlId) {
  const { data } = await client.post(`/controls/${controlId}/patterns/cirks`);
  return data.patterns;
}
export async function createDeliveryPattern(controlId, body) {
  const { data } = await client.post(`/controls/${controlId}/patterns`, body);
  return data.patterns;
}
export async function updateDeliveryPattern(controlId, patternId, body) {
  const { data } = await client.patch(`/controls/${controlId}/patterns/${patternId}`, body);
  return data.patterns;
}
export async function deleteDeliveryPattern(controlId, patternId) {
  const { data } = await client.delete(`/controls/${controlId}/patterns/${patternId}`);
  return data.patterns;
}
export async function addDeliveryPatternPart(controlId, patternId, body) {
  const { data } = await client.post(`/controls/${controlId}/patterns/${patternId}/parts`, body);
  return data.patterns;
}
export async function removeDeliveryPatternPart(controlId, patternId, partId) {
  const { data } = await client.delete(`/controls/${controlId}/patterns/${patternId}/parts/${partId}`);
  return data.patterns;
}

// One security solution from its own side (/security-solutions): every
// objective it delivers, its parts, and where it is in place.
export async function getSecuritySolution(id) {
  const { data } = await client.get(`/controls/solutions/${id}`);
  return data.solution;
}
export async function createSecuritySolution(body) {
  const { data } = await client.post('/controls/solutions', body);
  return data.solution;
}
export async function updateSecuritySolution(id, body) {
  const { data } = await client.patch(`/controls/solutions/${id}`, body);
  return data.solution;
}
export async function deleteSecuritySolution(id) {
  await client.delete(`/controls/solutions/${id}`);
}
export async function addSecuritySolutionObjective(id, controlId) {
  const { data } = await client.post(`/controls/solutions/${id}/objectives`, { control_id: controlId });
  return data.solution;
}
export async function removeSecuritySolutionObjective(id, controlId) {
  const { data } = await client.delete(`/controls/solutions/${id}/objectives/${controlId}`);
  return data.solution;
}
export async function addSecuritySolutionPart(id, body) {
  const { data } = await client.post(`/controls/solutions/${id}/parts`, body);
  return data.solution;
}
export async function removeSecuritySolutionPart(id, partId) {
  const { data } = await client.delete(`/controls/solutions/${id}/parts/${partId}`);
  return data.solution;
}

// ── The security architecture (v148) ─────────────────────────────────────────
// Rules, membership groups and builds: library work (controls.write).
export async function getArchitecture() {
  const { data } = await client.get('/architecture');
  return data;
}
// A system as the architecture sees it: the template groups it answers and the
// security solutions it wants, with their parts' state on this system.
export async function getSystemSecurity(systemId) {
  const { data } = await client.get(`/systems/${systemId}/security`);
  return data;
}
// Choose the security solution that delivers an objective on this system.
export async function chooseSystemSolution(systemId, controlId, pattern_id) {
  const { data } = await client.put(`/systems/${systemId}/solution-choices/${controlId}`, { pattern_id });
  return data;
}
// What adopting a system architecture pattern would add to the system.
export async function previewSystemBuild(systemId, buildId) {
  const { data } = await client.get(`/systems/${systemId}/builds/${buildId}/apply`);
  return data;
}
// Adopt it: copy its components on, in the state given (required).
export async function applySystemBuild(systemId, buildId, status) {
  const { data } = await client.post(`/systems/${systemId}/builds/${buildId}/apply`, { status });
  return data;
}
// kind: 'rules' | 'groups' | 'builds'
export async function createArchitectureItem(kind, body) {
  const { data } = await client.post(`/architecture/${kind}`, body);
  return data;
}
export async function updateArchitectureItem(kind, id, body) {
  const { data } = await client.patch(`/architecture/${kind}/${id}`, body);
  return data;
}
export async function deleteArchitectureItem(kind, id) {
  await client.delete(`/architecture/${kind}/${id}`);
}
// list: 'triggers' (rules, groups) | 'members' (groups) | 'components' (builds)
export async function addArchitectureComponent(kind, id, list, componentId) {
  await client.post(`/architecture/${kind}/${id}/${list}`, { component_id: componentId });
}
export async function removeArchitectureComponent(kind, id, list, componentId) {
  await client.delete(`/architecture/${kind}/${id}/${list}/${componentId}`);
}
