# Tour virtual Sarria → Santiago

Sobrevuelo interactivo de las cinco etapas finales del Camino Francés, de Sarria a
Santiago de Compostela. Sitio **estático**, sin framework ni paso de compilación:
`index.html` + `js/` + `css/` + `assets/`.

![Santiago Ways](assets/logo-horizontal.jpg)

## Cómo ejecutarlo en local

El proyecto usa **módulos ES**, así que necesita servirse por HTTP: abrir
`index.html` con doble clic (`file://`) no funciona.

```bash
npx serve .
```

O con Python:

```bash
python -m http.server 5173
```

Luego abre `http://localhost:5173`.

## Parámetros de URL

| Parámetro | Efecto |
|---|---|
| `?preview=1` | Muestra la barra de pruebas **Escritorio / Móvil** con el marco de 390×844 |
| `?token=pk.…` | Usa otro token de Mapbox sin tocar el código |
| `?seconds=40` | Cambia la duración de una etapa a velocidad 1x |
| `?pitch=70` · `?zoom=14` | Ajusta la cámara de seguimiento |
| `?images=remote` | Carga las fotos de los POIs desde santiagoways.com en vez de `assets/pois/` |
| `?debug=1` | Expone la instancia en `window.tourApp` para inspeccionarla desde la consola |

El diseño responsive es real (**container queries** sobre `.stage`, corte en 640 px),
así que `?preview=1` es solo una herramienta de pruebas: el móvil funciona igual sin ella.

## Configuración

Todo lo ajustable está en [`js/config.js`](js/config.js):

| Ajuste | Por defecto | Rango |
|---|---|---|
| `mapboxToken` | token público `pk.` | — |
| `pitch` | 60° | 40–78 |
| `followZoom` | 13,4 | 12–15 |
| `exaggeration` | 1,4 | 1–2,5 |
| `stageSeconds` | 60 s | 20–120 |
| `bookingUrl` | `''` | URL del CTA final |
| `poiImages` | `'local'` | `'local'` · `'remote'` |

### Token de Mapbox

El modo principal es **Mapbox GL JS 3.9.4**. Si `mapboxToken` no empieza por `pk.`,
la aplicación arranca directamente con **MapLibre GL 5.6.0** y mapas alternativos
(Esri, OpenTopoMap, CARTO y relieve Terrarium de AWS).

> [!IMPORTANT]
> El token es público y queda visible en el código, como corresponde a un token `pk.`.
> La cuenta **no tiene método de pago**, así que es un token de prueba: no admite
> restricciones de URL ni se puede rotar. Ver «Control del gasto».

### Caída automática a los mapas de respaldo

El tour **nunca se queda sin mapa**. Si Mapbox responde `401` (token inválido),
`403` (cuota agotada o token no autorizado) o `429` (límite de peticiones), o si el estilo
no llega a cargar en 12 segundos, el sitio cambia solo a MapLibre **conservando la etapa,
el progreso y la reproducción**, y lo avisa en el panel de ajustes.

Sin esto, un token caducado dejaba el tour corriendo sobre un fondo gris vacío.

### Control del gasto

La cuenta de Mapbox **no tiene método de pago**, y eso lo determina todo. Sin tarjeta,
Mapbox aplica [límites de prueba](https://docs.mapbox.com/accounts/guides/signup/):

| | Sin método de pago (actual) | Con método de pago |
|---|---|---|
| Cargas de mapa al mes | **5.000** | 50.000 gratis, luego 5 $/1.000 |
| Tokens | 1, sin crear, rotar ni borrar | Los que hagan falta |
| Restricciones de URL | **No disponibles** | Sí |
| Riesgo de factura | **Ninguno** | Sin tope de gasto posible |

Una carga es **una inicialización del mapa**, con sesión de hasta 12 h: equivale a una
visita. Moverse, hacer zoom, cambiar de tipo de mapa o repetir etapas **no suma**.

**Por qué se ha elegido así.** El objetivo era no poder gastar dinero, y sin tarjeta el
tope lo impone Mapbox: al llegar a 5.000 avisa por consola y por correo, y el token deja
de servir. A partir de ahí **el sitio cae solo a los mapas de respaldo** y el visitante
sigue viendo un mapa. Nunca hay factura.

> [!WARNING]
> El techo real son **5.000 visitas únicas al mes**, no 50.000. Para una campaña o una
> newsletter eso se consume rápido, y el resto del mes se verían los mapas alternativos.
> Además, al no poder restringir el token por URL y estar el repositorio en público,
> cualquiera podría copiarlo y agotar la cuota. El daño está acotado (no hay cobro, solo
> se pierde calidad de mapa), pero si el tour pasa a ser una pieza con tráfico serio,
> toca revisar esta decisión.

Si algún día se añade método de pago, Mapbox ofrece **rotar el token**: el actual dejaría
de funcionar y habría que actualizar `js/config.js`. Ese es el momento de crear un token
nuevo **con restricción de URL** a la dirección de Pages y usar ese.

## Estructura

```
index.html          Estructura de las tres pantallas
css/tokens.css      Design tokens · Santiago Ways Brandbook 2027
css/tour.css        Maquetación y responsive (container queries)
js/config.js        Ajustes y lectura de parámetros de URL
js/data.js          Waypoints, etapas, POIs, geometría y estilos de mapa
js/tour.js          Motor: mapa, cámara, reproducción y HUD
assets/             Logos de marca
assets/pois/        Fotos de los puntos de interés
```

## Cómo funciona

- **Ruta**: 27 waypoints con latitud, longitud y altitud, interpolados con
  **Catmull-Rom** (24 subpuntos por tramo); distancias por **haversine**.
  El trazado y las altitudes son **aproximados**: hay que sustituirlos por GPX reales.
- **Reproducción**: progreso 0→1 con `requestAnimationFrame`, `dt` limitado a 0,25 s.
  Una etapa dura `stageSeconds / velocidad`.
- **Cámara «Seguir el Camino»**: centro suavizado (`k = 1 - e^(-dt·3)`), rumbo calculado
  entre un punto 1200 m por detrás y otro 1800 m por delante y suavizado aparte. La
  altura de la cámara es la media de `queryTerrainElevation` en cinco puntos, consultada
  cada seis fotogramas. En Mapbox se posiciona con `setFreeCameraOptions`.
- **Cámara «Etapa completa»**: `fitBounds` de la etapa; el mapa se queda quieto y solo
  avanza el punto verde.
- **Rendimiento**: `pixelRatio ≤ 1,5`, `antialias: false`, `fadeDuration: 0`; el HUD se
  actualiza escribiendo en el DOM nodo a nodo, nunca re-renderizando; la línea recorrida
  se reescribe como mucho cada 120 ms; el punto del peregrino se posiciona con
  `map.project()` y `translate3d` (sin `Marker`, para que no tiemble).

## Publicar en GitHub Pages

No hay build: Pages sirve la raíz del repositorio tal cual.

1. **Settings → Pages**
2. *Source*: **Deploy from a branch**
3. *Branch*: `main`, carpeta `/ (root)` → **Save**

La URL tarda un par de minutos en responder. Después, **añade esa URL a las
restricciones del token de Mapbox**.

## Pendiente

- [ ] Sustituir los waypoints aproximados por **GPX reales** de cada etapa.
- [ ] Enlazar el CTA final («Reserva tu Camino») rellenando `bookingUrl`.

## Licencia y créditos

Marca, textos y fotografías: **Santiago Ways**.
Mapas: © Mapbox, © OpenStreetMap, © Maxar. Respaldo: © Esri, OpenTopoMap (CC-BY-SA), © CARTO.
Tipografía **Montserrat** (SIL Open Font License) vía Google Fonts.
