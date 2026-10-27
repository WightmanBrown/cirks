// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited
// Draft help text — see index.js.
export default {
  // AccountManagementPage
  'admin.account_management':        { title: 'Account management', body: 'Every person who can sign in to CIRKS. Create accounts, change a person’s name, primary role, department or active status, and reset their password or two-factor authentication. You cannot change your own role, department or active status here.' },
  'admin.accounts.new':              { title: 'New account', body: 'Creates an account with a primary role, an optional department and a temporary password of at least 12 characters. Give the person the password securely. Additional roles are granted on the Access Control page.' },
  'admin.accounts.list':             { title: 'Accounts', body: 'All accounts, active and inactive. Changes save as you make them. Moving a person to another department reports any records they own or are assigned that are now outside it, so they can be reassigned.' },
  'admin.accounts.col.name':         { title: 'Name', body: 'The person’s full name, edited in place: it saves when you press Enter or leave the field, and Esc puts it back. Any additional roles they hold are listed underneath.' },
  'admin.accounts.col.role':         { title: 'Role', body: 'The person’s primary role. It decides what they can see and change. Additional roles are granted on the Access Control page, and the person switches between them.' },
  'admin.accounts.col.department':   { title: 'Department', body: 'The department the person belongs to. Department-scoped roles, such as the information asset owner (IAO) and information asset manager (IAM), work on their own department’s records.' },
  'admin.accounts.col.active':       { title: 'Active', body: 'Whether the person can sign in. Clear it to deactivate the account: the account and its history are kept, but it can no longer be used.' },
  'admin.accounts.col.credentials':  { title: 'Credentials', body: 'Set a new password for the person (at least 12 characters), or clear their two-factor authenticator enrolment if they have lost the device. Reset 2FA is available only when they have enrolled.' },

  // AdminRbacPage
  'rbac.title':                      { title: 'Access control', body: 'Who can do what in CIRKS: the roles each person holds, whether departments are isolated, the separation-of-duties rules, and the capabilities each role is granted. Changes apply immediately.' },
  'rbac.users_roles':                { title: 'Users and roles', body: 'Every person’s primary role and any additional roles they hold. A person with several roles chooses which one to work in and can switch between them. You cannot change your own roles here.' },
  'rbac.col.user':                   { title: 'User', body: 'The person, with the email they sign in with. Inactive accounts are marked.' },
  'rbac.col.primary_role':           { title: 'Primary role', body: 'The role the person holds by default. Changing it here changes their account straight away.' },
  'rbac.col.additional_roles':       { title: 'Additional roles', body: 'Further roles the person can switch into, such as Security Architect held alongside their own role. Add one from the list or remove one with ×. Machine roles used by API keys cannot be given to a person.' },
  'rbac.department_isolation':       { title: 'Department isolation', body: 'When on, department-scoped roles (such as the IAO and IAM) see only their own department’s records, plus anything marked shared. When off, every role sees all departments.' },
  'rbac.sod':                        { title: 'Separation of duties', body: 'Rules that stop one person doing both halves of a sensitive act, such as accepting an exception on a risk they own or publishing an impact table they made. Each rule checks who did what, so holding another role does not get round it. Rules are off until switched on.' },
  'rbac.role_permissions':           { title: 'Role permissions', body: 'The capabilities granted to the chosen role. Tick or clear each one, choose all departments or own department where it can be scoped, then save. The admin role always keeps the right to manage access, so it cannot lock itself out.' },
  'rbac.resource':                   { title: 'Capability group', body: 'Capabilities grouped by the part of CIRKS they act on. Typically a “read” capability lets the role see that area and a “write” capability lets it change it.' },

  // ApiKeysPage
  'api_keys.title':                  { title: 'API keys', body: 'Credentials for machines, such as a SOC tool, that look up IP addresses and hostnames through the enrichment API. A key is sent in the X-API-Key header and can only answer enrichment lookups. CIRKS keeps only a hash, so the key itself is shown once.' },
  'api_keys.create':                 { title: 'Create a key', body: 'Name the integration the key is for and, optionally, the date it stops working. The key is shown once, straight after creation: copy it into the integration’s settings before dismissing it.' },
  'api_keys.existing':               { title: 'Existing keys', body: 'Every key minted, including revoked and expired ones, kept as a record. Revoke a key when the integration using it is retired or the key may have leaked; anything using it stops working at once.' },
  'api_keys.col.label':              { title: 'Label', body: 'The name given to the key when it was created, usually the integration that uses it.' },
  'api_keys.col.prefix':             { title: 'Prefix', body: 'The first characters of the key, so you can tell which key an integration holds without the full key being stored or shown.' },
  'api_keys.col.role':               { title: 'Role', body: 'The machine role the key acts as. A machine role can answer enrichment lookups and nothing else, and can never be given to a person.' },
  'api_keys.col.status':             { title: 'Status', body: 'Active keys work. Expired keys have passed their expiry date; revoked keys were withdrawn by an administrator. Neither is accepted again.' },
  'api_keys.col.last_used':          { title: 'Last used', body: 'When the key was last used to call CIRKS. A key unused for a long time may belong to a retired integration and is a candidate for revoking.' },
  'api_keys.col.expires':            { title: 'Expires', body: 'The date the key stops being accepted, if one was set when it was created. Blank means it works until revoked.' },

  // AuditLogPage
  'audit_log.title':                 { title: 'Audit log', body: 'The append-only record of governance acts: who did what, to which record, and when. It covers acts such as validating or returning a risk, accountability changes, SoA decisions and role switches; it is not a record of every change. Nothing here can be edited.' },
  'audit_log.col.when':              { title: 'When', body: 'The date and time the act was recorded. Newest entries come first.' },
  'audit_log.col.user':              { title: 'User', body: 'The person who acted and the role they were working in. “System” means no person was recorded, for example a change made by a database rule.' },
  'audit_log.col.action':            { title: 'Action', body: 'What was done, such as validating a risk, planning a meeting or updating a field.' },
  'audit_log.col.entity':            { title: 'Entity', body: 'The kind of record acted on, and its name where known. Select a row to see the record’s ID, the old and new values and where the request came from.' },
  'audit_log.col.narrative':         { title: 'Narrative', body: 'A plain-language account of the act, written when it was recorded, including any reason given.' },

  // DataExportPage
  'data_export.title':               { title: 'Data export', body: 'Download CIRKS data as CSV or TSV spreadsheets, one dataset at a time or all together in a .zip. Files use readable keys (email, department name, role) instead of internal IDs, so an export can be loaded into a fresh, empty installation.' },
  'data_export.group.accounts':      { title: 'Account management', body: 'People, the additional roles they hold, and departments. Passwords and authenticator secrets are not exported.' },
  'data_export.group.threats_controls': { title: 'Threats and controls', body: 'The threat catalogue, control objectives and the threats each counters, and the security architecture: security solutions and their parts, architecture rules, membership groups, system builds and the solution chosen for each objective on each system.' },
  'data_export.group.components':    { title: 'PPITF components', body: 'The component library (people, process, information, technology, facility), including policies and documents with their lifecycle, and the IP addresses recorded against hosts for SOC enrichment.' },
  'data_export.group.assets':        { title: 'Information assets', body: 'Information assets and their ratings against each impact table. The ratings are the source of every impact figure in CIRKS.' },
  'data_export.group.systems':       { title: 'Systems', body: 'Systems and what is linked to them: information assets, components, the threats identified against them, and the control objectives deployed on each with their status and any exclusion reason.' },
  'data_export.group.services':      { title: 'Business services', body: 'Business services and the systems each is made of. A service’s information assets and impact are derived from those systems, so they are not exported separately.' },
  'data_export.group.impact_tables': { title: 'Impact tables', body: 'Impact tables with their 1dBIL and 3dBIL level statements. Blank rows are included, so an export doubles as a template.' },
  'data_export.group.soa':           { title: 'Statement of Applicability', body: 'Each control objective’s SoA decision (applicable or not, and why), the scopes systems are grouped into, and which objectives are narrowed to a scope.' },
  'data_export.group.suppliers':     { title: 'Suppliers', body: 'Suppliers, their relationships with departments, the control objectives each supplier type is expected to meet, and the assurance evidence recorded against them.' },
  'data_export.group.access_control': { title: 'Access control', body: 'The capabilities granted to each role, the separation-of-duties rules and whether each is on, organisation-wide settings such as department isolation, and the capability catalogue for reference.' },

  // HelpContentPage
  'help_content.title':              { title: 'Help content', body: 'Every help point (ⓘ) CIRKS knows about, and where its text comes from. Write or replace the text for any key here, or turn on Edit help and change it on the page where the dot appears.' },
  'help_content.col.key':            { title: 'Key', body: 'The help point’s fixed identifier. It ties the text to one place on screen and does not change when the wording does.' },
  'help_content.col.english':        { title: 'English', body: '✓ means English text has been written for this key in CIRKS. — means it shows the shipped draft or glossary text, or nothing if there is none.' },
  'help_content.col.other_languages': { title: 'Other languages', body: 'The languages other than English that this key has been translated into.' },
  'help_content.col.source':         { title: 'Source', body: 'Where the text shown comes from. Custom: written in CIRKS, replacing any draft. Code default: the draft or glossary text shipped with CIRKS. Unwritten: no text yet.' },

  // KnowledgeSearchPage
  'knowledge.title':                 { title: 'Knowledge search', body: 'One search across services, information assets, systems, components, risks, security actions, threats and control objectives. Results include only what your role can read. An IP address or hostname also finds the hosts carrying it and the systems they belong to.' },
  'knowledge.section.services':      { title: 'Business services', body: 'Business services matching the search, up to 10. Impact is the highest of C, I and A, derived from the service’s systems; risk is the worst active risk on those systems.' },
  'knowledge.section.assets':        { title: 'Information assets', body: 'Information assets matching the search, up to 10. Impact is the highest of the asset’s C, I and A ratings.' },
  'knowledge.section.systems':       { title: 'Systems', body: 'Systems matching the search, up to 10. Impact is the highest of C, I and A, derived from the system’s information assets; risk is the worst active risk on the system.' },
  'knowledge.section.components':    { title: 'System components', body: 'Components matching the search, up to 10. “Vulnerable” means an active risk names the component as a reason the threat succeeds; its status is shown when it is not operational.' },
  'knowledge.section.risks':         { title: 'Risks', body: 'Active risks whose threat, system or information asset matches the search, highest score first, up to 10.' },
  'knowledge.section.actions':       { title: 'Security actions', body: 'Security actions matching the search, up to 10.' },
  'knowledge.section.threats':       { title: 'Threats', body: 'Threats from the threat catalogue matching the search, up to 10.' },
  'knowledge.section.controls':      { title: 'Control objectives', body: 'Control objectives matching the search, up to 10.' },
  'knowledge.matched_hosts':         { title: 'Matched hosts', body: 'Host components carrying the IP address or hostname searched for. An IP matches a recorded address or a recorded range containing it; a hostname matches partially, ignoring case.' },
  'knowledge.systems_at_risk':       { title: 'Systems at risk', body: 'Every active system the matched hosts belong to, highest risk first. A shared host can belong to several systems, so all are listed: together they are what an incident on that host could affect.' },
  'knowledge.col.system':            { title: 'System', body: 'The system the host belongs to, with the host or hosts it was found through.' },
  'knowledge.col.impact':            { title: 'Impact (C/I/A)', body: 'The system’s confidentiality, integrity and availability impact, each 1–5, derived from the information assets it holds.' },
  'knowledge.col.max_risk':          { title: 'Max risk', body: 'The highest score among the system’s active risks, with its band and how many active risks it has.' },

  // GraphExplorerPage + WalkableGraph
  'graph_explorer.title':            { title: 'Graph explorer', body: 'The record you started from and what it is directly connected to. Select a node to see it, and expand it to walk one step further. Only records your role can read are shown; a “+ more” node stands for connections beyond the first 12.' },
  'graph.node_panel':                { title: 'Selected node', body: 'The record selected in the graph, with its risk score, maturity or status where it has one. Expand it to add its own connections to the graph, or open its page.' },

  // MetricsPage
  'metrics.title':                   { title: 'Metrics and reporting', body: 'Reserved for audit evidence and ISMS performance reports. Nothing is reported here yet.' },

  // SelectRolePage
  'select_role.title':               { title: 'Select your role', body: 'Choose the role to work in for this session. It decides what you see and can change. You can switch to another of your roles later without signing out.' },

  // StyleSheetPage
  'style_sheet.title':       { title: 'Colours & fonts', body: 'Every font and colour CIRKS uses, read live from the one file that defines them (styles/globals.css). Nothing else in the app may set a colour, so this page is the whole palette. A day theme, when there is one, will show here too.' },
  'style_sheet.fonts':       { title: 'Fonts', body: 'The three font families: headings, body text, and the monospaced font used for labels and figures. Each is shown in every weight the app loads.' },
  'style_sheet.readability': { title: 'Text on each surface', body: 'Each text colour on each background, with its contrast ratio. 4.5:1 is the WCAG AA minimum for normal-sized text; a cross marks a pairing below it, which should not be used for reading text.' },
  'style_sheet.pairings':    { title: 'Pairings in use', body: 'The colour combinations the app actually draws: risk bands, control maturity levels, coloured text on a tint of its own colour, text on solid buttons, and component types — each with its contrast ratio.' },
  'style_sheet.colours':     { title: 'Every colour', body: 'Every colour token, grouped as the stylesheet groups them, with its name and current value. A value shown "at N%" is translucent and takes some colour from what is behind it.' },
};
