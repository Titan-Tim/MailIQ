/**
 * Teams API — SUPER_ADMIN only, tenant-scoped.
 * Mounted at /api/teams. A team groups users and owns shared mailboxes.
 */
const router = require('express').Router()
const prisma = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')

router.use(requireAuth, requireRole('SUPER_ADMIN'))

// GET /api/teams
router.get('/', async (req, res) => {
  const teams = await prisma.team.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: { name: 'asc' },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      mailboxes: { where: { isActive: true }, select: { id: true, name: true } },
    },
  })
  res.json({ teams })
})

// POST /api/teams
router.post('/', async (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name required' })
  const team = await prisma.team.create({ data: { tenantId: req.user.tenantId, name } })
  res.status(201).json(team)
})

// PUT /api/teams/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.team.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const name = (req.body?.name || '').trim()
  const team = await prisma.team.update({ where: { id: existing.id }, data: { name: name || existing.name } })
  res.json(team)
})

// DELETE /api/teams/:id  (cascades memberships; mailboxes fall back to GENERAL)
router.delete('/:id', async (req, res) => {
  const existing = await prisma.team.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  await prisma.team.delete({ where: { id: existing.id } })
  res.json({ deleted: true })
})

// POST /api/teams/:id/members  { userId }
router.post('/:id/members', async (req, res) => {
  const team = await prisma.team.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!team) return res.status(404).json({ error: 'Not found' })
  const user = await prisma.user.findFirst({ where: { id: req.body?.userId, tenantId: req.user.tenantId } })
  if (!user) return res.status(400).json({ error: 'Invalid user' })
  const member = await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    update: {},
    create: { teamId: team.id, userId: user.id },
  })
  res.status(201).json(member)
})

// DELETE /api/teams/:id/members/:userId
router.delete('/:id/members/:userId', async (req, res) => {
  const team = await prisma.team.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } })
  if (!team) return res.status(404).json({ error: 'Not found' })
  await prisma.teamMember.deleteMany({ where: { teamId: team.id, userId: req.params.userId } })
  res.json({ deleted: true })
})

module.exports = router
