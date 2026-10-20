-- 0135 — anyone at the SWG can see the findings it is asked about
--
-- WHY. v134 put each derived finding on the SWG agenda with a link to its detail,
-- and gated that detail on `assets.read`. The SIRO and the meeting secretary do
-- not hold it — and they are precisely the audience: the rating-completeness
-- report was specified for "the CISO and the SIRO", and the secretary runs the
-- meeting the line sits in. Clicking the line would have bounced them silently.
--
-- `findings.read` is modelled on `exceptions.read`, deliberately: a finding is
-- the other half of the same act (a finding is acted on or ACCEPTED, and
-- accepting will generalise risk_exceptions — docs/assurance-findings.md §6), and
-- v68 made exceptions readable by every role for transparency. Same holders, same
-- scopes: IAM/IAO see their own department's (plus shared) rows when department
-- isolation is on; everyone else sees all. Reading is not raising — raising stays
-- `findings.act` (v134).
--
-- Catalogue row always; grants only on an existing install (fresh installs get
-- them from db/seed.js — CLAUDE.md, v109/v113). The grants copy each role's
-- exceptions.read scope rather than hard-coding it, so an administrator who has
-- narrowed exceptions.read on an install has findings.read narrowed the same way.

INSERT INTO capabilities (key, resource, action, dept_scopable, description)
VALUES ('findings.read', 'findings', 'read', TRUE,
        'View derived assurance findings (own department for IAM/IAO)')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role, capability_key, scope)
SELECT rp.role, 'findings.read', rp.scope
  FROM role_permissions rp
 WHERE rp.capability_key = 'exceptions.read'
ON CONFLICT DO NOTHING;
