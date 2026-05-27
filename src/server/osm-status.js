const fs = require('fs')

const DB_FILE = 'data/osm-status.json'
const VALID = ['full', 'partial', 'none']

function loadDb (callback) {
  fs.readFile(DB_FILE, 'utf8', (err, data) => {
    if (err && err.code === 'ENOENT') return callback(null, {})
    if (err) return callback(err)
    try {
      callback(null, JSON.parse(data))
    } catch (e) {
      callback(null, {})
    }
  })
}

function saveDb (db, callback) {
  fs.writeFile(DB_FILE, JSON.stringify(db, null, '  '), callback)
}

module.exports = function (options, callback) {
  if (options.action === 'set') {
    const status = VALID.includes(options.status) ? options.status : 'full'
    loadDb((err, db) => {
      if (err) return callback(err)
      if (!db[options.dataset]) db[options.dataset] = {}
      db[options.dataset][options.id] = status
      saveDb(db, (err) => callback(err, { ok: true }))
    })
  } else {
    loadDb((err, db) => {
      if (err) return callback(err)
      callback(null, db[options.dataset] || {})
    })
  }
}
