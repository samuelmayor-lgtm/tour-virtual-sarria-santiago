/* Tour virtual Sarria → Santiago
   Reimplementación en JS limpio de la lógica del prototipo (clase Component).
   Sin framework: estado propio + actualización directa del DOM. */

import { CONFIG, PREVIEW } from './config.js';
import {
  DATA, WP, STAGES, MAPS, MB_MAPS, MB_JS, MB_CSS, ML_JS, ML_CSS,
  bearing, rad, fmt
} from './data.js';

const $ = id => document.getElementById(id);

/* ---------- carga perezosa de la librería de mapas ---------- */

function loadCSS(href) {
  if (document.querySelector('link[href="' + href + '"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function loadJS(src) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector('script[src="' + src + '"]');
    if (found) {
      if (found.dataset.loaded) return resolve();
      found.addEventListener('load', () => resolve());
      found.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', reject);
    document.head.appendChild(s);
  });
}

/* ============================================================
   Tour
   ============================================================ */

class Tour {
  constructor() {
    this.el = {
      stage: $('stage'), map: $('map'), intro: $('intro'), tour: $('tour'),
      dayNum: $('dayNum'), stageFrom: $('stageFrom'), stageTo: $('stageTo'),
      mapBtn: $('mapBtn'), mapName: $('mapName'), panel: $('panel'), panelClose: $('panelClose'),
      camFollow: $('camFollow'), camStage: $('camStage'),
      mapList: $('mapList'), noTokenNote: $('noTokenNote'), mbNote: $('mbNote'),
      fallbackNote: $('fallbackNote'),
      poi: $('poi'), poiImg: $('poiImg'), poiKm: $('poiKm'), poiTitle: $('poiTitle'), poiText: $('poiText'),
      playBtn: $('playBtn'), iconPlay: $('iconPlay'), iconPause: $('iconPause'),
      kmDone: $('kmDone'), kmTotal: $('kmTotal'), upDone: $('upDone'), upTotal: $('upTotal'),
      profArea: $('profArea'), profAreaDone: $('profAreaDone'), profLine: $('profLine'),
      clipRect: $('clipRect'), profCursor: $('profCursor'), eleBubble: $('eleBubble'), eleNow: $('eleNow'),
      speedBtn: $('speedBtn'), speedVal: $('speedVal'), days: $('days'),
      bar: document.querySelector('.bar'),
      end: $('end'), endDay: $('endDay'), endKm: $('endKm'), endTitle: $('endTitle'),
      endText: $('endText'), endBtn: $('endBtn'), endClose: $('endClose'),
      startBtn: $('startBtn')
    };

    this.state = {
      started: false, playing: false, stage: 0, speed: 1, ended: false,
      mapId: 'sat', mbMapId: 'mb-satlab', cam: 'follow', panel: false
    };

    this.progress = 0;   // 0→1 dentro de la etapa, fuera del estado: cambia cada frame
    this.map = null;
    this.lib = null;
    this.mb = false;
    this.labels = [];
    this.raf = 0;
    this.poiShown = -2;  // -1 = ninguno; -2 fuerza el primer pintado
    this.preloaded = {};
    this.fellBack = false;   // true tras caer de Mapbox a MapLibre
    this.styleOk = false;

    this.bindUI();
    this.renderDays();
    this.renderMapList();
    this.renderProfile();
    this.paintStageInfo();
    this.boot();
  }

  /* ---------- token / librería ---------- */

  token() { return String(CONFIG.mapboxToken || '').trim(); }

  /** Mapbox solo si hay token `pk.` y no nos ha echado ya (ver fallBack). */
  useMB() { return this.token().startsWith('pk.') && !this.fellBack; }
  mbStyle() { return MB_MAPS.find(m => m.id === this.state.mbMapId) || MB_MAPS[0]; }
  zoom() { return CONFIG.followZoom; }
  isMobile() { return this.el.stage.clientWidth <= 640; }

  async boot() {
    try {
      if (this.useMB()) {
        loadCSS(MB_CSS);
        await loadJS(MB_JS);
      } else {
        loadCSS(ML_CSS);
        await loadJS(ML_JS);
      }
    } catch (e) {
      console.error('No se pudo cargar la librería de mapas:', e);
      return;
    }
    this.initMap();
  }

  /* ---------- interfaz ---------- */

  bindUI() {
    this.el.startBtn.addEventListener('click', () => this.goStage(0));
    this.el.playBtn.addEventListener('click', () => {
      if (this.state.ended) this.goStage(this.state.stage);
      else if (this.state.playing) this.pause();
      else this.play();
    });
    this.el.speedBtn.addEventListener('click', () => {
      const s = this.state.speed;
      this.state.speed = s === 1 ? 2 : s === 2 ? 3 : s === 3 ? 4 : 1;
      this.el.speedVal.textContent = this.state.speed + 'x';
    });
    this.el.mapBtn.addEventListener('click', () => this.togglePanel(!this.state.panel));
    this.el.panelClose.addEventListener('click', () => this.togglePanel(false));
    this.el.camFollow.addEventListener('click', () => this.setCam('follow'));
    this.el.camStage.addEventListener('click', () => this.setCam('stage'));
    this.el.endClose.addEventListener('click', () => this.closeEnd());

    document.addEventListener('keydown', e => {
      if (!this.state.started) return;
      if (e.key === 'Escape' && this.state.panel) { this.togglePanel(false); return; }
      if (e.key === 'Escape' && !this.el.end.hidden) { this.closeEnd(); return; }
      if (e.code === 'Space' && !/^(BUTTON|INPUT|A)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        this.el.playBtn.click();
      }
    });

    // Cambios de tamaño: redimensionar mapa, reajustar padding y reencuadrar.
    let wasMobile = this.isMobile();
    this.ro = new ResizeObserver(() => {
      if (!this.map) return;
      this.map.resize();
      this.h = this.el.map.clientHeight || this.h;
      const m = this.isMobile();
      if (m !== wasMobile) {
        wasMobile = m;
        this.applyPadding();
        if (this.state.started && this.state.cam === 'stage') this.frameStage(this.state.stage);
      }
    });
    this.ro.observe(this.el.stage);

    // La ficha de POI se ancla sobre la barra, cuya altura cambia con el ancho
    // (la fila se parte) y con el idioma. Se publica como variable CSS en vez
    // de fijar un número que quedaría desfasado.
    this.barRo = new ResizeObserver(() => this.measureBar());
    this.barRo.observe(this.el.bar);
  }

  /** Publica la altura de la barra para que la ficha de POI se ancle sobre ella.
     El ResizeObserver no dispara al pasar la barra de oculta a visible, así que
     goStage también llama aquí: con 0 px la ficha se solaparía con la barra. */
  measureBar() {
    const h = this.el.bar.offsetHeight;
    if (h > 0) this.el.stage.style.setProperty('--bar-h', h + 'px');
  }

  applyPadding() {
    if (!this.map) return;
    this.map.setPadding(this.isMobile()
      ? { top: 80, bottom: 220, left: 0, right: 0 }
      : { top: 0, bottom: 0, left: 0, right: 0 });
  }

  togglePanel(open) {
    // El cartel de fin va por encima del panel; abrir ajustes lo descarta.
    if (open && !this.el.end.hidden) this.closeEnd(false);
    this.state.panel = open;
    this.el.panel.hidden = !open;
    this.el.mapBtn.setAttribute('aria-expanded', String(open));
    this.syncPoi(true);
  }

  renderDays() {
    this.el.days.replaceChildren(...DATA.map((d, i) => {
      const b = document.createElement('button');
      b.className = 'day';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === this.state.stage));
      b.innerHTML = '<span class="day__label"></span><span class="day__route"></span>';
      b.firstChild.textContent = 'Día ' + (i + 1);
      b.lastChild.textContent = d.from + ' → ' + d.to + ' · ' + fmt(d.km) + ' km';
      b.addEventListener('click', () => this.goStage(i));
      return b;
    }));
  }

  renderMapList() {
    const mb = this.useMB();
    const list = mb ? MB_MAPS : MAPS;
    const cur = mb ? this.state.mbMapId : this.state.mapId;
    // Tras un relevo sí hay token: el aviso correcto es el de respaldo, no «pega tu token».
    this.el.noTokenNote.hidden = mb || this.fellBack;
    this.el.mbNote.hidden = !mb;
    this.el.mapName.textContent = (list.find(m => m.id === cur) || list[0]).name;

    this.el.mapList.replaceChildren(...list.map(m => {
      const b = document.createElement('button');
      b.className = 'map-opt';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(m.id === cur));
      b.innerHTML = '<span class="map-opt__name"></span><span class="map-opt__desc"></span>';
      b.firstChild.textContent = m.id === cur ? m.name + ' ✓' : m.name;
      b.lastChild.textContent = m.desc;
      b.addEventListener('click', () => this.setMap(m.id));
      return b;
    }));
  }

  setMap(id) {
    if (this.useMB()) {
      this.state.mbMapId = id;
      const m = MB_MAPS.find(x => x.id === id);
      if (this.map && m) this.map.setStyle(m.style);
    } else {
      this.state.mapId = id;
      if (this.map && this.map.getLayer('bm-sat-0')) {
        MAPS.forEach(m => m.layers.forEach((_, k) =>
          this.map.setLayoutProperty('bm-' + m.id + '-' + k, 'visibility', m.id === id ? 'visible' : 'none')));
      }
    }
    this.renderMapList();
  }

  setCam(c) {
    this.state.cam = c;
    this.el.camFollow.setAttribute('aria-pressed', String(c === 'follow'));
    this.el.camStage.setAttribute('aria-pressed', String(c === 'stage'));
    if (!this.map || !this.state.started) return;
    if (c === 'stage') {
      this.frameStage(this.state.stage);
    } else {
      this.camC = null;
      this.camE = null;
      const s = this.state.stage;
      const d = this.progress * DATA[s].total;
      this.bear = this.camBearing(s, d);
      this.map.easeTo({ center: this.at(s, d).p, zoom: this.zoom(), pitch: CONFIG.pitch, bearing: this.bear, duration: 1600 });
    }
  }

  frameStage(i) {
    const c = DATA[i].coords;
    const b = new this.lib.LngLatBounds(c[0], c[0]);
    c.forEach(p => b.extend(p));
    const br = bearing(c[0], c[c.length - 1]) - 90;
    const mob = this.isMobile();
    this.map.fitBounds(b, {
      padding: mob ? { top: 90, bottom: 250, left: 24, right: 24 }
                   : { top: 140, bottom: 300, left: 80, right: 80 },
      pitch: 50, bearing: br, duration: 2000
    });
  }

  /* ---------- fallos de Mapbox y relevo a MapLibre ---------- */

  /** 401 token inválido · 403 restricción de URL · 429 límite de peticiones.
     Todo lo demás (una tesela suelta que falla) no justifica cambiar de motor. */
  onMapboxError(e) {
    const err = e && e.error;
    const status = err && err.status;
    const msg = (err && err.message) || '';
    console.warn('Mapbox:', msg);
    if (status === 401 || status === 403 || status === 429 || /access token/i.test(msg)) {
      this.fallBack('Mapbox respondió ' + (status || 'con un error de token'));
    }
  }

  /** Cambia a MapLibre en caliente, conservando etapa, progreso y reproducción. */
  fallBack(reason) {
    if (this.fellBack || !this.useMB()) return;
    console.warn('Tour: se usan los mapas de respaldo (' + reason + ').');
    this.fellBack = true;

    const resume = { progress: this.progress, playing: this.state.playing };
    this.teardown();
    this.state.playing = false;
    this.setPlayIcon(false);
    this.resume = resume;

    this.el.fallbackNote.hidden = false;
    this.renderMapList();
    this.boot();
  }

  /** Desmonta el mapa actual sin tocar el estado del tour. */
  teardown() {
    cancelAnimationFrame(this.raf);
    this.cancelAutoplay();
    clearTimeout(this.styleT);
    this.styleOk = false;
    if (this.walkerEl) { this.walkerEl.remove(); this.walkerEl = null; }
    this.wp = null;
    this.labels = [];
    this.walker = null;
    this.camC = null;
    this.camE = null;
    this.teC = null;
    if (this.map) { this.map.remove(); this.map = null; }
  }

  /** Recoloca el tour donde estaba tras un relevo de motor. */
  applyResume() {
    const r = this.resume;
    this.resume = null;
    if (!r) return;
    const s = this.state.stage, S = DATA[s];
    this.progress = r.progress;
    this.setWalker(this.at(s, this.progress * S.total).p);
    this.setDone(this.progress);
    this.paintUI();
    if (r.playing) this.play();
  }

  /* ---------- mapa ---------- */

  initMap() {
    this.mb = this.useMB();
    const ml = this.lib = this.mb ? window.mapboxgl : window.maplibregl;
    if (!ml) { console.error('Librería de mapas no disponible'); return; }
    this.labels = [];

    const common = {
      container: this.el.map, attributionControl: false, maxPitch: 80,
      fadeDuration: 0, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      antialias: false, center: [-7.98, 42.86], zoom: 9.6, pitch: 45, bearing: -70
    };

    let map;
    if (this.mb) {
      ml.accessToken = this.token();
      map = this.map = new ml.Map({
        ...common, maxTileCacheSize: 1200, projection: 'mercator', style: this.mbStyle().style
      });
      map.on('error', e => this.onMapboxError(e));
      // Red de seguridad: si el estilo no llega a cargar, algo va mal con la
      // cuenta o la red y nadie nos lo va a decir. Mejor mapas de respaldo
      // que un rectángulo gris.
      clearTimeout(this.styleT);
      this.styleT = setTimeout(() => { if (!this.styleOk) this.fallBack('el mapa no respondió'); }, 12000);
    } else {
      map = this.map = new ml.Map({
        ...common, maxTileCacheSize: 800, centerClampedToGround: false,
        cancelPendingTileRequestsWhileZooming: false,
        style: {
          version: 8,
          sources: {
            ...Object.fromEntries(MAPS.flatMap(m => m.layers.map((l, k) =>
              ['bm-' + m.id + '-' + k, { type: 'raster', tiles: l.tiles, tileSize: 256, maxzoom: l.max, attribution: l.attr }]))),
            dem: {
              type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: 'Relieve © Mapzen, AWS'
            }
          },
          sky: {
            'sky-color': '#BFD8E8', 'horizon-color': '#EEF3F4', 'fog-color': '#F4F6F2',
            'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.4, 'atmosphere-blend': 0.6
          },
          layers: MAPS.flatMap(m => m.layers.map((l, k) => ({
            id: 'bm-' + m.id + '-' + k, type: 'raster', source: 'bm-' + m.id + '-' + k,
            layout: { visibility: m.id === this.state.mapId ? 'visible' : 'none' },
            paint: { 'raster-fade-duration': 300 }
          })))
        }
      });
    }

    map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
    this.h = this.el.map.clientHeight || 800;
    this.applyPadding();

    map.on('style.load', () => { this.styleOk = true; clearTimeout(this.styleT); this.addOverlays(); });
    map.on('load', () => {
      this.styleOk = true;
      clearTimeout(this.styleT);
      this.addOverlays();
      if (!this.mb) this.addMapLibreMarkers(ml, map);
      if (this.state.started) {
        this.goStage(this.state.stage, false);
        this.applyResume();          // tras un relevo, vuelve donde estaba
      } else {
        this.overviewSpin();
      }
    });
  }

  /** MapLibre no tiene icon-text-fit: las etiquetas van como Markers HTML. */
  addMapLibreMarkers(ml, map) {
    WP.forEach((w, wi) => {
      const el = document.createElement('div');
      const end = STAGES.some(s => s[0] === wi || s[1] === wi);
      el.textContent = w[0];
      Object.assign(el.style, {
        fontFamily: 'Montserrat, system-ui, sans-serif',
        fontSize: end ? '14px' : '12px', fontWeight: end ? '800' : '700',
        color: '#2E2E2D', background: '#FFFFFF',
        padding: end ? '6px 12px' : '4px 9px', borderRadius: '999px',
        whiteSpace: 'nowrap', transform: 'translateY(-14px)', pointerEvents: 'none'
      });
      el.style.visibility = this.state.started ? 'visible' : 'hidden';
      this.labels.push({ el, wi });
      new ml.Marker({ element: el, anchor: 'bottom', subpixelPositioning: true })
        .setLngLat([w[2], w[1]]).addTo(map);
    });

    const me = document.createElement('div');
    me.className = 'walker';
    me.style.position = 'relative';
    this.walker = new ml.Marker({ element: me, subpixelPositioning: true })
      .setLngLat(DATA[0].coords[0]).addTo(map);
  }

  addOverlays() {
    const map = this.map;
    if (!map) return;

    if (!map.getSource('dem')) {
      map.addSource('dem', this.mb
        ? { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 }
        : { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 14, encoding: 'terrarium' });
    }
    map.setTerrain({ source: 'dem', exaggeration: CONFIG.exaggeration });
    if (this.mb && map.setFog) {
      map.setFog({ color: '#F4F6F2', 'high-color': '#BFD8E8', 'horizon-blend': 0.08, 'space-color': '#BFD8E8', 'star-intensity': 0, range: [0.8, 7] });
    }

    if (!map.getSource('route')) {
      const all = [];
      DATA.forEach((s, i) => all.push(...(i ? s.coords.slice(1) : s.coords)));
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: all } } });
    }
    if (!map.getSource('stage')) {
      map.addSource('stage', { type: 'geojson', lineMetrics: true, data: this.lineFeat(DATA[this.state.stage].coords) });
    }

    const lay = { 'line-cap': 'round', 'line-join': 'round' };
    if (!map.getLayer('route-case')) map.addLayer({ id: 'route-case', type: 'line', source: 'route', layout: lay, paint: { 'line-color': '#2E2E2D', 'line-opacity': 0.35, 'line-width': 9 } });
    if (!map.getLayer('route')) map.addLayer({ id: 'route', type: 'line', source: 'route', layout: lay, paint: { 'line-color': '#FFFFFF', 'line-width': 5 } });

    if (this.mb && !map.getSource('done-src')) {
      map.addSource('done-src', { type: 'geojson', data: this.lineFeat([]), tolerance: 0, buffer: 16 });
    }
    if (!map.getLayer('done')) {
      map.addLayer({
        id: 'done', type: 'line', source: this.mb ? 'done-src' : 'stage', layout: lay,
        paint: this.mb
          ? { 'line-color': '#7AA606', 'line-width': 6 }
          : { 'line-width': 6, 'line-gradient': ['step', ['line-progress'], '#7AA606', 0.0001, 'rgba(122,166,6,0)'] }
      });
    }

    if (this.mb) {
      if (!map.hasImage('sw-pill')) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        x.fillStyle = '#FFFFFF';
        x.beginPath();
        x.roundRect(0, 0, 64, 64, 30);
        x.fill();
        map.addImage('sw-pill', x.getImageData(0, 0, 64, 64), {
          pixelRatio: 2, stretchX: [[30, 34]], stretchY: [[30, 34]], content: [16, 12, 48, 52]
        });
      }
      if (!map.getSource('towns')) {
        map.addSource('towns', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: WP.map((w, wi) => ({
              type: 'Feature',
              properties: { name: w[0], wi, end: STAGES.some(s => s[0] === wi || s[1] === wi) },
              geometry: { type: 'Point', coordinates: [w[2], w[1]] }
            }))
          }
        });
      }
      if (!this.walkerEl) {
        const me = document.createElement('div');
        me.className = 'walker';
        map.getContainer().appendChild(me);
        this.walkerEl = me;
        map.on('move', () => this.placeWalker());
      }
      this.wp = this.wp || this.at(this.state.stage, this.progress * DATA[this.state.stage].total).p;

      if (!map.getLayer('towns')) {
        map.addLayer({
          id: 'towns', type: 'symbol', source: 'towns',
          layout: {
            visibility: this.state.started ? 'visible' : 'none',
            'text-field': ['get', 'name'],
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': ['case', ['get', 'end'], 16, 13],
            'text-anchor': 'bottom', 'text-offset': [0, -1.2],
            'text-pitch-alignment': 'viewport',
            'icon-image': 'sw-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [5, 11, 4, 11],
            'text-allow-overlap': true, 'icon-allow-overlap': true,
            'text-ignore-placement': true, 'icon-ignore-placement': true,
            'text-line-height': 1,
            'symbol-sort-key': ['case', ['get', 'end'], 0, 1]
          },
          paint: { 'text-color': '#2E2E2D' }
        });
      }
      this.filterTowns(this.state.stage);
    }

    this.setDone(this.progress);
  }

  filterTowns(i) {
    const map = this.map;
    if (!map || !map.getLayer('towns')) return;
    map.setFilter('towns', ['all', ['>=', ['get', 'wi'], STAGES[i][0]], ['<=', ['get', 'wi'], STAGES[i][1]]]);
    map.setLayoutProperty('towns', 'visibility', this.state.started ? 'visible' : 'none');
  }

  lineFeat(c) {
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: c.length > 1 ? c : [[0, 0], [0, 0]] } };
  }

  overviewSpin() {
    let last = performance.now();
    const spin = t => {
      if (this.state.started || !this.map) return;
      const dt = (t - last) / 1000;
      last = t;
      this.map.setBearing(this.map.getBearing() + dt * 2);
      this.raf = requestAnimationFrame(spin);
    };
    this.raf = requestAnimationFrame(spin);
  }

  /* ---------- geometría sobre la etapa ---------- */

  /** Punto, índice de segmento y altitud a d metros del inicio de la etapa s. */
  at(s, d) {
    const S = DATA[s];
    d = Math.max(0, Math.min(S.total, d));
    let lo = 0, hi = S.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (S.cum[m] <= d) lo = m; else hi = m;
    }
    const seg = S.cum[hi] - S.cum[lo] || 1;
    const t = (d - S.cum[lo]) / seg;
    const a = S.coords[lo], b = S.coords[hi];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i: lo, ele: S.eles[lo] + (S.eles[hi] - S.eles[lo]) * t };
  }

  /** Rumbo suavizado: de 1200 m por detrás a 1800 m por delante. */
  camBearing(s, d) { return bearing(this.at(s, d - 1200).p, this.at(s, d + 1800).p); }

  /** Desnivel positivo acumulado a d metros. */
  upAt(s, d) {
    const S = DATA[s], a = this.at(s, d), i = a.i;
    const j = Math.min(i + 1, S.eles.length - 1);
    const seg = (S.cum[j] - S.cum[i]) || 1;
    const t = Math.max(0, Math.min(1, (d - S.cum[i]) / seg));
    return S.cumUp[i] + (S.cumUp[j] - S.cumUp[i]) * t;
  }

  /* ---------- peregrino y línea recorrida ---------- */

  setWalker(p) {
    if (this.mb) { this.wp = p; this.placeWalker(); }
    else if (this.walker) this.walker.setLngLat(p);
  }

  placeWalker() {
    if (!this.mb || !this.walkerEl || !this.map || !this.wp) return;
    const pt = this.map.project(this.wp);
    this.walkerEl.style.transform = 'translate3d(' + (pt.x - 11).toFixed(2) + 'px,' + (pt.y - 11).toFixed(2) + 'px,0)';
  }

  setDone(p) {
    const map = this.map;
    if (!map || !map.getLayer('done')) return;
    if (this.mb) {
      // Reescribir el GeoJSON es caro: como mucho cada 120 ms, salvo en los extremos.
      const now = performance.now();
      if (p > 0 && p < 1 && this.doneT && now - this.doneT < 120) return;
      this.doneT = now;
      const s = this.state.stage, S = DATA[s];
      const a = this.at(s, Math.max(0, Math.min(1, p)) * S.total);
      const src = map.getSource('done-src');
      if (src) src.setData(this.lineFeat(p <= 0 ? [] : [...S.coords.slice(0, a.i + 1), a.p]));
      return;
    }
    map.setPaintProperty('done', 'line-gradient',
      ['step', ['line-progress'], '#7AA606', Math.max(0.0001, Math.min(0.9999, p)), 'rgba(122,166,6,0)']);
  }

  /* ---------- pintado del HUD ---------- */

  renderProfile() {
    const S = DATA[this.state.stage], min = 200, max = 760;
    const pts = S.eles.map((e, k) => [
      (S.cum[k] / S.total * 600).toFixed(1),
      (68 - (e - min) / (max - min) * 62).toFixed(1)
    ]);
    const line = 'M' + pts.map(p => p.join(',')).join(' L');
    this.el.profLine.setAttribute('d', line);
    this.el.profArea.setAttribute('d', line + ' L600,72 L0,72 Z');
    this.el.profAreaDone.setAttribute('d', line + ' L600,72 L0,72 Z');
  }

  /** Textos que solo cambian al cambiar de etapa. */
  paintStageInfo() {
    const i = this.state.stage, S = DATA[i];
    this.el.dayNum.textContent = String(i + 1);
    this.el.stageFrom.textContent = S.from;
    this.el.stageTo.textContent = S.to;
    this.el.kmTotal.textContent = fmt(S.km);
    this.el.upTotal.textContent = String(Math.round(S.up));
    [...this.el.days.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  }

  /** Se llama en cada frame: solo escribe en el DOM lo que ha cambiado. */
  paintUI() {
    const s = this.state.stage, S = DATA[s];
    const p = Number.isFinite(this.progress) ? this.progress : 0;
    const d = p * S.total;
    const ele = this.at(s, d).ele;

    const set = (el, v) => { if (el.textContent !== v) el.textContent = v; };

    set(this.el.kmDone, fmt(p * S.km));
    set(this.el.eleNow, String(Math.round(ele)));

    // El desnivel sube con inercia para que no salte de golpe al adelantar.
    const tgt = this.upAt(s, d);
    if (this.upShown == null || !this.state.playing || tgt < this.upShown) this.upShown = tgt;
    else this.upShown += (tgt - this.upShown) * 0.06 + Math.min(tgt - this.upShown, 0.4);
    set(this.el.upDone, String(Math.round(this.upShown)));

    const w = (p * 600).toFixed(1);
    this.el.clipRect.setAttribute('width', w);
    this.el.profCursor.setAttribute('x1', w);
    this.el.profCursor.setAttribute('x2', w);

    const y = (68 - (ele - 200) / 560 * 62) / 72 * 100;
    this.el.eleBubble.style.left = (p * 100).toFixed(2) + '%';
    this.el.eleBubble.style.top = y.toFixed(2) + '%';

    this.syncPoi();
  }

  /** Muestra la ficha del POI más cercano (±10 % de progreso). */
  syncPoi(force) {
    const S = DATA[this.state.stage];
    const p = this.progress;
    const i = this.state.panel ? -1 : S.pois.findIndex(x => Math.abs(p - x.frac) < 0.1);
    if (!force && i === this.poiShown) return;
    this.poiShown = i;

    if (i < 0) { this.el.poi.hidden = true; return; }
    const poi = S.pois[i];
    this.el.poiImg.style.backgroundImage = poi.src ? 'url("' + poi.src + '")' : 'none';
    this.el.poiImg.setAttribute('aria-label', poi.title);
    this.el.poiKm.textContent = poi.km;
    this.el.poiTitle.textContent = poi.title;
    this.el.poiText.textContent = poi.text;
    this.el.poi.hidden = false;
  }

  preloadImgs(i) {
    DATA[i].pois.concat(DATA[Math.min(DATA.length - 1, i + 1)].pois).forEach(p => {
      if (!p.src || this.preloaded[p.src]) return;
      const im = new Image();
      im.decoding = 'async';
      im.src = p.src;
      this.preloaded[p.src] = im;
      if (im.decode) im.decode().catch(() => {});
    });
  }

  /* ---------- reproducción ---------- */

  goStage(i, autoplay = true) {
    cancelAnimationFrame(this.raf);
    this.cancelAutoplay();
    const first = !this.state.started;
    this.state.stage = i;
    this.state.started = true;
    this.state.ended = false;
    this.state.playing = false;
    this.progress = 0;
    this.upShown = null;
    this.camC = null;
    this.camE = null;
    this.teC = null;

    this.el.intro.hidden = true;
    this.el.tour.hidden = false;
    this.el.stage.classList.add('started');   // en móvil libera la esquina de la concha
    this.measureBar();                        // la barra ya tiene caja: ahora mide
    this.el.end.hidden = true;
    this.setPlayIcon(false);
    this.paintStageInfo();
    this.renderProfile();
    this.poiShown = -2;
    this.paintUI();
    this.preloadImgs(i);

    if (!this.map) return;
    if (first) this.applyPadding();

    this.labels.forEach(({ el, wi }) => {
      el.style.display = (wi >= STAGES[i][0] && wi <= STAGES[i][1]) ? 'block' : 'none';
      el.style.visibility = 'visible';
    });
    const src = this.map.getSource('stage');
    if (src) src.setData(this.lineFeat(DATA[i].coords));
    this.setDone(0);

    const start = this.at(i, 0).p;
    this.bear = this.camBearing(i, 0);
    this.setWalker(start);
    if (this.mb) setTimeout(() => this.filterTowns(i), 0);

    if (this.state.cam === 'stage') this.frameStage(i);
    else this.map.flyTo({ center: start, zoom: this.zoom(), pitch: CONFIG.pitch, bearing: this.bear, duration: 2600, essential: true });

    if (autoplay) this.autoplay(i, this.state.cam === 'stage' ? 2000 : 2600);
  }

  /** Arranca al terminar el vuelo de entrada.
     `moveend` es la señal buena, pero si se pierde (pestaña en segundo plano
     durante la animación, evento tragado por un cambio de estilo) el tour se
     quedaría parado en 0 para siempre: de ahí el temporizador de respaldo. */
  autoplay(i, duration) {
    this.cancelAutoplay();
    const go = () => {
      this.cancelAutoplay();
      if (this.state.stage === i && !this.state.ended && !this.state.playing) this.play();
    };
    this.autoGo = go;
    this.map.once('moveend', go);
    this.autoT = setTimeout(go, duration + 1200);
  }

  cancelAutoplay() {
    clearTimeout(this.autoT);
    if (this.autoGo && this.map) this.map.off('moveend', this.autoGo);
    this.autoGo = null;
  }

  setPlayIcon(playing) {
    this.el.iconPlay.hidden = playing;
    this.el.iconPause.hidden = !playing;
    this.el.playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  }

  play() {
    if (this.state.ended || !this.map) return;
    this.state.playing = true;
    this.setPlayIcon(true);
    let last = performance.now();

    const loop = t => {
      const dt = Math.max(0, Math.min(0.25, (t - last) / 1000));
      last = t;

      // Guardas contra NaN: si algo se corrompe, el play se quedaría parado.
      if (!Number.isFinite(this.progress)) this.progress = 0;
      const s = this.state.stage, S = DATA[s];
      if (!Number.isFinite(this.bear)) this.bear = this.camBearing(s, this.progress * S.total);
      if (this.camC && !(Number.isFinite(this.camC[0]) && Number.isFinite(this.camC[1]))) this.camC = null;
      if (this.camE != null && !Number.isFinite(this.camE)) this.camE = null;
      if (this.teC != null && !Number.isFinite(this.teC)) this.teC = null;

      const dur = CONFIG.stageSeconds / this.state.speed;
      this.progress = Math.min(1, this.progress + dt / dur);
      const d = this.progress * S.total;
      const cur = this.at(s, d);

      if (this.state.cam === 'follow' && !this.map.isEasing()) {
        const target = this.camBearing(s, d);
        const diff = ((target - this.bear + 540) % 360) - 180;
        this.bear += diff * (1 - Math.exp(-dt * 0.6));

        if (!this.camC) { const c = this.map.getCenter(); this.camC = [c.lng, c.lat]; }
        const k = 1 - Math.exp(-dt * 3);
        this.camC = [this.camC[0] + (cur.p[0] - this.camC[0]) * k, this.camC[1] + (cur.p[1] - this.camC[1]) * k];

        let te = cur.ele * CONFIG.exaggeration;
        if (this.mb && this.map.queryTerrainElevation && ((this.fq = (this.fq || 0) + 1) % 6 === 0 || this.teC == null)) {
          let sum = 0, n = 0;
          for (const o of [-1500, -600, 0, 600, 1500]) {
            const v = this.map.queryTerrainElevation(this.at(s, d + o).p);
            if (v != null) { sum += v; n++; }
          }
          if (n) this.teC = sum / n;
        }
        if (this.mb && this.teC != null) te = this.teC;
        this.camE = this.camE == null ? te : this.camE + (te - this.camE) * (1 - Math.exp(-dt * 0.35));

        if (this.mb) {
          const ml = this.lib, pitch = CONFIG.pitch, lat = this.camC[1];
          const D = 1.5 * (this.h || 800) * 40075016.686 * Math.cos(rad(lat)) / (512 * Math.pow(2, this.zoom()));
          const b = rad(this.bear), hz = D * Math.sin(rad(pitch)), vt = D * Math.cos(rad(pitch));
          const pos = [
            this.camC[0] - hz * Math.sin(b) / (111320 * Math.cos(rad(lat))),
            lat - hz * Math.cos(b) / 110540
          ];
          const cam = this.map.getFreeCameraOptions();
          cam.position = ml.MercatorCoordinate.fromLngLat(pos, this.camE + vt);
          cam.setPitchBearing(pitch, this.bear);
          this.map.setFreeCameraOptions(cam);
        } else {
          this.map.jumpTo({ center: this.camC, bearing: this.bear, pitch: CONFIG.pitch, zoom: this.zoom(), elevation: this.camE });
        }
      }

      this.setWalker(cur.p);
      this.setDone(this.progress);
      this.paintUI();

      if (this.progress >= 1) { this.finish(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.cancelAutoplay();   // una pausa durante el vuelo de entrada manda
    this.state.playing = false;
    this.setPlayIcon(false);
  }

  finish() {
    this.state.playing = false;
    this.state.ended = true;
    this.progress = 1;
    this.setPlayIcon(false);
    this.paintUI();

    const i = this.state.stage, S = DATA[i], isLast = i === DATA.length - 1;
    this.el.endDay.textContent = String(i + 1);
    this.el.endKm.textContent = fmt(S.km);

    if (isLast) {
      this.el.endTitle.innerHTML = 'Has llegado a <span class="sw-underline">Santiago</span>';
      this.el.endText.textContent = 'Ya conoces cada etapa. ¿Lo organizamos juntos, con hoteles y asistencia 24/7?';
      this.el.endBtn.textContent = 'Reserva tu Camino';
      this.el.endBtn.onclick = () => { if (CONFIG.bookingUrl) location.href = CONFIG.bookingUrl; };
    } else {
      this.el.endTitle.textContent = 'Llegas a ' + S.to;
      this.el.endText.textContent = 'Tu hotel te espera con la maleta ya en la habitación. Mañana, nueva etapa.';
      this.el.endBtn.textContent = 'Ver el día ' + (i + 2);
      this.el.endBtn.onclick = () => this.goStage(i + 1);
    }
    this.el.end.hidden = false;
  }

  /** Oculta el cartel de fin de etapa. El tour sigue en `ended`: la barra
     queda libre para repetir la etapa o saltar a otro día. */
  closeEnd(moveFocus = true) {
    this.el.end.hidden = true;
    this.syncPoi(true);
    if (moveFocus) this.el.playBtn.focus();
  }
}

/* ---------- herramienta de vista previa (?preview=1) ---------- */

function setupPreview(tour) {
  const bar = $('previewBar'), stage = $('stage');
  const dsk = $('pvDesktop'), mob = $('pvMobile');
  bar.hidden = false;
  const set = mobile => {
    stage.classList.toggle('stage--framed', mobile);
    dsk.setAttribute('aria-pressed', String(!mobile));
    mob.setAttribute('aria-pressed', String(mobile));
    // El ResizeObserver de Tour se encarga de resize/padding/reencuadre.
  };
  dsk.addEventListener('click', () => set(false));
  mob.addEventListener('click', () => set(true));
}

const tour = new Tour();
if (PREVIEW) setupPreview(tour);

/* ?debug=1 expone la instancia para inspeccionarla desde la consola. */
if (new URLSearchParams(location.search).get('debug') === '1') window.tourApp = tour;
