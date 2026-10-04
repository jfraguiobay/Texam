# Texam

Lector de textos con **lectura por RSVP** (presentación serial rápida). Las palabras aparecen una a una en un punto fijo y la letra pivote —la **ORP**, *Optimal Recognition Point*— queda siempre clavada en el centro exacto de la pantalla. Tus ojos no se mueven; el texto viene a ti.

Todo ocurre en el navegador: nada se sube a ningún servidor, nada se instala.

> **Las palabras vienen a ti. Los ojos no se mueven.**

## Cómo funciona

Al leer en pantalla, los ojos hacen miles de micro-movimientos: recorren la línea, saltan a la siguiente, vuelven atrás. Eso es fricción. Con RSVP desaparece:

1. El texto se divide en palabras.
2. De cada palabra se calcula su **ORP**, el punto donde el ojo la reconoce antes, según su longitud:

   | Longitud | 1 | 2–5 | 6–9 | 10–13 | 14+ |
   | --- | --- | --- | --- | --- | --- |
   | Letra pivote | 1ª | 2ª | 3ª | 4ª | 5ª |

3. La palabra se parte en tres trozos (`antes` · `pivote` · `después`) y se alinea de modo que **la letra pivote cae siempre en el mismo píxel**, marcado con la guía central.
4. Cada palabra se muestra un tiempo proporcional a la velocidad elegida, con pausas extra al final de frase (`. ! ?`) y en comas.

Verificado con medición real del DOM durante la reproducción: la desviación del pivote respecto al centro es de **0,008 px** (redondeo subpíxel), tanto en móvil como en escritorio.

## Formatos admitidos

| Formato | Extensión | Cómo se procesa |
| --- | --- | --- |
| Texto plano | `.txt` `.text` `.log` `.csv` | Párrafos por líneas en blanco |
| Markdown | `.md` `.markdown` | Renderizado con marked + saneado |
| EPUB | `.epub` | EPUB 3 (nav) y EPUB 2 (NCX), con capítulos e imágenes |
| Word moderno | `.docx` | Conversión a HTML con mammoth |
| Word antiguo | `.doc` | Extracción heurística aproximada (ver nota) |
| RTF | `.rtf` | Parser propio de grupos de texto |
| HTML | `.html` `.htm` | Saneado y renderizado |
| PDF | `.pdf` | Extracción de texto con pdf.js |

Todos ellos se convierten en una lista de palabras y se leen por RSVP. **Nota sobre `.doc`:** el formato binario de Word 97‑2003 no está documentado públicamente; Texam prueba dos decodificaciones (Windows‑1252 y UTF‑16LE) y se queda con la que produce texto más legible. Para resultados perfectos, guárdalo como `.docx` o `.pdf`.

## Controles

Móvil primero: los controles caen bajo el pulgar.

| Control | Acción |
| --- | --- |
| Tocar la zona central | Reproducir / pausar |
| Botón redondo | Reproducir / pausar |
| `−10` / `+10` | Retroceder o avanzar diez palabras |
| `⏮` / `⏭` | Frase anterior / siguiente |
| Deslizador, `−` y `+` | Velocidad, de 150 a 900 ppm (pasos de 20) |
| `A−` / `A+` del panel | Tamaño de la letra pivote |
| `☾` / `☀` | Tema claro u oscuro |
| `✕` | Volver a la vista continua |

Teclado (escritorio):

| Tecla | Acción |
| --- | --- |
| `Espacio` | Reproducir / pausar |
| `←` / `→` | Frase anterior / siguiente |
| `↑` / `↓` | Subir / bajar 20 ppm |
| `+` / `-` | Tamaño del texto |
| `Esc` | Volver a la vista continua |

### Vista continua

El botón **Continuo** (o `✕` en el panel de velocidad) muestra el documento entero, desplazable, con índice lateral. Sigue siendo la vista adecuada para EPUB con imágenes, tablas o código. Se conserva la posición en ambos modos.

## Funciones

- Arrastrar y soltar, o selector de archivos.
- **Índice lateral** en la vista continua (de los títulos del documento o del propio EPUB).
- **Memoria de posición**: recuerda la palabra exacta y el punto de desplazamiento.
- **Barra de progreso** y estimación de tiempo restante según tu velocidad.
- Tema claro y oscuro con colores suaves; recuerda todas tus preferencias.

## Privacidad

No hay servidor, ni analítica, ni peticiones de red más allá de las librerías locales. Todo el análisis de archivos ocurre en tu navegador con `FileReader` y `DOMParser`. El contenido que abres **nunca sale de tu equipo**.

## Estructura

```
texam/
├── index.html      # página única
├── styles.css      # estilos (paleta suave, claro/oscuro, RSVP)
├── app.js          # lectura, parsers, motor RSVP, interfaz
├── libs/           # librerías locales (sin CDN, funciona sin conexión)
│   ├── jszip.min.js
│   ├── marked.min.js
│   ├── mammoth.browser.min.js
│   ├── purify.min.js
│   ├── pdf.min.js
│   └── pdf.worker.min.js
└── samples/        # documentos de ejemplo
```

## Uso local

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

También funciona abriendo `index.html` directamente, salvo la extracción de PDF (necesita un servidor por el *worker*).

## Publicar en GitHub Pages

1. Crea un repositorio público, por ejemplo `texam`.
2. Sube el contenido de esta carpeta a la rama `main`.
3. **Settings → Pages → Build and deployment**: *Source* **Deploy from a branch**, *Branch* `main`, carpeta `/ (root)`.
4. En un minuto estará en `https://<usuario>.github.io/texam/`.

El archivo `.nojekyll` ya está incluido para que Pages no procese la carpeta `libs/`.

## Tecnología

Sin frameworks ni paso de compilación. JavaScript de navegador y estas librerías de terceros, incluidas localmente:

- [JSZip](https://stuk.github.io/jszip/) — lectura de contenedores ZIP (EPUB, DOCX)
- [marked](https://marked.js.org/) — Markdown
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) — DOCX → HTML
- [DOMPurify](https://github.com/cure53/DOMPurify) — saneado de HTML
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF

## Licencia

MIT — ver [LICENSE](LICENSE).
