const hash = require('sheet-router/hash')
const escHTML = require('html-escape')
const forEach = require('foreach')
const async = require('async')

const Dataset = require('./Dataset.js')
const Examinee = require('./Examinee.js')
const httpRequest = require('./httpRequest.js')
const timestamp = require('./timestamp')
const loadingIndicator = require('./loadingIndicator')
const showLast = require('./showLast')

const datasets = {} // deprecated
const modules = [
  require('./news.js'),
  require('./wikidataToOsm.js')
]

let dataset
let place
let region
let ob
let currentItems = []
let checkAllAborted = false
let searchActive = false

let info

window.onload = () => {
  loadingIndicator.start()

  async.each(modules, (module, done) => module.init(done), (err) => {
    loadingIndicator.end()

    if (err) {
      return global.alert(err)
    }

    init()
  })
}

function init () {
  const selectDataset = document.getElementById('Dataset')
  const listDatasets = document.getElementById('datasets')

  Dataset.list((err, list) => {
    async.each(list, (id, done) => {
      Dataset.get(id, (err, dataset) => {
        datasets[id] = dataset // deprecated
        const option = document.createElement('option')
        option.value = id
        option.appendChild(document.createTextNode(dataset.title))
        selectDataset.appendChild(option)

        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = '#' + id
        a.appendChild(document.createTextNode(dataset.titleLong || dataset.title))
        li.appendChild(a)
        listDatasets.appendChild(li)

        done()
      })
    },
    () => {
      info = document.getElementById('content').innerHTML
      init2()
    })
  })
}

function init2 () {
  const selectDataset = document.getElementById('Dataset')
  showLast()

  selectDataset.onchange = chooseDataset

  const checkAllButton = document.getElementById('checkAll')
  if (checkAllButton) {
    checkAllButton.onclick = onCheckAllClick
  }

  const stopCheckAllButton = document.getElementById('stopCheckAll')
  if (stopCheckAllButton) {
    stopCheckAllButton.onclick = () => { checkAllAborted = true }
  }

  const itemFilter = document.getElementById('itemFilter')
  if (itemFilter) {
    itemFilter.oninput = applyItemFilter
  }

  const statusFilter = document.getElementById('statusFilter')
  if (statusFilter) {
    statusFilter.onchange = applyItemFilter
  }

  if (global.location.hash) {
    choose(global.location.hash.substr(1))
  }

  hash(loc => {
    choose(loc.substr(1))
  })
}

function chooseDataset () {
  const selectDataset = document.getElementById('Dataset')

  global.location.hash = selectDataset.value
  updateDataset()
}

function updateDataset () {
  const content = document.getElementById('content')
  const selectDataset = document.getElementById('Dataset')

  if (!selectDataset.value) {
    content.innerHTML = info
    showLast()
    return
  }

  dataset = datasets[selectDataset.value]
  place = null
  region = null
  ob = null
  searchActive = false
  const itemFilter = document.getElementById('itemFilter')
  if (itemFilter) itemFilter.value = ''
  const statusFilter = document.getElementById('statusFilter')
  if (statusFilter) statusFilter.value = ''

  dataset.showInfo(content)

  const select = document.getElementById('placeFilter')
  while (select.firstChild.nextSibling) {
    select.removeChild(select.firstChild.nextSibling)
  }
  select.onchange = update

  setupRegionFilter()

  loadingIndicator.start()

  if (dataset.refData.placeFilterField) {
    dataset.getValues(dataset.refData.placeFilterField, (err, values) => {
      loadingIndicator.end()

      if (err) { return global.alert(err) }

      values.forEach(place => {
        const option = document.createElement('option')
        option.appendChild(document.createTextNode(place))
        select.appendChild(option)
      })

      updateDataset2()
    })
  } else {
    loadingIndicator.end()

    const option = document.createElement('option')
    option.appendChild(document.createTextNode('alle'))
    select.appendChild(option)

    updateDataset2()
  }
}

function updateDataset2 () {
  if (global.location.hash) {
    choose(global.location.hash.substr(1))
  } else {
    update()
  }
}

function setupRegionFilter () {
  const regionSelect = document.getElementById('regionFilter')
  if (!regionSelect) return

  // reset to just the "all" option
  while (regionSelect.firstChild.nextSibling) {
    regionSelect.removeChild(regionSelect.firstChild.nextSibling)
  }
  regionSelect.value = ''

  const regionField = dataset.refData.regionFilterField
  if (!regionField) {
    regionSelect.hidden = true
    regionSelect.onchange = null
    return
  }

  regionSelect.hidden = false
  regionSelect.onchange = onRegionChange

  dataset.getValues(regionField, (err, values) => {
    if (err) { return }
    values.forEach(value => {
      const option = document.createElement('option')
      option.appendChild(document.createTextNode(value))
      regionSelect.appendChild(option)
    })
  })
}

function onRegionChange () {
  const placeSelect = document.getElementById('placeFilter')
  placeSelect.value = ''
  updatePlaceOptions(() => update())
}

// repopulate the place dropdown with the places of the selected region
function updatePlaceOptions (callback) {
  const regionSelect = document.getElementById('regionFilter')
  const placeSelect = document.getElementById('placeFilter')
  const regionField = dataset.refData.regionFilterField
  const placeField = dataset.refData.placeFilterField

  while (placeSelect.firstChild.nextSibling) {
    placeSelect.removeChild(placeSelect.firstChild.nextSibling)
  }

  if (!placeField) { return callback && callback() }

  const options = {}
  if (regionField && regionSelect && regionSelect.value) {
    options.filter = {}
    options.filter[regionField] = regionSelect.value
  }

  loadingIndicator.start()
  dataset.getItems(options, (err, items) => {
    loadingIndicator.end()
    if (err) { return callback && callback(err) }

    const seen = {}
    items.forEach(item => {
      const p = item[placeField]
      if (p != null && p !== '') seen[p] = true
    })

    Object.keys(seen).sort().forEach(p => {
      const option = document.createElement('option')
      option.appendChild(document.createTextNode(p))
      placeSelect.appendChild(option)
    })

    callback && callback()
  })
}

function choose (path) {
  const [_dataset, id] = path.split(/\//)

  if (!_dataset && !id) {
    const content = document.getElementById('content')
    content.innerHTML = info
    showLast()
    document.title = 'ogd-wikimedia-osm-checker'
  }

  if (!dataset || (_dataset !== dataset.id)) {
    const selectDataset = document.getElementById('Dataset')
    selectDataset.value = _dataset
    return updateDataset()
  }

  if (!id) {
    const content = document.getElementById('content')
    dataset.showInfo(content)
    appendStatsLink(content)
    return null
  }

  if (id === 'stats') {
    const content = document.getElementById('content')
    while (content.firstChild) content.removeChild(content.firstChild)
    renderStats(content)
    return null
  }

  loadingIndicator.start()
  dataset.getItem(id, (err, item) => {
    loadingIndicator.end()
    if (err) { return global.alert(id + ' nicht gefunden!') }

    httpRequest('log.cgi?path=' + encodeURIComponent(path), {}, () => {})

    // when a search is active, keep the search result list instead of
    // switching to the clicked item's place
    if (!searchActive) {
      const select = document.getElementById('placeFilter')
      if (dataset.refData.placeFilterField) {
        const place = item[dataset.refData.placeFilterField]
        select.value = place
      } else {
        select.value = 'alle'
      }
      update()
    }

    check(id)
  })
}

function update () {
  const select = document.getElementById('placeFilter')
  const regionSelect = document.getElementById('regionFilter')
  const regionValue = regionSelect ? regionSelect.value : ''

  if (select.value === place && regionValue === region && !searchActive) {
    return
  }

  place = select.value
  region = regionValue
  const content = document.getElementById('content')
  while (content.firstChild) {
    content.removeChild(content.firstChild)
  }

  if (place === '' && !searchActive) {
    content.innerHTML = info
    currentItems = []
    const checkAllButton = document.getElementById('checkAll')
    if (checkAllButton) {
      checkAllButton.disabled = true
    }
    showLast()
    return
  }

  const table = document.createElement('table')
  table.id = 'data'
  table.innerHTML = '<tr><th>' + escHTML(dataset.title) + '</th></tr>'
  content.appendChild(table)

  const dom = document.getElementById('data')

  const options = {}
  const filter = {}
  if (dataset.refData.regionFilterField && region) {
    filter[dataset.refData.regionFilterField] = region
  }
  if (dataset.refData.placeFilterField && place) {
    filter[dataset.refData.placeFilterField] = place
  }
  if (Object.keys(filter).length) {
    options.filter = filter
  }

  loadingIndicator.start()
  dataset.getItems(options, (err, items) => {
    loadingIndicator.end()
    if (err) { return global.alert(err) }

    currentItems = items
    const checkAllButton = document.getElementById('checkAll')
    if (checkAllButton) {
      checkAllButton.disabled = items.length === 0
    }

    items.forEach((item, index) => {
      const id = dataset.refData.idField ? item[dataset.refData.idField] : index

      const text = dataset.listFormat(item, index)

      const tr = document.createElement('tr')
      tr.id = dataset.id + '-' + id
      tr.dataset.osmStatus = 'unchecked'

      const td = document.createElement('td')
      tr.appendChild(td)

      const a = document.createElement('a')
      if (typeof text === 'string') {
        a.innerHTML = text
      } else {
        a.appendChild(text)
      }
      a.href = '#' + dataset.id + '/' + id

      td.appendChild(a)
      dom.appendChild(tr)
    })

    const tickTitles = {
      full: 'In OpenStreetMap mit ref:at:bda und wikidata gefunden',
      partial: 'In OpenStreetMap nur teilweise gefunden (ref:at:bda oder wikidata)',
      none: 'Kein Eintrag mit ref:at:bda oder wikidata in der OpenStreetMap gefunden'
    }

    global.fetch('osm-status.cgi?dataset=' + encodeURIComponent(dataset.id))
      .then(r => r.json())
      .then(status => {
        items.forEach((item, index) => {
          const id = dataset.refData.idField ? item[dataset.refData.idField] : index
          const itemStatus = status[id]
          if (!itemStatus) return
          const listEntry = document.getElementById(dataset.id + '-' + id)
          if (!listEntry) return
          const statusName = itemStatus === true ? 'full' : itemStatus
          listEntry.dataset.osmStatus = statusName
          if (listEntry.querySelector('.osm-confirmed')) return
          const a = listEntry.querySelector('a')
          if (!a) return
          const tick = document.createElement('span')
          tick.className = 'osm-confirmed osm-' + statusName
          tick.title = tickTitles[statusName] || ''
          tick.textContent = '✓'
          const title = a.querySelector('.title')
          if (title) {
            title.after(tick)
          } else {
            a.appendChild(tick)
          }
        })
        applyItemFilter()
      })
      .catch(() => {})

    applyItemFilter()
    selectCurrent()
  })
}

function applyItemFilter () {
  const input = document.getElementById('itemFilter')
  if (!input) return
  const query = input.value
  const wasActive = searchActive
  searchActive = query.length > 0

  if (wasActive !== searchActive) {
    place = null // force update() to re-render
    update()
    return
  }

  const table = document.getElementById('data')
  if (!table) return

  const statusFilter = document.getElementById('statusFilter')
  const statusValue = statusFilter ? statusFilter.value : ''

  Array.from(table.getElementsByTagName('tr')).forEach(tr => {
    if (!tr.id) return // skip header

    let visible = true
    if (query) {
      visible = tr.textContent.includes(query)
    }
    if (visible && statusValue) {
      visible = (tr.dataset.osmStatus || 'unchecked') === statusValue
    }
    tr.style.display = visible ? '' : 'none'
  })
}

function appendStatsLink (content) {
  if (!dataset) return
  const p = document.createElement('p')
  const a = document.createElement('a')
  a.href = '#' + dataset.id + '/stats'
  a.textContent = 'Statistik nach Ort'
  p.appendChild(a)
  content.appendChild(p)
}

function renderStats (content) {
  if (!dataset) return
  const datasetId = dataset.id

  const h1 = document.createElement('h1')
  h1.textContent = 'Statistik: ' + (dataset.titleLong || dataset.title)
  content.appendChild(h1)

  const back = document.createElement('p')
  const backLink = document.createElement('a')
  backLink.href = '#' + datasetId
  backLink.textContent = '← zurück zur Übersicht'
  back.appendChild(backLink)
  content.appendChild(back)

  const placeField = dataset.refData.placeFilterField
  if (!placeField) {
    const p = document.createElement('p')
    p.textContent = 'Keine Orts-Information verfügbar.'
    content.appendChild(p)
    return
  }

  const loading = document.createElement('p')
  loading.textContent = 'Lade Daten ...'
  content.appendChild(loading)

  Promise.all([
    global.fetch('osm-status.cgi?dataset=' + encodeURIComponent(datasetId)).then(r => r.json()),
    new Promise(resolve => dataset.getItems({}, (err, items) => resolve(err ? [] : items)))
  ]).then(([status, items]) => {
    if (!dataset || dataset.id !== datasetId) return
    loading.remove()

    const byPlace = {}
    items.forEach((item, index) => {
      const itemId = dataset.refData.idField ? item[dataset.refData.idField] : index
      const place = item[placeField] || '(unbekannt)'
      if (!byPlace[place]) byPlace[place] = { total: 0, checked: 0, full: 0, partial: 0, none: 0 }
      byPlace[place].total++
      const s = status[itemId] === true ? 'full' : status[itemId]
      if (s) {
        byPlace[place].checked++
        if (s in byPlace[place]) byPlace[place][s]++
      }
    })

    const rows = Object.keys(byPlace)
      .filter(p => byPlace[p].checked > 0)
      .map(p => {
        const s = byPlace[p]
        return {
          place: p,
          total: s.total,
          checked: s.checked,
          full: s.full,
          partial: s.partial,
          none: s.none,
          pct: s.total ? s.full / s.total : 0
        }
      })

    if (!rows.length) {
      const p = document.createElement('p')
      p.textContent = 'Noch keine Orte geprüft.'
      content.appendChild(p)
      return
    }

    const columns = [
      { key: 'place', label: 'Ort' },
      { key: 'checked', label: 'Geprüft' },
      { key: 'full', label: 'Vollständig' },
      { key: 'partial', label: 'Teilweise' },
      { key: 'none', label: 'Nicht gefunden' },
      { key: 'pct', label: '% vollständig' }
    ]

    const sortState = { key: 'place', dir: 1 }

    const table = document.createElement('table')
    table.className = 'stats'
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    columns.forEach(col => {
      const th = document.createElement('th')
      th.textContent = col.label
      th.className = 'sortable'
      th.onclick = () => {
        if (sortState.key === col.key) {
          sortState.dir = -sortState.dir
        } else {
          sortState.key = col.key
          sortState.dir = col.key === 'place' ? 1 : -1
        }
        renderBody()
      }
      headRow.appendChild(th)
    })
    thead.appendChild(headRow)
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)
    content.appendChild(table)

    function renderBody () {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild)

      const sorted = rows.slice().sort((a, b) => {
        const va = a[sortState.key]
        const vb = b[sortState.key]
        if (va < vb) return -1 * sortState.dir
        if (va > vb) return 1 * sortState.dir
        return 0
      })

      Array.from(headRow.children).forEach((th, i) => {
        const col = columns[i]
        let label = col.label
        if (col.key === sortState.key) {
          label += sortState.dir > 0 ? ' ▲' : ' ▼'
        }
        th.textContent = label
      })

      sorted.forEach(r => {
        const tr = document.createElement('tr')
        tr.innerHTML =
          '<td>' + escHTML(r.place) + '</td>' +
          '<td>' + r.checked + ' / ' + r.total + '</td>' +
          '<td>' + r.full + '</td>' +
          '<td>' + r.partial + '</td>' +
          '<td>' + r.none + '</td>' +
          '<td>' + Math.round(r.pct * 100) + ' %</td>'
        tbody.appendChild(tr)
      })
    }

    renderBody()
  }).catch(err => {
    if (!dataset || dataset.id !== datasetId) return
    loading.textContent = 'Fehler beim Laden der Statistik: ' + err
  })
}

function check (id, options = {}, done) {
  loadingIndicator.start()
  dataset.getItem(id, (err, entry) => {
    loadingIndicator.end()
    if (err) {
      if (done) return done(err)
      return global.alert(err)
    }

    const div = document.getElementById('details')

    while (div.firstChild) {
      div.removeChild(div.firstChild)
    }

    const reload = document.createElement('a')
    reload.href = '#'
    reload.className = 'reload'
    reload.innerHTML = '↻'
    reload.title = 'Nochmal prüfen'
    reload.onclick = () => {
      options.reload = timestamp()
      check(id, options)
      return false
    }
    div.appendChild(reload)

    loadingIndicator.start()

    const format = dataset.showFormat(entry)
    if (typeof format === 'string') {
      const dom = document.createElement('div')
      dom.innerHTML = format
      div.appendChild(dom)
    } else {
      div.appendChild(format)
    }

    Array.from(div.getElementsByTagName('a')).forEach(a => {
      if (!a.target) {
        a.target = '_blank'
      }
    })

    ob = new Examinee(id, entry, dataset)
    ob.initMessages(div)
    ob.runChecks(dataset, options, (err, result) => {
      if (err && !done) { global.alert(err) }

      loadingIndicator.end()

      if (done) done(err, result)
    })

    document.title = dataset.title + '/' + ob.id + ' - ogd-wikimedia-osm-checker'

    selectCurrent()
  })
}

function onCheckAllClick () {
  const button = document.getElementById('checkAll')
  const stopButton = document.getElementById('stopCheckAll')
  if (!button || button.dataset.running === '1') return

  if (!dataset || !currentItems.length) return

  const visibleIds = collectVisibleItemIds()
  if (!visibleIds.length) return

  checkAllAborted = false
  button.dataset.running = '1'
  button.disabled = true
  if (stopButton) stopButton.hidden = false

  async.eachSeries(visibleIds, (id, next) => {
    if (checkAllAborted) return next()
    check(id, {}, () => next())
  }, () => {
    button.dataset.running = ''
    button.disabled = false
    if (stopButton) stopButton.hidden = true
    checkAllAborted = false
  })
}

function collectVisibleItemIds () {
  const ids = []
  const prefix = dataset.id + '-'
  currentItems.forEach((item, index) => {
    const id = dataset.refData.idField ? item[dataset.refData.idField] : index
    const tr = document.getElementById(prefix + id)
    if (tr && tr.style.display !== 'none') {
      ids.push(id)
    }
  })
  return ids
}

function selectCurrent () {
  const table = document.getElementById('data')
  Array.from(table.getElementsByClassName('active')).forEach(d => d.classList.remove('active'))

  if (!dataset || !ob) {
    return
  }

  const listEntry = document.getElementById(dataset.id + '-' + ob.id)
  if (listEntry) {
    listEntry.classList.add('active')
    listEntry.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
