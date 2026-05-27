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

  const itemFilter = document.getElementById('itemFilter')
  if (itemFilter) {
    itemFilter.oninput = applyItemFilter
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
  ob = null
  searchActive = false
  const itemFilter = document.getElementById('itemFilter')
  if (itemFilter) itemFilter.value = ''

  dataset.showInfo(content)

  const select = document.getElementById('placeFilter')
  while (select.firstChild.nextSibling) {
    select.removeChild(select.firstChild.nextSibling)
  }
  select.onchange = update

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
    appendOsmStatusLists(content)
    return null
  }

  loadingIndicator.start()
  dataset.getItem(id, (err, item) => {
    loadingIndicator.end()
    if (err) { return global.alert(id + ' nicht gefunden!') }

    httpRequest('log.cgi?path=' + encodeURIComponent(path), {}, () => {})

    const select = document.getElementById('placeFilter')
    if (dataset.refData.placeFilterField) {
      const place = item[dataset.refData.placeFilterField]
      select.value = place
    } else {
      select.value = 'alle'
    }
    update()

    check(id)
  })
}

function update () {
  const select = document.getElementById('placeFilter')
  if (select.value === place && !searchActive) {
    return
  }

  place = select.value
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
  if (dataset.refData.placeFilterField && place) {
    options.filter = {}
    options.filter[dataset.refData.placeFilterField] = place
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
          if (!listEntry || listEntry.querySelector('.osm-confirmed')) return
          const a = listEntry.querySelector('a')
          if (!a) return
          const statusName = itemStatus === true ? 'full' : itemStatus
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
      })
      .catch(() => {})

    applyItemFilter()
    selectCurrent()
  })
}

function applyItemFilter () {
  const input = document.getElementById('itemFilter')
  if (!input) return
  const query = input.value.trim().toLowerCase()
  const wasActive = searchActive
  searchActive = query.length > 0

  if (wasActive !== searchActive) {
    place = null // force update() to re-render
    update()
    return
  }

  const table = document.getElementById('data')
  if (!table) return

  Array.from(table.getElementsByTagName('tr')).forEach(tr => {
    if (!tr.id) return // skip header
    if (!query) {
      tr.style.display = ''
      return
    }
    const text = tr.textContent.toLowerCase()
    tr.style.display = text.includes(query) ? '' : 'none'
  })
}

function appendOsmStatusLists (content) {
  if (!dataset) return
  const container = document.createElement('div')
  container.className = 'osm-status-lists'
  content.appendChild(container)
  renderOsmStatusLists(container)
}

function renderOsmStatusLists (container) {
  if (!dataset) return
  const datasetId = dataset.id

  while (container.firstChild) container.removeChild(container.firstChild)

  global.fetch('osm-status.cgi?dataset=' + encodeURIComponent(datasetId))
    .then(r => r.json())
    .then(status => {
      if (!dataset || dataset.id !== datasetId) return
      const partialIds = Object.keys(status).filter(k => status[k] === 'partial')
      const noneIds = Object.keys(status).filter(k => status[k] === 'none')
      if (!partialIds.length && !noneIds.length) return

      dataset.getItems({}, (err, items) => {
        if (err) return
        if (!dataset || dataset.id !== datasetId) return

        const byId = {}
        items.forEach((item, index) => {
          const itemId = dataset.refData.idField ? item[dataset.refData.idField] : index
          byId[itemId] = { item, index }
        })

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'recheck-status'
        button.textContent = 'Alle erneut prüfen'
        button.onclick = () => onRecheckStatusClick(button, container, partialIds.concat(noneIds))
        container.appendChild(button)

        renderStatusList(container, 'Teilweise gefunden (partial)', partialIds, byId)
        renderStatusList(container, 'Nicht gefunden (none)', noneIds, byId)
      })
    })
    .catch(() => {})
}

let recheckAborted = false
function onRecheckStatusClick (button, container, ids) {
  if (button.dataset.running === '1') {
    recheckAborted = true
    return
  }
  if (!ids.length) return

  recheckAborted = false
  button.dataset.running = '1'
  const originalLabel = button.textContent
  button.textContent = 'Abbrechen'

  async.eachSeries(ids, (id, next) => {
    if (recheckAborted) return next()
    check(id, {}, () => next())
  }, () => {
    button.dataset.running = ''
    button.textContent = originalLabel
    recheckAborted = false
    renderOsmStatusLists(container)
  })
}

function renderStatusList (parent, title, ids, byId) {
  if (!ids.length) return
  const h2 = document.createElement('h2')
  h2.textContent = title + ' (' + ids.length + ')'
  parent.appendChild(h2)

  const ul = document.createElement('ul')
  ids.forEach(id => {
    const entry = byId[id]
    if (!entry) return
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = '#' + dataset.id + '/' + id
    const text = dataset.listFormat(entry.item, entry.index)
    if (typeof text === 'string') {
      a.innerHTML = text
    } else {
      a.appendChild(text)
    }
    li.appendChild(a)
    ul.appendChild(li)
  })
  parent.appendChild(ul)
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
  if (!button) return

  if (button.dataset.running === '1') {
    checkAllAborted = true
    return
  }

  if (!dataset || !currentItems.length) return

  const visibleIds = collectVisibleItemIds()
  if (!visibleIds.length) return

  checkAllAborted = false
  button.dataset.running = '1'
  const originalLabel = button.textContent
  button.textContent = 'Abbrechen'

  async.eachSeries(visibleIds, (id, next) => {
    if (checkAllAborted) return next()
    check(id, {}, () => next())
  }, () => {
    button.dataset.running = ''
    button.textContent = originalLabel
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
