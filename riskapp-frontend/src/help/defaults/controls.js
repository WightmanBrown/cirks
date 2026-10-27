// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Draft help text — see index.js.
export default {
  // ControlLibraryPage
  'controls.library': { title: 'Control Library', body: 'Every control objective your organisation may adopt: the ideal set, with NIST CSF 2.0 as the default and your own added beside it. Nothing here is done until it is adopted in the Statement of Applicability. Select a row to open the objective.' },
  'controls.col.title': { title: 'Title', body: 'What the control objective asks for, in a few words. The full wording is on the objective’s own page.' },
  'controls.col.type': { title: 'Type', body: 'How the control acts: preventive (stops it happening), detective (spots it), corrective (puts it right) or deterrent (discourages it).' },
  'controls.col.status': { title: 'Status', body: 'Derived, never typed in: Not decided (no SoA decision yet), Not applicable, Not assessed (adopted, maturity not rated) or Adopted (adopted and rated).' },
  'controls.effectiveness': { title: 'Effectiveness (maturity)', body: 'The maturity rating of the control that meets this objective, 1–5, recorded with evidence when the control is edited. Unrated means nobody has assessed it yet; a low rating is how an ineffective control shows.' },
  'controls.col.applicability': { title: 'Applicability', body: 'A label set on the objective. Baseline means part of the minimum set expected everywhere; Specific means added for a particular risk. Where an objective actually applies is decided in the SoA and its scopes.' },

  // ControlDetailPage
  'control_detail.title': { title: 'Control objective', body: 'A job to be done. This page says what it asks, how well it is met, how it is delivered on each system, and the SoA decision on it. The control that meets it appears under Our control once it is adopted.' },
  'control_detail.what_it_asks': { title: 'What it asks', body: 'The objective’s wording, its type and who added it. A control editor (controls.write) can change the wording.' },
  'control_detail.standard_requirements': { title: 'Standard requirements it meets', body: 'The lines of each loaded standard that this objective is mapped to, fully or partly. A custom objective is mapped to none. Select a reference to see that standard’s view of the SoA.' },
  'controls.maturity': { title: 'How well it is met', body: 'A read-out for anyone: whether it is adopted, how it is implemented, its maturity, how many of the systems where it applies have it, and how many active risks it treats. All of it is derived from the SoA decision, the control and the systems.' },
  'control_detail.security_solutions': { title: 'Security solutions', body: 'The ways this objective can be delivered. A system needs one complete solution; for an objective delivered on each system, its status there follows the state of that solution’s parts. One solution can deliver several objectives, so changing it changes it for all of them.' },
  'control_detail.on_each_system': { title: 'On each system', body: 'Every system the objective is recorded on, with its status, the security solution in place and any missing or degraded parts. It also says why it is there: the threats identified on that system that it counters, or Baseline when it counters none.' },
  'control_detail.decision': { title: 'Decision — Statement of Applicability', body: 'Whether this objective applies, why, where (the whole organisation or named scopes) and what drives it. Not applicable needs a reason. One objective is decided here; the SoA register reports it.' },
  'control_detail.our_control': { title: 'Our control', body: 'How the organisation meets this objective: how it is delivered and implemented, who is responsible, and the threats it counters. Shown only once the objective is adopted; a controls.write holder changes it with Edit control.' },
  'control_detail.implementation': { title: 'Implementation', body: 'How the control is delivered (organisation-wide, for a group, or on each system), its implementation status, a one-line description shown in the SoA, and its maturity. For a control delivered on each system the status is derived from the systems; otherwise it is stated by hand.' },
  'control_detail.responsible_owner': { title: 'Responsible owner', body: 'The person responsible for this control. Unassigned, it is the CISO’s. Changing it needs controls.write.' },
  'controls.owner': { title: 'Responsible', body: 'The person responsible for this control: the CISO unless someone else has been named, for example HR for staff training.' },
  'control_detail.threats': { title: 'Threats it counters', body: 'The threats this control is linked to in the threat catalogue. A control lowers a risk only where it is on the risk’s system and linked to the risk’s threat, so these links decide which risks it counts on.' },
  'control_detail.col.threat_category': { title: 'Category', body: 'How the threat arises: accidental, deliberate or environmental.' },
  'control_detail.col.threat_source': { title: 'Source', body: 'Where the threat comes from: internal, external or natural.' },
  'control_detail.col.link_notes': { title: 'Notes', body: 'Anything recorded about this link, such as the control only partly mitigating the threat.' },

  // WithdrawControlDialog
  'withdraw_control.title': { title: 'Withdraw from use', body: 'Removes the control from every system it is recorded on and unlinks it from its threats, which takes it out of every risk. Its judged residuals go, and work planned against it is withdrawn with a note. The preview is the real change, rolled back. A reason is required and audited.' },
  'withdraw_control.risks_rise': { title: 'Risks that rise', body: 'The active risks whose probability goes up once this control stops counting on them, measured by making the change and rolling it back.' },
  'withdraw_control.col.now': { title: 'Now', body: 'The risk’s probability today (confidentiality / integrity / availability), with its risk score in brackets.' },
  'withdraw_control.col.after': { title: 'After', body: 'The probability and risk score the register will show once the control is withdrawn.' },

  // SoaFindingsPanel
  'soa_findings.objective': { title: 'This objective contradicts itself', body: 'Where this objective’s SoA decision disagrees with what is recorded: recorded on systems where it does not apply, not applicable yet countering a threat, or not applicable with no reason. Each finding is derived and goes away once the fact is put right.' },
  'soa_findings.register': { title: 'Findings', body: 'Every place the SoA disagrees with what is recorded on systems or in the threat catalogue. Each is derived, so there is nothing to close: it disappears when the decision or the record is corrected. Each group says which act resolves it.' },

  // StatementOfApplicabilityPage
  'soa.all_controls': { title: 'Statement of Applicability', body: 'The record of every control objective: whether it applies and why, how it is implemented and its maturity. Each standard’s view is derived from it. Here you can decide several objectives at once; one objective is decided on its own page. Approve a version to freeze it for audit.' },
  'soa.custom': { title: 'Custom control objectives', body: 'Your own control objectives, mapped to no standard and filed by their own reference. They are decided in the same way as any other objective.' },
  'soa.standard': { title: 'A standard’s view', body: 'Each requirement of this standard, read from the control objectives mapped to it: covered, partly covered, excluded or a gap. Decisions are made on the objectives; here you can only exclude a requirement, with a reason.' },
  'soa.iso27001': { title: 'ISO/IEC 27001 view', body: 'Each Annex A control (in CIRKS, a standard requirement), read from the control objectives mapped to it. Decisions are made on the objectives; here you can only exclude a requirement, with a reason. ISO text is not shipped: load your own licensed copy.' },
  'soa.coverage.risk_traceability': { title: 'Risk traceability', body: 'For each applicable objective: Treated means it treats one or more active risks; Baseline means it is implemented but treats no identified risk; Untraced means neither. Derived from where the control is deployed and which threats it counters.' },
  'soa.untreated_risks': { title: 'Risks above appetite with no control', body: 'Active risks at or above the mandatory action score where no control on the risk’s system counters its threat. Deploy a control that does, or record an accepted exception.' },
  'soa.versions': { title: 'Approved versions', body: 'Frozen copies of the whole SoA, each approved by a named person with a note. A version never changes afterwards, so it can be given to an auditor. The live register is a working draft until approved.' },
  'soa.group': { title: 'Group', body: 'Rows are grouped by the structure of the catalogue or standard they come from. The number is how many rows in the group match the current filters.' },

  // ControlSetsSetupPage
  'setup.control_sets': { title: 'Objectives & standards', body: 'Where control objectives, standards and the mappings between them are loaded. You only need a standard if you report against one. Only NIST CSF 2.0 ships with CIRKS; load your own licensed copy of anything else.' },
  'setup.step_objectives': { title: 'Control objectives', body: 'Import control objectives into the library from a CSV file. Objectives that already exist are skipped. The library is the ideal set; the SoA decides which apply.' },
  'setup.step_standards': { title: 'Standards and their requirements', body: 'Each standard CIRKS knows about. Upload a standard’s requirements on its card, and enable it to show it as a view on the Statement of Applicability.' },
  'setup.step_mappings': { title: 'Mappings', body: 'Import which control objectives meet which standard requirements, fully or partly. One objective can meet several requirements, and one requirement can need several objectives.' },
  'setup.standard_card': { title: 'Standard', body: 'Requirements: lines loaded for this standard. Mapped: requirements mapped to at least one control objective. Met: requirements met, fully or partly, by an applicable objective.' },

  // ScopesPage / ScopeDetailPage
  'scopes.title': { title: 'Scopes', body: 'Named sets of systems in which a control objective can apply, such as the cardholder data environment. An adopted objective applies to the whole organisation unless it is narrowed to scopes. Drawing scopes needs scopes.manage (CISO, SIRO, admin).' },
  'scopes.col.scope': { title: 'Scope', body: 'The scope’s name. The whole organisation is the default and cannot be edited. Select a scope to change its systems.' },
  'scopes.col.systems': { title: 'Systems', body: 'How many systems are in the scope. A system can be in several scopes.' },
  'scopes.col.objectives': { title: 'Objectives narrowed to it', body: 'How many adopted control objectives apply only in this scope (and any others they are narrowed to).' },
  'scope_detail.title': { title: 'Scope', body: 'A named set of systems. Changing its systems changes where every objective narrowed to it is expected to be in place.' },
  'scope_detail.systems': { title: 'Systems in this scope', body: 'The systems that make up this scope. An objective narrowed to an empty scope is expected nowhere.' },
  'scope_detail.objectives': { title: 'Objectives that apply only here', body: 'The adopted control objectives narrowed to this scope. Narrow an objective from its own page or from the SoA’s bulk decision.' },

  // SecuritySolutionsPage / SecuritySolutionDetailPage / SecuritySolutionSummaryCard
  'security_solutions.title': { title: 'Security solutions', body: 'The library of ways control objectives are delivered. Each solution is a set of component parts, or is provided by a supplier. One solution can deliver several objectives, so it is defined once here and shared.' },
  'security_solutions.col.delivers': { title: 'Delivers', body: 'The control objectives this solution delivers. It delivers nothing until at least one is added.' },
  'security_solutions.col.parts': { title: 'Component parts', body: 'How many components the solution is made of. A supplier solution has no parts: it is met by the supplier’s evidence.' },
  'security_solutions.col.in_place_on': { title: 'In place on', body: 'Systems where the solution is in play: one of its on-system parts is recorded there or, for a solution with no such part, the system’s security architecture implies it or someone chose it. It counts whether or not every part is working.' },
  'security_solution.card': { title: 'Security solution', body: 'One way of delivering control objectives: the components that, working together, do the job. A change to it reaches every objective it delivers.' },
  'security_solution.objectives': { title: 'Control objectives it delivers', body: 'The control objectives this solution can deliver. Where it is in place on a system it delivers all of them there.' },
  'security_solution.parts': { title: 'Component parts', body: 'The components that must all be in place for a system to have this solution. Each says where it must be: on the system itself, on a named security system, or once for the organisation.' },
  'security_solution.in_place': { title: 'Where it is in place', body: 'The systems where this solution is in play, with how complete it is on each. For an objective delivered on each system, the objective’s status there follows this state.' },
  'security_solution.col.state': { title: 'State', body: 'Complete when every part is operational, degraded when a part is degraded, incomplete when a part is missing or not recorded. Derived from the components’ states.' },
  'security_solution.col.what_is_wrong': { title: 'What is wrong', body: 'The parts that are missing or degraded on this system. Fixing them is what brings the solution, and the objectives it delivers, into place.' },

  // SecuritySolutionWizard
  'solution_wizard.title': { title: 'New security solution', body: 'Creates a security solution. If something is run to deliver it, the solution is lifted from that security system; if it is documents, processes and people, you name it and add its parts by hand on its own page.' },
  'solution_wizard.on_each_protected': { title: 'On each protected system', body: 'The component each protected system must record, such as an agent. A system without it shows a gap. With nothing here, the solution applies only where something implies it or it is chosen.' },
  'solution_wizard.on_security_system': { title: 'On the security system', body: 'The security system’s components that provide the protection. Their state is set once, on that system, so if one fails every protected system shows it.' },

  // ArchitecturePages
  'security_architecture.template': { title: 'Systems architecture template', body: 'The groups every system must answer, such as its network zone or where it is hosted. Each group comes from a published document. Editing needs architecture.write.' },
  'security_architecture.groups': { title: 'Groups', body: 'Each system should record one component from each group that applies to it. An unanswered group is a gap, shown on the system and in the findings, because without it the triggers cannot tell what the system needs.' },
  'security_architecture.group_card': { title: 'Group', body: 'Its members are the valid answers. With triggers, it applies only to systems recording one of them; without, to every active system. The note says how many systems have not answered it.' },
  'security_architecture.triggers': { title: 'Security pattern triggers', body: 'Rules saying which components imply a security solution. Each rule cites the published document that requires it. Editing needs controls.write.' },
  'security_architecture.rules': { title: 'Triggers', body: 'A system recording any one of a rule’s components is expected to have its security solution. Where two rules imply different solutions for the same objective on a system, the system shows a conflict for someone to choose.' },
  'security_architecture.rule_card': { title: 'Rule', body: 'The security solution this rule implies, the document requiring it, and how many systems it applies to today.' },
  'security_architecture.patterns': { title: 'System architecture patterns', body: 'Named sets of components normally installed together, such as a standard Windows server. They save recording components one at a time; they do not decide what a system must have. Editing needs architecture.write.' },
  'security_architecture.builds': { title: 'Patterns', body: 'Applying a pattern copies its components onto a system. Afterwards the system’s components are its own: changing or removing the pattern does not change systems it was applied to.' },
  'security_architecture.build_card': { title: 'Pattern', body: 'The components this pattern records on a system when it is applied.' },

  // SupplierControlSetsPage
  'supplier_sets.title': { title: 'Supplier control sets', body: 'The control objectives each supplier type is expected to meet. A relationship is held to the every-supplier set plus its own type’s set, so a change here reaches every relationship of that type. Editing needs controls.write.' },
  'supplier_sets.set': { title: 'Control set', body: 'The objectives expected of relationships of this supplier type, met by the supplier’s current evidence (a report or contract terms) recorded on the relationship. An objective delivered once for the organisation counts as met by our own control when the SoA says it is implemented.' },
  'supplier_sets.col.in_soa': { title: 'In the SoA', body: 'The objective’s status from the Statement of Applicability: Not decided, Not applicable, Not assessed or Adopted.' },

  // ImpactTablesPage / ImpactTableEditor / ImpactTableSummaryCard
  'impact_tables.overview': { title: 'Impact tables', body: 'Scales that say what each level of harm (1–5) means for the business. Information assets are rated against them, and those ratings drive every impact and risk score. Assets must be rated against every mandatory table.' },
  'impact_tables.col.scope': { title: 'Scope', body: 'Organisation tables reach across every department; department tables belong to one department.' },
  'impact_tables.col.department': { title: 'Department', body: 'The department accountable for the table. Every table has one, whatever its scope.' },
  'impact_tables.col.status': { title: 'Status', body: 'Draft tables can still be edited. Published tables are in service and their levels are frozen; unpublish one to change them.' },
  'impact_tables.col.attributes': { title: 'Attributes', body: 'Mandatory means every information asset must be rated against this table; an asset that is not is reported as a finding. A mandatory table cannot be unpublished or deleted.' },
  'impact_tables.card': { title: 'Impact table', body: 'A scale that defines what each level of harm means. Open it to read or edit its level descriptions.' },
  'impact_tables.detail': { title: 'Impact table', body: 'The table’s levels and their descriptions. Publishing freezes the levels; a mandatory table must be made voluntary before it can be unpublished. Deleting it removes the ratings made against it.' },
  'impact_tables.bil': { title: '1dBIL — business impact level', body: 'One statement per level, 1 to 5, describing the harm to the business at that level. This is what the business view rates against.' },
  'impact_tables.cia': { title: '3dBIL — CIA implications', body: 'Separate statements for confidentiality, integrity and availability at each level, used in the expert view. A dimension no table assesses counts as minimal impact (1), never not applicable.' },

  // AddControlModal
  'add_control.title': { title: 'New control objective', body: 'Adds your own control objective to the library. It is not adopted until it is decided applicable in the Statement of Applicability. A reference is optional and must be unique.' },
};
