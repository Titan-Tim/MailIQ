/**
 * Inbound access control — the single source of truth for who can see what.
 *
 * Privacy model (enforced here, server-side — never rely on the UI):
 *   • PERSONAL mailbox content → the owner ONLY. Admins CANNOT read another
 *     person's personal inbox.
 *   • TEAM mailbox content → members of that team, plus SUPER_ADMIN.
 *   • GENERAL (unassigned) mailbox content + TRIAGE (unrouted) → SUPER_ADMIN
 *     and OPERATOR (the people who manage routing).
 *
 * Also lazily ensures every user has their own personal mailbox, so existing
 * users get one the first time they touch the inbound module.
 */
const prisma = require('../db')

async function ensurePersonalMailbox(user) {
  const existing = await prisma.mailbox.findFirst({
    where: { tenantId: user.tenantId, ownerUserId: user.id },
  })
  if (existing) return existing
  return prisma.mailbox.create({
    data: {
      tenantId: user.tenantId,
      name: user.name || user.email,
      email: user.email,
      ownerUserId: user.id,
      keywords: user.name || null, // so name-addressed post routes to them
    },
  })
}

/**
 * @returns {Promise<{contentMailboxIds:Set<string>, canSeeTriage:boolean,
 *                    canManage:boolean, isAdmin:boolean}>}
 */
async function getInboundAccess(user) {
  const isAdmin = user.role === 'SUPER_ADMIN'
  const isOperator = user.role === 'OPERATOR'

  const [memberships, mailboxes] = await Promise.all([
    prisma.teamMember.findMany({ where: { userId: user.id }, select: { teamId: true } }),
    prisma.mailbox.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, teamId: true, ownerUserId: true },
    }),
  ])
  const teamIds = new Set(memberships.map((m) => m.teamId))

  // Self-heal: make sure this user has a personal mailbox.
  if (!mailboxes.some((m) => m.ownerUserId === user.id)) {
    const created = await ensurePersonalMailbox(user)
    mailboxes.push({ id: created.id, teamId: null, ownerUserId: user.id })
  }

  const contentMailboxIds = new Set()
  for (const m of mailboxes) {
    if (m.ownerUserId) {
      if (m.ownerUserId === user.id) contentMailboxIds.add(m.id)          // personal → owner only
    } else if (m.teamId) {
      if (isAdmin || teamIds.has(m.teamId)) contentMailboxIds.add(m.id)   // team → members + admin
    } else {
      if (isAdmin || isOperator) contentMailboxIds.add(m.id)              // general → staff
    }
  }

  return {
    contentMailboxIds,
    canSeeTriage: isAdmin || isOperator,
    canManage: isAdmin || isOperator,
    isAdmin,
  }
}

/** Can this user read this specific item? (Honours the privacy model + triage.) */
function canAccessItem(access, item) {
  return item.matchedMailboxId
    ? access.contentMailboxIds.has(item.matchedMailboxId)
    : access.canSeeTriage
}

module.exports = { getInboundAccess, ensurePersonalMailbox, canAccessItem }
