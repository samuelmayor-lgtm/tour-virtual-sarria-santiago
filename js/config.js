/* Tour virtual Sarria → Santiago · configuración
   Ajustes expuestos (equivalentes a los "Tweaks" del prototipo). */

export const CONFIG = {
  /* Token público de Mapbox (empieza por "pk."). Si se deja vacío o no empieza
     por "pk.", la aplicación cae automáticamente a MapLibre con mapas de prueba.
     Restringir el token por URL en account.mapbox.com → Tokens. */
  mapboxToken: 'pk.eyJ1Ijoic2FudGlhZ293YXlzIiwiYSI6ImNtdjlqdGJ3ODAxbW0yd3M3M3A1cHo5M3cifQ.E_VgbECq4j64dVSl9Cx1UQ',

  /* Cámara */
  pitch: 60,          // 40–78
  followZoom: 13.4,   // 12–15
  exaggeration: 1.4,  // 1–2.5

  /* Reproducción */
  stageSeconds: 60,   // 20–120 · duración de una etapa a velocidad 1x

  /* Enlace del CTA final «Reserva tu Camino». Vacío = botón sin enlace. */
  bookingUrl: 'https://santiagoways.com/es/camino-de-santiago/camino-frances/de-sarria-a-santiago/',

  /* Fotos de los puntos de interés. 'local' usa assets/pois/ (repo autónomo),
     'remote' las carga de santiagoways.com. */
  poiImages: 'local'
};

/* Permite forzar ajustes desde la URL, p. ej. ?token=pk.xxx&seconds=40 */
const q = new URLSearchParams(location.search);
if (q.get('token')) CONFIG.mapboxToken = q.get('token').trim();
if (q.get('seconds')) CONFIG.stageSeconds = Number(q.get('seconds')) || CONFIG.stageSeconds;
if (q.get('pitch')) CONFIG.pitch = Number(q.get('pitch')) || CONFIG.pitch;
if (q.get('zoom')) CONFIG.followZoom = Number(q.get('zoom')) || CONFIG.followZoom;
if (q.get('images') === 'remote') CONFIG.poiImages = 'remote';

/* Herramienta de pruebas: ?preview=1 muestra el selector Escritorio / Móvil. */
export const PREVIEW = q.get('preview') === '1';
