const async = require('async')

const httpRequest = require('./httpRequest.js')
const Cache = require('./Cache')

const cache = new Cache()

let active = null
const queue = []
// The Overpass instance is local (see below), so no politeness delay is needed
// between requests. Raise this when pointing at a public Overpass API.
const delay = 0

// Cache key for a set of queries. Sorted, so the same set in a different order
// still hits the cache.
function cacheId (queries) {
  return queries.concat().sort()
}

function load (queries, options, callback) {
  const data = cache.get(cacheId(queries), options)
  if (data !== undefined) {
    return async.setImmediate(() => callback(null, data))
  }

  queue.push([queries, callback])

  if (!active) {
    next()
  }
}

function next () {
  if (!queue.length) {
    return
  }

  const [queries, callback] = queue.shift()
  active = true

  const body = '[out:json];(' + queries.join('') + ');out tags bb;'

  httpRequest('http://localhost:12345/api/interpreter',
    {
      method: 'POST',
      responseType: 'json',
      body
    },
    (err, result) => {
      global.setTimeout(() => {
        active = false
        next()
      }, delay)

      if (err) { return callback(err) }

      const elements = result.body.elements
      cache.add(cacheId(queries), elements)
      callback(null, elements)
    }
  )
}

module.exports = {
  load,

  cached (queries) {
    return cache.get(cacheId(queries))
  },

  includes (arr, el) {
    return !!arr.filter(e => e.type === el.type && e.id === el.id).length
  }
}
