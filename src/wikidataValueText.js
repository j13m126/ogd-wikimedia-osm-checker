/**
 * Render the human readable text of a non-entity Wikidata snak value.
 *
 * Entity values (wikibase-item / wikibase-property) are resolved to labels by
 * the caller (which has the batched label map) and are only handled here as a
 * fallback to the bare id.
 *
 * @param {Object} snak - a Wikidata mainsnak
 * @return {string} the rendered value text ('' for somevalue/novalue/unknown)
 */
module.exports = function wikidataValueText (snak) {
  if (!snak || snak.snaktype !== 'value' || !snak.datavalue) {
    return ''
  }

  const value = snak.datavalue.value

  switch (snak.datavalue.type) {
    case 'string':
      return value
    case 'monolingualtext':
      return value.text
    case 'globecoordinate':
      return value.latitude + ', ' + value.longitude
    case 'quantity':
      return (value.amount || '').replace(/^\+/, '')
    case 'time':
      return formatTime(value)
    case 'wikibase-entityid':
      return value.id
    default:
      return typeof value === 'string' ? value : ''
  }
}

function formatTime (value) {
  const m = value.time.match(/^([+-])(\d+)-(\d{2})-(\d{2})/)
  if (!m) {
    return value.time
  }

  const year = parseInt(m[2], 10)
  const suffix = m[1] === '-' ? ' v. Chr.' : ''

  switch (value.precision) {
    case 11: // day
      return m[4] + '.' + m[3] + '.' + year + suffix
    case 10: // month
      return m[3] + '.' + year + suffix
    case 9: // year
      return year + suffix
    case 8: // decade
      return year + 'er' + suffix
    case 7: // century
      return (Math.floor((year - 1) / 100) + 1) + '. Jh.' + suffix
    case 6: // millennium
      return (Math.floor((year - 1) / 1000) + 1) + '. Jt.' + suffix
    default:
      return year + suffix
  }
}
