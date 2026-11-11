import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PORT = 3001
const DATA_DIR = join(process.cwd(), 'data')

mkdirSync(DATA_DIR, { recursive: true })

const db = new DatabaseSync(join(DATA_DIR, 'dev.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

const getItems = db.prepare(
  'SELECT id, name, created_at FROM items ORDER BY id DESC'
)

const createItem = db.prepare(
  'INSERT INTO items (name) VALUES (?)'
)

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(data))
}

async function readJson(req) {
  let body = ''

  for await (const chunk of req) {
    body += chunk
    if (Buffer.byteLength(body) > 1_000_000) {
      throw new Error('Request body too large')
    }
  }

  return JSON.parse(body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' })
    }

    if (req.method === 'GET' && url.pathname === '/api/items') {
      return sendJson(res, 200, { items: getItems.all() })
    }

    if (req.method === 'POST' && url.pathname === '/api/items') {
      let body

      try {
        body = await readJson(req)
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON body' })
      }

      if (
        typeof body.name !== 'string' ||
        !body.name.trim() ||
        body.name.trim().length > 120
      ) {
        return sendJson(res, 400, {
          error: 'Name must be a non-empty string of at most 120 characters',
        })
      }

      const result = createItem.run(body.name.trim())

      return sendJson(res, 201, {
        item: {
          id: Number(result.lastInsertRowid),
          name: body.name.trim(),
        },
      })
    }

    return sendJson(res, 404, { error: 'Route not found' })
  } catch {
    return sendJson(res, 500, { error: 'Internal server error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`API running at http://127.0.0.1:${PORT}`)
  console.log(`SQLite database: ${join(DATA_DIR, 'dev.db')}`)
})
