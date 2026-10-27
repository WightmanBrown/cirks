// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getStandards, setStandardEnabled, importStandardControls,
  importControlMappings, importControls,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Shell } from '../components/Shell';
import { BackButton } from '../components/BackButton';
import { Spinner } from '../components/Spinner';
import { HelpDot } from '../components/HelpDot';
import { CapabilityGate } from '../components/CapabilityGate';
import styles from './ControlSetsSetupPage.module.css';

// The "select & import control sets" setup step (v87 Phase B). An org's controls are
// CIRKS-native; each standard (ISO/CIS/NIST) is a reference lens its controls map to.
// Here an admin enables standards and imports their reference catalogues + the
// crosswalk. Only NIST CSF 2.0 ships with bundled text (public domain); ISO and
// CIS ship none and are imported here under the organisation's own licence.
export function ControlSetsSetupPage() {
  const { hasCapability } = useAuth();
  const navigate = useNavigate();

  const [standards, setStandards] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [result, setResult]       = useState(null);   // { label, imported, skipped, errors }
  const [busy, setBusy]           = useState('');      // key of the in-flight upload

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await getStandards(); setStandards(d.standards); setError(''); }
    catch { setError('Could not load control sets.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!hasCapability('controls.import')) {
    return <CapabilityGate capability="controls.import" feature="import control sets" />;
  }

  async function runImport(key, label, fn, file) {
    if (!file) return;
    setBusy(key); setResult(null); setError('');
    try {
      const r = await fn(file);
      setResult({ label, ...r });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || `Import failed for ${label}.`);
    } finally {
      setBusy('');
    }
  }

  async function toggleEnabled(s) {
    try { await setStandardEnabled(s.id, !s.is_enabled); await load(); }
    catch { setError(`Could not update ${s.name}.`); }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <BackButton />
        <div className={styles.header}>
          <h1 className={styles.title}>
            Objectives &amp; standards<HelpDot k="setup.control_sets" placement="bottom" label="About objectives and standards" />
          </h1>
          <p className={styles.desc}>
            <strong>
              Loading a standard is a three-step process, each with its own button below:
              1 · import control objectives, 2 · upload the standard&apos;s requirements on its card,
              3 · import the mappings that say which control objectives meet which standard requirements.
            </strong>
          </p>
          <p className={styles.desc}>
            A <b>control objective</b> is a job to be done. The Control Library holds the ideal set:
            NIST CSF 2.0 ships as the default, and you can add your own. Tick one{' '}
            <em>applicable</em> in the Statement of Applicability to adopt it; you then build and
            rate the <b>control</b> that meets it — the components that together do the job.
            A <b>standard requirement</b> is a standard&apos;s own text, in its own numbering. You only
            need standards if you report against one: load it here and map its requirements to your
            control objectives. (ISO 27001 calls its requirements &ldquo;Annex A controls&rdquo;.)
          </p>
          <p className={styles.desc}>
            Only NIST CSF 2.0 ships with CIRKS — it is a public-domain US Government work. Every
            other standard you load yourself: ISO/IEC 27001 is copyrighted and CIS is licensed
            non-commercially, so import your own licensed copy of either.
          </p>
        </div>

        {error && <div className={styles.errorBanner} role="alert">{error}</div>}
        {result && (
          <div className={styles.resultBanner} role="status">
            <strong>{result.label}:</strong> imported {result.imported}, skipped {result.skipped}.
            {result.errors?.length > 0 && (
              <ul className={styles.errList}>
                {result.errors.slice(0, 8).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                {result.errors.length > 8 && <li>…and {result.errors.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        {loading ? (
          <div className={styles.loading}><Spinner /><span>Loading…</span></div>
        ) : (
          <>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>1 · Control objectives <HelpDot k="setup.step_objectives" placement="bottom" /></h2>
              <p className={styles.blockDesc}>
                Import control objectives into the library (columns: <code>title, control_type, description, is_baseline</code>,
                and optionally <code>reference_code</code> — your own reference, e.g. ORG-AC-01, for objectives mapped to no standard).
                The library is the ideal set; the Statement of Applicability decides which apply.
              </p>
              <UploadButton
                label="Import control objectives (CSV)"
                busy={busy === 'native'}
                onFile={(f) => runImport('native', 'Control objectives', importControls, f)}
              />
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>2 · Standards and their requirements <HelpDot k="setup.step_standards" placement="bottom" /></h2>
              <div className={styles.cards}>
                {standards.map((s) => (
                  <StandardCard
                    key={s.id}
                    s={s}
                    busy={busy === `ref-${s.id}`}
                    onToggle={() => toggleEnabled(s)}
                    onFile={(f) => runImport(`ref-${s.id}`, `${s.name} requirements`, (file) => importStandardControls(s.id, file), f)}
                    onOpenSoa={() => navigate(`/soa/${s.code}`)}
                  />
                ))}
              </div>
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>3 · Map control objectives to standard requirements <HelpDot k="setup.step_mappings" placement="bottom" /></h2>
              <p className={styles.blockDesc}>
                Import which control objectives meet which standard requirements, fully or partly
                (columns: <code>control_title, standard, standard_ref, coverage</code>).
              </p>
              <UploadButton
                label="Import mappings (CSV)"
                busy={busy === 'maps'}
                onFile={(f) => runImport('maps', 'Control mappings', importControlMappings, f)}
              />
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}

function StandardCard({ s, busy, onToggle, onFile, onOpenSoa }) {
  return (
    <div className={`${styles.card} ${s.is_enabled ? '' : styles.cardOff}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardName}>{s.name}{s.version ? ` ${s.version}` : ''} <HelpDot k="setup.standard_card" placement="bottom" /></span>
        <label className={styles.enableToggle} title="Show this standard as a view on the Statement of Applicability">
          <input type="checkbox" checked={s.is_enabled} onChange={onToggle} />
          {s.is_enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <div className={styles.cardMeta}>
        <span className={s.bundled ? styles.tagBundled : styles.tagImport}>{s.bundled ? 'bundled' : 'import'}</span>
        {s.license && <span className={styles.license} title={s.license}>{s.license}</span>}
      </div>
      <div className={styles.cardStats}>
        <span title="Requirements loaded for this standard"><b>{s.reference_count}</b> requirements</span>
        <span title="Requirements mapped to at least one control objective"><b>{s.mapped_count}</b> mapped</span>
        <span title="Requirements met, fully or partly, by an applicable control objective"><b>{s.applicable_count}</b> met</span>
      </div>
      <div className={styles.cardActions}>
        <UploadButton label="Upload requirements (CSV)" busy={busy} small onFile={onFile} />
        {s.reference_count > 0 && (
          <button className={styles.soaLink} onClick={onOpenSoa}>Open SoA →</button>
        )}
      </div>
    </div>
  );
}

function UploadButton({ label, busy, small, onFile }) {
  const ref = useRef(null);
  return (
    <>
      <button
        className={`${styles.uploadBtn} ${small ? styles.uploadBtnSmall : ''}`}
        disabled={busy}
        onClick={() => ref.current?.click()}
      >
        {busy ? 'Importing…' : `↑ ${label}`}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".csv,.tsv,.txt"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }}
      />
    </>
  );
}
