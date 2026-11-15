# TypeSpec → OpenAPI: раскладка проекта `spec/` и версии

Research для [issue #26](https://github.com/MNSolov/ai-for-developers-project-386/issues/26).
Всё ниже проверено на `@typespec/compiler@1.18.0` под pinned Node из `mise.toml`
(Node 26.13.1): компиляция запускалась в песочнице `spec/`-проекта, фрагменты
`openapi.yaml` в документе — реальный вывод эмиттера, а не пересказ документации.
Ссылки на первоисточники — в конце.

## Решение коротко

1. `spec/` — четвёртый самостоятельный npm-проект в репозитории (рядом с `api/`,
   `client/` и корнем), `"type": "module"`, версии `@typespec/*` зафиксированы
   точно, `package-lock.json` коммитится.
2. Минимальный набор пакетов: `@typespec/compiler`, `@typespec/http`,
   `@typespec/openapi3` + обязательный peer `@typespec/openapi`. Все — `1.18.0`.
3. Эмитим **OpenAPI 3.1.0** и указываем это явно: по умолчанию эмиттер отдаёт
   `3.0.0`.
4. `tspconfig.yaml` с `kind: project` и `emitter-output-dir: "{project-root}"` →
   единственный файл `spec/openapi.yaml`, который коммитится и проверяется на дрейф.
5. Дрейф ловится `tsp compile . && git diff --exit-code -- openapi.yaml
   && test -z "$(git status --porcelain -- openapi.yaml)"`; шаг встраивается в
   `hk` (`mise run check` и `pre-push`), а в CI добавляется `npm ci` для `spec/`.
6. Для ajv-валидации ответов нужен `Ajv2020` (`ajv/dist/2020`) + `ajv-formats`;
   `discriminator` из OpenAPI ajv не переваривает — либо `strict: false`, либо
   вырезать ключ перед компиляцией валидаторов. Это главный аргумент за 3.1
   (его Schema Object — надмножество JSON Schema 2020-12).

## Пакеты и версии

Проверено через npm registry (`npm view`) и установкой в песочнице:

| Пакет | Версия | `engines.node` | Роль |
| --- | --- | --- | --- |
| `@typespec/compiler` | `1.18.0` | `>=22.0.0` | язык, CLI `tsp`, стандартная библиотека |
| `@typespec/http` | `1.18.0` | `>=22.0.0` | `@service`, `@route`, `@get/@post/…`, `@body`, `@statusCode`, `@header`, `@query`, `@server` |
| `@typespec/openapi` | `1.18.0` | — | `@info`, `@oneOf`, `@useRef`, `@tagMetadata`; **обязательный peer** `@typespec/openapi3` |
| `@typespec/openapi3` | `1.18.0` | `>=22.0.0` | эмиттер OpenAPI 3.0/3.1/3.2 |

Факты о совместимости:

- `@typespec/http@1.18.0` объявляет peer `@typespec/compiler@^1.18.0`;
  `@typespec/openapi3@1.18.0` — peer `compiler`, `http`, `openapi` (все три
  неопциональные) и опциональные peer'ы `@typespec/sse`, `@typespec/events`,
  `@typespec/streams`, `@typespec/versioning`, `@typespec/json-schema`,
  `@typespec/xml`. Peer-диапазоны — `^1.18.0`, поэтому версии должны быть из
  одной мажорной линии и не ниже 1.18.0; на практике все четыре пакета ставятся
  одной и той же версией (в проверке — `1.18.0`, опубликованы 2026-11-11).
- `@typespec/rest@0.88.0` **не нужен**: в примере ниже ничего из него не
  использовалось, `@route`/`@error`/`@useAuth` уже в `@typespec/http` и
  стандартной библиотеке. Меньше пакетов — меньше дрейфа.
- Node: минимум по документации — **Node.js 22.0.0 и npm 7.0.0**; в `package.json`
  компилятора `engines.node: ">=22.0.0"`. В `mise.toml` запинен Node `26`
  (фактически 26.13.1), npm 11.20.0 — совместимо, компиляция проверена.
- ESM: пакет компилятора — `"type": "module"`, `exports` отдаёт только
  `import`/`default`, CJS-точки входа нет. CLI `tsp` от этого не зависит, но любой
  JS-скрипт/плагин в `spec/` должен быть ESM, поэтому `spec/package.json` тоже
  `"type": "module"` — как в `api/`.

`package.json` песочницы, на которой проверялось (версии — точные, без `^`):

```json
{
  "name": "spec",
  "private": true,
  "type": "module",
  "scripts": {
    "compile": "tsp compile .",
    "check:drift": "tsp compile . && git diff --exit-code -- openapi.yaml && test -z \"$(git status --porcelain -- openapi.yaml)\"",
    "check:format": "tsp format --check \"**/*.tsp\"",
    "format": "tsp format \"**/*.tsp\""
  },
  "devDependencies": {
    "@typespec/compiler": "1.18.0",
    "@typespec/http": "1.18.0",
    "@typespec/openapi": "1.18.0",
    "@typespec/openapi3": "1.18.0"
  }
}
```

Точные версии, а не `^`: patch-релизы TypeSpec меняют вывод эмиттера, а
сгенерированный `openapi.yaml` лежит в git — диапазон версий превратил бы
обновление зависимости в «дрейф» спеки.

## Раскладка `spec/`

```
spec/
├── main.tsp           # точка входа: @service, модели, операции
├── tspconfig.yaml
├── package.json       # private, type: module, точные версии
├── package-lock.json  # коммитится, нужен для npm ci
├── openapi.yaml       # ГЕНЕРИРУЕТСЯ и коммитится; руками не править
└── (node_modules/, tsp-output/ — в .gitignore)
```

- Один сервис — один файл `spec/openapi.yaml` в корне проекта. Так его удобно
  указывать клиенту (`npx openapi-typescript ../spec/openapi.yaml -o …`) и
  проверять `git diff` из `spec/`.
- `spec/openapi.yaml` — generated-файл в терминах `AGENTS.md`: генерируется
  `tsp compile`, руками не редактируется.
- `node_modules/` уже покрыт корневым `.gitignore` (шаблон без слэша матчится на
  любом уровне). Дополнительно стоит добавить `spec/tsp-output/` — на случай
  запуска без конфига. **Не** называйте выходную папку `out/`: корневой
  `.gitignore` игнорирует `out/` на любом уровне.

Разбивать `main.tsp` на несколько файлов можно через `import "./models/booking.tsp"`;
на детерминизм и на эмиттер это не влияет.

## `tspconfig.yaml`

Полный рабочий конфиг для `spec/tspconfig.yaml`:

```yaml
# kind: project делает каталог границей проекта TypeSpec;
# entrypoint по умолчанию — main.tsp, но фиксируем явно.
kind: project
entrypoint: main.tsp

emit:
  - "@typespec/openapi3"

# Рекомендация документации для CI: warnings становятся ошибками.
warn-as-error: true

options:
  "@typespec/openapi3":
    # Абсолютный путь через {project-root}: файл кладётся ровно в spec/openapi.yaml.
    emitter-output-dir: "{project-root}"
    output-file: "openapi.yaml"
    file-type: yaml
    # ВАЖНО: по умолчанию эмиттер отдаёт 3.0.0. Нам нужен 3.1.0.
    openapi-versions:
      - "3.1.0"
    # LF независимо от ОС — иначе дрейф на Windows/CI.
    new-line: lf
    # Стабильные operationId: имя операции с именем родительского namespace
    # (Bookings_list). Можно заменить на "fqn" или задавать @operationId вручную.
    operation-id-strategy: parent-container
    # Явные значения по умолчанию, чтобы поведение не менялось при апгрейде:
    omit-unreachable-types: false
    seal-object-schemas: false
    include-x-typespec-name: never
```

Почему именно так (все пункты — из документации эмиттера и конфигурации):

- `emit: ["@typespec/openapi3"]` — имя пакета-эмиттера; альтернатива —
  `tsp compile . --emit=@typespec/openapi3`.
- `emitter-output-dir` задаёт каталог эмиттера (по умолчанию
  `{output-dir}/@typespec/openapi3`, то есть `tsp-output/@typespec/openapi3/`).
  Путь в конфиге должен быть абсолютным, поэтому `{project-root}`/`{cwd}`.
- `output-file` умеет интерполировать `{service-name}`, `{version}`, `{file-type}`;
  при одном сервисе без версионирования по умолчанию и так `openapi.yaml`, но
  фиксируем имя явно — от него зависит путь в git.
- `openapi-versions`: допустимые значения `3.0.0 | 3.1.0 | 3.2.0`,
  **default `["3.0.0"]`**. Без этой опции получите 3.0.
- `new-line: lf` — default и так `lf`, но фиксируем: дрейф не должен зависеть от
  ОС.
- `file-type` можно не указывать (выводится из расширения), но с явным `yaml`
  поведение очевиднее.
- Переключение версии через CLI (`--option "@typespec/openapi3.openapi-versions=3.0.0"`)
  на 1.18.0 падает на валидации схемы опции (`invalid-schema: must be array`).
  Если нужен второй вариант спеки, используйте отдельный build-конфиг и
  `--config` (см. раздел про 3.0 vs 3.1), а не `--option`.

## `main.tsp`: рабочий пример

Этот файл компилируется без ошибок и предупреждений на 1.18.0 с конфигом выше
(приведён после `tsp format`, поэтому стиль канонический):

```typespec
import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

/** Booking service API. */
@service(#{ title: "Booking API" })
@info(#{ version: "1.0.0" })
@server("https://api.example.com", "Production")
namespace Booking;

/** A single booking. */
@example(
  #{
    id: "b-1",
    status: BookingStatus.confirmed,
    startsAt: utcDateTime.fromISO("2026-01-05T10:00:00Z"),
    day: plainDate.fromISO("2026-01-05"),
    note: null,
    metadata: #{ source: "web" },
    guests: 2,
  },
  #{ title: "Confirmed booking" }
)
model Booking {
  /** Server-assigned identifier. */
  id: string;

  status: BookingStatus;
  startsAt: utcDateTime;
  day: plainDate;

  /** Explicitly nullable note. */
  note: string | null;

  metadata: Record<string>;
  guests: int32;
}

enum BookingStatus {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
}

/** Base error body. */
@error
model ErrorResponse {
  message: string;
}

model NotFoundError extends ErrorResponse {
  code: "NOT_FOUND";
}

model ValidationError extends ErrorResponse {
  code: "VALIDATION_ERROR";
  details: string[];
}

@route("/bookings")
namespace Bookings {
  /** List bookings. */
  @get
  op list(@query limit?: int32):
    | {
        @statusCode statusCode: 200;
        @body body: Booking[];
      }
    | NotFoundError;

  /** Read one booking. */
  @get
  op read(@path id: string): Booking | NotFoundError;

  /** Create a booking. */
  @post
  op create(@body booking: Booking):
    | {
        @statusCode statusCode: 201;
        @body body: Booking;
      }
    | ValidationError;
}
```

Что из этого реально получилось в `spec/openapi.yaml` (OpenAPI 3.1.0):

```yaml
openapi: 3.1.0
info:
  title: Booking API
  version: 1.0.0
  description: Booking service API.
paths:
  /bookings:
    get:
      operationId: Bookings_list
      description: List bookings.
      parameters:
        - name: limit
          in: query
          required: false
          schema: { type: integer, format: int32 }
      responses:
        '200':
          description: The request has succeeded.
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Booking' }
        default:
          description: An unexpected error response.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/NotFoundError' }
components:
  schemas:
    Booking:
      type: object
      required: [id, status, startsAt, day, note, metadata, guests]
      properties:
        startsAt: { type: string, format: date-time }
        day: { type: string, format: date }
        note:
          anyOf:
            - type: string
            - type: 'null'
          description: Explicitly nullable note.
        metadata:
          type: object
          additionalProperties: { type: string }
      description: A single booking.
      examples:
        - id: b-1
          status: confirmed
          startsAt: '2026-01-05T10:00:00Z'
          day: '2026-01-05'
          note: null
          metadata: { source: web }
          guests: 2
    NotFoundError:
      type: object
      required: [code]
      properties:
        code:
          type: string
          enum: [NOT_FOUND]
      allOf:
        - $ref: '#/components/schemas/ErrorResponse'
```

### Даты и время

| TypeSpec | OpenAPI |
| --- | --- |
| `utcDateTime` | `type: string, format: date-time` (RFC 3339, UTC) |
| `offsetDateTime` | `type: string, format: date-time` (RFC 3339 со смещением) |
| `plainDate` | `type: string, format: date` |
| `plainTime` | `type: string, format: time` |
| `duration` | `type: string, format: duration` |

Значения в примерах задаются конструкторами: `utcDateTime.fromISO(...)`,
`plainDate.fromISO(...)`, `duration.fromISO(...)` — иначе эмиттер не сможет
отрендерить пример по протоколу.

### Ошибки и коды ответов

- `@error` на модели превращает её в **`default`-ответ** (`schema` этой модели),
  а не в конкретный 4xx. Это подтверждено выводом: `NotFoundError` → `default`,
  при этом HTTP-код в спеке не фиксируется.
- Точный код задаётся явной моделью возврата:
  `| { @statusCode _: 404; @body body: NotFoundError }`.
- Один `@statusCode` может быть union (`@statusCode _: 200 | 201`) — эмиттер
  создаст по response на каждый код.
- Ошибки удобно описывать через `extends` от базовой модели с `@error`, но
  **нельзя** переопределять унаследованное свойство (`duplicate-property`):
  в примере `code` объявлен только в наследниках, а `message` — в базе.
- Стандартные ответы `OkResponse`, `CreatedResponse`, `NoContentResponse`,
  `NotFoundResponse`, `ConflictResponse` и т.п. есть в `@typespec/http`.

### Описания и примеры

- `/** … */` или `@doc("…")` → `description` (markdown разрешён); `@summary` →
  `summary`; `@tag` на namespace/operation → `tags`.
- `@example(value, #{ title, description })` на модели/скаляре → пример схемы.
  В 3.1 это массив `examples`, в 3.0 — единственный `example`; несколько
  `@example` в 3.0 не выразить.
- `@opExample(#{ parameters: …, returnType: … })` на операции → `examples` в
  `content` ответа (и параметров). Примеры именуются по `title`, поэтому
  `title` лучше задавать. В проверке с двумя `@opExample` в 3.1 получился
  именованный map `examples: { two: …, one: … }` внутри `application/json`.

### Массивы, `Record`, optional, nullable

- `T[]` → `type: array` + `items`; массив на верхнем уровне ответа — нормально
  (`op list(): Booking[]` → `application/json` со `schema.type: array`).
- `(T | null)[]` → `items.anyOf: [T, {type: 'null'}]`; ошибок генерации нет.
- `Record<string>` → `type: object` + `additionalProperties: {type: string}`;
  `Record<unknown>` → `additionalProperties: {}`; `Record<never>` →
  `additionalProperties: {not: {}}` (3.0) / `unevaluatedProperties: {not: {}}`
  (3.1). Модель `extends Record<T>` даёт `properties` **и**
  `additionalProperties`; при композиции через `allOf` в 3.1 эмиттер использует
  `unevaluatedProperties`, потому что `additionalProperties` не видит свойства
  из `allOf`.
- `prop?: T` → свойство не попадает в `required`; `@query`/`@header` параметр с
  `?` → `required: false`.
- `T | null` — единственный способ выразить nullable в TypeSpec; отдельного
  ключевого слова нет. В 3.1 → `anyOf: [T, {type: 'null'}]`, в 3.0 →
  `type: T, nullable: true`.
- Подводный камень (проверено): **голый** union в возврате
  (`op maybe(): string | null`) эмитится как `text/plain` со `schema.type: string`
  — `null` теряется. Оборачивайте полезную нагрузку в модель или `@body`:
  `op bodyNull(): { @body body: string | null }` → корректный `anyOf` с `null`.
- Имена `@header`/`@query` по умолчанию переводятся в kebab-case
  (`requestId` → `request-id`). Если нужен точный проводной контракт, задавайте
  имя строкой: `@header("x-request-id") requestId: string`.

### Discriminator и полиморфизм

Два разных механизма, оба проверены:

- `@discriminator("kind")` на базовой модели + `model Cat extends Pet { kind: "cat"; … }`
  → в `Pet` появляется `discriminator: {propertyName: kind, mapping: {…}}`,
  а `Cat`/`Dog` — `allOf: [$ref Pet]` + свои свойства и `enum` из литерала.
- `@discriminated(#{ envelope: "none" }) union Pet { cat: Cat, dog: Dog }` →
  `oneOf` + `discriminator` с `mapping`; `envelope: "none"` кладёт поля варианта
  рядом с `kind`, без обёртки `{kind, value}` (по умолчанию обёртка есть).
- Обычный `union` без `@discriminated` → `anyOf` (эмиттер не может гарантировать
  взаимоисключаемость); `@oneOf` из `@typespec/openapi` заставляет `oneOf`.

Практическое следствие для ajv — в разделе ограничений.

## Проверка дрейфа и встраивание в `mise run check` / hk

### Команда

Из `spec/`:

```bash
npm run check:drift
# = tsp compile .
#   && git diff --exit-code -- openapi.yaml
#   && test -z "$(git status --porcelain -- openapi.yaml)"
```

- `git diff --exit-code -- openapi.yaml` ловит изменение/удаление
  закоммиченного файла.
- `git status --porcelain` дополнительно ловит **untracked** файл: если
  переименовали сервис и эмиттер создал новый файл, `git diff` этого не увидит.
- `warn-as-error: true` в `tspconfig.yaml` (или флаг `tsp compile . --warn-as-error`)
  не даёт предупреждениям эмиттера просочиться в зелёный CI: локально `check:drift`
  гоняет тот же конфиг, что и CI.
- `tsp compile` не пишет таймстемпов и не создаёт временных файлов; повторная
  компиляция побайтово стабильна. Проверено: sha256 `spec/openapi.yaml` =
  `c9f7a45e8cec4d12da2caade5f7990f50828cdfa6e202cae8cedd2dcc7d194b6` три раза
  подряд — первый прогон, повторный и после `rm -rf openapi/`.

Локально для быстрой проверки руками:

```bash
cd spec
npm ci
npx tsp compile .
git -C .. diff --exit-code -- spec/openapi.yaml
```

### hk

В `hk.pkl` шаг кладётся в `slowSteps` (как `api-test`/`client-test`), поэтому он
попадает и в `mise run check` (`hk check --all`), и в `pre-push`:

```pkl
local slowSteps = new Mapping<String, Step> {
  // … существующие шаги …
  ["spec-openapi-drift"] {
    dir = "spec"
    glob = "**"
    check = "npm run check:drift"
  }
}
```

Форматирование `.tsp` — в `fastSteps` (pre-commit и `mise run fix`), по аналогии
с prettier:

```pkl
  ["spec-format"] {
    dir = "spec"
    glob = "**/*.tsp"
    check = "npm exec -- tsp format --check {{files}}"
    fix = "npm exec -- tsp format {{files}}"
  }
```

`tsp format` поддерживает `--check` (и `-x/--exclude`), поэтому check и fix —
одна и та же команда с флагом.

### CI и первый запуск

`spec/` — такой же самостоятельный npm-проект, как `api/` и `client/`, поэтому:

1. В `.github/workflows/check.yml` перед `mise run check` добавить шаг по образцу
   существующих:

   ```yaml
   - name: Install spec dependencies
     if: hashFiles('spec/package.json') != ''
     working-directory: spec
     run: npm ci
   ```

2. В `AGENTS.md` (раздел «First run on a fresh clone») добавить `npm install` в
   `spec/`, а формулировку «три self-contained npm-проекта» — обновить на четыре.

3. `spec/package-lock.json` коммитится: `npm ci` без него не работает.

Без шага (1) `hk` в CI упадёт на `npm run check:drift` с отсутствующим `tsp`.

### Что не делать

- Не генерировать спеку в `pre-commit` «на всякий случай»: pre-commit работает по
  staged-файлам, а компиляция пишет файл целиком. Дрейф проверяется в `check`/
  `pre-push`/CI, а `pre-commit` только форматирует `.tsp`.
- Не добавлять `spec/openapi.yaml` в `.gitignore` и не пытаться проверять дрейф
  без коммита файла — сравнивать будет не с чем.
- Не запускать `tsp compile` в `fix`-хуке: он перезапишет спеку, и дрейф
  «исчезнет» вместо того, чтобы упасть.

## Ограничения: 3.1 vs 3.0, nullable, discriminator, ajv

### 3.1 против 3.0 (проверено диффом одного и того же `main.tsp`)

| Аспект | OpenAPI 3.1.0 | OpenAPI 3.0.0 |
| --- | --- | --- |
| `T \| null` | `anyOf: [T, {type: 'null'}]` | `type: T`, `nullable: true` |
| Примеры схемы | `examples: [ … ]` (массив) | `example: …` (один) |
| `Record<never>` / sealed-схемы | `unevaluatedProperties: {not: {}}` | `additionalProperties: {not: {}}` |
| `Record` + `allOf` | `unevaluatedProperties` | `additionalProperties` |
| `enum-strategy: annotated` | поддержан | игнорируется + warning |
| Схемы | надмножество JSON Schema 2020-12 | диалект OpenAPI, не JSON Schema |

Вывод: для связки «openapi-typescript + ajv» берём **3.1.0**. По спецификации
OAS 3.1 Schema Object — «a superset of JSON Schema Specification Draft 2020-12»,
то есть спека почти напрямую скармливается ajv-классу 2020-12. 3.0 пришлось бы
конвертировать (`nullable`, `example` и т.п.).

Для сравнения версий в песочнице использовался build-конфиг (project-конфиг
нельзя передать в `--config`):

```yaml
# spec/tspconfig.3.0.yaml — только для проверки, в репозиторий не нужен
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    emitter-output-dir: "{project-root}"
    output-file: "openapi-3.0.yaml"
    openapi-versions:
      - "3.0.0"
```

```bash
npx tsp compile . --config tspconfig.3.0.yaml
```

### Nullable

- В TypeSpec nullable — это `T | null`; в модели/`@body`/элементе массива
  работает предсказуемо (см. выше).
- Голый scalar-return с `null` теряет `null` (проверено на 1.18.0) — всегда
  оборачивайте в `@body` или модель.
- Для ajv: `nullable` из 3.0 ajv поддерживает «из коробки», но `enum`/`const`
  `nullable` не расширяет — `null` надо явно добавлять в `enum`.

### Discriminator

- TypeSpec генерирует `discriminator` с `mapping` — и для `@discriminator`
  (наследование, `allOf`), и для `@discriminated` (`oneOf`).
- **ajv не поддерживает `mapping`**. Проверено на `ajv@8.20.0`:
  - `strict: true` без опции → `strict mode: unknown keyword: "discriminator"`;
  - `discriminator: true` → `discriminator: mapping is not supported`
    (падает компиляция всех схем, которые транзитивно ссылаются на такую модель).
- Рабочие варианты для валидации ответов:
  1. `strict: false` — ключ `discriminator` игнорируется, структура продолжает
     проверяться через `oneOf`/`allOf` (проверено: данные валидируются, `Cat`
     проходит, `Dog` с `kind: "cat"` — нет);
  2. перед компиляцией валидаторов удалить ключ `discriminator` из схем
     (тоже проверено: компилируется и в `strict: true`).
- То есть `discriminator` в спеке нужен для `openapi-typescript`/доков, а для
  ajv его надо нейтрализовать. Это не блокер, но должно быть в тестовом хелпере.

### Массивы и `Record`

- Ошибок генерации для `T[]`, `Record<T>`, `Record<unknown>`, `Record<never>`,
  `(T | null)[]` на 1.18.0 не обнаружено — все случаи выше скомпилировались.
- Реальный источник ошибок — не массивы/`Record` сами по себе, а:
  - `@typespec/openapi3/union-null` (error): композиция моделей даёт пустую
    `null`-схему, которую нельзя выразить в OpenAPI;
  - `@typespec/http/duplicate-operation`: два `op` в namespace с общим
    `@route` без собственного `@route` — падение компиляции (поймано на
    песочнице);
  - `@typespec/openapi3/invalid-schema`: неверный тип опции эмиттера (например,
    `openapi-versions` строкой вместо массива).
- `Record<never>`/`seal-object-schemas: true` и композиция `Record` + `allOf`
  дают `unevaluatedProperties`. Это **не** понимает ajv класса draft-07:
  проверено — `new Ajv().compile(...)` падает с
  `strict mode: unknown keyword: "unevaluatedProperties"`, а `Ajv2020` —
  компилирует. Отсюда требование: `Ajv2020` для 3.1.

### ajv: практическая обвязка

- Класс: `import Ajv2020 from "ajv/dist/2020.js"` (файл есть в `ajv@8.20.0`,
  который и так приходит с компилятором). Обычный `Ajv` — draft-07, для 3.1 не
  подходит.
- Форматы: ajv **не включает** форматы; для `date-time`/`date` нужен
  `ajv-formats` (иначе `format` игнорируется).
- `$ref` внутри `#/components/schemas/...` ajv сам не резолвит: схемы компонентов
  надо зарегистрировать (например, присвоив `$id`) или разыменовать документ
  перед компиляцией.
- `discriminator` — см. выше (`strict: false` или вырезать).
- Валидировать имеет смысл только те схемы, которые относятся к ответам
  (`components.schemas` + `content.*.schema` пути), а не весь документ: сам
  OpenAPI-документ — не JSON Schema.

### openapi-typescript

- Поддерживает OpenAPI 3.0 и 3.1, включая `discriminator`; текущая версия —
  `7.13.0`, рекомендуется Node 20+. Для 3.1 из этой спеки генерация типов
  проблем не вызывает (пути/`components` — стандартные).
- Генерировать типы лучше отдельным шагом клиента из закоммиченного
  `spec/openapi.yaml`, не из вывода компилятора напрямую: тогда дрейф спеки
  ловится до генерации типов.

## Что именно проверялось

Песочница: `spec/`-проект с `package.json`/`tspconfig.yaml`/`main.tsp` из этого
документа, `npm ci` под `mise exec` (Node 26.13.1, npm 11.20.0).

- `npx tsp compile .` → `openapi/openapi.yaml`, затем (после смены
  `emitter-output-dir` на `{project-root}`) `spec/openapi.yaml`; exit 0,
  предупреждений нет.
- Три компиляции подряд (включая после удаления выходного файла) → одинаковый
  sha256 (`c9f7a45e…`), таймстемпов в файле нет.
- Дифф 3.1 vs 3.0 на одном исходнике: ровно `nullable`, `example(s)`,
  `unevaluatedProperties`/`additionalProperties` (см. таблицу).
- `@error` → `default`-ответ; `@statusCode` union → отдельные response.
- Скаляры: `utcDateTime`/`offsetDateTime` → `format: date-time`, `plainDate` →
  `date`, `plainTime` → `time`, `duration` → `duration`.
- `@example` (3.1 `examples`-массив), `@opExample` (именованные `examples` в
  `content`).
- `@discriminator` → `allOf` + `mapping`; `@discriminated(envelope: "none")` →
  `oneOf` + `discriminator`.
- ajv 8.20.0: `Ajv2020` компилирует все схемы спеки; `Ajv` (draft-07) падает на
  `unevaluatedProperties`; `discriminator: true` падает на `mapping`;
  `strict: false` без опции `discriminator` — валидирует данные.
- `tsp format --check` и `tsp format` (2 файла отформатировано, 3 без изменений).
- `tsp` CLI: `compile`, `format --check`, `init`, `install`, `info`.

## Источники

TypeSpec (официальная документация):

- Getting started for REST — требования Node.js 22/npm 7, структура проекта,
  `tsp init/install/compile`: <https://typespec.io/docs/getting-started/getting-started-rest/01-setup-basic-syntax/>
- OpenAPI3 emitter, установка и опции (`openapi-versions`, `output-file`,
  `emitter-output-dir`, `file-type`, `new-line`, `omit-unreachable-types`,
  `seal-object-schemas`, `operation-id-strategy`, `enum-strategy`):
  <https://typespec.io/docs/emitters/openapi3/reference/>,
  <https://typespec.io/docs/emitters/openapi3/reference/emitter/>
- Конфигурация `tspconfig.yaml` (`kind: project`, `entrypoint`,
  `warn-as-error`, `output-dir`, интерполяция `{project-root}`,
  `--config`/`--dry-run`/`--no-emit`):
  <https://typespec.io/docs/handbook/configuration/configuration/>
- CLI (`tsp compile/format/init/install/info`, `format --check`):
  <https://typespec.io/docs/handbook/cli/>
- TypeSpec для OpenAPI-разработчиков — таблица `type`/`format` (`plainDate`,
  `utcDateTime`, `offsetDateTime`), `additionalProperties`/`Record`, `allOf` и
  `discriminator`, `@error` → `default`, `@info`, `@tagMetadata`:
  <https://typespec.io/docs/getting-started/typespec-for-openapi-dev/>
- Модели: optional-свойства, `Record`, `extends`/`is`/spread, массивы:
  <https://typespec.io/docs/language-basics/models/>
- Скаляры и конструкторы дат (`fromISO`, `now`):
  <https://typespec.io/docs/language-basics/scalars/>
- Discriminated types (`@discriminated`, `envelope`, `@discriminator`):
  <https://typespec.io/docs/standard-library/discriminated-types/>
- Примеры (`@example`, `@opExample`):
  <https://typespec.io/docs/standard-library/examples/>
- Примеры HTTP-ответов по статус-кодам:
  <https://typespec.io/docs/libraries/http/examples/>
- Библиотека HTTP (декораторы и стандартные response-модели):
  <https://typespec.io/docs/libraries/http/reference/>
- Диагностика `union-null`:
  <https://typespec.io/docs/emitters/openapi3/reference/diagnostics/union-null/>
- Release notes 1.18.0: <https://typespec.io/release-notes/typespec-1-18-0/>

Npm registry (версии, engines, peers — проверено `npm view`):

- `@typespec/compiler@1.18.0` — `engines.node >=22.0.0`, `"type": "module"`,
  ESM-only `exports`: <https://www.npmjs.com/package/@typespec/compiler>
- `@typespec/http@1.18.0`, `@typespec/openapi@1.18.0`,
  `@typespec/openapi3@1.18.0`: <https://www.npmjs.com/package/@typespec/openapi3>

OpenAPI и валидация:

- OAS 3.1.0, Schema Object — надмножество JSON Schema Draft 2020-12:
  <https://spec.openapis.org/oas/v3.1.0.html#data-types>
- ajv: версии JSON Schema (`Ajv2020`), `nullable`, ограничения `discriminator`
  (`mapping` не поддерживается), отсутствие форматов без `ajv-formats`:
  <https://ajv.js.org/json-schema.html>
- openapi-typescript 7.x — поддержка 3.0/3.1 и `discriminator`:
  <https://openapi-ts.dev/introduction>
