// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import { GLOSSARY } from '../utils/glossary';
import { HelpDot } from './HelpDot';

/**
 * Small `ⓘ` affordance that reveals a definition on hover, focus, or click.
 *
 * Usage:
 *   <InfoTip term="currentRisk" />            // pulls the glossary definition
 *   <InfoTip text="Free-form explanation" />  // ad-hoc, one-off hints
 *
 * InfoTip is now a thin adapter over <HelpDot>: a `term` maps to the help key
 * `glossary.<term>`, and the hard-coded GLOSSARY entry is the *fallback* shown
 * when no DB help has been authored. So existing tips keep working with zero DB
 * rows, but an admin in edit mode can now customise (or translate) any term in
 * place — a saved DB entry overrides the glossary default. The editor pre-fills
 * from the glossary so it's adopt-and-tweak, not retype.
 *
 * Ad-hoc `text` (no term) has no stable key, so it renders as a read-only tip.
 */
export function InfoTip({ term, text, label, className = '' }) {
  const entry = term ? GLOSSARY[term] : null;
  const fallback = entry
    ? { title: entry.term, body: entry.definition }
    : (text ? { body: text } : null);

  // Nothing to show and no editable key → render nothing.
  if (!fallback && !term) return null;

  const k    = term ? `glossary.${term}` : undefined;
  const aria = label ?? (entry ? `What does "${entry.term}" mean?` : 'More information');

  return <HelpDot k={k} fallback={fallback} label={aria} className={className} />;
}
