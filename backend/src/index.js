require('dotenv').config()
const express    = require('express')
const cors       = require('cors')
const path       = require('path')

const authRouter      = require('./routes/auth')
const dispatchRouter  = require('./routes/dispatches')
const recipientRouter = require('./routes/recipients')
const insertRouter    = require('./routes/inserts')
const rulesRouter     = require('./routes/rules')
const batchRouter     = require('./routes/batches')
const trackRouter     = require('./routes/track')
const returnRouter    = require('./routes/returns')

const app = express()

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))
app.use(express.json())

// Auth-protected API routes
app.use('/api/auth',       authRouter)
app.use('/api/dispatches', dispatchRouter)
app.use('/api/recipients', recipientRouter)
app.use('/api/inserts',    insertRouter)
app.use('/api/rules',      rulesRouter)
app.use('/api/batches',    batchRouter)
app.use('/api/returns',    returnRouter)

// Public tracking route (no auth — recipient-facing)
app.use('/api/track', trackRouter)

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }))

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  if (err.message?.includes('Only PDF')) return res.status(400).json({ error: err.message })
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => console.log(`Jasmitan Mail API running on :${PORT}`))
