const async = require('async')
const fetch = require('node-fetch')
const findWikidataItems = require('find-wikidata-items')

const cache = require('./wikidataCache')
const getUserAgent = require('../getUserAgent.js')
const wikidataLabel = require('../wikidataLabel.js')
const wikidataValueText = require('../wikidataValueText.js')

const API = 'https://www.wikidata.org/w/api.php'
const SPARQL = 'https://query.wikidata.org/sparql?query='
const MAX_IDS = 50 // wbgetentities accepts up to 50 ids per request
const maxActive = 5 // concurrent outbound requests (stay polite to Wikimedia)
const DISPATCH_GAP = 120 // ms minimum spacing between dispatches

let active = 0
let timer = null

// pending entity-id loads, deduplicated by id: id -> [callback, ...]
const pendingIds = new Map()
// pending refProperty lookups: [{ key, id, options, resolve }]
const pendingRefs = []
// pending SPARQL queries: [{ options, resolve }]
const pendingQueries = []

// session-wide label cache (property titles + referenced item labels)
const labelCache = {}

// -- scheduler -------------------------------------------------------------

function hasWork () {
  return pendingIds.size || pendingRefs.length || pendingQueries.length
}

function schedule () {
  if (timer || active >= maxActive || !hasWork()) {
    return
  }
  timer = global.setTimeout(() => { timer = null; drain() }, 0)
}

function drain () {
  if (active >= maxActive || !hasWork()) {
    return
  }

  active++
  let released = false
  const release = () => {
    if (released) { return }
    released = true
    active--
    schedule()
  }

  dispatchOne(release)

  // stagger further dispatches a little for politeness
  if (hasWork() && active < maxActive && !timer) {
    timer = global.setTimeout(() => { timer = null; drain() }, DISPATCH_GAP)
  }
}

function dispatchOne (release) {
  if (pendingIds.size) {
    const ids = []
    for (const id of pendingIds.keys()) {
      ids.push(id)
      if (ids.length >= MAX_IDS) { break }
    }
    const resolvers = {}
    ids.forEach(id => { resolvers[id] = pendingIds.get(id); pendingIds.delete(id) })
    return loadEntities(ids, resolvers, release)
  }

  if (pendingRefs.length) {
    const key = pendingRefs[0].key
    const batch = []
    const rest = []
    pendingRefs.forEach(ref => {
      if (ref.key === key && batch.length < MAX_IDS) {
        batch.push(ref)
      } else {
        rest.push(ref)
      }
    })
    pendingRefs.length = 0
    rest.forEach(r => pendingRefs.push(r))
    return loadRefs(key, batch, release)
  }

  if (pendingQueries.length) {
    const q = pendingQueries.shift()
    return loadQuery(q.options, q.resolve, release)
  }

  release()
}

// -- request entry points --------------------------------------------------

/**
 * Look up a single entity by id, using the cache and the batched id queue.
 */
function requestEntity (id, options, callback) {
  cache.get(id, options, (err, data) => {
    if (err) { return callback(err) }
    if (data !== undefined) { return callback(null, data) }

    if (pendingIds.has(id)) {
      pendingIds.get(id).push(callback)
    } else {
      pendingIds.set(id, [callback])
    }
    schedule()
  })
}

/**
 * Look up several entities by id, returning an array of the found ones.
 */
function requestEntities (ids, options, callback) {
  async.map(ids,
    (id, done) => requestEntity(id, options, done),
    (err, entities) => {
      if (err) { return callback(err) }
      callback(null, entities.filter(e => e))
    }
  )
}

// -- loaders (each holds an active slot only while doing real HTTP work) ----

function loadEntities (ids, resolvers, release) {
  apiGetEntities(ids, 'claims|labels|descriptions|sitelinks', (err, entities) => {
    if (err) {
      ids.forEach(id => resolvers[id].forEach(cb => cb(err)))
      return release()
    }

    resolveLabels(entities, () => {
      ids.forEach(id => {
        const raw = entities[id]
        let processed = null
        if (raw && !('missing' in raw)) {
          processed = processEntity(raw)
          cache.set(id, processed)
        }
        resolvers[id].forEach(cb => cb(null, processed))
      })
      release()
    })
  })
}

function loadRefs (key, batch, release) {
  const queries = batch.map(b => {
    const q = {}
    q[key] = b.id
    return q
  })

  findWikidataItems(queries, {}, (err, results) => {
    release()

    if (err) {
      return batch.forEach(b => b.resolve(err))
    }

    batch.forEach((b, i) => {
      const ids = Object.keys((results && results[i]) || {})
      requestEntities(ids, b.options, b.resolve)
    })
  })
}

function loadQuery (options, resolve, release) {
  fetch(SPARQL + encodeURIComponent(options.query),
    {
      headers: {
        // lower case to avoid forbidden request headers, see:
        // https://github.com/ykzts/node-xmlhttprequest/pull/18/commits/7f73611dc3b0dd15b0869b566f60b64cd7aa3201
        'user-agent': getUserAgent(),
        accept: 'application/json'
      }
    })
    .then(response => response.json())
    .then(result => {
      release()

      const ids = []
      result.results.bindings.forEach(item => {
        const m = item.item && item.item.value.match(/(Q[0-9]+)$/)
        if (m) { ids.push(m[1]) }
      })

      const _options = JSON.parse(JSON.stringify(options))
      delete _options.query

      requestEntities(ids, _options, resolve)
    })
    .catch(err => {
      release()
      global.setTimeout(() => resolve(err), 0)
    })
}

// -- Wikidata API helpers --------------------------------------------------

function apiGetEntities (ids, props, callback) {
  const url = API + '?action=wbgetentities&format=json' +
    '&ids=' + ids.join('|') +
    '&props=' + props +
    '&languages=de-at|de|en'

  fetch(url,
    {
      headers: {
        'user-agent': getUserAgent(),
        accept: 'application/json'
      }
    })
    .then(response => response.json())
    .then(result => {
      if (result.error) {
        return callback(new Error('Wikidata API error: ' + (result.error.info || result.error.code)))
      }
      callback(null, result.entities || {})
    })
    .catch(err => callback(err))
}

/**
 * Resolve labels for every property and referenced item across a batch of
 * entities into the session labelCache (best-effort; failures are ignored).
 */
function resolveLabels (entities, callback) {
  const needed = new Set()

  Object.keys(entities).forEach(id => {
    const entity = entities[id]
    if (!entity || !entity.claims) { return }

    Object.keys(entity.claims).forEach(prop => {
      if (!(prop in labelCache)) { needed.add(prop) }

      entity.claims[prop].forEach(claim => {
        const snak = claim.mainsnak
        if (snak && snak.snaktype === 'value' && snak.datavalue && snak.datavalue.type === 'wikibase-entityid') {
          const vid = snak.datavalue.value.id
          if (vid && !(vid in labelCache)) { needed.add(vid) }
        }
      })
    })
  })

  const ids = [...needed]
  if (!ids.length) { return callback() }

  const chunks = []
  for (let i = 0; i < ids.length; i += MAX_IDS) {
    chunks.push(ids.slice(i, i + MAX_IDS))
  }

  async.eachSeries(chunks,
    (chunk, done) => {
      apiGetEntities(chunk, 'labels', (err, result) => {
        if (err) { return done() }
        chunk.forEach(id => {
          const entity = result[id]
          labelCache[id] = (entity && wikidataLabel(entity.labels)) || id
        })
        done()
      })
    },
    () => callback()
  )
}

/**
 * Add `claimsTitle` (property labels) and per-claim `.text` (rendered value),
 * matching the shape the rest of the app expects.
 */
function processEntity (entity) {
  entity.claimsTitle = {}

  Object.keys(entity.claims || {}).forEach(prop => {
    entity.claimsTitle[prop] = labelCache[prop] || prop

    entity.claims[prop].forEach(claim => {
      const snak = claim.mainsnak
      if (snak && snak.snaktype === 'value' && snak.datavalue && snak.datavalue.type === 'wikibase-entityid') {
        claim.text = labelCache[snak.datavalue.value.id] || snak.datavalue.value.id
      } else {
        claim.text = wikidataValueText(snak)
      }
    })
  })

  return entity
}

// -- public interface ------------------------------------------------------

function request (options, callback) {
  if (options.query) {
    pendingQueries.push({ options, resolve: callback })
    schedule()
    return
  }

  if (!options.key || !options.key.match(/^(id|P[0-9]+)$/)) {
    return callback(new Error('illegal key'))
  }

  if (!options.id) {
    return callback(new Error('illegal id'))
  }

  if (options.key === 'id') {
    return requestEntity(options.id, options, (err, entity) => {
      if (err) { return callback(err) }
      callback(null, entity ? [entity] : [])
    })
  }

  // key is a property (Pxxx): resolve the referenced item(s) via SPARQL
  pendingRefs.push({ key: options.key, id: options.id, options, resolve: callback })
  schedule()
}

module.exports = request
