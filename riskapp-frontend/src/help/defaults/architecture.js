// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Draft help text — see index.js. Business architecture: systems, information
// assets, business services, components, departments and suppliers.
export default {
  // ComponentLibraryPage (People groups, Processes, Technology, Facilities, Policies & documents)
  'people_groups.title': { title: 'People groups', body: 'The people component catalogue: teams and groups of staff that systems and security solutions rely on, such as IT administrators or developers. One shared catalogue for the organisation, with no owning department.' },
  'processes.title': { title: 'Processes', body: 'The process component catalogue: the ways of working that systems and security solutions rely on, such as joiners and leavers or patch management. One shared catalogue for the organisation.' },
  'technology.title': { title: 'Technology components', body: 'The technology component catalogue: software, hardware and services that systems are built from and security solutions use. A component marked as a host carries the hostnames and IP addresses SOC enrichment looks up.' },
  'facilities.title': { title: 'Facilities', body: 'The facility component catalogue: buildings, rooms and sites that systems depend on. One shared catalogue for the organisation, with no owning department.' },
  'policies.title': { title: 'Policies & documents', body: 'The policies, standards and procedures your control objectives rely on (ISO 27001 clause 7.5). They are components of type information. Guidelines are advisory and deliver no control. These are not information assets, which are the business data a system holds.' },
  'components.col.status': { title: 'Status', body: 'The component’s state in the catalogue: operational, degraded, planned, decommissioned or unknown. A policy or document reads Published, Under review or Not published; one past its review date reads Under review and is marked overdue.' },
  'components.col.linked_systems': { title: 'Linked systems', body: 'How many systems the component is on. A component that exists once for the organisation reads “organisation wide”: it is counted on every system that relies on it, not copied onto each.' },
  'components.col.vulnerable': { title: 'Vulnerable', body: 'How many active risks an analyst has named this component on as a reason the threat succeeds. Blank when none has.' },
  'components.col.risk_score': { title: 'Risk score', body: 'The worst score among the active risks that name this component as a vulnerability. It is not the worst risk on the systems the component sits on.' },
  'policies.col.supports': { title: 'Supports', body: 'The control objectives this document helps deliver, by reference. “none” means no objective relies on it yet.' },
  'policies.col.kind': { title: 'Kind', body: 'Policy, standard, procedure or guideline. A guideline is advisory: nobody is bound by it, so it cannot deliver a control objective.' },
  'policies.col.next_review': { title: 'Next review', body: 'When the document is next due for review. Once the date passes it reads Under review and appears as a finding until it is reviewed. A published document must have one.' },

  // Shared columns on the Systems, Information assets and Business services lists
  'architecture.col.owner_iao': { title: 'Owner (IAO)', body: 'The information asset owner assigned to this record: the person accountable for it. A dash means nobody is assigned; a dot after the name means they sit in a different department from the one that owns the record.' },
  'architecture.col.manager_iam': { title: 'Manager (IAM)', body: 'The information asset manager assigned to this record, who looks after it day to day. A dash means nobody is assigned; a dot after the name means they sit in a different department from the one that owns the record.' },

  // SystemsPage
  'systems.title': { title: 'Systems', body: 'The systems the organisation runs. A system holds information assets and is made of components; threats and risks are assessed against systems. Its impact is derived from the information assets it holds. Select a row to see its summary.' },
  'systems.col.risk': { title: 'Risk', body: 'The band of the highest-scoring active risk on this system. A dash means no active risk has been assessed on it.' },

  // InformationAssetsPage
  'information_assets.title': { title: 'Information assets', body: 'The business information the organisation holds and must protect, such as patient records. Each is owned by an information asset owner and rated against the impact tables; those ratings drive the impact of every system that holds it.' },
  'assets.col.impact': { title: 'Impact', body: 'The worst harm if this asset were compromised, from its ratings against the impact tables. Business view shows a word; expert view shows confidentiality, integrity and availability as numbers (1–5). An asset missing a mandatory table is marked, as its impact may be understated.' },
  'assets.col.risk': { title: 'Risk', body: 'The band of the highest-scoring active risk on any system that holds this asset. A dash means none.' },

  // BusinessServicesPage
  'pages.business_services': { title: 'Business services', body: 'What the business delivers, such as payroll or online booking. A service is made of systems; its impact is derived from the information assets its own department holds in those systems and is never rated directly. A shared service can be adopted by other departments.' },
  'services.col.risk': { title: 'Risk', body: 'The band of the highest-scoring active risk on any of the service’s systems. A dash means none.' },
  'services.new_modal': { title: 'New business service', body: 'Name the service and say what it is. It belongs to your department. Tick shared if other departments may adopt it. Add its systems afterwards on the service’s page; its impact follows from them.' },

  // Summary cards (lists and detail pages)
  'system_card.title': { title: 'System', body: 'A system’s summary: owning department, owner, its impact and its highest risk. Impact is derived from the information assets it holds; expert view shows each asset’s contribution to confidentiality, integrity and availability.' },
  'system_card.risk_path': { title: 'Highest risk path', body: 'The chain to this system’s highest-scoring active risk: the system, the threat, and the risk’s band. “+N more” counts its other active risks.' },
  'asset_card.title': { title: 'Information asset', body: 'An information asset’s summary: owning department, its information asset owner (IAO) and manager (IAM), and its impact from the ratings against the impact tables. Business view shows one word for the worst dimension; expert view shows C, I and A.' },
  'service_card.title': { title: 'Business service', body: 'A business service’s summary: its department, whether it is shared or adopted, and its impact. The impact is derived from the information assets its department holds in the service’s systems; it is never rated directly.' },
  'service_card.risk_path': { title: 'Highest risk path', body: 'The chain to the highest-scoring active risk on any of this service’s systems: the information asset, the system, the threat and the risk’s band.' },

  // RiskPathTree (shared columns)
  'risk_tree.col.information_asset': { title: 'Information asset', body: 'The information asset the risk reaches: one held on the system the threat attacks.' },
  'risk_tree.col.risk': { title: 'Risk', body: 'The active risk’s current score. Business view shows its band (Low to Catastrophic); expert view shows the score, 1–25. Select it to open the risk.' },

  // SystemDetailPage
  'system_detail.risks': { title: 'Risks on this system', body: 'Every active risk assessed against this system, one per threat, worst first. Each score is impact (from the system’s information assets) combined with probability (from the controls in place). Select a risk to open it.' },
  'system_detail.architecture_components': { title: 'Architecture components', body: 'What this system is made of: people, processes, policies and documents, technology and facilities. Recording a component can trigger a security solution, and so imply control objectives. Where a component belongs to a system architecture pattern, the whole pattern is offered.' },
  'system_detail.template': { title: 'Systems architecture template', body: 'The groups every system is expected to answer, such as its network zone or identity provider. Pick the component from each group that this system has. A group left unanswered is a gap in the system’s record and is reported as a finding.' },
  'system_detail.recorded_components': { title: 'Recorded on this system', body: 'The components on this system’s record, with their state. “This system” lists those that exist on it alone; “Organisation-wide” lists those it relies on that exist once for the organisation or on a security system, whose state is set where they live.' },
  'system_detail.security': { title: 'Security', body: 'The security solutions that this system’s recorded components trigger. Each is drawn as its ideal set of parts with this system’s record laid over it; any part not in place is a gap. The solutions decide which control objectives are implied here.' },
  'system_detail.expected_components': { title: 'Expected here but not recorded', body: 'Parts that a control objective on this system needs, from the security solution in use, which the system’s record does not mention. Record each as working, degraded or genuinely missing. Until then the system’s record is incomplete.' },
  'system_detail.implied_objectives': { title: 'Implied but not recorded', body: 'Control objectives that this system’s own security solutions deliver, but which have no row on the system yet. Until recorded they count on none of its risks. Recording sets each to its solution’s state: operational if complete, degraded if a part is degraded, otherwise missing.' },

  // SystemSecuritySolutions (list view)
  'system_security.col.part': { title: 'Part of the solution', body: 'A component the security solution needs in order to work.' },
  'system_security.col.where': { title: 'Where', body: 'Where the part must be: on this system, on a named security system that protects others, or once for the organisation.' },
  'system_security.col.state': { title: 'State', body: 'The part’s state as recorded: in place, degraded, missing, state unknown, or not recorded. Anything but in place is a gap in the solution.' },

  // SystemPatternAdoption
  'pattern_adoption.title': { title: 'Adopt a system architecture pattern', body: 'A system architecture pattern is a named set of components that systems of a kind share. Adopting it copies the whole set onto this system in one step, with the state you choose. It is a copy: changing the pattern later does not change this system.' },
  'pattern_adoption.col.type': { title: 'Type', body: 'The kind of component: people, process, policy or document, technology, or facility.' },
  'pattern_adoption.col.on_system': { title: 'On this system', body: 'Whether the component is already recorded here, is being added now, or would be added by adopting the pattern.' },

  // FindingBanner
  'finding_banner.component_record': { title: 'Record incomplete', body: 'A finding: this system’s record is missing something the security architecture needs to know, such as a component its controls rely on or an unanswered template group. Record it, raise an action, or accept the finding until a date with a reason. It clears by itself once the record is complete.' },
  'finding_banner.rating_incomplete': { title: 'Not fully rated', body: 'A finding: this asset has not been rated against every mandatory impact table, so its impact, and every risk on the systems holding it, may be understated. Rate it, raise an action, or accept the finding until a date with a reason.' },
  'finding_banner.document_review': { title: 'Overdue for review', body: 'A finding: this published document is past its review date, or has none. Until reviewed it reads as Under review on every system that relies on it. Record the next review date to close it, or raise an action, or accept it until a date.' },

  // SystemCreateWizard
  'system_wizard.title': { title: 'New system', body: 'Creates a system in five steps: what it is, which system architecture pattern it is built like (or by hand), its answers to the template, anything special, and a review of the security solutions its record implies. Nothing is created until the last step.' },
  'system_wizard.step.what': { title: 'What it is', body: 'Its name, description, owning department and owner (suggested: the department’s information asset owner), whether other departments may share it, and whether it is a security system that protects other systems.' },
  'system_wizard.step.built_like': { title: 'What it is built like', body: 'Choose a system architecture pattern if one fits: it records the usual components in one step and keeps systems of the same kind alike. Otherwise build this one by hand.' },
  'system_wizard.step.answers': { title: 'Its answers', body: 'One component from each group of the systems architecture template, such as its network zone. A pattern answers most of them. A group left blank shows the system’s record as incomplete until it is answered.' },
  'system_wizard.step.special': { title: 'Anything special', body: 'Components this system has beyond the pattern or the template answers: special software, a device, a team. Then choose the state they are all recorded in; there is no default.' },
  'system_wizard.step.review': { title: 'Review', body: 'What will be recorded, and the security solutions the components will imply. Each implied solution brings its control objectives onto the system in the state its parts are in.' },
  'system_wizard.nothing_fits': { title: 'Nothing fits?', body: 'If more systems like this will follow, make a system architecture pattern first (needs the architecture permission). For a one-off, build it by hand; you can save it as a pattern at the end.' },
  'system_wizard.implies': { title: 'What this record implies', body: 'The security solutions whose trigger components are among those being recorded, and which component triggers each. They decide which control objectives the system will be expected to meet.' },

  // InformationAssetDetailPage
  'asset_new.title': { title: 'New information asset', body: 'Record a piece of business information the organisation must protect: its name, owning department, owner (IAO) and manager (IAM). Rate it against its impact tables on the next screen; until then it has no impact.' },
  'asset_detail.risks': { title: 'Risks to this information asset', body: 'The active risks on every system that holds this asset, grouped by system and worst first. The asset’s rating feeds the impact of each. Open a system to see its risks.' },
  'asset_detail.impact_tables': { title: 'Impact tables', body: 'The impact tables this asset is rated against. Each table describes, in the business’s own words, what each level of harm looks like. The asset’s impact is the highest rating across its tables, dimension by dimension.' },
  'asset_detail.required_tables': { title: 'Required tables not yet applied', body: 'Impact tables marked mandatory apply to every information asset. Leaving one out can only understate this asset’s impact, and so every risk on the systems that hold it. Add them, then rate the asset against each.' },
  'asset_detail.applied_tables': { title: 'Applied to this asset', body: 'The tables this asset is linked to, and whether each has been rated. A required table that is applied but not rated still leaves the asset not fully rated.' },
  'asset_detail.suggested_tables': { title: 'Suggested tables', body: 'Impact tables that other information assets on the same systems are rated against, but this one is not. A quick way to rate like assets alike.' },
  'asset_detail.add_tables': { title: 'Add a table', body: 'Any other published impact table from your department or the whole organisation that applies to this asset.' },
  'asset_detail.bil_1d': { title: '1dBIL: overall business impact', body: 'One business impact level (BIL 1–5) for this table, chosen from its statements. In business view this one level sets confidentiality, integrity and availability alike. Expert view rates each separately (3dBIL); a dimension left unset takes this level.' },
  'asset_detail.col.service': { title: 'Service', body: 'A business service this asset is part of. The link is derived: the asset sits in one of the service’s systems. To change it, change which systems hold the asset or which systems make up the service.' },

  // BusinessServiceDetailPage
  'service_detail.risks': { title: 'Risks to this service', body: 'The active risks on the systems that deliver this service, grouped by system and worst first. A service has no risks of its own: they are the risks of its systems.' },
  'service_detail.transfer': { title: 'Transfer to another department', body: 'Moves the service to another department, which then owns it. Departments that have adopted it keep their adoption. The change is recorded in the audit log.' },
  'service_detail.owner_department': { title: 'Owner department', body: 'The department that owns this service and answers for it.' },
  'service_detail.impact_tables_count': { title: 'Impact tables', body: 'How many impact tables this service’s information assets are rated against. The service is never rated itself, so these come from its assets.' },
  'service_detail.impact_source': { title: 'Impact source', body: 'Where the service’s impact comes from: always the information assets its own department holds in the service’s systems. With none rated, the service has no impact to report.' },
  'service_detail.systems': { title: 'Systems delivering this service', body: 'The systems that make up the service. Its impact and its risks follow from them. Select a system to open it.' },
  'service_detail.link_system': { title: 'Link a system', body: 'Add a system to this service. Systems holding your department’s information contribute impact and probability; systems you only depend on contribute probability only.' },
  'service_detail.col.stake': { title: 'Your stake', body: 'How many of this department’s information assets the system holds, and the highest business impact level (BIL) among them. “Dependency only” means the service relies on the system but your department holds no information in it.' },
  'service_detail.col.worst_risk': { title: 'Worst risk', body: 'The highest-scoring active risk on the system. Business view shows the band; expert view shows the score, 1–25.' },
  'service_detail.information': { title: 'Information this service touches', body: 'Derived, not chosen: your department’s information assets held in the service’s systems. The service’s impact is calculated from these. To change it, change which systems hold the assets or make up the service.' },
  'service_detail.col.max_impact': { title: 'Max impact', body: 'The asset’s worst rating across confidentiality, integrity and availability, as a word. Switch to expert view for the three numbers.' },
  'service_detail.untreated': { title: 'Risks with nothing planned', body: 'Active risks on the service’s systems with no security action proposed, planned or in progress. A completed action does not count: if the risk is still here, nothing is being done about it now.' },
  'service_detail.col.untreated_risk': { title: 'Risk', body: 'The risk’s current score. Business view shows the band; expert view shows the score, 1–25.' },
  'service_detail.actions': { title: 'Security actions', body: 'Security actions against any risk on the service’s systems, whatever their status, earliest target first.' },
  'service_detail.col.action': { title: 'Action', body: 'The security action’s title.' },
  'service_detail.col.action_owner': { title: 'Owner', body: 'The action’s accountable owner, who answers for getting it done.' },
  'service_detail.col.action_status': { title: 'Status', body: 'Proposed (awaiting acceptance), planned (accepted), in progress, or completed. An action completes when its last item does.' },
  'service_detail.col.progress': { title: 'Progress', body: 'How many of the action’s items are complete, out of all its items.' },
  'service_detail.col.target_date': { title: 'Target', body: 'The date the action is due to be finished by. Marked overdue once it has passed with the action still open.' },
  'service_detail.impact_tables': { title: 'Impact tables', body: 'Read-only: the impact tables this service’s information assets are rated against. A service is not rated directly; its impact is the highest rating of the assets it uses. To change what appears here, rate the assets.' },
  'service_detail.col.table_scope': { title: 'Scope', body: 'Whether the table applies across the organisation or to one department.' },
  'service_detail.col.table_department': { title: 'Department', body: 'The department a department-scoped table belongs to.' },
  'service_detail.col.bil_levels': { title: 'BIL levels', body: 'How many of the table’s five business impact levels have a statement describing them.' },
  'service_detail.col.brought_in_by': { title: 'Brought in by', body: 'Which of this service’s information assets are rated against the table, with the level each was given. This is why the table is listed here.' },

  // ComponentDetailPage, ComponentModal, DocumentLifecycle
  'component_detail.title': { title: 'Component', body: 'A part that systems are made of: a person or group, a process, a policy or document, a piece of technology, or a facility. The catalogue is shared by the whole organisation and has no owning department. Its scope says whether it exists once for the organisation or once per system.' },
  'component_detail.edit_modal': { title: 'Edit component', body: 'Change the component’s name, description, type and catalogue status. The change applies everywhere the component is used.' },
  'component_detail.network_identity': { title: 'Network identity', body: 'The hostname and IP addresses of this host. SOC enrichment looks these up to find which systems a host belongs to, and their impact and risks.' },
  'component_detail.vulnerable_on': { title: 'Named as a vulnerability', body: 'Active risks on which an analyst marked this component as part of why the threat succeeds. A judgement about the component, separate from its state and from the other risks on the systems it sits in.' },
  'component_detail.systems': { title: 'Systems using this component', body: 'Every system the component is on, with each system’s worst risk. A component that exists once for the organisation appears on every system that relies on it. Expand a system to see its risks.' },
  'component_modal.title': { title: 'Component', body: 'The one place a component is created or edited. When creating, say whether it exists once for the organisation or once per system, and whether it answers a systems architecture template group. Leaving the first unanswered keeps it out of security solutions until someone answers.' },
  'document_lifecycle.title': { title: 'Document', body: 'The document’s kind, version, owner, approval and next review date, and where it lives. A published document must have a review date; once that passes it reads as Under review until a new date is recorded.' },
  'cia_table.col.c': { title: 'Confidentiality', body: 'The harm if information were disclosed to someone who should not see it. Each row gives a value for this dimension, from 1 to 5.' },
  'cia_table.col.i': { title: 'Integrity', body: 'The harm if information were altered or corrupted. Each row gives a value for this dimension, from 1 to 5.' },
  'cia_table.col.a': { title: 'Availability', body: 'The harm if information or the service were unavailable when needed. Each row gives a value for this dimension, from 1 to 5.' },
  'cia_table.col.max': { title: 'Max CIA', body: 'The highest of the confidentiality, integrity and availability values on each row. Switch to expert view to see all three.' },

  // DepartmentsPage, DepartmentDetailPage
  'departments.title': { title: 'Organisation', body: 'The organisation’s departments. A department owns systems, information assets and business services, and owns the risks on its systems. The person answerable for those risks is the department’s information asset owner (IAO), or the SIRO where it has none.' },
  'departments.new_modal': { title: 'New department', body: 'Add a department with its name, description and owner. Its information asset owner and manager are set by giving people those roles in this department, under user administration.' },
  'departments.col.iao': { title: 'Owner (IAO)', body: 'The active people in this department who hold the information asset owner role. “No IAO” means nobody does, so its risks fall to the SIRO and new systems and assets have no owner.' },
  'departments.col.iam': { title: 'Manager (IAM)', body: 'The active people in this department who hold the information asset manager role, and look after its records day to day.' },
  'departments.col.assets': { title: 'Assets', body: 'How many information assets the department owns.' },
  'departments.col.systems': { title: 'Systems', body: 'How many systems the department owns.' },
  'departments.col.services': { title: 'Services', body: 'How many business services the department owns.' },
  'departments.col.impact_tables': { title: 'Impact tables', body: 'How many impact tables belong to this department alone. Organisation-wide tables are not counted.' },
  'departments.col.active_risks': { title: 'Active risks', body: 'How many active risks there are on the department’s systems. The department owns these risks.' },
  'department_detail.title': { title: 'Department', body: 'One department: its people and the systems, information assets and business services it owns, with roll-up counts. It owns the risks on its systems.' },
  'department_detail.edit_modal': { title: 'Edit department', body: 'Change the department’s name, description and owner.' },
  'department_detail.people': { title: 'People', body: 'Everyone whose account belongs to this department, with their role. Information asset owners and managers here are the ones accountable for its records.' },
  'department_detail.col.person': { title: 'Name', body: 'The person’s full name.' },
  'department_detail.col.status': { title: 'Status', body: 'Whether the account is active. An inactive account cannot sign in and is not counted as the department’s IAO or IAM.' },
  'department_detail.systems': { title: 'Systems', body: 'The systems this department owns, each with the band of its worst active risk. Select one to open it.' },
  'department_detail.assets': { title: 'Information assets', body: 'The information assets this department owns. A shared asset counts towards every department’s impact, not only this one’s.' },
  'department_detail.services': { title: 'Business services', body: 'The business services this department owns. A shared service may also be adopted by other departments.' },

  // DepartmentSetupWizard
  'dept_wizard.title': { title: 'Department setup', body: 'Set up a department and catalogue the business services it runs. Pick a department, or create one, to start; you then choose an optional service template and add its services.' },
  'dept_wizard.col.department': { title: 'Department', body: 'The department’s name. Select a row to set it up or edit it.' },
  'dept_wizard.template': { title: 'Service template', body: 'Optional. Each template lists typical services for a kind of department, such as IT or Finance, as examples to add. Nothing is added until you choose a service. Skip it to add your own.' },
  'dept_wizard.examples': { title: 'Examples', body: 'Services you can add with one click: shared services other departments already run, and examples from the templates you chose.' },
  'dept_wizard.from_org': { title: 'From your organisation', body: 'Shared services that other departments already run. Adopting one lets this department use it without creating a copy.' },
  'dept_wizard.template_examples': { title: 'Template examples', body: 'Typical services from the template, to add as this department’s own. Edit the name and description afterwards to fit.' },
  'dept_wizard.services': { title: 'Services', body: 'The business services this department runs, as added so far. Edit, remove or mark each as shared, so other departments can adopt it.' },
  'dept_wizard.done': { title: 'Department set up', body: 'The services now catalogued for this department. They can be found and changed under Business services.' },
  'dept_wizard.whats_next': { title: 'What’s next', body: 'A business service is not rated directly. Link each one to the systems that deliver it, and rate the information assets those systems hold against the impact tables; the service’s impact follows.' },

  // SuppliersPage, SupplierDetailPage
  'suppliers.title': { title: 'Suppliers', body: 'The outside organisations the business relies on. What we have with each is a relationship: onshore contractors, a contracted-out service, a service provider hosting a system, or the maker of a product we run. Each relationship belongs to the department that contracts it.' },
  'suppliers.col.relationships': { title: 'Relationships', body: 'The supplier types of this supplier’s relationships, and how many are active out of all recorded. One supplier can be several types.' },
  'suppliers.col.contracted_by': { title: 'Contracted by', body: 'The departments that contract this supplier. Each owns its relationships, and its information asset owner (IAO) is accountable for them.' },
  'suppliers.col.criticality': { title: 'Criticality', body: 'Derived, never typed in: the highest impact of the systems the supplier’s current relationships touch. Business view shows a word; expert view shows the number.' },
  'suppliers.col.assurance': { title: 'Assurance', body: 'Whether every live relationship has all its supplier control objectives met by current evidence. Gaps are counted, and whether anyone has answered them with an action or an acceptance.' },
  'supplier_detail.title': { title: 'Supplier', body: 'One supplier, with how critical it is and every relationship we have with it. A supplier with no relationships can be deleted; one with relationships cannot.' },
  'supplier_detail.relationships': { title: 'Relationships', body: 'Each thing we have with this supplier: its type, what it touches, the contract and who is accountable, with its assurance beneath. A relationship that has run its course is set to Ended, not deleted.' },
  'supplier.criticality': { title: 'Criticality', body: 'A supplier is as critical as the most important system its live relationships give it access to: the highest impact rating of the information on that system. Worked out from the systems, never typed in.' },
  'suppliers_panel.title': { title: 'Suppliers', body: 'The supplier relationships that touch this, directly or through a component on it. Read-only here; relationships are recorded on the supplier’s page.' },

  // SupplierRelationshipsTable, SupplierRelationshipCard
  'supplier_rel.card': { title: 'Relationship', body: 'What this relationship touches: the system the supplier hosts or operates, or the component it supplies. Its facts are listed below, and its assurance beneath them.' },
  'supplier_rel.col.touches': { title: 'Touches', body: 'What the relationship reaches in our model: the system the supplier hosts or operates, or the component (people, process or technology) it supplies.' },
  'supplier_rel.col.type': { title: 'Supplier type', body: 'Onshore contractors, contracted-out service, service provider (SaaS) or software / hardware supplier. The type decides which control objectives the relationship is expected to meet.' },
  'supplier_rel.col.status': { title: 'Status', body: 'Proposed, active, exiting or ended. Only an active or exiting relationship is live: it counts towards criticality and can raise an assurance finding.' },
  'supplier_rel.col.contract': { title: 'Contract', body: 'The contract reference, with a link where one is recorded, and its start and end dates.' },
  'supplier_rel.col.accountable': { title: 'Accountable', body: 'Derived, not chosen: the information asset owner (IAO) of the contracting department, or the SIRO where that department has none.' },
  'supplier_rel.col.criticality': { title: 'Criticality', body: 'The highest impact of the systems this relationship touches. Derived from the systems, never typed in.' },

  // SupplierAssurance
  'supplier_assurance.title': { title: 'Assurance', body: 'Whether the supplier meets the control objectives expected of this relationship: those for every supplier, those for its supplier type, and any it is relied on to deliver on the system. Each is met only by current evidence. A live relationship with any not met is a finding.' },
  'supplier_assurance.objectives': { title: 'Supplier control objectives', body: 'The control objectives this supplier must evidence, unmet ones first. The sets for each supplier type are edited under Supplier control sets.' },
  'supplier_assurance.col.met': { title: 'Met?', body: 'Yes when at least one current assurance report or set of contract terms covers the objective. Expired evidence does not count.' },
  'supplier_assurance.col.met_by': { title: 'Met by', body: 'The current evidence covering this objective, or the expired evidence that once did.' },
  'supplier_assurance.ours': { title: 'Ours: met by our own control', body: 'Objectives delivered once for the whole organisation, so no supplier document can meet them. Each is met when the Statement of Applicability says our control is implemented. They do not count towards the supplier’s finding.' },
  'supplier_assurance.col.in_place': { title: 'In place?', body: 'Whether the Statement of Applicability says our own control is implemented, and if not, how it stands there.' },
  'supplier_assurance.col.delivered_by': { title: 'Delivered by', body: 'The security solutions that deliver this objective for the organisation.' },
  'supplier_assurance.evidence': { title: 'Evidence recorded', body: 'The assurance reports and contract terms recorded for this relationship. Record as many as needed; one current piece covering an objective is enough. Evidence that has lapsed stays on the record.' },
  'supplier_assurance.col.evidence': { title: 'Evidence', body: 'The report or contract clause, with its reference and a link where recorded.' },
  'supplier_assurance.col.evidence_type': { title: 'Evidence type', body: 'An assurance report (such as a SOC 2 report or ISO certificate audit) or terms in the contract that bind the supplier.' },
  'supplier_assurance.col.valid_until': { title: 'Valid until', body: 'When the evidence stops counting. A report must carry its expiry; contract terms last while the contract runs unless given their own date.' },
  'supplier_assurance.col.covers': { title: 'Covers', body: 'How many of this relationship’s control objectives the evidence covers.' },

  // SupplierEvidenceForm
  'supplier_evidence.step_what': { title: 'What is the evidence?', body: 'An assurance report, with its name, issuer reference and the date it expires, or terms in the contract, naming the contract and clause. Contract terms end with the contract unless you give them a date.' },
  'supplier_evidence.step_covers': { title: 'Which objectives it covers', body: 'Tick each of this relationship’s control objectives the evidence shows is met. One piece of evidence need not cover them all.' },

};
