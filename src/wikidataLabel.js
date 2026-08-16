/**
 * Pick a human readable label from a Wikidata labels/descriptions object,
 * preferring Austrian German, then German, then English.
 * @param {Object} labels - map of language code to { language, value }
 * @return {string} the preferred label, or '' if none of the preferred languages exist
 */
module.exports = function wikidataLabel (labels) {
  if (!labels) {
    return ''
  }

  const lang = ['de-at', 'de', 'en'].filter(l => labels[l])
  if (!lang.length) {
    return ''
  }

  return labels[lang[0]].value
}
