// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useEffect, useMemo, useState } from 'react';
import { getComponentRecordedOn, updateComponent } from '../api';
import { COMPONENT_TYPE_LABEL } from '../utils/componentTypes';
import { partLocationsFor } from '../utils/deliveryPatterns';
import styles from './DeliveryPatternsSection.module.css';

// Adding a part: the component's scope decides where it can be (v137), and a
// part on a security system can only go where the component is recorded — its
// state is read from that record (v145).
export function SolutionPartForm({ pattern: p, components, sharedWarning = '', confirmShared = () => true, onScopeStated, run, setError, onAdd }) {
  const [componentId, setComponentId] = useState('');
  const [location, setLocation] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [recordedOn, setRecordedOn] = useState(null);
  const [elsewhere, setElsewhere] = useState([]);
  const sorted = useMemo(() => [...(components || [])].sort((a, b) =>
    a.component_type.localeCompare(b.component_type) || a.name.localeCompare(b.name)), [components]);
  const comp = sorted.find(c => c.id === componentId) || null;
  const allowed = comp ? partLocationsFor(comp) : null;

  // One allowed place (a per-system component): it is chosen, not asked.
  useEffect(() => {
    setServiceId(''); setRecordedOn(null);
    setLocation(allowed?.length === 1 ? allowed[0].value : '');
  }, [componentId, comp?.instantiation]); // eslint-disable-line react-hooks/exhaustive-deps -- reset per component

  useEffect(() => {
    if (location !== 'service' || !componentId) return;
    let live = true;
    getComponentRecordedOn(componentId).then(all => {
      if (!live) return;
      // v155: a part can be placed only on a system recorded as a security
      // system. Where it is recorded on other systems, say so rather than list them.
      const list = all.filter(s => s.is_security_system);
      setElsewhere(all.filter(s => !s.is_security_system));
      setRecordedOn(list);
      if (list.length === 1) setServiceId(list[0].id);
    }).catch(() => live && setRecordedOn([]));
    return () => { live = false; };
  }, [location, componentId]);

  const stateScope = async (instantiation) => {
    setError('');
    try { await updateComponent(componentId, { instantiation }); await onScopeStated(); }
    catch (err) { setError(err?.response?.data?.error || 'The scope was not saved.'); }
  };

  const ready = componentId && location && (location !== 'service' || serviceId);
  return (
    <form className={styles.partForm} onSubmit={(e) => {
      e.preventDefault();
      if (!confirmShared(`Add "${comp?.name}" to "${p.name}"?`)) return;
      run(async () => {
        const r = await onAdd({ component_id: componentId, location, service_system_id: serviceId || undefined });
        setComponentId('');
        return r;
      });
    }}>
      <select value={componentId} onChange={e => setComponentId(e.target.value)} aria-label={`Part to add to ${p.name}`}>
        <option value="">Add a part…</option>
        {sorted.map(c => <option key={c.id} value={c.id}>{COMPONENT_TYPE_LABEL[c.component_type]}: {c.name}</option>)}
      </select>

      {comp && !allowed && (
        <div className={styles.scopeAsk}>
          <span>Does <b>{comp.name}</b> exist once for the organisation, or once per system? That decides where it can be.</span>
          <button type="button" className={styles.secondary} onClick={() => stateScope('organisational')}>Once for the organisation</button>
          <button type="button" className={styles.secondary} onClick={() => stateScope('per_system')}>Once per system</button>
        </div>
      )}

      {comp && allowed?.length === 1 && (
        <span className={styles.where} title={allowed[0].hint}>
          {allowed[0].label} — {comp.name} exists once per system
        </span>
      )}

      {comp && allowed?.length > 1 && (
        <select value={location} onChange={e => setLocation(e.target.value)} aria-label="Where the part must be">
          <option value="">Where must it be?</option>
          {allowed.map(l => <option key={l.value} value={l.value} title={l.hint}>{l.label}</option>)}
        </select>
      )}

      {location === 'service' && recordedOn && recordedOn.length > 0 && (
        <select value={serviceId} onChange={e => setServiceId(e.target.value)} aria-label="Security system">
          {recordedOn.length > 1 && <option value="">Which security system?</option>}
          {recordedOn.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {location === 'service' && recordedOn && recordedOn.length === 0 && (
        <span className={styles.warn}>
          {elsewhere.length > 0
            ? `${comp?.name} is recorded on ${elsewhere.map(s => s.name).join(', ')}, which ${elsewhere.length === 1 ? 'is' : 'are'} not recorded as a security system. Tick "Security system" on that system's Details tab, then add it here.`
            : `${comp?.name} is not recorded on any system yet. Record it on the security system that runs it, then add it here.`}
        </span>
      )}

      <button className={styles.primary} type="submit" disabled={!ready}
        title={sharedWarning || undefined}>
        {sharedWarning ? `Add part — changes it for all ${(p.objectives || []).length} objectives` : 'Add part'}
      </button>
    </form>
  );
}
