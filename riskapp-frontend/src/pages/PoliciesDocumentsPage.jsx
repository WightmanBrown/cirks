// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
import ComponentLibraryPage from './ComponentLibraryPage';

// Policies, standards and procedures that deliver control objectives — the
// `information` component type (ISO 27001 clause 7.5, "documented
// information"). Not information ASSETS, which are the business data a system
// holds and live under Business Architecture. Listed under Security Controls
// because a document belongs to the objectives it supports, not to a system.
export function PoliciesDocumentsPage() {
  return (
    <ComponentLibraryPage
      componentType="information" title="Policies & documents" singular="policy or document"
      supportsControls
      intro="The policies, standards and procedures your control objectives rely on — the documented information the ISMS runs on. Guidelines are advisory and do not deliver a control. These are not the information assets a system holds; those are under Business Architecture." />
  );
}
