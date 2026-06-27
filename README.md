# ogd-wikimedia-osm-checker
Vergleiche die Einträge verschiedener OGD (Open Government Data) Datensätze mit Wikidata, Wikipedia, Wikimedia Commons und OpenStreetMap.

Aktuell verfügbare Datensätze:
* [Denkmalliste des österr. Bundesdenkmalamtes](https://bda.gv.at/denkmalverzeichnis/#denkmalliste-gemaess-3-dmsg)
* [Kunstwerke im öff. Raum (Kulturgut Wien)](https://www.data.gv.at/katalog/dataset/stadt-wien_kunstwerkeimffentlichenraumwien)
* [Wiener Gemeindebauten (Wiener Wohnen)](https://www.wienerwohnen.at/wiener-gemeindebau/gemeindebaubeschreibungen.html)

Der Checker läuft auf https://www.openstreetmap.at/checker

Ein Screencast mit einer Anleitung findet sich hier: https://www.youtube.com/watch?v=e9Is-3ssA7U

## Installation
```
git clone https://github.com/plepe/ogd-wikimedia-osm-checker
cd ogd-wikimedia-osm-checker
npm install # install dependencies, link code
npm run download # download current list of memorial sites to data/bda.json
npm start # start internal web server on port 8080
```

Browse to http://localhost:8080

### Run with docker
```sh
git clone https://github.com/plepe/ogd-wikimedia-osm-checker
cd ogd-wikimedia-osm-checker
docker build -t skunk/ogd-wikimedia-osm-checker .
docker run -p 8080:8080 -d skunk/ogd-wikimedia-osm-checker
```

Browse to http://localhost:8080

### Run with podman-compose (persistent data)
The datasets in `data/` are baked into the image at build time, but the
runtime OSM check status (`data/state/osm-status.json`) is stored in a named
volume so it survives image updates.

```sh
git clone https://github.com/plepe/ogd-wikimedia-osm-checker
cd ogd-wikimedia-osm-checker
podman-compose up -d --build
```

Browse to http://localhost:43210

To update to a new image version while keeping your stored check status:
```sh
git pull
podman-compose build
podman-compose up -d
```

The first run seeds the `osm-status-data` volume from the committed
`data/state/osm-status.json`. Afterwards the volume is the source of truth and
later image rebuilds preserve it, while the dataset files (`data/bda.json` etc.)
are refreshed from each new image.

## Create an additional dataset
There's a (German) screencast here: https://www.youtube.com/watch?v=4PKUCjS2HL8

### Dataset
Create a file `foobar.yaml` in the `datasets/` directory. You can use
[minimal.yaml](doc/minimal.yaml) as basis or [example.yaml](doc/example.yaml)
(which has a full documentation of this file).

### Downloader [optional]
If you need a special downloader, create a file in `src/datasets`:
`DownloadExample.js` and add it to `src/datasets/download.js`.

This should load the reference data and create a JSON file in the `data`
folder.

```js
const fetch = require('node-fetch')
const fs = require('fs')

module.exports = function downloadExample (callback) {
  fetch('https://example.com/dataset.json')
    .then(response => response.json())
    .then(data => fs.writeFile('data/example.json', JSON.stringify(data), callback))
}
```

## Development
If you modify the code, you can run the following command. This will compile the code with debugging symbols and will re-compile as soon as the source code changed.
```
npm run watch
```

## Author
* Stephan Bösch-Plepelits
