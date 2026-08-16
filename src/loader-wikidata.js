const async = require('async')
const queryString = require('query-string')

const Cache = require('./Cache')
const cache = new Cache()

module.exports = {
  load (queries, options, callback) {
    const results = {}

    async.each(queries,
      (query, done) => {
        const data = cache.get(query, options)
        if (data !== undefined) {
          // async.each discards the value passed to done(), so cached entries
          // have to be merged into `results` here as well.
          data.filter(r => r).forEach(r => { results[r.id] = r })
          return done(null)
        }

        global.fetch('wikidata.cgi?' + queryString.stringify(query) + '&' + queryString.stringify(options))
          .then(res => res.json())
          .then(result => {
            cache.add(query, result)
            result.filter(r => r).forEach(r => { results[r.id] = r })
            done(null)
          })
          .catch(e => done(e))
      },
      (err) => {
        async.setImmediate(() => callback(err, Object.values(results)))
      }
    )
  },

  cached (query) {
    return cache.get(query)
  },

  includes (arr, el) {
    return !!arr.filter(e => e.id === el.id).length
  }
}
