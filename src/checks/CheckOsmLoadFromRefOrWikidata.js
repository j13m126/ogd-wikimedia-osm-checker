const twig = require('twig').twig

const STATUS = require('../status.js')
const osmFormat = require('../osmFormat.js')
const Check = require('../Check.js')
const idFromRefOrRefValue = require('../idFromRefOrRefValue')

function saveOsmStatus (ob, status) {
  global.fetch('osm-status.cgi?action=set&dataset=' + encodeURIComponent(ob.dataset.id) + '&id=' + encodeURIComponent(ob.id) + '&status=' + encodeURIComponent(status))
    .then(() => updateListTick(ob.dataset.id, ob.id, status))
    .catch(() => {})
}

const TICK_TITLES = {
  full: 'In OpenStreetMap mit ref:at:bda und wikidata gefunden',
  partial: 'In OpenStreetMap nur teilweise gefunden (ref:at:bda oder wikidata)',
  none: 'Kein Eintrag mit ref:at:bda oder wikidata in der OpenStreetMap gefunden'
}

function insertTick (listEntry, tick) {
  const a = listEntry.querySelector('a')
  if (!a) return
  const title = a.querySelector('.title')
  if (title) {
    title.after(tick)
  } else {
    a.appendChild(tick)
  }
}

function updateListTick (datasetId, itemId, status) {
  const listEntry = document.getElementById(datasetId + '-' + itemId)
  if (!listEntry) return
  const existing = listEntry.querySelector('.osm-confirmed')
  if (existing) existing.remove()
  const tick = document.createElement('span')
  tick.className = 'osm-confirmed osm-' + status
  tick.title = TICK_TITLES[status] || ''
  tick.textContent = '✓'
  insertTick(listEntry, tick)
}

class CheckOsmLoadFromRefOrWikidata extends Check {
  // result:
  // - null/false: not finished yet
  // - true: check is finished
  check (ob, dataset) {
    let wikidataId

    if (!dataset.osm || !dataset.osm.refField) {
      return true // use 'CheckOsmLoadFromWikidata' instead
    }

    let id = idFromRefOrRefValue(ob, dataset.osm.refValue)
    if (id === false || id === null) {
      return true
    }

    if (dataset.osm.refFormat) {
      if (!dataset.osmRefFormatTemplate) {
        dataset.osmRefFormatTemplate = twig({ data: dataset.osm.refFormat })
      }

      id = dataset.osmRefFormatTemplate.render(ob.templateData())
    }

    const osmRefField = dataset.osm.refField

    // OSM object has been loaded by 'osmLoadSimilar'. When re-showing data, let
    // that module do it.
    if (ob.osmSimilar && id) {
      return ob.message('osm', STATUS.ERROR, 'Kein Eintrag mit <tt>' + osmRefField + '=' + id + '</tt> in der OpenStreetMap gefunden!')
    }

    if (!ob.data.osm) {
      // wait for wikidata info to be loaded
      return
    }

    if (!ob.isDone(/^CheckWikidataLoad/)) {
      // wait for all wikidata loaders to finish
      return
    }

    const loadingWikidata = ob.data.wikidata ? ob.data.wikidata.filter(entry => !ob.load('osm', 'nwr[wikidata="' + entry.id + '"];')) : []

    let loadingRef = false
    if (id !== null) {
      loadingRef = !ob.load('osm', 'nwr["' + osmRefField + '"=' + id + '];')
    }

    if (loadingWikidata.length || loadingRef) {
      return false
    }

    if (ob.data.wikidataSelected) {
      wikidataId = ob.data.wikidataSelected.id
    }

    const refBdaResult = ob.data.osm.filter(el => el.tags[osmRefField] === id)
    let refWdResult = []
    if (wikidataId) {
      refWdResult = ob.data.osm.filter(el => el.tags.wikidata === wikidataId)
    }

    if (refWdResult.length && refBdaResult.length && refWdResult.length === refBdaResult.length) {
      saveOsmStatus(ob, 'full')
      return ob.message('osm', STATUS.SUCCESS, refBdaResult.length + ' Objekt via <tt>' + osmRefField + '=' + id + '</tt> und <tt>wikidata=' + wikidataId + '</tt> gefunden:<ul>' + refBdaResult.map(el => '<li>' + osmFormat(el, ob) + '</li>').join('') + '</ul>')
    }

    if (refBdaResult.length && refWdResult.length && refBdaResult.length !== refWdResult.length) {
      return ob.message('osm', STATUS.ERROR, 'Unterschiedliche Anzahl von Objekten mit <tt>' + osmRefField + '=' + id + '</tt> und/oder <tt>wikidata=' + wikidataId + '</tt> in der OpenStreetMap gefunden: ' + ob.data.osm.map(el => '<li>' + osmFormat(el, ob) + '</li>').join('') + '</ul>')
    }

    if (refBdaResult.length) {
      refBdaResult.forEach(el => {
        if (el.tags.wikidata && ob.data.wikidata.length === 0) {
          ob.load('wikidata', { key: 'id', id: el.tags.wikidata })
        }
      })

      saveOsmStatus(ob, 'partial')
      return ob.message('osm', STATUS.SUCCESS, refBdaResult.length + ' Objekt via <tt>' + osmRefField + '=' + id + '</tt> gefunden: ' + refBdaResult.map(el => '<li>' + osmFormat(el, ob) + '</li>').join('') + '</ul>')
    }

    //      const wrongWikidata = refBdaResult.filter(entry => !!entry.tags.wikidata)
    //      if (wrongWikidata.length) {
    //        ul.innerHTML += '<li class="error">Eintrag mit anderer Wikidata ID gefunden, potentielles Duplikat: <a target="_blank" href="https://wikidata.org/wiki/' + escHTML(wrongWikidata[0].tags.wikidata) + '">' + escHTML(wrongWikidata[0].tags.wikidata) + '</a></li>'
    //      } else {
    //        ul.innerHTML += '<li class="error">Kein Eintrag mit <tt>wikidata=' + wikidataId + '</tt> in der OpenStreetMap gefunden!</li>'
    //      }

    if (refWdResult.length) {
      if (id !== null) {
        ob.message('osm', STATUS.ERROR, 'Kein Eintrag mit <tt>' + osmRefField + '=' + id + '</tt> in der OpenStreetMap gefunden!')
      }

      saveOsmStatus(ob, 'partial')
      ob.message('osm', STATUS.SUCCESS, refWdResult.length + ' Objekt via <tt>wikidata=' + wikidataId + '</tt> gefunden: ' + refWdResult.map(el => '<li>' + osmFormat(el, ob) + '</li>').join('') + '</ul>')
      return true
    }

    saveOsmStatus(ob, 'none')
    if (id === null) {
      return ob.message('osm', STATUS.ERROR, 'Kein Eintrag ' + (wikidataId ? 'mit <tt>wikidata=' + wikidataId + '</tt>' : '') + ' in der OpenStreetMap gefunden!')
    } else {
      return ob.message('osm', STATUS.ERROR, 'Kein Eintrag mit <tt>' + osmRefField + '=' + id + '</tt> ' + (wikidataId ? 'oder <tt>wikidata=' + wikidataId + '</tt>' : '') + ' in der OpenStreetMap gefunden!')
    }
  }
}

module.exports = options => new CheckOsmLoadFromRefOrWikidata(options)
