// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Draft help for table columns that mean the same thing wherever they appear.
// Reuse these keys (`col.*`) rather than writing a page-specific one, so a column
// reads identically on every table. Page files must not redefine them.
export default {
  'col.name':        { title: 'Name', body: 'What this record is called. Select the row to open it.' },
  'col.department':  { title: 'Department', body: 'The department that owns this record. Its Information Asset Owner is accountable for it, and its Information Asset Manager looks after it day to day.' },
  'col.status':      { title: 'Status', body: 'Where this record is in its lifecycle. The values a status can take are explained on the record’s own page.' },
  'col.impact':      { title: 'Impact', body: 'How much harm the business would suffer if this were compromised. It is derived from the information assets involved, never typed in. Business view shows a word; expert view shows the number (1–5).' },
  'col.confidentiality': { title: 'Confidentiality', body: 'The harm if the information were disclosed to someone who should not see it, rated 1–5.' },
  'col.integrity':   { title: 'Integrity', body: 'The harm if the information were altered or corrupted, rated 1–5.' },
  'col.availability':{ title: 'Availability', body: 'The harm if the information or service were unavailable when needed, rated 1–5.' },
  'col.probability': { title: 'Probability', body: 'How likely the threat is to succeed against this system, rated 1–5, taking account of the controls in place.' },
  'col.threat':      { title: 'Threat', body: 'Something that could harm a system, such as ransomware or a lost laptop. Threats come from the threat catalogue.' },
  'col.system':      { title: 'System', body: 'A system holds information assets and is made of components (people, process, information, technology, facilities). Risks are assessed against systems.' },
  'col.control':     { title: 'Control objective', body: 'A security job that needs doing, such as “multi-factor authentication for remote access”. It is met by a security solution.' },
  'col.reference':   { title: 'Reference', body: 'The identifier from the standard or catalogue this comes from, for example a NIST CSF code.' },
  'col.created':     { title: 'Created', body: 'When this record was first recorded.' },
  'col.role':        { title: 'Role', body: 'What the person does in CIRKS. A role decides what they can see and change.' },
  'col.email':       { title: 'Email', body: 'The address the person signs in with.' },
  'col.supplier':    { title: 'Supplier', body: 'An outside organisation the business relies on. Its relationships say what it supplies and to whom.' },
  'col.component':   { title: 'Component', body: 'A part of a system: a person or group, a process, a policy or document, a piece of technology, or a facility.' },
  'col.solution':    { title: 'Security solution', body: 'The way a control objective is delivered: the components that, working together, do the job.' },
};
