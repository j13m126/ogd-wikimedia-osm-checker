const fetch = require('node-fetch')

// Transient conditions that deserve another attempt: rate limiting and
// temporary server/proxy failures. Everything else - 400, 404, or a valid
// response that simply contains no results - is a real answer and is passed
// through unchanged, never retried.
const RETRY_STATUS = [429, 500, 502, 503, 504]

const MAX_ATTEMPTS = 5
const BASE_DELAY = 500
const MAX_DELAY = 8000

function backoff (attempt, retryAfter) {
  if (retryAfter !== null) {
    return Math.min(retryAfter, MAX_DELAY)
  }

  const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY)

  // jitter, so several parallel requests do not retry in lockstep
  return delay + Math.floor(Math.random() * 250)
}

// Wikimedia sends 'Retry-After' on 429; honour it when present.
function parseRetryAfter (response) {
  const value = response && response.headers && response.headers.get('retry-after')
  if (!value) {
    return null
  }

  const seconds = parseInt(value, 10)
  if (!isNaN(seconds)) {
    return seconds * 1000
  }

  const date = Date.parse(value)
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now())
  }

  return null
}

/**
 * fetch() + JSON parsing, retrying only on transient failures.
 * @param {string} url
 * @param {Object} options - passed to fetch()
 * @param {function} callback - callback(err, body)
 */
function fetchJson (url, options, callback) {
  let attempt = 0

  function finish (err, body) {
    // leave the promise chain, so an exception thrown by the callback is not
    // mistaken for a request failure and retried
    global.setImmediate(() => callback(err, body))
  }

  function schedule (reason, retryAfter) {
    const delay = backoff(attempt, retryAfter)
    console.error('fetchRetry: ' + reason + ' (' + url.slice(0, 120) + ') - attempt ' + attempt + '/' + MAX_ATTEMPTS + ', retrying in ' + delay + 'ms')
    global.setTimeout(run, delay)
  }

  function run () {
    attempt++

    fetch(url, options)
      .then(response => {
        if (!response.ok) {
          if (RETRY_STATUS.includes(response.status) && attempt < MAX_ATTEMPTS) {
            return schedule('HTTP ' + response.status, parseRetryAfter(response))
          }

          return finish(new Error('HTTP ' + response.status + ' for ' + url))
        }

        return response.json().then(
          body => finish(null, body),
          () => {
            if (attempt < MAX_ATTEMPTS) {
              return schedule('invalid JSON', null)
            }

            finish(new Error('Invalid JSON response from ' + url))
          }
        )
      })
      .catch(err => {
        // network level failure (DNS, connection reset, timeout, ...)
        if (attempt < MAX_ATTEMPTS) {
          return schedule(err.message, null)
        }

        finish(err)
      })
  }

  run()
}

/**
 * Retry a callback style operation on error. Used for helpers which do their
 * own HTTP handling. An operation which succeeds with an empty result is not
 * retried - only actual errors are.
 * @param {function} operation - operation(done), done(err, ...results)
 * @param {function} callback - receives the final result
 */
function retry (operation, callback) {
  let attempt = 0

  function run () {
    attempt++

    operation(function (err) {
      if (err && attempt < MAX_ATTEMPTS) {
        const delay = backoff(attempt, null)
        console.error('fetchRetry: ' + err.message + ' - attempt ' + attempt + '/' + MAX_ATTEMPTS + ', retrying in ' + delay + 'ms')
        return global.setTimeout(run, delay)
      }

      callback.apply(null, arguments)
    })
  }

  run()
}

module.exports = { fetchJson, retry, MAX_ATTEMPTS }
