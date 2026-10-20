-- CIRKS — IS1 Business Impact Level reference catalogue.
--
-- WHAT THIS IS. The read-only reference the impact-table editor's "Adopt example
-- text" picker offers while an organisation writes its own impact scale. It is a
-- starting point to copy and adapt, never the scale itself: the real table lives
-- in `impact_tables` and is authored by the organisation's own CISO.
--
-- PROVENANCE AND LICENCE. Derived from HMG IA Standard No. 1 (IS1), the UK
-- government's technical risk-assessment standard, whose Business Impact Level
-- tables it reproduces. IS1 is **Crown copyright**, published under the Open
-- Government Licence, which permits reuse — including commercially — **provided
-- the source is acknowledged**. This header is that acknowledgement and must
-- travel with the file:
--
--   Contains public sector information licensed under the Open Government
--   Licence v3.0. Source: HMG IA Standard No. 1, Crown copyright.
--
-- Same test as v101, which removed ISO/IEC 27001 Annex A text from the
-- repository: CIRKS ships third-party content only where the licence permits
-- redistribution, and states on the file what that licence is. ISO's does not
-- permit it; the OGL does.
--
-- WHY THIS FILE EXISTS. The catalogue was seeded by
-- `schema/v32_business_impact_tables.sql` in the hand-applied-schema era. The
-- v88 baseline was cut with `pg_dump --schema-only`, which carries structures
-- but not data, so the three tables arrived empty and nothing replaced them.
-- `bil_categories`, `bil_subcategories` and `bil_reference_levels` have
-- therefore been empty on EVERY install built from the baseline — not just the
-- demo dataset. The picker calls `GET /bil/reference` and swallows the failure
-- (`.catch(() => {})` in `ImpactTableEditor.jsx`), so the feature has been
-- silently offering nothing rather than erroring, which is why it read as
-- missing data rather than a broken feature.
--
-- Idempotent on the natural keys, so re-seeding on every boot is a no-op. Note
-- the corollary that bit v98: edits to the TEXT below will never reach an
-- existing install — changing a descriptor needs an accompanying migration.
--
-- Two descriptors contain semicolons in their prose. Anything that slices this
-- file on ';' will silently truncate the catalogue to a third of its rows.

-- ── Categories ───────────────────────────────────────────────────────────────
INSERT INTO bil_categories (name, org_type, display_order) VALUES
  ('Defence, International Relations, Security and Intelligence', 'government', 1),
  ('Public Order, Public Safety and Law Enforcement',             'government', 2),
  ('Trade, Economics and Public Finance',                         'government', 3),
  ('Public Services',                                             'government', 4),
  ('Critical National Infrastructure (CNI)',                      'government', 5),
  ('Personal / Citizen',                                          'government', 6)
ON CONFLICT (org_type, name) DO NOTHING;


-- ── Sub-categories ───────────────────────────────────────────────────────────
INSERT INTO bil_subcategories (category_id, name, display_order)
SELECT c.id, v.subcat_name, v.ord
FROM (VALUES
  ('Defence, International Relations, Security and Intelligence', 'Impact on life and safety',                    1),
  ('Defence, International Relations, Security and Intelligence', 'Impact on political stability',               2),
  ('Defence, International Relations, Security and Intelligence', 'Impact on military operations',               3),
  ('Defence, International Relations, Security and Intelligence', 'Impact on foreign relations',                 4),
  ('Defence, International Relations, Security and Intelligence', 'Impact on international trade negotiations',  5),
  ('Defence, International Relations, Security and Intelligence', 'Impact on intelligence operations',           6),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on life and safety',                               1),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on provision of emergency services',               2),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on crime fighting',                                3),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on judicial proceedings',                          4),
  ('Trade, Economics and Public Finance', 'Impact on public finances',                                           1),
  ('Trade, Economics and Public Finance', 'Impact on UK trade and commerce',                                     2),
  ('Public Services', 'Inconvenience and impact on public confidence in public services',                        1),
  ('Public Services', 'Impact on public finances',                                                               2),
  ('Public Services', 'Impact on non-public finances',                                                           3),
  ('Public Services', 'Locally provisioned services with an impact on the personal safety of citizens',          4),
  ('Public Services', 'Locally provisioned services with an impact on the health of citizens',                   5),
  ('Public Services', 'Locally provisioned services with no impact on health or safety of citizens',             6),
  ('Public Services', 'Locally provisioned services in support of the Civil Contingencies Act',                  7),
  ('Critical National Infrastructure (CNI)', 'Communications',      1),
  ('Critical National Infrastructure (CNI)', 'Power',               2),
  ('Critical National Infrastructure (CNI)', 'Finance',             3),
  ('Critical National Infrastructure (CNI)', 'Transport',           4),
  ('Critical National Infrastructure (CNI)', 'Water and Sewage',    5),
  ('Critical National Infrastructure (CNI)', 'Food and Consumables',6),
  ('Personal / Citizen', 'Impact on health and safety of the Citizen', 1),
  ('Personal / Citizen', 'Impact on the Privacy of the Citizen',       2),
  ('Personal / Citizen', 'Impact on the Identity of the Citizen',      3),
  ('Personal / Citizen', 'Utilisation of Public Services',             4),
  ('Personal / Citizen', 'Embarrassment or distress',                  5),
  ('Personal / Citizen', 'Personal Finance',                           6)
) AS v(cat_name, subcat_name, ord)
JOIN bil_categories c ON c.name = v.cat_name AND c.org_type = 'government'
ON CONFLICT (category_id, name) DO NOTHING;


-- ── Reference level descriptors (BIL 1–5) ────────────────────────────────────
INSERT INTO bil_reference_levels (subcategory_id, level, description)
SELECT sc.id, v.level::SMALLINT, v.description
FROM (VALUES

  -- Defence: Impact on life and safety
  ('Defence, International Relations, Security and Intelligence', 'Impact on life and safety', 1,
   'Inconvenience or discomfort to an individual'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on life and safety', 2,
   'Risk to an individual''s personal safety or liberty'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on life and safety', 3,
   'Risk to a group of individual''s security or liberty'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on life and safety', 4,
   'Threaten life directly leading to limited loss of life'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on life and safety', 5,
   'Lead directly to widespread loss of life'),

  -- Defence: Impact on political stability
  ('Defence, International Relations, Security and Intelligence', 'Impact on political stability', 1,
   'None'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on political stability', 2,
   'Minor loss of confidence in Government'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on political stability', 3,
   'Major loss of confidence in Government'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on political stability', 4,
   'Threaten directly the internal political stability of the UK or friendly countries'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on political stability', 5,
   'Collapse of internal political stability of the UK or friendly countries'),

  -- Defence: Impact on military operations
  ('Defence, International Relations, Security and Intelligence', 'Impact on military operations', 1,
   'Loss of a number of minor supply services'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on military operations', 2,
   'Make it more difficult to maintain the operational effectiveness or security of UK or allied forces (e.g. compromise of UK forces training materials or supply procedures)'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on military operations', 3,
   'Cause damage to the operational effectiveness or security of UK or allied forces (e.g. compromise of a logistics system causing re-supply problems without causing risk to life)'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on military operations', 4,
   'Cause severe damage to the operational effectiveness or security of UK or allied forces (e.g. compromise of the operational plans of units of company size or below in a theatre of military operations)'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on military operations', 5,
   'Cause exceptionally grave damage to the operational effectiveness or security of UK or allied forces (e.g. compromise of the operational plans of units of battalion size or above in a theatre of military operations)'),

  -- Defence: Impact on foreign relations
  ('Defence, International Relations, Security and Intelligence', 'Impact on foreign relations', 1,
   'None'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on foreign relations', 2,
   'Cause embarrassment to Diplomatic relations'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on foreign relations', 3,
   'Materially damage diplomatic relations (e.g. cause formal protest or other sanctions).'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on foreign relations', 4,
   'Raise international tension, or seriously damage relations with friendly governments'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on foreign relations', 5,
   'Directly provoke international conflict, or cause exceptionally grave damage to relations with friendly governments'),

  -- Defence: Impact on international trade negotiations
  ('Defence, International Relations, Security and Intelligence', 'Impact on international trade negotiations', 1,
   'None'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on international trade negotiations', 2,
   'None'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on international trade negotiations', 3,
   'Disadvantage a major UK Company'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on international trade negotiations', 4,
   'Disadvantage a number of major UK Companies'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on international trade negotiations', 5,
   'Disadvantage the UK in international negotiations (e.g. advance compromise of UK negotiation strategy or acceptable outcomes, in the context of a bilateral trade dispute)'),

  -- Defence: Impact on intelligence operations
  ('Defence, International Relations, Security and Intelligence', 'Impact on intelligence operations', 1,
   'None'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on intelligence operations', 2,
   'Damage unique intelligence operations in support of intelligence requirements at JIC Priority Three or less.'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on intelligence operations', 3,
   'Halt unique intelligence operations in support of intelligence requirements at JIC Priority Three or less, or damage unique intelligence operations in support of requirements at Priority Two'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on intelligence operations', 4,
   'Halt unique intelligence operations in support of intelligence requirements at JIC Priority Two, or damage unique intelligence operations in support of intelligence requirements at JIC Priority One. Cause damage to UK or allied intelligence capability'),
  ('Defence, International Relations, Security and Intelligence', 'Impact on intelligence operations', 5,
   'Halt unique intelligence operations in support of intelligence requirements at JIC Priority One. Cause severe damage to UK or allied intelligence capability'),

  -- Public Order: Impact on life and safety
  ('Public Order, Public Safety and Law Enforcement', 'Impact on life and safety', 1,
   'Inconvenience or cause discomfort to an individual'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on life and safety', 2,
   'Risk to an individual''s personal safety or liberty'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on life and safety', 3,
   'Risk to a group of individuals safety or liberty.'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on life and safety', 4,
   'Threaten life directly leading to limited loss of life'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on life and safety', 5,
   'Lead directly to widespread loss of life'),

  -- Public Order: Impact on provision of emergency services
  ('Public Order, Public Safety and Law Enforcement', 'Impact on provision of emergency services', 1,
   'Minor disruption to service activities that requires reprioritisation at the local level to meet expected levels of service'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on provision of emergency services', 2,
   'Minor disruption to emergency service activities that requires reprioritisation at the area or divisional level to meet expected levels of service'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on provision of emergency services', 3,
   'Disruption to emergency service activities that requires reprioritisation at the county or organisational level to meet expected levels of service'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on provision of emergency services', 4,
   'Disruption to emergency service activities that requires reprioritisation at the national level (e.g. one police force requesting help from another) to meet expected levels of service'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on provision of emergency services', 5,
   'Disruption to emergency service activities that requires emergency powers to be invoked (e.g. military assistance to the emergency services) to meet expected levels of service'),

  -- Public Order: Impact on crime fighting
  ('Public Order, Public Safety and Law Enforcement', 'Impact on crime fighting', 1,
   'None'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on crime fighting', 2,
   'Hinder the detection, impede the investigation, or facilitate the commission of low-level crime (i.e. crime not defined in legislation as "serious crime"), or hinder the detection of serious crime'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on crime fighting', 3,
   'Impede the investigation of, or facilitate the commission of serious crime (as defined in legislation)'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on crime fighting', 4,
   'Cause major, long-term impairment to the ability to investigate serious crime (as defined in legislation)'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on crime fighting', 5,
   'Cause major, long-term impairment to the ability to investigate serious organised crime (as defined in legislation).'),

  -- Public Order: Impact on judicial proceedings
  ('Public Order, Public Safety and Law Enforcement', 'Impact on judicial proceedings', 1,
   'None'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on judicial proceedings', 2,
   'Minor failure in local Magistrates courts'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on judicial proceedings', 3,
   'Cause a low-level criminal prosecution to collapse; cause a conviction for a low-level criminal offence to be declared unsafe or referred for appeal.'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on judicial proceedings', 4,
   'Cause a serious crime prosecution to collapse; cause a conviction for a serious criminal offence to be declared unsafe or referred for appeal'),
  ('Public Order, Public Safety and Law Enforcement', 'Impact on judicial proceedings', 5,
   'Cause a number of criminal convictions to be declared unsafe or referred to appeal (e.g. through persistent and undetected compromise of an evidence-handling system)'),

  -- Trade: Impact on public finances
  ('Trade, Economics and Public Finance', 'Impact on public finances', 1,
   'Loss to Public Sector of up to £10,000'),
  ('Trade, Economics and Public Finance', 'Impact on public finances', 2,
   'Loss to Public Sector of up to £1 million'),
  ('Trade, Economics and Public Finance', 'Impact on public finances', 3,
   'Loss to HMG/Public Sector of £millions'),
  ('Trade, Economics and Public Finance', 'Impact on public finances', 4,
   'Loss to HMG/ Public Sector of £10s millions, up to £100 million'),
  ('Trade, Economics and Public Finance', 'Impact on public finances', 5,
   'Short term material damage to national finances or economic interests (to an estimated total of £100s millions to £10 billion)'),

  -- Trade: Impact on UK trade and commerce
  ('Trade, Economics and Public Finance', 'Impact on UK trade and commerce', 1,
   'None'),
  ('Trade, Economics and Public Finance', 'Impact on UK trade and commerce', 2,
   'Undermine the financial viability of a number of UK small businesses'),
  ('Trade, Economics and Public Finance', 'Impact on UK trade and commerce', 3,
   'Undermine the financial viability of a minor UK-based or UK-owned organisation'),
  ('Trade, Economics and Public Finance', 'Impact on UK trade and commerce', 4,
   'Undermine the financial viability of a major UK-based or UK-owned organisation'),
  ('Trade, Economics and Public Finance', 'Impact on UK trade and commerce', 5,
   'Material damage to international trade or commerce, directly and noticeably reducing economic growth in the UK'),

  -- Public Services: Inconvenience and public confidence
  ('Public Services', 'Inconvenience and impact on public confidence in public services', 1,
   'Likely to reduce an individual citizen''s perception of that service (e.g. a compromise leading to the cancellation of a hospital appointment)'),
  ('Public Services', 'Inconvenience and impact on public confidence in public services', 2,
   'Likely to reduce the perception of that service by many citizens (e.g. compromise leading to an outpatient clinic closing for a day, with cancellation of appointments)'),
  ('Public Services', 'Inconvenience and impact on public confidence in public services', 3,
   'Likely to result in undermined confidence in the service provider generally (e.g. public failures at a hospital leading to noticeable lower public confidence in that hospital)'),
  ('Public Services', 'Inconvenience and impact on public confidence in public services', 4,
   'Likely to result in undermined confidence in the service at a national level (e.g. compromise of national patient information databases leading to undermined confidence in the NHS)'),
  ('Public Services', 'Inconvenience and impact on public confidence in public services', 5,
   'May lead to a loss of public trust in the service severe enough to cause a noticeable drop in citizens using the service through mistrust, with consequent risk to life'),

  -- Public Services: Impact on public finances
  ('Public Services', 'Impact on public finances', 1,
   'Likely to cause a loss to the Public sector of up to £10,000'),
  ('Public Services', 'Impact on public finances', 2,
   'Likely to cause a loss to the Public sector of up to £1 million'),
  ('Public Services', 'Impact on public finances', 3,
   'Likely to cause a loss to HMG/ Public sector of £millions'),
  ('Public Services', 'Impact on public finances', 4,
   'Likely to cause a loss to HMG/ Public sector of £10s millions, up to £100 million'),
  ('Public Services', 'Impact on public finances', 5,
   'May cause short term material damage to national finances or economic interests (to an estimated total of £100s millions to £10 billion)'),

  -- Public Services: Impact on non-public finances
  ('Public Services', 'Impact on non-public finances', 1,
   'Minor financial loss to an individual or business (typically up to £100)'),
  ('Public Services', 'Impact on non-public finances', 2,
   'Significant financial loss to an individual or business'),
  ('Public Services', 'Impact on non-public finances', 3,
   'Severe financial loss to any individual such as unemployment or loss of a small UK business'),
  ('Public Services', 'Impact on non-public finances', 4,
   'Devastating financial loss for an individual, or severe economic loss leading to loss of a large company or employer or a number of small businesses'),
  ('Public Services', 'Impact on non-public finances', 5,
   'Material financial loss to the UK economy, leading to loss of a number of large organisation or severe damage to entire market sectors'),

  -- Public Services: Personal safety
  ('Public Services', 'Locally provisioned services with an impact on the personal safety of citizens', 1,
   'None'),
  ('Public Services', 'Locally provisioned services with an impact on the personal safety of citizens', 2,
   'Low risk to an individuals personal safety (e.g. the compromise of the address of a victim of abuse, where there is a low risk of further abuse if such information became known)'),
  ('Public Services', 'Locally provisioned services with an impact on the personal safety of citizens', 3,
   'Directly lead to a risk to an individuals personal safety (e.g. the compromise of the address of a victim of abuse, where there is a reasonable risk of further abuse if such information became known)'),
  ('Public Services', 'Locally provisioned services with an impact on the personal safety of citizens', 4,
   'Serious risk to any individual''s personal safety (e.g. the compromise of the address of a victim of abuse, where serious further abuse is likely if such information became known)'),
  ('Public Services', 'Locally provisioned services with an impact on the personal safety of citizens', 5,
   'Threaten life directly (e.g. the compromise of witness protection information, where there is a real risk of attempted murder if the information became known)'),

  -- Public Services: Health
  ('Public Services', 'Locally provisioned services with an impact on the health of citizens', 1,
   'Disruption to a local service'),
  ('Public Services', 'Locally provisioned services with an impact on the health of citizens', 2,
   'Disruption, compromise or flawed working of local services which could pose a risk to health (e.g. spread of disease)'),
  ('Public Services', 'Locally provisioned services with an impact on the health of citizens', 3,
   'Authority-wide disruption, compromise or flawed working of services which could pose an increased risk to health (e.g. spread of disease)'),
  ('Public Services', 'Locally provisioned services with an impact on the health of citizens', 4,
   'Significant authority-wide disruption, compromise or flawed working of services which could lead to major health risks'),
  ('Public Services', 'Locally provisioned services with an impact on the health of citizens', 5,
   'Major disruption or compromise of a Local Authorities services, or critical faults within these services, which could lead to severe health risks and limited loss of life'),

  -- Public Services: No health or safety impact
  ('Public Services', 'Locally provisioned services with no impact on health or safety of citizens', 1,
   'Cancellation of services to a small number (up to 10) of citizens (e.g. closure of a library or other facility)'),
  ('Public Services', 'Locally provisioned services with no impact on health or safety of citizens', 2,
   'Cancellation of services to a number (up to 100) of citizens (e.g. closure of a library or other facility)'),
  ('Public Services', 'Locally provisioned services with no impact on health or safety of citizens', 3,
   'Cancellation of multiple services to a number (up to 1000) of citizens leading to significant individual financial losses'),
  ('Public Services', 'Locally provisioned services with no impact on health or safety of citizens', 4,
   'Loss of major services provided by a Local Authorities leading to major financial losses to the Local Authority or Citizens'),
  ('Public Services', 'Locally provisioned services with no impact on health or safety of citizens', 5,
   'Total loss of major services provided by a Local Authorities leading to severe financial losses to the Local Authority or devastating losses to Citizens.'),

  -- Public Services: Civil Contingencies Act
  ('Public Services', 'Locally provisioned services in support of the Civil Contingencies Act', 1,
   'Isolated or minor incident to which a Local Authority is not able to react within a few days which affects a small number of citizens'),
  ('Public Services', 'Locally provisioned services in support of the Civil Contingencies Act', 2,
   'Isolated or minor incident to which a Local Authority is not able to react within a few days which affects a number of citizens/local businesses'),
  ('Public Services', 'Locally provisioned services in support of the Civil Contingencies Act', 3,
   'Significant incident to which a Local Authority is not able to react within 24 hours which affects a large number of citizens/local businesses - e.g. significant flooding, fire, contamination or explosion.'),
  ('Public Services', 'Locally provisioned services in support of the Civil Contingencies Act', 4,
   'Major incident to which a Local Authority is not able to react within 24 hours which affects a large number of citizens/local businesses - e.g. major flooding, fire, contamination, explosion or CNI failure.'),
  ('Public Services', 'Locally provisioned services in support of the Civil Contingencies Act', 5,
   'Major incident to which a Local Authority is not able to react within 12 hours which affects a large number of citizens/local businesses - e.g. major flooding, fire, contamination, explosion or CNI failure'),

  -- CNI: Communications
  ('Critical National Infrastructure (CNI)', 'Communications', 1, 'Local loss of telecoms for up to 12 hours'),
  ('Critical National Infrastructure (CNI)', 'Communications', 2, 'Local loss of telecoms for up to 24 hours'),
  ('Critical National Infrastructure (CNI)', 'Communications', 3, 'Loss of telecoms in a region for up to 24 hours'),
  ('Critical National Infrastructure (CNI)', 'Communications', 4, 'Loss of telecoms nationally for up to a week'),
  ('Critical National Infrastructure (CNI)', 'Communications', 5, 'Loss of telecoms nationally for more than 1 week'),

  -- CNI: Power
  ('Critical National Infrastructure (CNI)', 'Power', 1, 'Local outage causing disruption for up to 12 hours'),
  ('Critical National Infrastructure (CNI)', 'Power', 2, 'Loss of power in a region causing disruption for up to 24 hours'),
  ('Critical National Infrastructure (CNI)', 'Power', 3, 'Loss of power in a region causing disruption for up to a week'),
  ('Critical National Infrastructure (CNI)', 'Power', 4, 'Loss of power in a region causing disruption for more than 1 week'),
  ('Critical National Infrastructure (CNI)', 'Power', 5, 'Loss of power nationally affecting the whole of the UK for more than 1 week'),

  -- CNI: Finance
  ('Critical National Infrastructure (CNI)', 'Finance', 1, 'Minimal impact (less than £10,000)'),
  ('Critical National Infrastructure (CNI)', 'Finance', 2, 'Minor loss to a Financial Company (less than £1 million)'),
  ('Critical National Infrastructure (CNI)', 'Finance', 3, 'Major loss of a Leading Financial company of £millions'),
  ('Critical National Infrastructure (CNI)', 'Finance', 4, 'Major loss of a Leading Financial Company of £10s millions'),
  ('Critical National Infrastructure (CNI)', 'Finance', 5, 'Severe losses to UK Business of up to £100s millions'),

  -- CNI: Transport
  ('Critical National Infrastructure (CNI)', 'Transport', 1, 'Minor disruption of a key local transport systems for up to 24 hours'),
  ('Critical National Infrastructure (CNI)', 'Transport', 2, 'Disruption of a number of key local transport systems for up to 24 hours'),
  ('Critical National Infrastructure (CNI)', 'Transport', 3, 'Major disruption of key regional transport systems for up to a week'),
  ('Critical National Infrastructure (CNI)', 'Transport', 4, 'Severe national disruption of key transport systems for up to a month'),
  ('Critical National Infrastructure (CNI)', 'Transport', 5, 'Severe national disruption of key transport systems for over a month'),

  -- CNI: Water and Sewage
  ('Critical National Infrastructure (CNI)', 'Water and Sewage', 1,
   'Breakdown of local water supplies and/or sewage service for a small number (<10) of people for more than a day'),
  ('Critical National Infrastructure (CNI)', 'Water and Sewage', 2,
   'Breakdown of local water supplies and/or sewage service for a small number (<50) of people for more than a week'),
  ('Critical National Infrastructure (CNI)', 'Water and Sewage', 3,
   'Breakdown of local water supplies and/or sewage service for a number (up to 100) of people or prolonged drought (up to 1 month)'),
  ('Critical National Infrastructure (CNI)', 'Water and Sewage', 4,
   'Breakdown of local water suppliers and/or sewage service for over 100 people or prolonged drought (up to 1 month)'),
  ('Critical National Infrastructure (CNI)', 'Water and Sewage', 5,
   'Breakdown of regional water suppliers and/or sewage service (affecting >100 people) or prolonged drought (up to 3 months)'),

  -- CNI: Food and Consumables
  ('Critical National Infrastructure (CNI)', 'Food and Consumables', 1,
   'Local disruption to the distribution of some essential goods, fuel, raw materials, medicines and/or disruption of food for up to a month'),
  ('Critical National Infrastructure (CNI)', 'Food and Consumables', 2,
   'Regional disruption to the distribution of some essential goods, fuel, raw materials and medicines and/or widespread disruption of food for up to a week'),
  ('Critical National Infrastructure (CNI)', 'Food and Consumables', 3,
   'Regional disruption to the distribution of some essential goods, fuel, raw materials and medicines and widespread disruption of food for up to a month'),
  ('Critical National Infrastructure (CNI)', 'Food and Consumables', 4,
   'National disruption to the distribution of essential goods, fuel, raw materials and medicines and widespread disruption of food for up to a month'),
  ('Critical National Infrastructure (CNI)', 'Food and Consumables', 5,
   'National disruption to the distribution of essential goods, fuel, raw materials and medicines and widespread disruption of food for over a month'),

  -- Personal/Citizen: Impact on health and safety
  ('Personal / Citizen', 'Impact on health and safety of the Citizen', 1,
   'Compromise an individual''s personal safety or security.'),
  ('Personal / Citizen', 'Impact on health and safety of the Citizen', 2,
   'Minor injuries to a group of individuals or serious injury to an individual involving slight to moderate pain for 2-7 days. Thereafter some pain/discomfort for several weeks. Some restrictions to work and/or leisure activities over several weeks/months. After 3-4 months return to normal health with no permanent disability.'),
  ('Personal / Citizen', 'Impact on health and safety of the Citizen', 3,
   'Serious injury to several individuals or compromise of a group of individuals personal safety'),
  ('Personal / Citizen', 'Impact on health and safety of the Citizen', 4,
   'Permanent incapacitating injury or illness to an individual, Moderate to severe pain for 1-4 weeks. Thereafter some pain gradually reducing, but may recur when taking part in some activities. Some permanent restrictions to leisure and possibly some work activities and may directly threaten their life.'),
  ('Personal / Citizen', 'Impact on health and safety of the Citizen', 5,
   'Permanently incapacitating injury or illness to many individuals that may lead to widespread loss of life.'),

  -- Personal/Citizen: Privacy
  ('Personal / Citizen', 'Impact on the Privacy of the Citizen', 1,
   'Loss of control of a citizen''s personal data beyond those authorised by the citizen.'),
  ('Personal / Citizen', 'Impact on the Privacy of the Citizen', 2,
   'Loss of control of many citizens'' personal data beyond those authorised by each citizen.'),
  ('Personal / Citizen', 'Impact on the Privacy of the Citizen', 3,
   'Loss of control of a citizen''s sensitive data beyond those authorised by the citizen. A compromise to the identity or financial status of an individual citizen.'),
  ('Personal / Citizen', 'Impact on the Privacy of the Citizen', 4,
   'Loss of control of many citizens'' sensitive or financially significant personal data beyond those authorised by each citizen. A compromise to the identity or financial status of many citizens. Increased vulnerability to criminal attack.'),
  ('Personal / Citizen', 'Impact on the Privacy of the Citizen', 5,
   'Widespread compromise of identity management systems or personal financial systems across the UK.'),

  -- Personal/Citizen: Identity
  ('Personal / Citizen', 'Impact on the Identity of the Citizen', 1,
   'Illicit access using one individual''s identity on behalf of another would allow the entry of incorrect information, thereby causing distress, or access to payments intended for that person or could further a subsequent impersonation attack on that individual.'),
  ('Personal / Citizen', 'Impact on the Identity of the Citizen', 2,
   'Illicit access using several individual''s identities would allow the entry of incorrect information, thereby causing distress, or access to payments intended for those people or could further subsequent impersonation attacks on several individuals.'),
  ('Personal / Citizen', 'Impact on the Identity of the Citizen', 3,
   'Illicit access using many (thousands of) individual''s identities would allow the entry of incorrect information, thereby causing distress, or access to payments intended for those people or could further subsequent impersonation attacks on many individuals.'),
  ('Personal / Citizen', 'Impact on the Identity of the Citizen', 4,
   'Illicit access would facilitate a serious crime, such as blackmail or long-term fraud or disrupt an on-going legal process or provide the means of creating an illicit real world identity for an individual or several individuals.'),
  ('Personal / Citizen', 'Impact on the Identity of the Citizen', 5,
   'Illicit access could lead to the loss of liberty or life of an individual or several individuals.'),

  -- Personal/Citizen: Utilisation of Public Services
  ('Personal / Citizen', 'Utilisation of Public Services', 1,
   'Minimal disruption to a group of individuals or significant disruption in service delivery or distress to an individual. For example availability to a set of personal information is lost, requiring resubmission of identity evidence before minor services can be delivered (e.g. library lending)'),
  ('Personal / Citizen', 'Utilisation of Public Services', 2,
   'Significant disruption to service delivery for a number of individuals, such as nation wide. For example loss of ability to deliver a non-essential service nation wide'),
  ('Personal / Citizen', 'Utilisation of Public Services', 3,
   'Substantial disruption to service delivery to a large group of individuals, perhaps nationally. Lack of services may directly threaten the safety or wellbeing of an individual or a small group. For example, loss of personal entitlement information for social security payments'),
  ('Personal / Citizen', 'Utilisation of Public Services', 4,
   'Severe disruption to service delivery to a large group of individuals, that may directly threaten safety or lead to limited loss of life, for example limited loss of sensitive police records.'),
  ('Personal / Citizen', 'Utilisation of Public Services', 5,
   'Severe and widespread disruption to service delivery, which may directly lead to widespread loss of life, for example severe loss of availability of many medical records'),

  -- Personal/Citizen: Embarrassment or distress
  ('Personal / Citizen', 'Embarrassment or distress', 1,
   'Short-term distress or significant embarrassment to an individual, such as compromise of their financial credit score'),
  ('Personal / Citizen', 'Embarrassment or distress', 2,
   'Prolonged distress for an individual citizen, short-term distress or significant embarrassment for many citizens. For example permanent loss of professional standing for an individual, leading to identity theft for an individual'),
  ('Personal / Citizen', 'Embarrassment or distress', 3,
   'Prolonged and severe distress for a significant number of citizens, or extreme distress for an individual. For example, total compromise of an individual''s medical history or partial compromise for a group. Loss, leading to identity theft for a group of individuals'),
  ('Personal / Citizen', 'Embarrassment or distress', 4,
   'Severe distress to an individual to the extent that it may lead to loss of life (for example compromise of witness protection information). Widespread and severe distress to a large group of individuals, possibly nation wide'),
  ('Personal / Citizen', 'Embarrassment or distress', 5,
   'Severe and extreme distress to a large group of individuals, leading directly to widespread loss of life. For example the total compromise of an entire nation wide witness protection scheme'),

  -- Personal/Citizen: Personal Finance
  ('Personal / Citizen', 'Personal Finance', 1,
   'Major financial loss for an individual, but not involving any financial hardship, or minor loss for a small group of individuals'),
  ('Personal / Citizen', 'Personal Finance', 2,
   'Significant loss of income for an individual, such that it has a short-term impact on the individual''s way of life or causes some financial hardship.'),
  ('Personal / Citizen', 'Personal Finance', 3,
   'Substantial loss of income for a significant group of individuals that causes financial hardship. Financially devastating for an individual for example personal bankruptcy and repossession of home.'),
  ('Personal / Citizen', 'Personal Finance', 4,
   'Financially devastating for a large group of individuals for example wide spread personal bankruptcy and repossession of homes.'),
  ('Personal / Citizen', 'Personal Finance', 5,
   'Financial impacts are wide spread to the extent that major long-term damage is caused to the UK economy.')

) AS v(cat_name, subcat_name, level, description)
JOIN bil_categories    c  ON c.name = v.cat_name  AND c.org_type = 'government'
JOIN bil_subcategories sc ON sc.category_id = c.id AND sc.name = v.subcat_name
ON CONFLICT (subcategory_id, level) DO NOTHING;
