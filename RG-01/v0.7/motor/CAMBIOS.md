# Registro de cambios del motor común

Cada versión del motor indica qué se añadió, qué estudio lo pidió y si afecta a estudios anteriores. Un estudio congelado lleva su propia copia del motor, así que estos cambios nunca alteran un estudio publicado.

## 0.6.0 · 2026-11-16

**Motivo:** etapa 3. El investigador pasará RG-01 por enlace, con los participantes acompañados, y guardará los datos en Google Drive con DataPipe. DataPipe ya no admite experimentos nuevos en OSF.

- **Envío a DataPipe** (`data.datapipe`, `datos/envio-datapipe.js`):
  - **Qué se envía:** al terminar la sesión, los mismos archivos que se descargan (paquete `.zip`, archivos propios del estudio, datos personales) más el registro bruto en texto (`_bruto.json`), que llega aunque falle el `.zip`. Los `.csv` y el `.json` van como texto (`POST /api/data/`), con el BOM de los CSV; el `.zip`, en base64 (`POST /api/base64/`, solo si `send_zip: true`; exige «Accept base64 file uploads» en DataPipe).
  - **Nombres:** todos llevan el identificador de la sesión, porque DataPipe rechaza nombres repetidos.
  - **Respuestas:** 201 (guardado), 202 (en cola) y `FILE_EXISTS` (ya estaba) cuentan como enviados. Cualquier otra respuesta es un error, que se muestra.
  - **Sin bibliotecas nuevas:** son peticiones web normales a la API documentada (pipe.jspsych.org/docs/api, consultada el 2026-11-16).
- **Destino:** experimento de **PRUEBAS** (`experiment_id_test`) para el modo prueba y para cualquier versión no congelada; experimento **REAL** (`experiment_id_real`) solo para sesiones reales de una versión congelada. Una versión congelada sin `experiment_id_real` no puede iniciarse.
- **Pantalla del investigador:** fila «Datos al terminar» (destino y descarga).
- **Pantalla final:** estado del envío archivo por archivo y botón «Reintentar el envío» si falla. Los datos siguen guardados en el navegador y la descarga funciona como antes.
- **Sesiones pendientes:** al abrir el estudio, las sesiones cerradas sin enviar se envían solas, igual que las no descargadas se descargan solas. «Recuperar datos» tiene la columna «Enviada» y el botón «Enviar a DataPipe», que usa la configuración guardada con la sesión.
- `datos/paquete.js`: `buildRawJSON` (el mismo registro bruto que va en el `.zip`). `datos/almacen-local.js`: `findPendingSessions` y `markSent`.
- **Pruebas:** `pruebas/datapipe.test.mjs` (6 pruebas, con DataPipe simulado).

**Estudios anteriores:** sin `data.datapipe` no se envía nada y todo funciona como en la 0.5.0.

## 0.5.0 · 2026-11-16

**Motivo:** peticiones del investigador para la primera versión definitiva de RG-01 (idioma elegido por el investigador; la regla se pasa con un botón) y el arreglo pendiente del guardado en el navegador.

- **Idioma elegido por el investigador** (`languages_available`, p. ej. `["es", "en"]`): la pantalla del investigador muestra «Idioma del participante» junto al grupo. `language` es el idioma seleccionado de entrada. El idioma elegido se registra en `session_start.language`. La huella (`config_hash`) no cambia con el idioma: es la de `config.js` tal como está escrito. La página se marca con ese idioma (`<html lang>`). Sin `languages_available`, todo funciona como antes.
- **Pantalla del personaje con botón** (paso `speech`, `advance: "button"`, botón con `button_key` o `continue_button`): se avanza con un botón, como en las demás pantallas, y no con la barra espaciadora. El tiempo de lectura se registra igual (`screen_continue`, `method = button`). La barra espaciadora (`advance_key: " "`) sigue disponible.
- **Guardado en el navegador (pendiente del 2026-11-16, punto 1 de `base/ESTADO.md`):**
  - al abrir un estudio, las sesiones interrumpidas que se descargan solas son solo las del **mismo estudio y la misma versión**. Antes se filtraba solo por estudio;
  - «Recuperar datos» muestra el motor con que se hizo cada sesión y marca con ⚠ las de otro motor: su registro bruto se descarga intacto, pero las tablas se recalculan con el motor de la página.
  - Las claves del almacenamiento no cambian, así que las sesiones guardadas con motores anteriores siguen apareciendo.
- **Pruebas:** `pruebas/motor050.test.mjs` (4 pruebas).

**Estudios anteriores:** sin cambios de comportamiento si no usan `languages_available` ni `advance: "button"`. Lo único que cambia es el filtro por versión de la descarga automática de sesiones interrumpidas: ya no recoge sesiones de otras versiones del mismo estudio.

## 0.4.0 · 2026-11-16

**Motivo:** Grupo 2 de RG-01 («Exposición forzada»), pedido por el investigador: ensayos forzados con las demás figuras bloqueadas, que se pueden repetir a elección del participante, con el marcador a 0 al empezar cada repetición y antes del experimento.

Añadido (todo opcional; un estudio que no lo use funciona igual que con la 0.3.0):

- **Ensayos forzados** (`phases[].forced`): lista por bloque y por ensayo con la única alternativa disponible. Las demás se ven atenuadas (opacidad 0,25) y bloqueadas. Un clic sobre ellas se registra como `input_ignored` con `reason = option_locked` y el ensayo sigue abierto. Las contingencias, el feedback, la fijación y el «+X» funcionan igual. En modo prueba, una fase forzada no se acorta (solo se aplican las reducciones de tiempos).
- **Tramo repetible** (paso `repeat` del flujo, con `steps`, `repeat_button_key` y `continue_button_key`): ejecuta sus pasos y termina con dos botones, sin más texto. «Repetir» vuelve a ejecutar exactamente lo mismo (misma secuencia, mismas posiciones); «continuar» sigue el flujo. Sin límite de repeticiones. Eventos `repetition_start`, `repeat_choice` y `repeat_end`; los eventos de dentro llevan `repeat_id` y `repetition`. El tramo lo gestiona el motor, no jsPsych: para jsPsych es un único paso, y `presentacion/plugin.js` no cambia. Dentro se admiten `form`, `countdown`, `screen`, `phase` y `reset_balance`.
- **Puesta a 0 del saldo** (paso `reset_balance`): el saldo disponible pasa a 0. Se registra `balance_reset` con el saldo anterior. Las pendientes no se tocan.
- **Numeración:** las fases forzadas no consumen la numeración del diseño. Los ensayos y bloques libres conservan sus números (p. ej., 1–180) aunque haya una fase forzada antes. Los forzados, y cualquier ensayo o bloque ejecutado más de una vez, reciben números únicos a continuación del último libre. `session.beginTrial` devuelve el ensayo con su número definitivo.
- **Datos:** columnas nuevas, con su entrada en el diccionario:
  - en `ensayos`: `block_index_global`, `trial_kind`, `forced_option` y `repetition`;
  - en `bloques`: `block_kind` y `repetition`;
  - en `formularios`: `repetition`;
  - en `sesiones`: `n_forced_trials_planned` y `n_balance_resets`.
  `n_trials_planned` cuenta solo los ensayos libres. Las tablas emparejan ensayos y bloques por `block_index_global`; con datos anteriores, que no lo llevan en los ensayos, se empareja por fase y bloque, como antes.
- **Pruebas:** `pruebas/forzados.test.mjs` (9 pruebas, con saldos calculados a mano: «+0», «+0», «+30», «+20» y marcador −6, 0, 24, 40) y la configuración `pruebas/configuraciones/forzados.config.js`.

**Estudios anteriores:** PIL-01 (motor 0.2.3, en la organización anterior) y RG-01 (motor 0.3.0) no se ven afectados hasta que se actualice su motor. Con esta versión, un estudio sin ensayos forzados ni tramos repetibles produce los mismos ensayos, consecuencias y saldos. Las tablas ganan columnas, pero las existentes no cambian.

## 0.3.0 · 2026-11-16

**Motivo:** reorganización pedida por el investigador (`PLAN-REORGANIZACION.md`, paso 1): cada experimento es una carpeta independiente con su propia copia del motor, y este motor de `base` es el de referencia. **Solo cambios de organización: ningún cambio de procedimiento, de contingencias ni de datos registrados.**

- **Pantalla del investigador** (`presentacion/runner.js`): desaparece el enlace «Inicio del laboratorio». «Recuperar datos» abre `motor/recuperar.html` del propio experimento. El parámetro `labRoot` de `runStudy` pasa a llamarse `experimentRoot` y vale `"./"` por defecto, porque `index.html` está en la carpeta del experimento, junto a `motor/`. El aviso de «falta jsPsych» indica que hay que volver a copiar el motor desde `base`.
- **`recuperar.html`:** el enlace de vuelta («Volver al experimento») lleva a `../`.
- **Servidores** (`herramientas/servidor.ps1`, `servidor.pl`): el puerto es obligatorio (lo pasa el lanzador de cada experimento; ya no hay puerto por defecto 8765). Sirven la carpeta del experimento y el navegador se abre directamente en él. Se identifican con `X-Lab-Server: laboratorio:<carpeta>`: si el puerto ya lo usa ese mismo experimento, solo se abre el navegador; si lo usa otro, se avisa y no se abre nada.
- **`herramientas/empaquetar.mjs`** (sustituye a `empaquetar.py`; solo necesita Node.js): empaqueta una carpeta de experimento independiente, sin `datos/`, `pruebas/`, `publicado/` ni `paquetes/` del primer nivel, archivos ocultos, `CLAUDE*.md` ni `package.json`. Conserva el permiso de ejecución de los lanzadores de Mac.
- **Pruebas:** las del motor usan copias de prueba de las configuraciones de PIL-01 y RG-01 (`pruebas/configuraciones/`) y ya no dependen de ninguna carpeta de experimento. La prueba que abre el paquete con Python se marca como **omitida** (con un mensaje) si no hay Python con `openpyxl`, en lugar de fallar.
- *Añadido el mismo día, antes de copiar la 0.3.0 a ningún experimento: `empaquetar.mjs` y la prueba omitida. Con ellos se copió a RG-01.*

**Datos:** los archivos y columnas no cambian. Solo cambia `engine_version` (0.3.0) en los datos nuevos.
**Estudios anteriores:** los estudios de `experimentos/` siguen usando el motor 0.2.3 de la raíz hasta que se pasen a carpetas independientes (pasos 2 y 3 del plan). Un `index.html` antiguo (rutas `../../motor/`) no funciona con esta versión sin adaptar sus rutas.

## 0.2.3 · 2026-11-15

**Motivo:** error de la 0.2.2 detectado por el investigador al probar RG-01 v0.3. En la pantalla de la regla no se veía la foto y la barra espaciadora no funcionaba.

- **Causa:** la imagen se precargaba en `runStudy`, pero la pantalla se dibuja en `startSession`, que no la recibía. Al llegar a la pantalla saltaba un error (`preloadedImages is not defined`) antes de que empezara a escucharse la barra espaciadora.
- **Arreglo:** `startSession` recibe las imágenes precargadas, igual que ya recibía los SVG (`presentacion/runner.js`).
- **Datos:** una sesión hecha con la 0.2.2 que llegara a la pantalla de la regla quedó detenida allí. Sus datos, si se guardaron, llevan `engine_version = 0.2.2` y son solo de prueba.
- **Estudios anteriores:** sin efecto en los estudios con SVG.

## 0.2.2 · 2026-11-15 (con un error: usar 0.2.3)

**Motivo:** petición del investigador para RG-01: una foto en la pantalla de la regla, en lugar del monigote SVG.

- **Personaje como imagen:** el paso `speech` del flujo acepta en `character` una imagen `.png`, `.jpg`, `.jpeg` o `.webp`, además de un `.svg`. Se muestra con el mismo ancho que el SVG (14rem) y conserva su proporción.
- **Precarga:** la imagen se descarga y se descodifica antes de poder iniciar la sesión, y se inserta ese mismo elemento, así que aparece entera desde el primer fotograma. Si no carga, la pantalla del investigador muestra «No se pudo cargar el estímulo…» y la sesión no puede iniciarse (igual que con el SVG).
- **Validación:** `character` debe terminar en una de esas extensiones.
- Archivos: `presentacion/runner.js`, `presentacion/estilos.css`, `nucleo/config.js`.

**Estudios anteriores:** PIL-01 no usa este paso. RG-01 v0.1 y v0.2 usan un SVG, que funciona igual que antes. Sin comprobar todavía en navegador ni con las pruebas automáticas (falta Node.js en el ordenador del investigador).

## 0.2.1 · 2026-11-15

**Motivo:** petición del investigador: «que se descarguen los datos aunque se termine antes».

- **Sesiones interrumpidas:** al abrir un estudio, el motor busca en ese navegador las sesiones de ese estudio que nunca se descargaron. Las que tienen cierre registrado (p. ej., se cerró la pestaña: `abandoned`) se descargan solas, con los mismos archivos que una sesión terminada y el sufijo `_INTERRUMPIDA`. Las que no tienen cierre (podrían seguir abiertas en otra pestaña) muestran un botón. Cada sesión se descarga una sola vez.
- **Copia de emergencia (Ctrl + Mayús + E):** descarga ahora los mismos archivos que el final (paquete, archivos propios del estudio y datos personales), con el sufijo `_EMERGENCIA`.
- **Recuperar datos:** descarga también los archivos propios del estudio y los datos personales de cada sesión.
- **Pantallas con botón o tecla:** responden desde el mismo momento en que aparecen. Antes empezaban a escuchar un fotograma después (≈16 ms), y una pulsación automática muy rápida podía perderse.
- `motor/datos/descargas.js`: un único lugar que decide qué archivos se descargan.
- `herramientas/empaquetar.py`: crea un `.zip` autónomo de un estudio para probarlo en otro ordenador.

**Limitación del navegador:** al cerrar la pestaña no se puede iniciar una descarga. Los datos se guardan en el navegador durante toda la sesión y se descargan la próxima vez que se abre el estudio en ese mismo navegador. Para sesiones remotas está previsto el envío al receptor de datos (etapa 3).

**Estudios anteriores:** PIL-01 y RG-01 sin cambios en su configuración; sus recorridos automáticos se repitieron y los superaron.

## 0.2.0 · 2026-11-15

**Motivo:** el estudio RG-01 (elección entre tres estímulos, Grupo 1).

Añadido (todo opcional en la configuración; un estudio que no lo use funciona igual que con 0.1.0):

- **Contingencias por fase** (`contingencies[].phases`): una contingencia solo actúa en las fases indicadas.
- **Estímulos dibujados en SVG** (`options[].stimulus.svg`) en lugar de botones con texto.
- **Tres o más alternativas** con posiciones left/center/right y el método `all_permutations_balanced` (cada permutación aparece el mismo número de veces en cada bloque).
- **Punto de fijación** como intervalo entre ensayos (`trial.iti_display: "fixation"`).
- **«+X» de final de bloque** con duración fija y sin botón (`block_end_feedback`), con opción de omitirlo si X = 0.
- **Flujo configurable** (`flow`) con pasos de formulario, cuenta atrás, pantalla de texto, pantalla con personaje que habla (avance con la barra espaciadora), fases y final. Cada paso puede limitarse a unos **grupos** (`group`, `flow[].groups`).
- **Formularios** (`forms`): texto, número, opción única con «Otro (especificar)», casilla con texto desplegable, texto largo y escalera de 1 a 10. El botón solo se activa con los campos obligatorios completos.
- **Código del participante escrito en un formulario** (`participant.id_source: "form"`).
- **Datos personales separados** (campos `personal: true`): nunca entran en el registro ni en el paquete; tienen su propio guardado en el navegador y su propio CSV.
- **Instrucción vigente:** cada respuesta registra la última instrucción presentada.
- **Archivos propios de un estudio** (`exportar.js`), descargados al final y también desde «Recuperar datos».
- **Descarga automática** al terminar (`data.auto_download`).
- **Tablas nuevas** en el paquete: `pantallas` (tiempos de lectura) y `formularios` (una fila por respuesta).
- **Marcador:** los negativos se muestran con el signo menos tipográfico (−3).
- **Nombres del `.zip`:** usan la hora local en lugar de UTC.

**Estudios anteriores:** PIL-01 sigue funcionando sin cambios en su configuración. Su recorrido automático se repitió con el motor 0.2.0 y lo superó.

## 0.1.0 · 2026-11-15

Primera versión: núcleo (programas CRF, EXT, FR, VR, FI y VI; contingencias; cola de consecuencias; diseño; sesión; registro), datos (tablas, CSV, XLSX, ZIP, guardado local, recuperación) y presentación (ensayo de elección con dos alternativas). Estudio de referencia: PIL-01.
