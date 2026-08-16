const fs = require('fs')
const path = require('path')

const timestamp = require('../timestamp')

// One file per entity. The set of cached entities can grow into the thousands,
// so a single rewritten file (like osm-status.json) would be wasteful.
const DIR = 'data/state/wikidata'

fs.mkdirSync(DIR, { recursive: true })

// In-memory layer in front of the disk, keyed by entity id.
const memory = {}

function fileName (id) {
  return path.join(DIR, id + '.json')
}

function fresh (entry, reload) {
  return !reload || entry.ts > reload
}

/**
 * Look up a processed entity. Checks the in-memory layer first, then disk.
 * @param {string} id - Wikidata entity id (e.g. Q42)
 * @param {Object} options - may contain a `reload` timestamp to invalidate older entries
 * @param {function} callback - callback(err, data) - data is undefined on a miss
 */
function get (id, options, callback) {
  const reload = options && options.reload

  const mem = memory[id]
  if (mem && fresh(mem, reload)) {
    return callback(null, mem.data)
  }

  fs.readFile(fileName(id), 'utf8', (err, content) => {
    if (err) {
      return callback(null, undefined)
    }

    let entry
    try {
      entry = JSON.parse(content)
    } catch (e) {
      return callback(null, undefined)
    }

    if (!fresh(entry, reload)) {
      return callback(null, undefined)
    }

    memory[id] = entry
    callback(null, entry.data)
  })
}

/**
 * Store a processed entity in memory and (asynchronously) on disk.
 */
function set (id, data) {
  const entry = { ts: timestamp(), data }
  memory[id] = entry

  fs.writeFile(fileName(id), JSON.stringify(entry), err => {
    if (err) {
      console.error('wikidataCache: failed to write ' + id + ': ' + err.message)
    }
  })
}

module.exports = { get, set }
