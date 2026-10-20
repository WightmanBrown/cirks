// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Wightman Brown Limited

// Who may complete a security-action item.
//
// This mirrors the server rule on POST /risks/:id/action-items/:iid/complete,
// which is deliberately outside the capability model:
//
//   "Gated to the CISO, a risk analyst, or the system owner (custom, not a
//    capability — the system owner may not hold risks.write)."
//
// It lives here because both RiskDetailPage and ActionDetailPage need it and
// because it was previously approximated by `canEdit` (ciso / admin /
// risk_analyst-on-a-pending-risk) in one place and absent in the other — so the
// system owner, who is typically the person named Responsible on every item,
// had no affordance anywhere in the product. A rule this easy to restate
// slightly wrong is worth stating once.

/** Roles that may complete any item, regardless of who owns the system. */
export const PRIVILEGED_ITEM_ROLES = ['ciso', 'risk_analyst', 'admin'];

/** Items are only completable once the action has been accepted. */
export const ACCEPTED_ACTION_STATUSES = ['planned', 'in_progress'];

/**
 * @param {object}  a
 * @param {string}  a.actionStatus        the parent action's status
 * @param {string}  a.itemStatus          this item's status
 * @param {string}  a.role                the viewer's ACTIVE role
 * @param {string}  a.userId              the viewer's id
 * @param {string} [a.systemOwnerUserId]  owner of the item's system, if known
 * @returns {boolean}
 */
export function mayCompleteItem({
  actionStatus, itemStatus, role, userId, systemOwnerUserId,
}) {
  if (!ACCEPTED_ACTION_STATUSES.includes(actionStatus)) return false;
  if (itemStatus === 'completed') return false;
  if (PRIVILEGED_ITEM_ROLES.includes(role)) return true;
  // Both ids must be present: two undefineds are not the same person.
  return Boolean(userId && systemOwnerUserId && userId === systemOwnerUserId);
}
