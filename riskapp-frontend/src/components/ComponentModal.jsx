// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { HelpDot } from './HelpDot';
import { useState, useEffect } from 'react';
import { createComponent, updateComponent, addComponentIp, removeComponentIp, getArchitecture, addArchitectureComponent } from '../api';
import { useAuth } from '../context/AuthContext';
import { COMPONENT_TYPE_OPTIONS, componentStatusOptions } from '../utils/componentTypes';
import { DateField } from './DateField';
import styles from '../pages/ComponentLibraryPage.module.css';
import own from './ComponentModal.module.css';

// Loose client-side IP/CIDR check — the backend (inet column) is authoritative.
function looksLikeInet(v) {
  const s = (v || '').trim();
  if (!s) return false;
  const parts = s.split('/');
  if (parts.length > 2) return false;
  const [addr, mask] = parts;
  if (mask !== undefined && !/^\d{1,3}$/.test(mask)) return false;
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(addr)) {
    return addr.split('.').every(o => Number(o) <= 255);
  }
  return addr.includes(':') && /^[0-9a-fA-F:]+$/.test(addr);
}

// THE one panel a component is created from (owner, 2026-10-09) — the library
// pages, a system's Components tab and a risk's coverage panel all open this, so
// the two questions that are expensive to leave blank are asked every time:
// does it exist once or on each system (v137), and does it answer one of the
// systems architecture template groups (v148). Also edits a component, from the
// library; the two questions are asked only at creation.
export function ComponentModal({ componentType = 'technology', singular, existing, defaultName = '', onClose, onSaved }) {
  const isEdit = !!existing;
  const { hasCapability } = useAuth();
  const canArchitect = hasCapability('architecture.write');
  const [name, setName]   = useState(existing?.name || defaultName);
  const [desc, setDesc]   = useState(existing?.description || '');
  const [status, setStatus] = useState(existing?.status || 'unknown');
  const [type, setType]   = useState(existing?.component_type || componentType);
  const [isHost, setIsHost]     = useState(existing?.is_host || false);
  const [hostname, setHostname] = useState(existing?.hostname || '');
  const [ips, setIps]           = useState(existing?.ip_addresses || []); // {id?, ip_address, label}
  const [ipDraft, setIpDraft]   = useState('');
  const [ipLabel, setIpLabel]   = useState('');
  // A new policy or document can be given its lifecycle as it is created (v139),
  // so it can be created Published — which needs a next review date (v141).
  // Edits go through the Document section on the component's own page.
  const [docKind, setDocKind]             = useState('');
  const [docVersion, setDocVersion]       = useState('');
  const [docApprovedOn, setDocApprovedOn] = useState('');
  const [docNextReview, setDocNextReview] = useState('');
  const [docUrl, setDocUrl]               = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  // The two questions. undefined = not answered yet; '' = answered "neither".
  const [scope, setScope]   = useState(undefined);   // 'organisational' | 'per_system' | '' (not sure yet)
  const [groupId, setGroupId] = useState(undefined); // a template group's id | '' (none of these)
  const [groups, setGroups] = useState(null);        // null = could not be read: the question is not asked

  useEffect(() => {
    if (isEdit) return;
    getArchitecture().then(a => setGroups(a.groups || [])).catch(() => setGroups(null));
  }, [isEdit]);

  const label = singular || 'component';
  // Documents answer no template group; and without the template there is nothing to ask.
  const askGroup = !isEdit && type !== 'information' && Array.isArray(groups) && groups.length > 0;
  // A group most of whose members are of this type is the likely home.
  const likely = (g) => g.members.length > 0 && g.members.filter(m => m.component_type === type).length * 2 > g.members.length;
  const answered = isEdit || (scope !== undefined && (!askGroup || groupId !== undefined));

  const originalIps = existing?.ip_addresses || [];
  const canBeHost   = type === 'technology';

  function addIpToList() {
    const v = ipDraft.trim();
    if (!looksLikeInet(v)) { setError('Enter a valid IPv4/IPv6 address or CIDR range.'); return; }
    if (ips.some(i => i.ip_address === v)) { setError('That IP is already listed.'); return; }
    setError('');
    setIps([...ips, { ip_address: v, label: ipLabel.trim() || null }]);
    setIpDraft(''); setIpLabel('');
  }

  function removeIpFromList(target) {
    setIps(ips.filter(i => i !== target));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const hostFields = canBeHost
        ? { is_host: isHost, hostname: isHost ? (hostname.trim() || null) : null }
        : { is_host: false, hostname: null };

      const isNewDoc = !isEdit && type === 'information';
      const docFields = isNewDoc ? {
        document_kind: docKind || undefined, document_version: docVersion.trim() || undefined,
        document_approved_on: docApprovedOn || undefined, document_next_review: docNextReview || undefined,
        document_url: docUrl.trim() || undefined,
      } : {};
      const body = { component_type: type, name: name.trim(), description: desc.trim() || undefined, status, ...hostFields, ...docFields };
      const saved = isEdit ? await updateComponent(existing.id, body) : await createComponent(body);
      const compId = isEdit ? existing.id : saved.id;
      if (!isEdit) {
        if (scope) { await updateComponent(compId, { instantiation: scope }); saved.instantiation = scope; }
        if (groupId) await addArchitectureComponent('groups', groupId, 'members', compId);
      }

      // Reconcile IPs. If the component is (still) a host, add the new ones and
      // remove any the user deleted. If it's no longer a host, drop all its IPs.
      const keepHost = canBeHost && isHost;
      const keptIds  = new Set(ips.filter(i => i.id).map(i => i.id));
      const toRemove = keepHost ? originalIps.filter(o => !keptIds.has(o.id)) : originalIps;
      const toAdd    = keepHost ? ips.filter(i => !i.id) : [];

      await Promise.all([
        ...toRemove.map(o => removeComponentIp(compId, o.id)),
        ...toAdd.map(i => addComponentIp(compId, { ip_address: i.ip_address, label: i.label || undefined })),
      ]);

      onSaved(saved);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${isEdit ? 'save' : 'create'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{isEdit ? `Edit ${label}` : `New ${label}`} <HelpDot k="component_modal.title" placement="bottom" /></h2>
        <form onSubmit={handleSubmit}>
          <label className={styles.fieldLabel}>
            Name
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </label>
          <label className={styles.fieldLabel}>
            Description
            <textarea className={styles.textarea} value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
          </label>
          <label className={styles.fieldLabel}>
            Type
            <select className={styles.select} value={type} onChange={e => setType(e.target.value)}>
              {COMPONENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Status
            <select className={styles.select} value={status} onChange={e => setStatus(e.target.value)}>
              {componentStatusOptions(type).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          {type === 'information' && !isEdit && (
            <div className={styles.docFields}>
              <label className={styles.fieldLabel}>
                Kind
                <select className={styles.select} value={docKind} onChange={e => setDocKind(e.target.value)}>
                  <option value="">not stated</option>
                  <option value="policy">Policy</option>
                  <option value="standard">Standard</option>
                  <option value="procedure">Procedure</option>
                  <option value="guideline">Guideline (advisory — delivers no control)</option>
                </select>
              </label>
              <label className={styles.fieldLabel}>
                Version
                <input className={styles.input} value={docVersion} onChange={e => setDocVersion(e.target.value)} placeholder="e.g. 1.0" />
              </label>
              <label className={styles.fieldLabel}>
                Approved / published on
                <DateField className={styles.input} value={docApprovedOn} onChange={e => setDocApprovedOn(e.target.value)} />
              </label>
              <label className={styles.fieldLabel}>
                Next review
                <DateField className={styles.input} value={docNextReview} onChange={e => setDocNextReview(e.target.value)} />
              </label>
              <label className={`${styles.fieldLabel} ${styles.docWide}`}>
                Where it lives (link)
                <input className={styles.input} type="url" value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://…" />
              </label>
              {status === 'operational' && !docNextReview && (
                <p className={`${styles.docHint} ${styles.docWide}`}>A published document must have a next review date.</p>
              )}
              <p className={`${styles.docHint} ${styles.docWide}`}>Owner and approver can be set on the document&rsquo;s page once it is created.</p>
            </div>
          )}

          {/* Host network identity — only technology components can be hosts. */}
          {canBeHost && (
            <div className={styles.hostSection}>
              <label className={styles.hostToggle}>
                <input type="checkbox" checked={isHost} onChange={e => setIsHost(e.target.checked)} />
                <span>This technology component is a <strong>host</strong> (has a network address)</span>
              </label>

              {isHost && (
                <>
                  <label className={styles.fieldLabel}>
                    Hostname / FQDN
                    <input
                      className={styles.input}
                      value={hostname}
                      onChange={e => setHostname(e.target.value)}
                      placeholder="dc01.corp.local"
                    />
                  </label>

                  <div className={styles.fieldLabel}>
                    IP addresses
                    <div className={styles.ipList}>
                      {ips.length === 0 && <span className={styles.muted}>No IP addresses yet.</span>}
                      {ips.map((ip, idx) => (
                        <div key={ip.id || `new-${idx}`} className={styles.ipRow}>
                          <span className={styles.ipAddr}>{ip.ip_address}</span>
                          {ip.label && <span className={styles.ipLabel}>{ip.label}</span>}
                          <button type="button" className={styles.ipRemove} onClick={() => removeIpFromList(ip)} aria-label="Remove IP">×</button>
                        </div>
                      ))}
                    </div>
                    <div className={styles.ipAddRow}>
                      <input
                        className={styles.input}
                        value={ipDraft}
                        onChange={e => setIpDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIpToList(); } }}
                        placeholder="10.0.4.12 or 10.0.4.0/24"
                      />
                      <input
                        className={styles.input}
                        value={ipLabel}
                        onChange={e => setIpLabel(e.target.value)}
                        placeholder="label (eth0)"
                        style={{ maxWidth: 120 }}
                      />
                      <button type="button" className={styles.btnSecondary} onClick={addIpToList}>Add IP</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {!isEdit && (
            <div className={own.placement}>
              <div className={own.question}>
                <span>Does it exist once, or on each system?</span>
                <div className={own.options}>
                  <button type="button" className={own.option} aria-pressed={scope === 'organisational'} onClick={() => setScope('organisational')}>
                    Once for the organisation
                    <small>One network, one team, one policy. Its state is set once and every system relying on it shares it.</small>
                  </button>
                  <button type="button" className={own.option} aria-pressed={scope === 'per_system'} onClick={() => setScope('per_system')}>
                    Once per system
                    <small>An agent, an operating system, a setting. Each system records its own, with its own state.</small>
                  </button>
                </div>
                <button type="button" className={own.linkBtn} aria-pressed={scope === ''} onClick={() => setScope('')}>Not sure yet</button>
                {scope === 'organisational' && <p className={own.say}><b>{name.trim() || 'It'}</b> exists once. In a security solution it can be placed once for the organisation, or on a security system.</p>}
                {scope === 'per_system' && <p className={own.say}><b>{name.trim() || 'It'}</b> is recorded on each system that has it. In a security solution that means <b>every system relying on the solution must record its own</b>.</p>}
                {scope === '' && <p className={own.warn}>Left unstated. It cannot be used in a security solution until someone answers this on the component&rsquo;s page.</p>}
              </div>

              {askGroup && (
                <div className={own.question}>
                  <span>Does it answer one of the systems architecture template groups?</span>
                  <div className={own.options}>
                    {groups.map(g => (
                      <button type="button" key={g.id} className={own.chip} aria-pressed={groupId === g.id} disabled={!canArchitect}
                        onClick={() => setGroupId(g.id)}>
                        {g.name}{likely(g) && <em> · likely</em>}
                      </button>
                    ))}
                    <button type="button" className={own.chip} aria-pressed={groupId === ''} onClick={() => setGroupId('')}>None of these</button>
                  </div>
                  <p className={own.hint}>
                    Every system should record one component from each group: a network answers Connectivity, an operating
                    system answers Operating system.
                    {!canArchitect && ' Adding a component to a group needs the architecture permission; if it belongs in one, ask an architect.'}
                  </p>
                  {groupId && <p className={own.say}><b>{name.trim() || 'It'}</b> becomes an allowed answer for <b>{groups.find(g => g.id === groupId)?.name}</b> on every system.</p>}
                  {groupId === '' && <p className={own.say}>It answers no template group. That is normal for software, agents, processes and documents.</p>}
                  {groupId === undefined && <p className={own.warn}>If it is a network, a host, an operating system, a sign-in, a team or a user group and this is skipped, a system that records it will still show that group as blank.</p>}
                </div>
              )}
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving || !answered} className={styles.btnPrimary}
              title={answered ? undefined : 'Answer the questions above first'}>
              {saving ? 'Saving…' : (isEdit ? 'Save changes' : `Create ${label}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Inline summary card shown when a row is expanded.
