-- 0116 — an append-only note stream for actions and their items
--
-- WHY. Progress on an action was a single `security_actions.progress_notes` text
-- column, overwritten in place. It recorded no author and no time, kept no
-- history, and wrote nothing to `audit_log` — so "who said what, and when" was
-- unanswerable. Used on 1 of 14 actions on CIRKS-test, which is what people make
-- of a field that cannot be trusted to still say tomorrow what it says today.
--
-- It also carried a live bug. `needsUpdateSql` treated an action as up to date
-- when the column was non-empty AND `updated_at >= the meeting date`, while the
-- `trg_sa_upd` trigger bumps `updated_at` on ANY update. Accepting an action, or
-- editing its title, silently cleared "needs a progress update" without anyone
-- having logged progress.
--
-- GRAIN. Notes hang off the ITEM, not only the action: the SWG's question is
-- "what is the status of the work on THIS control", and an action is a container
-- spanning several. A NULL `item_id` is a note about the action as a whole, which
-- is what the old column meant, so one table serves both.
--
-- APPEND-ONLY. A note cannot be edited: `trg_action_notes_no_update` refuses
-- UPDATE outright. DELETE is deliberately left alone so the ON DELETE CASCADE
-- from an action still works — a BEFORE DELETE guard would block the cascade and
-- make actions undeletable. The guarantee is therefore "a recorded note is never
-- silently rewritten", which is the one that matters for a narrative an auditor
-- reads.
--
-- The composite FK pins a note's item to the same action, so an item's dialogue
-- cannot be filed against the wrong action. item_id is nullable and MATCH SIMPLE
-- is the default, so an action-level note skips the check entirely.

CREATE TABLE public.security_action_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id      uuid NOT NULL REFERENCES public.security_actions(id) ON DELETE CASCADE,
  item_id        uuid REFERENCES public.security_action_items(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_action_note_not_blank CHECK (TRIM(BOTH FROM note) <> '')
);

-- Lets the composite FK below tie (item, action) together.
ALTER TABLE public.security_action_items
  ADD CONSTRAINT security_action_items_id_action_key UNIQUE (id, action_id);

ALTER TABLE public.security_action_notes
  ADD CONSTRAINT security_action_notes_item_belongs_to_action
  FOREIGN KEY (item_id, action_id)
  REFERENCES public.security_action_items(id, action_id) ON DELETE CASCADE;

CREATE INDEX idx_action_notes_action ON public.security_action_notes (action_id, created_at DESC);
CREATE INDEX idx_action_notes_item   ON public.security_action_notes (item_id, created_at DESC)
  WHERE item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_action_notes_no_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'security_action_notes is append-only: a recorded note cannot be edited';
END;
$$;

CREATE TRIGGER trg_action_notes_no_update
  BEFORE UPDATE ON public.security_action_notes
  FOR EACH ROW EXECUTE FUNCTION public.fn_action_notes_no_update();

-- Carry the existing column across as action-level notes. The author is unknown
-- — the column never recorded one — so it stays NULL and reads as unattributed,
-- which is honest rather than inventing one. updated_at is the closest thing to
-- a time the note was written, and is at least an upper bound.
INSERT INTO public.security_action_notes (action_id, item_id, author_user_id, note, created_at)
SELECT sa.id, NULL, NULL, sa.progress_notes, COALESCE(sa.updated_at, sa.created_at)
  FROM public.security_actions sa
 WHERE sa.progress_notes IS NOT NULL AND TRIM(BOTH FROM sa.progress_notes) <> '';

ALTER TABLE public.security_actions DROP COLUMN progress_notes;
