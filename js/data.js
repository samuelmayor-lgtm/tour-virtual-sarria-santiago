/* Tour virtual Sarria → Santiago · datos de ruta
   Waypoints, etapas y puntos de interés, más la geometría derivada.
   Altitudes y trazado son APROXIMADOS: sustituir por GPX reales cuando existan. */

/* Mismo ?v= que en index.html y tour.js: si no coincide, el navegador
   cargaría dos instancias distintas del módulo de configuración. */
import { CONFIG } from './config.js?v=2';

/* [nombre, lat, lng, altitud m] */
export const WP = [
  ['Sarria', 42.7807, -7.4140, 450], ['Barbadelo', 42.7660, -7.4440, 570],
  ['Morgade', 42.7700, -7.5170, 650], ['Ferreiros', 42.7740, -7.5330, 660],
  ['Mercadoiro', 42.7880, -7.5720, 560], ['Portomarín', 42.8075, -7.6156, 390],
  ['Gonzar', 42.8270, -7.6960, 550], ['Castromaior', 42.8380, -7.7130, 600],
  ['Ventas de Narón', 42.8470, -7.7560, 700], ['Ligonde', 42.8590, -7.7940, 630],
  ['Airexe', 42.8610, -7.8050, 630], ['Palas de Rei', 42.8733, -7.8686, 565],
  ['San Xulián', 42.8770, -7.9030, 500], ['Casanova', 42.8880, -7.9520, 470],
  ['Leboreiro', 42.8975, -7.9850, 430], ['Melide', 42.9140, -8.0150, 455],
  ['Boente', 42.9180, -8.0710, 400], ['Castañeda', 42.9230, -8.1000, 410],
  ['Ribadiso', 42.9300, -8.1380, 310], ['Arzúa', 42.9265, -8.1636, 390],
  ['Salceda', 42.9230, -8.2550, 370], ['Santa Irene', 42.9150, -8.3270, 380],
  ['O Pedrouzo', 42.9050, -8.3622, 290], ['Amenal', 42.9050, -8.3950, 260],
  ['Lavacolla', 42.9010, -8.4380, 300], ['Monte do Gozo', 42.8870, -8.4950, 370],
  ['Santiago', 42.8806, -8.5446, 260]
];

/* [índice del primer waypoint, índice del último, km oficiales] */
export const STAGES = [[0, 5, 22.2], [5, 11, 24.8], [11, 19, 28.5], [19, 22, 19.3], [22, 26, 19.4]];

const UP = 'https://santiagoways.com/wp-content/uploads/';

/* s: etapa · wp: waypoint en el que aparece · img: ruta remota · local: fichero en assets/pois/ */
export const POIS = [
  { s: 0, wp: 'Sarria', title: 'Sarria', img: UP + '2026/05/post-alojamiento-sarria2.webp', local: 'sarria.webp',
    text: 'El punto de partida más elegido: desde aquí cumples los 100 km necesarios para recibir la Compostela.' },
  { s: 0, wp: 'Morgade', title: 'Mojón del km 100', img: UP + '2017/11/ultimos-100-km-del-camino-de-santiago.jpg', local: 'mojon-km-100.jpg',
    text: 'El hito que todo peregrino quiere fotografiar. A partir de aquí, la cuenta atrás hasta Santiago.' },
  { s: 0, wp: 'Portomarín', title: 'Portomarín', img: UP + '2018/11/PORTOMARIN-1.jpg', local: 'portomarin.jpg',
    text: 'Cruzas el embalse de Belesar y subes a la iglesia de San Nicolás, trasladada piedra a piedra desde el pueblo antiguo.' },
  { s: 1, wp: 'Ventas de Narón', title: 'Sierra Ligonde', img: UP + '2018/11/Ligonde08.jpg', local: 'sierra-ligonde.jpg',
    text: 'El punto más alto de la etapa, con vistas abiertas sobre los campos de Lugo.' },
  { s: 2, wp: 'Melide', title: 'Melide', img: UP + '2020/05/comer-pulpo-marisco-santiago-compostela-1.jpg', local: 'melide.jpg',
    text: 'Aquí se une el Camino Primitivo. Parada obligada para probar el pulpo a feira.' },
  { s: 2, wp: 'Ribadiso', title: 'Ribadiso', img: UP + '2018/11/Ribadiso_da_Baixo08.jpg', local: 'ribadiso.jpg',
    text: 'Un puente medieval sobre el río Iso. Buen lugar para descansar los pies antes de Arzúa.' },
  { s: 3, wp: 'Santa Irene', title: 'Bosques de eucalipto', img: UP + '2017/11/BOSQUE-min.jpg', local: 'bosque-eucalipto.jpg',
    text: 'Una etapa suave, a la sombra, entre aldeas y prados. Perfecta para disfrutar sin prisa.' },
  { s: 4, wp: 'Monte do Gozo', title: 'Monte do Gozo', img: UP + '2020/07/monte-do-gozo.jpeg', local: 'monte-do-gozo.jpeg',
    text: 'Desde aquí se ven por primera vez las torres de la catedral. Quedan 5 km.' },
  { s: 4, wp: 'Santiago', title: 'Plaza del Obradoiro', img: UP + '2018/11/plaza-del-obradoiro.jpg', local: 'plaza-del-obradoiro.jpg',
    text: 'Has llegado. Tu Compostela te espera en la Oficina del Peregrino.' }
];

/* ---------- geodesia ---------- */

const R = 6371000;
export const rad = d => d * Math.PI / 180;

/** Distancia haversine en metros entre dos [lng, lat]. */
export function hav(a, b) {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Rumbo en grados de a hacia b, ambos [lng, lat]. */
export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Catmull-Rom en una dimensión. */
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const SUB = 24; // subpuntos por tramo entre waypoints

function poiImage(p) {
  return CONFIG.poiImages === 'remote' ? p.img : 'assets/pois/' + p.local;
}

/** Interpola una etapa: coordenadas, altitudes, distancias acumuladas y POIs situados. */
function buildStage(i) {
  const [a, b, km] = STAGES[i];
  const pts = WP.slice(a, b + 1);
  const coords = [], eles = [], wpIdx = {};

  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    wpIdx[p1[0]] = coords.length;
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB;
      coords.push([cr(p0[2], p1[2], p2[2], p3[2], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
      // altitud con easing coseno para que el perfil no haga picos en los waypoints
      eles.push(p1[3] + (p2[3] - p1[3]) * (0.5 - 0.5 * Math.cos(Math.PI * t)));
    }
  }
  const last = pts[pts.length - 1];
  wpIdx[last[0]] = coords.length;
  coords.push([last[2], last[1]]);
  eles.push(last[3]);

  const cum = [0];
  for (let k = 1; k < coords.length; k++) cum.push(cum[k - 1] + hav(coords[k - 1], coords[k]));
  const total = cum[cum.length - 1];

  let up = 0, down = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = pts[k][3] - pts[k - 1][3];
    if (d > 0) up += d; else down -= d;
  }

  const pois = POIS.filter(p => p.s === i).map(p => {
    const f = cum[wpIdx[p.wp]] / total;
    return { ...p, src: poiImage(p), frac: f, km: (f * km).toFixed(1).replace('.', ',') };
  });

  const cumUp = [0];
  for (let k = 1; k < eles.length; k++) cumUp.push(cumUp[k - 1] + Math.max(0, eles[k] - eles[k - 1]));

  return { from: pts[0][0], to: last[0], km, coords, eles, cum, cumUp, total, up, down, pois };
}

export const DATA = STAGES.map((_, i) => buildStage(i));

/* ---------- estilos de mapa ---------- */

const ESRI = n => 'https://server.arcgisonline.com/ArcGIS/rest/services/' + n + '/MapServer/tile/{z}/{y}/{x}';

/** Respaldo MapLibre, sin token. */
export const MAPS = [
  { id: 'sat', name: 'Satélite', desc: 'Esri World Imagery. Gratis para pruebas; uso comercial con licencia ArcGIS.',
    layers: [{ tiles: [ESRI('World_Imagery')], max: 18, attr: 'Imágenes © Esri, Maxar, Earthstar Geographics' }] },
  { id: 'satlab', name: 'Satélite con nombres', desc: 'Satélite de Esri más carreteras y topónimos. Misma licencia.',
    layers: [{ tiles: [ESRI('World_Imagery')], max: 18, attr: 'Imágenes © Esri, Maxar' },
             { tiles: [ESRI('Reference/World_Boundaries_and_Places')], max: 18, attr: 'Nombres © Esri' }] },
  { id: 'topo', name: 'Topográfico', desc: 'Esri World Topo: relieve, caminos y pueblos. Uso comercial con licencia ArcGIS.',
    layers: [{ tiles: [ESRI('World_Topo_Map')], max: 18, attr: '© Esri, HERE, Garmin, OpenStreetMap' }] },
  { id: 'otm', name: 'Senderismo', desc: 'OpenTopoMap: curvas de nivel y senderos. Libre con atribución; sin tráfico alto.',
    layers: [{ tiles: ['a', 'b', 'c'].map(s => 'https://' + s + '.tile.opentopomap.org/{z}/{x}/{y}.png'), max: 17,
               attr: '© OpenStreetMap, SRTM · OpenTopoMap (CC-BY-SA)' }] },
  { id: 'carto', name: 'Claro', desc: 'CARTO Voyager: limpio y legible. Gratis hasta cierto uso; luego plan de pago.',
    layers: [{ tiles: ['a', 'b', 'c', 'd'].map(s => 'https://' + s + '.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'),
               max: 19, attr: '© OpenStreetMap · © CARTO' }] }
];

/** Modo principal, con token Mapbox. */
export const MB_MAPS = [
  { id: 'mb-satlab', name: 'Satélite con nombres', desc: 'Mapbox Satellite Streets: imagen Maxar con pueblos y carreteras de OpenStreetMap.', style: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'mb-sat', name: 'Satélite', desc: 'Mapbox Satellite: solo la imagen aérea, sin nombres.', style: 'mapbox://styles/mapbox/satellite-v9' },
  { id: 'mb-out', name: 'Exterior', desc: 'Mapbox Outdoors: senderos, relieve y curvas de nivel.', style: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'mb-light', name: 'Claro', desc: 'Mapbox Light: mapa minimalista y muy legible.', style: 'mapbox://styles/mapbox/light-v11' }
];

export const MB_JS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js';
export const MB_CSS = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css';
export const ML_JS = 'https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js';
export const ML_CSS = 'https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css';

/** 22,2 → "22,2" (coma decimal, una cifra). */
export const fmt = n => n.toFixed(1).replace('.', ',');
