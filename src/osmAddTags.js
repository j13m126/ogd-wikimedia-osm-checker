const wikidataToOsm = require('./wikidataToOsm.js')

module.exports = function osmAddTags (ob, el) {
  let compiledTags = {}

  if (ob.dataset.osmAddTags) {
    compiledTags = { ...compiledTags, ...ob.dataset.osmAddTags(ob, el) }
  }

  compiledTags = { ...compiledTags, ...wikidataToOsm.addTags(ob, el) }

  if (ob.data.wikidataSelected) {
    compiledTags.wikidata = ob.data.wikidataSelected.id
  }

  if (ob.data.commons) {
    const categories = ob.data.commons.filter(page => page.title.match(/^Category:/))
    if (categories.length) {
      compiledTags.wikimedia_commons = categories[0].title
    }
  }

  if (el) {
    Object.keys(compiledTags).forEach(k => {
      const v = compiledTags[k]

      if (k in el.tags && el.tags[k] === v) {
        delete compiledTags[k]
      }
    })
  }

  // 'ref:at:bda' (the old Objekt-ID tag) is deprecated. If the OSM object still
  // carries it, mark it for removal: an empty value tells JOSM to delete the key.
  if (el && el.tags && 'ref:at:bda' in el.tags) {
    compiledTags['ref:at:bda'] = ''
  }

  return compiledTags
}
