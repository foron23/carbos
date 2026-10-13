# 14 - Chat on-device (Fase 3 / v1.1)

> [!abstract] TL;DR
> Capa de v1.1, **opt-in y desactivable**: un LLM on-device (Qwen2.5-1.5B-Instruct o el
> nivel ligero) traduce lenguaje natural a un **esquema cerrado de intenciones** validado con
> Zod **antes** de ejecutar. El chat **propone, nunca ejecuta**: cada intencion que escribe en el
> diario se muestra en una **tarjeta de confirmacion** y solo el boton _Registrar_ escribe. `query_totals`
> responde en lectura y no lleva tarjeta. El chat **nunca produce unidades de insulina** y **nunca
> esta en el camino del calculo** (D8, D10, D12; roadmap `01-roadmap.md:56-62`). Se oculta sin
> dejar rastro si el dispositivo no aguanta (**iPhone incluido**) y los pesos viven fuera del
> artefacto (D18/D24).

## Contexto

D8 fija la v1 por **botones** y deja el **chat conversacional en v1.1**, "con el esquema de
intenciones y el modelo de datos ya preparados". La Fase 1 termino con ese esquema preparado
(`FoodItem`, `Meal`, `InsulinLog`) y la Fase 2 aislo el modulo de insulina como funcion pura. El
chat es la ultima capa: entra **despues** de la foto (v1) y de la aritmetica (Fase 2) y no cambia
ninguna de las dos.

La linea regulatoria (`docs/decisiones.md`, "La linea regulatoria") decide el diseno: el calculo de
dosis no es el proposito ni el nucleo. Por eso el chat **no calcula**, **no recomienda** y **no
produce unidades**: la unica forma de que aparezca un numero de insulina es que el usuario lo haya
escrito en su propio mensaje, y solo se guarda lo que ya se ha puesto.

## Alcance y fuera de alcance

**Dentro (v1.1):**

- Interpretar lenguaje natural (ES/EN) como una de cinco **intenciones cerradas**.
- **Validar** la intencion con Zod antes de tocarla (roadmap `:58`).
- **Proponer** un borrador de comida, un registro de insulina o un cambio de fecha en una
  **tarjeta de confirmacion**; **no ejecutar** hasta que el usuario confirme.
- Responder en **lectura** a preguntas de totales (`query_totals`) sin tarjeta.
- Cargar el modelo en **diferido** (descarga de pesos con tamano y progreso) y **ocultarse**
  si el dispositivo no aguanta.

**Fuera de alcance (no-goals):**

- **Uso medico.** No es dispositivo medico ni consejo medico; los textos no pueden decir "dosis",
  "recomendamos", "seguro" ni "preciso" (`docs/decisiones.md`, "Textos y reglas de redaccion").
- **Calcular unidades.** El chat no convierte carbohidratos en unidades y no tiene ninguna accion
  `compute_insulin` ni campo `carbs -> units` (la linea regulatoria, codificada **por ausencia**).
- **Entrar en el camino del calculo.** El chat no importa `src/insulin/arithmetic.ts`; lo impide
  `src/chat/boundary.test.ts` (ver _Tests_).
- **Escribir sin confirmar.** Ningun `putMeal` / `putInsulin` / `replaceVault` antes del boton
  _Registrar_ de la tarjeta.
- **Persistir la conversacion.** El historial vive en memoria de la sesion y no toca IndexedDB ni
  `localStorage` (privacidad).
- **Aprender de las correcciones.** Reafirma D33: la porcion habitual por alimento queda aparcada.
- **Sustituir al modulo de insulina.** El chat no calcula ni ajusta; solo puede proponer el
  **registro** de un numero que el usuario ya ha escrito.

## Taxonomia de intenciones y esquema Zod

El vocabulario es **cerrado**: fuera de la lista, `unknown`. La intencion es una
**union discriminada** sobre `action`; **todos** los objetos son `.strict()` (una clave de mas
invalida la intencion entera).

```ts
import { z } from 'zod';

export const MAX_MEAL_GRAMS = 2000; // por item; una racion no llega a 2 kg
export const MAX_INSULIN_UNITS = 100; // por registro; por encima se degrada a unknown

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD');
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'hora esperada HH:MM');

const mealItem = z
  .object({
    query: z.string().trim().min(1), // texto; el id NO sale del modelo
    grams: z.number().gt(0).max(MAX_MEAL_GRAMS).optional(),
  })
  .strict();

export const chatIntentSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('log_meal'),
      date: isoDate.optional(),
      time: hhmm.optional(),
      items: z.array(mealItem).min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal('log_insulin'),
      date: isoDate.optional(),
      time: hhmm.optional(),
      units: z.number().gt(0).max(MAX_INSULIN_UNITS), // solo desde el mensaje (ver guardas)
      kind: z.enum(['bolus', 'basal']).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('query_totals'),
      date: isoDate.optional(), // sin fecha = dia actual
    })
    .strict(),
  z
    .object({
      action: z.literal('set_date'),
      date: isoDate,
    })
    .strict(),
  z.object({ action: z.literal('unknown') }).strict(),
]);

export type ChatIntent = z.infer<typeof chatIntentSchema>;

export function parseIntent(raw: unknown): ChatIntent {
  const result = chatIntentSchema.safeParse(raw);
  return result.success ? result.data : { action: 'unknown' };
}
```

Reglas de la taxonomia:

| `action`       | Semantica                           | Efecto                       | Tarjeta |
| -------------- | ----------------------------------- | ---------------------------- | ------- |
| `log_meal`     | anadir comida(s) al diario          | propone un `Meal`            | si      |
| `log_insulin`  | registrar insulina **ya puesta**    | propone un `InsulinLog`      | si      |
| `query_totals` | preguntar el total de carbohidratos | responde en lectura          | no      |
| `set_date`     | mover la fecha que se esta viendo   | cambia `currentDate`         | si      |
| `unknown`      | no entendido / invalido / degradado | no hace nada; mensaje neutro | no      |

**No existe** `compute_insulin`. Tampoco existe ningun campo que relacione carbohidratos con
unidades (`carbs`, `bolus`, `dose`, `ratio`...): cualquier clave no declarada **rompe** `.strict()` y
la intencion cae a `unknown`.

## Guardas anti-alucinacion

1. **`.strict()` en todos los objetos.** Una clave extra invalida el objeto; el parser devuelve
   `unknown`. Esto cubre campos inventados por el modelo (un `foodId`, un `units` colado en
   `log_meal`, un `path`/`url`, un `id` de comida, etc.).
2. **El `foodId` jamas sale del modelo.** El esquema de intencion **no tiene** campo `foodId`: solo
   `query` (texto). `resolve.ts` (paso 3) obtiene el `foodId` **unicamente** de `searchFoods` del
   catalogo (`src/catalog/search.ts`); si no hay coincidencia, el item se marca como no resuelto y
   la tarjeta lo muestra para que el usuario elija o cancele. Ningun camino permite escribir un
   `foodId` que no venga del catalogo.
3. **Gramos acotados.** `grams` es opcional, `> 0` y `<= MAX_MEAL_GRAMS` (2000). Fuera de rango es
   invalidacion -> `unknown`; nunca se recorta en silencio.
4. **Unidades acotadas y verbatim.** En `log_insulin`, `units` es `> 0` y `<= MAX_INSULIN_UNITS`
   (100, **guarda**, no criterio clinico). Ademas, `parse.ts` (paso 3) **solo acepta** un numero de
   unidades si **aparece literalmente en el mensaje del usuario**: se normaliza la parte entera y
   decimal y se exige que la subcadena este en el texto original. Si no aparece, o aparece pero
   fuera de rango, la intencion **degrada a `unknown`**. El modelo no puede inventar una cantidad.
5. **Fallback `unknown`.** Cualquier fallo (JSON invalido, esquema invalido, accion no declarada,
   guarda verbatim incumplida) devuelve `{ action: 'unknown' }`. La UI responde con un mensaje neutro
   y **no** reintenta en bucle ni ejecuta nada.
6. **Extraccion de JSON e invalido.** `parse.ts` extrae el primer bloque JSON valido de la salida
   del modelo (fences `json ... ` incluidas). Si no hay JSON parseable, o si `safeParse`
   falla, se devuelve `unknown`. No se evalúa codigo, no se usa `eval`, no se acepta parcialmente un
   objeto roto.
7. **Validar antes de ejecutar.** El orden es siempre: texto -> intencion (Zod) -> resolucion
   (catalogo) -> **tarjeta** -> confirmacion -> escritura. La validacion nunca ocurre despues de un
   efecto.

## Flujo de la tarjeta de confirmacion (propone, no ejecuta)

Separacion **propose / execute**: interpretar y resolver construye una `Proposal` **en memoria**; la
tarjeta la muestra; solo el boton de confirmacion escribe.

- **`log_meal`.** Titulo "Vas a registrar" + `date`/`time` (por defecto fecha vista y hora actual) +
  una fila por item con **nombre del catalogo**, **gramos** (editable; por defecto la porcion del
  catalogo si no vinieron gramos) y **carbohidratos** calculados con `totals.ts`. Si un `query` no
  casa con el catalogo, la fila se marca como no resuelta. Botones **Registrar** (`button.register`)
  y **Cancelar**. Al confirmar: revalida la `Proposal` (Zod + catalogo) y llama `putMeal`.
- **`log_insulin`.** Titulo con `time`, `units` (solo el numero verbatim) y `kind` (por defecto
  `bolus`). Aviso visible de que es **solo registro de lo ya puesto**. Al confirmar: `putInsulin`.
- **`set_date`.** Titulo con la fecha destino y botones confirmar/cancelar; al confirmar llama al
  `setDate` inyectado y `refresh()`; no escribe en la base de datos.
- **`query_totals`.** **Sin tarjeta**: se responde en lectura con `dayCarbs`/`weekCarbs`
  (`src/core/totals.ts`). Jamas escribe.
- **`unknown`.** Mensaje neutro; sin tarjeta, sin ejecucion.

Reglas de la tarjeta:

- **Cero escrituras antes de confirmar.** El render es puro; el handler de confirmacion es el unico
  que llama `putMeal`/`putInsulin`/`setDate` y despues `refresh()`.
- **Revalidacion en confirmar.** La `Proposal` se vuelve a pasar por Zod (y por el catalogo) antes de
  escribir; si cambio el estado y ya no es valida, se cancela sin escribir.
- **Accesibilidad.** El foco va al primer control de la tarjeta al abrirse; `role="group"` con
  `aria-label`; botones con nombre accesible; areas tactiles >= 44 px; _Cancelar_ es la accion
  segura por defecto. `make audit-uiux` debe seguir verde a 390 y 320 px.
- **i18n.** Todo texto de la tarjeta sale de `STRINGS` en **es y en**; nada literal. Se usan
  `button.register` y claves `chat.*` nuevas (ver _Claves i18n_).
- **Sin auto-ejecucion.** No hay temporizadores, ni "confirmar por defecto", ni envio al pulsar
  Enter sin que el foco este en _Registrar_.

## Runtime y manifest

- **Modelo.** `Qwen2.5-1.5B-Instruct` o **mas ligero**, cuantizado: `q4f16` para WebGPU y
  `q4`/`q8` para el fallback WASM. La eleccion final se cierra con el banco de intenciones (ver
  _Tests_) y el presupuesto de memoria; la spec no fija el repo de pesos (se documenta al publicar).
- **Runtime.** Se carga con **`import()` dinamico** dentro del worker de chat para no engordar el
  chunk inicial (mismo patron que `onnxruntime-web` en `src/model/worker.ts`). Candidatos:
  `@huggingface/transformers` (transformers.js), `ort-genai` o WebLLM. **En esta fundacion no se
  anade ninguna dependencia pesada a `package.json`**: el runtime entra por import dinamico cuando
  se publiquen los pesos; hasta entonces el modulo compila sin esa dependencia.
- **Manifest propio.** `public/chat-manifest.json`, **separado** de `public/model-manifest.json`
  (que **no se extiende**). `src/chat/manifest.ts` define `chatManifestSchema` **reutilizando**
  `modelEntrySchema` de `src/model/manifest.ts` (no toca `modelManifestSchema`):

  ```jsonc
  {
    "model": {
      "version": "...",
      "url": "https://cdn.jsdelivr.net/gh/foron23/carbos@chat-weights-<v>/weights/chat/<file>",
      "sha256": "<64 hex>",
      "bytes": 123456789,
    },
    "tokenizer": { "version": "...", "url": "...", "sha256": "...", "bytes": 1234 },
  }
  ```

  Cada entrada lleva `version`, `url`, `sha256` y `bytes`; el sha256 se verifica con
  `verifySha256` antes de usar. **Sin `public/chat-manifest.json` el chat se oculta** (no hay UI de
  error).

- **Cache.** `Cache Storage` propio `carbos-chat-v1` (via `loadAsset(entry, 'carbos-chat-v1', ...)`
  en `src/model/loader.ts`), separado del cache de modelos de foto.
- **Descarga diferida.** Nada se descarga en el arranque: al habilitar el chat y abrir la tarjeta de
  input, se muestra tamano y progreso (`fetchWithProgress`) y el sha256 se comprueba antes de
  inicializar la sesion.
- **Pesos fuera del repo/artefacto.** Viven en `weights/` del mismo repo y se sirven por jsDelivr
  desde un tag (D18/D24). `public/sw.js` **no** los precachea: su handler de `fetch` ya ignora todo
  lo cross-origin (`public/sw.js:59`), que es como chat y foto mantienen los pesos fuera del
  precache.
- **No toca el contrato de foto.** `modelManifestSchema`, `src/model/worker.ts` y
  `public/model-manifest.json` quedan intactos. La unica pieza compartida es un `fetchJson(url,
schema, fetcher)` **aditivo** en `src/model/loader.ts` (refactor de `fetchManifest` para llamarlo;
  comportamiento y tests existentes sin cambios).

## Degradacion

Sondas de capacidad (`src/chat/capability.ts`, inyectables para test):

1. `'gpu' in navigator` / `navigator.gpu` presente (WebGPU). Sin WebGPU no hay chat.
2. **iOS**: `navigator.userAgent` contiene `iPhone`/`iPad`/`iPod`, o
   `navigator.userAgentData.platform === 'iOS'` -> **oculto siempre** (WebGPU inestable, cuota de
   almacenamiento que se borra; decision explicita: **iPhone incluido**).
3. `navigator.deviceMemory < 4` -> oculto.
4. `navigator.hardwareConcurrency < 4` -> oculto.
5. `navigator.storage.estimate()`: si `quota - usage` es menor que `chat-manifest.bytes * 1.5`
   (margen de seguridad) -> oculto.

Reglas:

- **Flag persistido** `carbos.chat.enabled` / `carbos.chat.disabled` (copia del patron de
  `src/insulin/flag.ts`). El chat es **opt-in**.
- `setupChat(host, deps)` **no renderiza nada** (ni el host ni un boton) cuando
  `!isChatEnabled() || !chatCapable()`.
- Ante **cualquier fallo de runtime** (import dinamico, descarga, sha256, sesion): se persiste
  `carbos.chat.disabled` y **se oculta en silencio**, **sin UI de error** ni reintentos.
- **Reactivacion.** Se limpia `carbos.chat.disabled` y se vuelve a ofrecer el opt-in solo si las
  sondas pasan de nuevo (p. ej. tras un cambio de dispositivo o de cuota). Nunca se reactiva solo.
- El chat oculto **no deja nodos ni peticiones**: cero coste cuando no aplica, de modo que el
  arnes E2E y la app existentes no cambian.

## Limitaciones conocidas de esta fundacion

- **(a) La guarda verbatim es sin contexto.** `parse.ts` acepta un numero de unidades si aparece
  literalmente en cualquier parte del mensaje, sin mirar palabras cercanas: "comi 6 galletas" con
  `units: 6` en la salida del modelo pasaria la guarda. La **tarjeta de confirmacion** es la
  defensa primaria (nada se escribe sin confirmar). Una guarda por proximidad de palabras clave
  (p. ej. "unidad"/"insulina"/"me puse" junto al numero) queda como **trabajo futuro**.
- **(b) Sin pesos ni manifest publicados.** No se ha publicado `public/chat-manifest.json`; al
  habilitar el chat con el control opt-in, este permanece **oculto** hasta que exista ese fichero.
- **(c) Un manifest ausente no es un fallo.** Si falta el manifest, el chat se oculta **sin**
  persistir `carbos.chat.disabled`: ese flag solo se escribe ante un **fallo de runtime**. Asi, al
  publicar el manifest el chat vuelve a ofrecerse sin intervencion del usuario.

## Impacto en el dominio

- **`SCHEMA_VERSION` no cambia.** `Meal`, `InsulinLog`, `FoodItem` y `Vault` quedan igual
  (`src/core/types.ts`, `src/core/schema.ts`).
- **`MealOrigin`.** Decision recomendada: la comida creada desde el chat se guarda con
  `origin: 'manual'`. Anadir un `'chat'` obligaria a tocar la union congelada y la migracion; el
  contenido ya es confirmado por la persona, que es la semantica de `'manual'`.
- **Sin conversacion persistida.** El historial no se escribe en IndexedDB ni `localStorage`; solo
  las propuestas confirmadas se materializan como `Meal`/`InsulinLog`.
- **Escribe por la via existente.** Solo `putMeal`/`putInsulin` de `src/core/db.ts`; nunca
  `replaceVault` ni acceso directo a la base.

## Presupuesto de bundle

- El runtime del LLM entra por **import dinamico** dentro de `src/chat/worker.ts`; no aparece en el
  chunk inicial.
- **Ninguna** parte de los pesos (`.gguf`, `.onnx`, `tokenizer.json`, `.bin`) esta en `dist/`.
  `make verify-bundle` ya falla tambien con `.gguf` y `tokenizer.json`. El target
  `make chat-weights-manifest` (espejo de `weights-manifest`) **queda pendiente**: se anadira
  junto a los pesos del chat cuando estos se publiquen. Hoy **no existe** en el `Makefile`.
- El codigo propio del chat (UI + protocolo, sin runtime ni pesos) se mantiene pequeno; el objetivo
  de medicion es que el chunk inicial de la app no crezca respecto a v1 (sin runtime importado).

## Claves i18n y redaccion

Claves nuevas en **es** y **en** (todas con traduccion real; la guarda de paridad y la de tildes de
`src/i18n/index.test.ts` siguen aplicando):

- `section.chat`
- `settings.chatModule` (control opt-in del chat, marcado como experimental)
- `chat.title`, `chat.inputPlaceholder`, `chat.send`
- `chat.thinking`, `chat.unknown`, `chat.emptyQuery`, `chat.noMatch`
- `chat.mealTitle`, `chat.insulinTitle`, `chat.dateTitle`, `chat.totalsTitle`
- `chat.insulinNote` (solo registro de lo ya puesto)
- `chat.disclaimer` (no es consejo ni dispositivo medico; revisa y ajusta con tu equipo medico)
- `chat.cancel` (se reutiliza `button.register` para confirmar)

Redaccion (obligatoria): **nunca** "dosis", "recomendamos", "deberias ponerte", "seguro",
"preciso"; **siempre** "estimacion", "registro", "aritmetica", "tus numeros", "revisa y ajusta",
"tu equipo medico". Los textos no pueden sugerir que el chat calcula o recomienda unidades.

## Tests

- **Unitarios puros** (Node, sin navegador):
  - `src/chat/intent.test.ts`: cada `action` valida; `.strict()` rechaza claves extra; gramos y
    unidades fuera de rango se rechazan; `compute_insulin` y cualquier campo `carbs -> units` caen a
    `unknown`; `parseIntent` devuelve `unknown` ante `null`/string/objeto roto.
  - `src/chat/parse.test.ts` (paso 3): extraccion de JSON, JSON invalido -> `unknown`, y guarda
    **verbatim** de `units` (acepta solo si el numero aparece literal; rechaza si no).
  - `src/chat/resolve.test.ts` (paso 3): `foodId` solo por `searchFoods`; sin coincidencia -> item no
    resuelto; la `Proposal` no contiene unidades calculadas.
  - `src/chat/capability.test.ts`: sondas con `navigator` mockeado (WebGPU, iOS, memoria, hilos,
    cuota).
  - `src/chat/manifest.test.ts`: `chatManifestSchema` reutiliza `modelEntrySchema` y rechaza sha256
    invalido; `fetchJson` con un `Fetcher` falso.
  - `src/chat/boundary.test.ts`: **falla si algo bajo `src/chat/**` importa
    `src/insulin/arithmetic`** (prueba de la linea regulatoria).
- **E2E** (`make e2e`, Firefox): escenario con un **worker de chat de prueba (stub)** que devuelve
  JSON fijo, comprobando que **no hay escritura antes de confirmar** (el diario no cambia hasta
  pulsar _Registrar_) y que `query_totals` responde sin tarjeta. El stub no descarga pesos.
- **Banco de intenciones ES/EN** (`eval/chat/`): frases etiquetadas con su `action` esperada. Se
  puntua contra los **pesos reales** (no en CI sin pesos). **Umbral fijado por Foron** (pendiente de
  su valor; placeholder de trabajo: `>= 95 %` acierto de accion en ES y en EN). El umbral es el
  criterio de done de roadmap `:62`.
- **i18n**: paridad de claves y tildes (`src/i18n/index.test.ts`) para todas las claves `chat.*`.
- **Auditoria**: `make audit-uiux` verde (foco, nombres accesibles, >= 44 px, sin desborde 390/320).
- **Bundle**: `make verify-bundle` (extendido) y `make build` sin runtime en el chunk inicial.
- **Gate**: `make check` + `npm run typecheck` en cada paso.

## Criterios de aceptacion

1. Existe un **esquema cerrado** de intenciones con Zod y se **valida antes de ejecutar**
   (roadmap `:58`). Fuera de la taxonomia -> `unknown`.
2. Toda escritura en el diario pasa por una **tarjeta de confirmacion**; no hay auto-ejecucion ni
   escrituras antes de confirmar.
3. `query_totals` responde en **lectura**, sin tarjeta y sin escribir.
4. El chat **nunca produce unidades**: no hay accion `compute_insulin` ni campo `carbs -> units`; las
   unidades solo se aceptan si aparecen **verbatim** en el mensaje.
5. El chat **nunca entra en el camino del calculo**: `src/chat/**` no importa
   `src/insulin/arithmetic` (test de frontera) y no calcula dosis.
6. El `foodId` de un item **solo** puede venir de `searchFoods` del catalogo.
7. El chat es **opt-in** y **desactivable**: sin flag, sin capacidad o tras un fallo de runtime,
   **no renderiza nada** y no deja nodos (iPhone incluido).
8. Los pesos y el runtime **no estan en el artifacto**: import dinamico, manifest propio
   `public/chat-manifest.json`, pesos fuera del repo (D18/D24), SW sin precache, `verify-bundle`
   verde.
9. **Sin cambios de dominio**: `SCHEMA_VERSION` sigue en 3 y no se persiste la conversacion; se
   reutilizan `Meal`/`InsulinLog` con `origin: 'manual'`.
10. Todo texto nuevo existe en **es** y **en**, con las guardas de tildes y paridad; se respetan las
    reglas de redaccion.
11. `make check`, `npm run typecheck` y `make audit-uiux` en verde; los escenarios E2E existentes no
    cambian.
12. (Gate con pesos) El banco ES/EN supera el **umbral fijado por Foron**; se declara la cifra y la
    fecha (metricas honestas, `02-fase1.md:126`).

Estos criterios desarrollan el done de Fase 3 (roadmap `:56-62`) y no relajan ninguna regla de
`02-fase1.md:118-126` (la foto y el modelo nunca producen unidades; pesos fuera del artifacto;
metrica honesta antes que feature).

## Riesgos

- **Alucinacion de numeros.** Un LLM puede inventar una cantidad; mitigado con la guarda
  **verbatim** y con `.strict()`, que degradan a `unknown`.
- **Precision de intencion en ES/EN.** Sin pesos reales no se mide; mitigado con el banco y un umbral
  fijado por Foron, y con el hecho de que el chat es opcional (el usuario siempre puede usar botones).
- **Coste en el dispositivo.** Memoria/GPU/latencia pueden hacer la experiencia peor que no tener
  chat; mitigado con las sondas de capacidad y el hide silencioso (**iPhone incluido**).
- **Deriva regulatoria.** Que el chat "parezca" que calcula; mitigado con la ausencia de codigo de
  calculo (test de frontera), la redaccion controlada y el aviso no descartable de la tarjeta.
- **Confusion con el modulo de insulina.** El chat registra lo ya puesto; el modulo de Fase 2 calcula
  aritmetica. El texto debe distinguirlo; se reutiliza `insulin.note`.
- **Manifest/cache.** Un sha256 mal calculado al publicar bloquea el chat; mitigado con
  `verifySha256` ya existente, con un target `chat-weights-manifest` **pendiente** de anadir al
  publicar los pesos y con las limitaciones conocidas de esta fundacion (mas abajo).

## Lo que NO se puede validar sin los pesos reales

Documentado como **gate explicito**; no se afirma ningun numero sin medirlo
(`02-fase1.md:126`):

- **Precision de intenciones ES/EN** (el done de roadmap `:62`) y por tanto si el modelo elegido
  basta.
- **Tasa de JSON valido** de la salida real del modelo.
- **Robustez a prompt injection** y a entradas adversarias.
- **Calidad del tokenizador y de la cuantizacion** (q4f16 / q4 / q8).
- **Latencia, tokens/s y memoria pico** en movil.
- Si **Qwen2.5-1.5B** (o mas ligero) **cabe** de verdad en los telefonos objetivo.
- **Compilacion de shaders WebGPU / kernels WASM** en dispositivos concretos.
- El **hide real en iPhone/Safari** (requiere dispositivo fisico y UA real).
- El **tamano real de descarga** (`bytes`) y que el **sha256** calculado a mano coincida con los
  pesos publicados.

Testable **sin** pesos: el esquema Zod; el parser sobre salidas encoladas; `resolve.ts` contra el
`CATALOG` real; la forma del prompt (snapshot); `capability.ts` con `navigator` mockeado; el worker y
el cliente con `Worker` falso; la tarjeta y el "sin escritura antes de confirmar" con un cliente
stub en E2E; la frontera anti-aritmetica; la paridad i18n; y `verify-bundle`.

## Orden de implementacion

1. **`docs/specs/14-chat.md`** (esta spec) + entrada en el indice del README.
2. **`src/chat/intent.ts`** + `intent.test.ts` (esquema cerrado y parser; puro).
3. Prompt + parse + resolve (`prompt.ts`, `parse.ts`, `resolve.ts`).
4. Tarjeta de confirmacion (`ui.ts`, `index.ts`, estilos, i18n).
5. Capacidad + flag (`capability.ts`, `flag.ts`).
6. Manifest + loader aditivo + worker/cliente.
7. Cableado en `main.ts`, degradacion y presupuesto de bundle.
8. Tests completos (incluye `boundary.test.ts`), banco ES/EN y auditoria.
