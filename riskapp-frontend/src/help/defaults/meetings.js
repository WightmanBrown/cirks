// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Draft help text — see index.js.
// Area: Security Working Group (SWG) meetings, SIRO review cycles and the dashboard widgets.
export default {
  // DashboardPage
  'dashboard.title': { title: 'Your dashboard', body: 'The widgets shown depend on the role you are signed in as; switch role to see another set. Choose “Customise layout” to drag widgets into the order you prefer — the order is saved to your account.' },
  'widget.control_set_stub': { title: 'Control set', body: 'Not built yet. This placeholder marks where a control library widget will go on the security consultant’s dashboard. Use the Security Controls pages in the meantime.' },
  'widget.dashboard_stub': { title: 'Dashboard', body: 'No widgets have been built for this role yet. Use the navigation menu to reach the pages your role can open.' },

  // Dashboard widgets
  'widget.my_tasks': { title: 'My tasks', body: 'Things waiting for you, worked out from your role: for example risks to validate, actions awaiting acceptance, risks returned to you, or your own actions that need a progress update before the next SWG meeting. A row clears by itself once the work is done. Select a row to go to it.' },
  'widget.system_setup': { title: 'System setup', body: 'A checklist of what CIRKS needs before it is usable: departments, a published impact table, a threat catalogue, control objectives, users other than admins, and an active review cycle. Each tick is worked out from the database; an unticked line links to where it is fixed.' },
  'widget.user_management': { title: 'User management', body: 'Every account, with its department and primary role. Changing a primary role here saves straight away. Your own account and system accounts cannot be changed from this list; use the Account Management page for anything else.' },
  'widget.my_assets': { title: 'My information assets', body: 'The five information assets of your department (plus shared ones) that matter most, ordered by their highest risk, then by their C/I/A rating. The chips show the asset’s confidentiality, integrity and availability rating. Select one to open it in the list.' },
  'widget.my_services': { title: 'My business services', body: 'The five business services of your department that matter most, ordered by their highest risk, then by impact. A service’s C/I/A is derived from the information assets it uses through its systems; it is never rated directly.' },
  'widget.my_systems': { title: 'Systems in my remit', body: 'The systems your department owns, plus those that hold your department’s information assets, ordered by their highest risk. A shared system you merely depend on is not listed. The full estate is on the Systems page.' },
  'widget.my_risks': { title: 'My risks', body: 'Your department’s risks: current (validated) and future (awaiting validation) heat maps, what has changed since the last SWG meeting, and the top risks by score. Use the department button to switch between your department and every department.' },
  'widget.my_risks.since_last_swg': { title: 'Since last SWG', body: 'How your department’s risks have moved since the most recent SWG meeting whose minutes were issued: new risks, risks whose score rose or fell, and risks removed because the exposure ended. Risks retired as raised in error are not counted.' },
  'widget.my_risks.top_risks': { title: 'Top risks', body: 'The five highest-scoring risks from the heat maps above. Select one to open it in the risk register.' },
  'widget.risk_heatmap': { title: 'Risk heat map', body: 'Every risk you can see, placed by impact (across) and probability (up). Colour shows the band the score falls in. Select a grid to open the matching risk register.' },
  'widget.heatmap_current': { title: 'Current', body: 'Validated risks — those the CISO has accepted as a fair assessment. The number is how many there are.' },
  'widget.heatmap_future': { title: 'Future', body: 'Risks assessed but not yet validated: waiting for the CISO’s review, or returned for rework. They join the current picture once validated.' },
  'widget.exceptions': { title: 'Security exceptions', body: 'Risks the organisation has formally accepted for a limited time instead of treating them. Every role sees the whole organisation’s list. The headline counts active exceptions; overdue ones have passed their review date. Select one to open its risk.' },
  'widget.exceptions_breach': { title: 'Exceptions in breach', body: 'Exceptions that passed their review date without being renewed or revoked, and have expired. The risk is still accepted but no longer within policy. Open each one and renew or revoke the acceptance.' },
  'widget.exceptions_contravention': { title: 'In contravention of policy', body: 'Exceptions that passed their review date without being renewed or revoked, and have expired. Shown to the SIRO for oversight; each needs renewing or revoking on its risk.' },
  'widget.security_action_plan': { title: 'Security action plan', body: 'Counts across all security actions: overdue, proposed and awaiting acceptance, accepted and in progress, remediation items still open, and items completed in the last 30 days. Select a line to open the queue behind it.' },
  'widget.probability_signals': { title: 'Open probability signals', body: 'Risks flagged because the probability of their threat, or of their system, changed after the risk was assessed. Each needs an analyst to decide whether the risk’s own probability should change.' },
  'widget.control_effectiveness': { title: 'Control effectiveness', body: 'Control objectives the Statement of Applicability says apply, but whose effectiveness nobody has rated yet. Select the widget to open the control library and rate them.' },
  'widget.impact_tables': { title: 'Impact tables', body: 'The organisation-wide impact tables, which say what each impact level means for the business, and how many are still drafts waiting to be published. Select the widget to open them.' },
  'widget.pending_validations': { title: 'Pending validations', body: 'Risks assessed and waiting for the CISO to validate them or return them for rework. Select the widget to open the queue.' },
  'widget.cycle_approval': { title: 'Cycle approval', body: 'Review cycles waiting for the SIRO’s sign-off. A cycle goes to the SIRO once the minutes of its SWG meeting are issued. Open one to check its risks and actions and approve it.' },
  'widget.siro_actions': { title: 'Security actions', body: 'Security actions that require SIRO sign-off, are not yet signed off, and are neither completed nor cancelled.' },
  'widget.siro_impact_tables': { title: 'Impact tables', body: 'Organisation-wide impact tables published by someone other than the SIRO or an admin, newest first — so the SIRO knows the scales have changed and can review them.' },
  'widget.onboarding_handover': { title: 'Onboarding handover', body: 'Whether the organisation is still in setup or has gone operational. In setup the security consultant can accept any risk exception to build the first risk picture. Going operational is one-way: afterwards the consultant accepts exceptions at risk analyst level.' },
  'widget.swg_summary': { title: 'Security Working Group', body: 'The next planned SWG meeting (with a calendar invite and your personal meeting pack) and the latest issued minutes. If any of your in-progress actions need a progress note before the meeting, it says so here.' },
  'widget.swg_meetings': { title: 'SWG meetings', body: 'The meeting that needs the secretary’s attention most: a planned meeting first, then a closed one whose minutes are not yet issued. Select it to open the meeting, or plan a new one.' },
  'widget.agenda_prep': { title: 'Agenda prep', body: 'Readiness of the current planned or closed meeting: how many agenda items have a decision recorded, how many attendees have opened their pack, and how many are presenting.' },
  'widget.action_progress': { title: 'Action progress', body: 'Accepted security actions still in progress across the organisation. While a meeting is planned, an action needs an update until its owner adds a progress note after the meeting was planned. Select one to open it.' },

  // MeetingsListPage
  'meetings.title': { title: 'SWG meetings', body: 'Every Security Working Group meeting. A meeting is planned, then closed once it has been held, then its minutes are issued and it is sealed. A closed meeting whose minutes are not yet issued is flagged.' },
  'meetings.col.date': { title: 'Date', body: 'The day the meeting is held.' },
  'meetings.col.state': { title: 'State', body: 'Planned (agenda and attendees can still change), closed (held; decisions and minutes are being finished), or minutes issued (sealed — nothing can change).' },
  'meetings.col.cycle': { title: 'Cycle', body: 'The review cycle this meeting reviews, if one was linked. Issuing the minutes sends the cycle to the SIRO for approval.' },
  'meetings.col.chair': { title: 'Chair', body: 'The person chairing the meeting.' },
  'meetings.col.secretary': { title: 'Secretary', body: 'The meeting secretary who planned the meeting and keeps its record.' },
  'meetings.col.attendees': { title: 'Attendees', body: 'How many people are on the attendee list, including named external attendees.' },
  'meetings.col.agenda_items': { title: 'Agenda items', body: 'How many items are on the agenda, generated or added by hand.' },

  // PlanMeetingPage
  'plan_meeting.title': { title: 'Plan a meeting', body: 'Set up the next SWG meeting: its date and time budget, the review cycle it covers, its chair and attendees. Once planned, generate the agenda on the meeting’s page.' },
  'plan_meeting.date': { title: 'Meeting date', body: 'The day of the meeting, agreed outside CIRKS. The target duration is the overall time budget; generating the agenda splits it across the sections.' },
  'plan_meeting.cycle': { title: 'Link to a review cycle', body: 'The review cycle (draft or active) this meeting reviews. Only cycles without an open meeting are offered. When the minutes are issued the cycle moves to SIRO review.' },
  'plan_meeting.chair': { title: 'Chair', body: 'Who chairs the meeting. Optional.' },
  'plan_meeting.attendees': { title: 'Attendees', body: 'People invited to the meeting: CIRKS users, or named external attendees such as an HR representative or an auditor. Each has a meeting role: chair, secretary, presenter, member or observer.' },

  // MeetingDetailPage
  'meeting_detail.title': { title: 'SWG meeting', body: 'One Security Working Group meeting. The secretary builds the agenda, attendee list and attachments while it is planned, closes it once held, then writes and issues the minutes. Other attendees see their personal pack here.' },
  'meeting_detail.attendees': { title: 'Attendees', body: 'Who is invited and in what capacity. The list is frozen when the meeting is closed.' },
  'meeting_detail.col.name': { title: 'Name', body: 'The attendee. A CIRKS user shows their role in CIRKS; someone without an account is marked external.' },
  'meeting_detail.col.department': { title: 'Department', body: 'The department the attendee belongs to in CIRKS. Blank for external attendees.' },
  'meeting_detail.col.meeting_role': { title: 'Meeting role', body: 'The part the person plays in this meeting: chair, secretary, presenter, member or observer. It is separate from their role in CIRKS.' },
  'meeting_detail.col.presenting': { title: 'Presenting item', body: 'The agenda item this attendee presents. It appears under “Your prep” in their meeting pack, and they can attach material to it.' },
  'meeting_detail.col.pack_viewed': { title: 'Pack viewed', body: 'When the attendee last opened their meeting pack. “Not viewed” means they have not opened it yet.' },
  'meeting_detail.col.present': { title: 'Present', body: 'Whether the attendee was recorded as present at the meeting.' },
  'meeting_detail.attachments': { title: 'Meeting attachments', body: 'Papers for the whole meeting. Open formats only (PDF, RTF, CSV, TSV, JSON, XML, Markdown and common image types); the file’s contents are checked on upload. Frozen when the meeting closes.' },
  'meeting_detail.close_modal': { title: 'Close meeting', body: 'Record that the meeting has been held and whether it was quorate. Closing freezes the agenda, attendees and attachments; decision text and the minutes can still be written.' },
  'meeting_detail.minutes': { title: 'Minutes', body: 'The formal minutes, written after the meeting is closed. “Auto-fill from decisions” drafts them from the decisions recorded on the agenda. Issuing seals them for good and sends any linked review cycle to the SIRO; mistakes are corrected in the next meeting’s minutes.' },
  'meeting_detail.minutes_issued': { title: 'Minutes', body: 'The issued minutes: the sealed, formal record of the meeting. They are never amended.' },
  'meeting_detail.pack': { title: 'Meeting pack', body: 'Your personal view of the agenda: what you are presenting, what is relevant to your role, and everything else. Opening it is recorded so the secretary can see who has read it.' },

  // AgendaSection
  'agenda.title': { title: 'Agenda', body: 'Generated from the current state of CIRKS — risks awaiting validation, actions in progress or awaiting acceptance, active exceptions, findings — plus standing items. Regenerating replaces the generated items and keeps those added by hand. Each section has a time budget in minutes.' },
  'agenda.phase.procedural': { title: 'Procedural', body: 'Opening, previous minutes, any other business and close: the items that make the meeting a proper record.' },
  'agenda.phase.change_briefings': { title: 'Change briefings', body: 'What has changed since the last meeting: new systems, services and threats, the review cycle, ISMS objectives, incidents and new risks, and progress on actions.' },
  'agenda.phase.assurance_reports': { title: 'Assurance reports', body: 'Reports from outside CIRKS, and the findings CIRKS works out for itself, one line per kind of finding.' },
  'agenda.phase.decisions': { title: 'Decisions', body: 'Items the group must decide: validating risks, accepting actions and reviewing exceptions. The decision is recorded against each item and goes into the minutes.' },
  'agenda.category.opening': { title: 'Opening', body: 'Attendees, apologies and the quorum check.' },
  'agenda.category.previous_minutes': { title: 'Previous minutes & actions arising', body: 'Confirm the last meeting’s minutes and follow up what arose from them. Corrections to issued minutes are recorded here, because issued minutes are never amended.' },
  'agenda.category.change_briefing': { title: 'Change briefings', body: 'New systems and services in scope, and new or emerging threats.' },
  'agenda.category.cycle_overview': { title: 'Cycle overview', body: 'An overview of the review cycle linked to this meeting. Appears only when a cycle is linked.' },
  'agenda.category.isms_objectives': { title: 'ISMS objectives & interested parties', body: 'A standing item on changes to the ISMS objectives and to interested parties. “No change” is a valid outcome; minuting it is the evidence the group looked.' },
  'agenda.category.threat_identification': { title: 'Identified exposures awaiting assessment', body: 'Threats identified against a system that nobody has yet assessed as a risk, with how many systems they span. Those identified more than one review cycle ago are counted separately, and the group is asked whether that backlog is acceptable.' },
  'agenda.category.new_risks': { title: 'New risks and incidents requiring action', body: 'Incidents since the last meeting (held in your incident tooling, not in CIRKS) and how many new risks await validation. The risks themselves are decided under Risk validation.' },
  'agenda.category.action_progress': { title: 'Action progress', body: 'One line per accepted security action that is planned or in progress, for its owner to report on.' },
  'agenda.category.sap_health': { title: 'SAP health', body: 'A standing review of the health of the Security Action Plan as a whole.' },
  'agenda.category.assurance': { title: 'Assurance reports', body: 'Reports from outside CIRKS (training, phishing tests, patching), then one line per kind of assurance finding with how many are outstanding. Finding lines link to the Findings page.' },
  'agenda.category.risk_validation': { title: 'Risk validation', body: 'One item per risk awaiting validation. In the meeting the CISO can validate the risk or return it for rework; the secretary records the decision text.' },
  'agenda.category.action_adoption': { title: 'Action adoption', body: 'One item per proposed security action that has items, for the group to accept. Accepting freezes the action’s items, owners and targets and records each risk’s score as the starting point.' },
  'agenda.category.exceptions': { title: 'Exceptions', body: 'One item per active exception, soonest expiry first, for the group to review. Renewing or revoking happens on the risk.' },
  'agenda.category.verification': { title: 'Verification of completed actions', body: 'Retired. Appears only on older meetings; an action now finishes when its last item is completed on the risk.' },
  'agenda.category.aob': { title: 'Any other business', body: 'Anything else the group needs to raise, including improvement opportunities.' },
  'agenda.category.close': { title: 'Close', body: 'Close the meeting and confirm the quorum has been recorded.' },

  // RunMeetingPage
  'run_meeting.title': { title: 'Run meeting', body: 'Full-screen view for running the meeting: step through the agenda item by item and record what was discussed and decided. The bar shows how many items have been discussed and decided.' },
  'run_meeting.item': { title: 'Agenda item', body: 'The item under discussion. On decision items the CISO (or an admin) can validate or return a risk, or accept an action, directly; the secretary records the decision text, which goes into the minutes.' },

  // PackPage / PackView
  'pack.title': { title: 'Meeting pack', body: 'Your personal view of the agenda for this meeting. Opening it is recorded on the attendee list.' },
  'pack.your_prep': { title: 'Your prep', body: 'Items you are presenting. You can attach material to them until the minutes are issued.' },
  'pack.read_in_advance': { title: 'Read in advance', body: 'Agenda sections relevant to your role — for example risk validation and exceptions for the CISO, or new risks and action progress for an information asset owner (IAO).' },
  'pack.full_agenda': { title: 'Full agenda', body: 'Every other item on the agenda. Select the heading to open or fold it.' },

  // PublishedMinutesPage
  'published_minutes.title': { title: 'SWG minutes', body: 'The issued minutes of a Security Working Group meeting: the sealed, formal record. Issued minutes are never changed; corrections go in the next meeting’s minutes.' },

  // SiroCyclesPage
  'siro_cycles.title': { title: 'Cycle approval', body: 'Review cycles waiting for your sign-off as SIRO. A cycle arrives here when the minutes of its SWG meeting are issued. Open one to check it and approve it.' },
  'siro_cycles.col.cycle': { title: 'Cycle', body: 'The name of the review cycle.' },
  'siro_cycles.col.period': { title: 'Period', body: 'The dates the review cycle covers.' },
  'siro_cycles.col.meeting_date': { title: 'Meeting date', body: 'The date of the SWG meeting that reviewed this cycle.' },
  'siro_cycles.col.frozen_at': { title: 'Frozen at', body: 'When the cycle was frozen for review.' },
  'siro_cycles.col.frozen_by': { title: 'Frozen by', body: 'Who froze the cycle for review.' },
  'siro_cycles.col.changes': { title: 'Changes', body: 'What the cycle changed: risks new to this cycle, risks escalated (↑) and risks treated, transferred or avoided (↓); actions raised in the cycle and actions completed.' },

  // SiroCycleSummaryPage
  'siro_cycle_summary.title': { title: 'Review cycle', body: 'One review cycle awaiting your approval: the risks it reviewed and the security actions in its plan. Approving completes the cycle and clears the “impact changed in this cycle” flags on systems and information assets.' },
  'siro_cycle_summary.risks': { title: 'Risks reviewed', body: 'Every risk reviewed in this cycle, highest score first, with the decision taken and its finalised notes. “New” marks a risk not reviewed in any earlier cycle.' },
  'siro_cycle_summary.col.asset': { title: 'Asset', body: 'The information asset the risk was recorded against, where one was.' },
  'siro_cycle_summary.col.score': { title: 'Score', body: 'The risk score, impact × probability, from 1 to 25.' },
  'siro_cycle_summary.col.level': { title: 'Level', body: 'The band the score falls in, such as low, medium, high or critical.' },
  'siro_cycle_summary.col.decision': { title: 'Decision', body: 'The review decision taken on the risk in this cycle: accept, treat, transfer, avoid, defer or escalate.' },
  'siro_cycle_summary.col.finalised_notes': { title: 'Finalised notes', body: 'The final notes recorded for the risk in this cycle. Every risk needs them before the cycle can be approved; “pending” means they are missing.' },
  'siro_cycle_summary.actions': { title: 'Security actions', body: 'The security actions in this cycle’s action plan, with their status and whether they need SIRO sign-off. “New” marks an action raised in this cycle.' },
  'siro_cycle_summary.col.title': { title: 'Title', body: 'What the action is.' },
  'siro_cycle_summary.col.type': { title: 'Type', body: 'How the action treats the risk.' },
  'siro_cycle_summary.col.owner': { title: 'Owner', body: 'The person accountable for delivering the action.' },
  'siro_cycle_summary.col.target_date': { title: 'Target date', body: 'When the action is due to be finished.' },
  'siro_cycle_summary.col.siro': { title: 'SIRO', body: 'Whether the action needs SIRO sign-off and, if so, whether it has been given.' },
  'siro_cycle_summary.approval': { title: 'SIRO approval', body: 'Approve the cycle once every reviewed risk has finalised notes. Approving marks the cycle completed.' },
};
