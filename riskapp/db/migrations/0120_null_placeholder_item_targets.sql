-- 0120 — clear action-item targets that were never a judgement
--
-- WHY. An item's `target_p_*` is meant to be a HUMAN JUDGEMENT: what the attack
-- probability will be once THIS control is working. It was seeded from
-- `COALESCE(judged residual, threat inherent)` — and an action is built from the
-- GAP, so its controls are exactly the ones nobody has judged. Every such item
-- was therefore created carrying the threat inherent, which means "no control at
-- all": an action promising no improvement whatsoever.
--
-- The consequence reached the register. `tgt_p_*` is the MIN over open items'
-- targets, then LEAST(target, current) — so a target no better than untreated
-- clamps straight back to the present, and the Target Risk column renders
-- identical to Current Risk. Measured on CIRKS-test before this migration: 29 of
-- 41 open control items carried a target equal to the threat inherent, and only
-- 1 risk of 12 with a target showed one genuinely lower than its current score.
--
-- Reported by the owner as "the current and the target remain the same… somewhere
-- I have made a mistake in the requested logic". The model is now explicit: a
-- target is a human judgement per control, never derived.
--
-- WHAT THIS DOES. Null the targets that are demonstrably placeholders — those
-- exactly equal to their risk's threat inherent on all three dimensions. A
-- deliberate judgement of "this control achieves nothing" is indistinguishable
-- from the placeholder by value alone, but nobody builds an action to achieve
-- nothing, and leaving a fabricated number in place is worse than losing a
-- hypothetical real one that can be re-entered.
--
-- NULL is the honest state: the register shows "—" for target where nobody has
-- said what the work will buy, instead of a figure asserting it will buy nothing.
-- Item targets stay nullable and the MIN ignores NULL, so no other code changes.

UPDATE public.security_action_items sai
   SET target_p_c = NULL, target_p_i = NULL, target_p_a = NULL
  FROM public.security_action_risks sar
  JOIN public.risks r   ON r.id = sar.risk_id
  JOIN public.threats t ON t.id = r.threat_id
 WHERE sar.action_id = sai.action_id
   AND sai.element_type = 'control'
   AND sai.target_p_c IS NOT NULL
   AND sai.target_p_c = t.probability_c
   AND sai.target_p_i = t.probability_i
   AND sai.target_p_a = t.probability_a;
