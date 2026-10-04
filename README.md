# Texam

Lector de textos minimalista que funciona **íntegramente en el navegador**. Abres un archivo y lo lees: nada se sube a ningún servidor, nada se instala, nada se guarda fuera de tu equipo.

> **Lee lo que quieras. Ligero, tranquilo y sin ruido.**

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

**Nota sobre `.doc`:** el formato binario de Word 97‑2003 no está documentado públicamente. Texam prueba dos decodificaciones (Windows‑1252 y UTF‑16LE) y se queda con la que produce texto más legible. Funciona aceptablemente con documentos sencillos; para resultados perfectos, guárdalo como `.docx` o `.pdf`.

## Funciones

- **Arrastrar y soltar** o selector de archivos.
- **Índice lateral** automático (de los títulos del documento, o del propio EPUB).
- **Ajuste de tamaño de letra** (botones `A−` / `A+` o teclas `+` / `-`).
- **Tema claro y oscuro** con colores suaves; recuerda tu elección.
- **Memoria de posición**: al reabrir un documento, vuelve donde lo dejaste.
- **Barra de progreso** de lectura discreta.
- Teclas `j` / `k` para avanzar y retroceder, `Esc` para cerrar el índice.

## Privacidad

No hay servidor, ni analítica, ni peticiones de red más allá de las librerías locales. Todo el análisis de archivos ocurre en tu navegador mediante las APIs `FileReader` y `DOMParser`. El contenido de los documentos que abres **nunca sale de tu equipo**.

## Estructura

```
texam/
├── index.html      # página única
├── styles.css      # estilos (paleta suave, claro/oscuro)
├── app.js          # lógica: lectura, parsers, interfaz
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

Al no haber build ni dependencias externas, basta con servir la carpeta:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

También funciona abriendo `index.html` directamente, salvo la extracción de PDF (necesita un servidor por el *worker*).

## Publicar en GitHub Pages

1. Crea un repositorio público, por ejemplo `texam`.
2. Sube el contenido de esta carpeta a la rama `main`.
3. En el repositorio: **Settings → Pages → Build and deployment**
   - *Source*: **Deploy from a branch**
   - *Branch*: `main` · carpeta `/ (root)`
4. Guarda. En un minuto estará en `https://<usuario>.github.io/texam/`.

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
