# Exclusion constraint на `tstzrange` в Postgres 17 через Drizzle-миграции

Research по тикету [#27](https://github.com/MNSolov/ai-for-developers-project-386/issues/27). Цель — не дать двум встречам занять пересекающиеся интервалы, отдавать на пересечение `409 SLOT_TAKEN` и не терять остальные ошибки БД.

Проверено на практике: PostgreSQL 17.12 (`postgres:17`), `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `pg@8.23.1`, Node.js 23.8. Эксперименты выполнены в одноразовом контейнере `postgres:17`; SQL и выводы psql ниже — фактические, не пересказ.

## Коротко

- Ограничение задаётся как `EXCLUDE USING gist (during WITH &&)` по `tstzrange(start, end, '[)')`; индекс GiST создаётся самим ограничением.
- Полуоткрытый интервал `[)` — правильный выбор: соседние слоты `[10:00, 10:30)` и `[10:30, 11:00)` не конфликтуют, а одинаковые и частично пересекающиеся — конфликтуют.
- `btree_gist` для одного диапазона **не нужен**; он нужен только если в ограничение добавляется равенство по скалярному столбцу (например, `specialist_id WITH =`).
- `starts_at`/`ends_at` обязаны быть `NOT NULL`, плюс `CHECK (ends_at > starts_at)`: `NULL` превращает диапазон в неограниченный, а пустой диапазон (`starts_at = ends_at`) не конфликтует ни с чем.
- Drizzle не умеет ни `tstzrange`, ни `EXCLUDE`: диапазон объявляется через `customType`, ограничение добавляется custom-SQL миграцией (`drizzle-kit generate --custom`).
- Ошибка Postgres `23P01` (`exclusion_violation`) несёт имя ограничения в поле `constraint`. Drizzle оборачивает её в `DrizzleQueryError`, поэтому код надо смотреть в `error.cause.code`, а не в `error.code`.
- 10 параллельных вставок дают ровно одну успешную; на практике 9 отклоняются с `23P01`. В редком прогоне наблюдался `40P01` (deadlock) — его нужно ретраить, а не отдавать как 409.

## 1. Точный SQL

### 1.1. Рекомендуемый вариант: generated column `during`

Хранимый генерируемый столбец делает диапазон первоклассным значением: его можно выбирать, по нему строить запросы и по нему же создать exclusion constraint. Функция `tstzrange(...)` — `IMMUTABLE` (проверено: `provolatile = 'i'`), поэтому допустима в `GENERATED ALWAYS AS`.

```sql
CREATE TABLE "appointments" (
  "id"         bigserial PRIMARY KEY NOT NULL,
  "starts_at"  timestamp with time zone NOT NULL,
  "ends_at"    timestamp with time zone NOT NULL,
  "during"     tstzrange GENERATED ALWAYS AS (
    tstzrange("starts_at", "ends_at", '[)')
  ) STORED,
  CONSTRAINT "appointments_time_order"
    CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "appointments_no_overlap"
    EXCLUDE USING gist ("during" WITH &&)
);

CREATE INDEX "appointments_starts_at_idx"
  ON "appointments" USING btree ("starts_at");
```

Фактический `\d appointments` после применения:

```text
Indexes:
    "appointments_pkey" PRIMARY KEY, btree (id)
    "appointments_no_overlap" EXCLUDE USING gist (during WITH &&)
    "appointments_starts_at_idx" btree (starts_at)
Check constraints:
    "appointments_time_order" CHECK (ends_at > starts_at)
```

`EXCLUDE` автоматически создаёт индекс с тем же именем, что и ограничение; отдельный `CREATE INDEX ... gist` не нужен и привёл бы к дублированию.

### 1.2. Альтернатива: ограничение на выражении, без столбца `during`

```sql
CREATE TABLE "appointments" (
  "id"        bigserial PRIMARY KEY NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at"   timestamp with time zone NOT NULL,
  CONSTRAINT "appointments_time_order"
    CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "appointments_no_overlap"
    EXCLUDE USING gist (
      tstzrange("starts_at", "ends_at", '[)') WITH &&
    )
);

CREATE INDEX "appointments_starts_at_idx"
  ON "appointments" USING btree ("starts_at");
```

Проверено: работает без `btree_gist`. Индекс ограничения будет GiST по выражению `tstzrange(starts_at, ends_at, '[)')` и ускорит запросы с **точно таким же** выражением. Минус — в Drizzle нет столбца, который можно типизировать; диапазон придётся собирать через `sql`.

### 1.3. Когда действительно нужен `btree_gist`

`btree_gist` даёт GiST-опклассы с B-tree-поведением для скалярных типов (`text`, `uuid`, `int*`, `timestamp*`, `date` и др.), чтобы смешать равенство и пересечение в одном ограничении. Для чистого `tstzrange` он не требуется — в новой БД без расширения такое ограничение создаётся (проверено).

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist ("specialist_id" WITH =, "during" WITH &&);
```

Без расширения Postgres отвечает:

```text
ERROR:  data type uuid has no default operator class for access method "gist"
HINT:  You must specify an operator class for the index or define a default operator class for the data type.
```

Факты из документации:

- `btree_gist` — «trusted» расширение: его может установить не суперпользователь, у которого есть `CREATE` на текущую БД.
- Ограничение с равенством по скалярному столбцу проверено: одинаковый `specialist_id` + пересечение — ошибка; разные `specialist_id` с теми же интервалами — обе строки вставляются.
- Многоколоночный GiST-индекс ограничения обслуживает и запрос `specialist_id = $1 AND during && ...` (проверено `EXPLAIN`: `Index Scan using specialist_no_overlap`).

Если в календаре всегда один владелец и нет ресурса/специалиста, `btree_gist` можно не устанавливать вовсе.

### 1.4. Полезный вариант: частичное ограничение

`EXCLUDE` поддерживает `WHERE (predicate)` — внутри создаётся частичный индекс. Например, отменённые встречи не должны блокировать слот:

```sql
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist ("during" WITH &&)
  WHERE ("status" <> 'cancelled');
```

Проверено: отменённая встреча и активная с тем же интервалом сосуществуют, а вторая активная с пересечением падает с `23P01`. Тогда отмена (`UPDATE ... SET status = 'cancelled'`) выводит строку из индекса и освобождает слот. Это не входит в текущий скоуп, но пригодится, когда появится отмена записи.

## 2. Семантика границ, `NULL` и часовых поясов

### 2.1. Полуоткрытый интервал `[)`

`[)` означает: нижняя граница включена, верхняя — нет. Проверено запросами к `tstzrange`:

| Случай | `&&` |
| --- | --- |
| `[10:00, 10:30)` и `[10:30, 11:00)` — соседние | `false` |
| `[10:00, 10:30)` и `[10:29, 10:59)` — пересечение 1 минута | `true` |
| `[10:00, 10:30)` и `[10:00, 10:30)` — идентичные | `true` |
| `[10:00, 10:00)` — пустой диапазон | `empty`, `&&` = `false` |

Отсюда два обязательных следствия:

1. Слоты по 30 минут можно генерировать как `[start, start + 30 min)` и не бояться ложных конфликтов на стыках.
2. `starts_at = ends_at` даёт пустой диапазон, который не конфликтует ни с чем. Без `CHECK (ends_at > starts_at)` в таблицу можно вставить сколько угодно «встреч нулевой длины» — проверено: две одинаковые пустые строки обе успешно вставились.

### 2.2. `NULL` делает диапазон неограниченным

`tstzrange(NULL, ends_at, '[)')` — это `(,ends_at)`, то есть «всё, что раньше `ends_at`». Проверено:

```sql
INSERT INTO appointments_nullable (starts_at, ends_at)
VALUES (NULL, '2026-01-01 12:00+00');
-- ERROR: conflicting key value violates exclusion constraint "no_overlap"
-- Key (tstzrange(starts_at, ends_at, '[)'::text))=((,"2026-01-01 12:00:00+00"))
--   conflicts with existing key (["2026-01-01 10:00:00+00","2026-01-01 10:30:00+00"))
```

Поэтому:

- `starts_at` и `ends_at` — `NOT NULL`;
- `CHECK (ends_at > starts_at)` — защита от пустых и перевёрнутых интервалов;
- `during` в варианте с generated column наследует это: при непустых `NOT NULL`-входах он всегда непустой.

### 2.3. Часовые пояса

`timestamptz` хранит момент в UTC; исходный часовой пояс не сохраняется, а при выводе значение конвертируется в `TimeZone` сессии. Сравнения `tstzrange` идут по абсолютным моментам, поэтому `[)`-границы не зависят от того, в какой зоне их показали.

- Drizzle `timestamp({ withTimezone: true, mode: 'date' })` отдаёт JS `Date` (момент UTC); `node-postgres` парсит `timestamptz` в `Date`.
- `starts_at + interval '30 minutes'` — абсолютные 30 минут; `+ interval '1 day'` — календарные сутки, которые могут быть 23 или 25 часов при переходе на летнее время (документация Postgres прямо предупреждает об этом). Для сетки слотов внутри дня это означает: генерировать локальные границы в явной зоне (`AT TIME ZONE 'Europe/Moscow'`), а хранить уже `timestamptz`.
- Окно записи «14 дней» лучше считать от `now()` в UTC и сравнивать `starts_at` с `now()`/`now() + interval '14 days'`; это btree-запрос, см. §5.

## 3. Ограничения и подводные камни механизма

Из документации `CREATE TABLE ... EXCLUDE`:

- Оператор должен быть **коммутативным**; `&&` для диапазонов коммутативен.
- `exclude_element` — это имя столбца или выражение в скобках, с необязательными collation/opclass/ordering. Выражение должно быть иммутабельным.
- Индекс ограничения создаётся автоматически и называется так же, как ограничение; имена ограничений/индексов уникальны в схеме.
- Access method должен поддерживать `amgettuple`: **GIN не подходит**, практически это GiST или SP-GiST. B-tree/hash технически допустимы, но бессмысленны.
- `EXCLUDE` может быть `DEFERRABLE`, но по умолчанию `NOT DEFERRABLE`; deferrable-ограничение нельзя использовать как арбитр в `ON CONFLICT`. Для «сразу 409» нужен немедленный вариант — не указываем `DEFERRABLE`.
- Для партиционированных таблиц все колонки ключа партиционирования обязаны входить в ограничение с оператором `=`; иначе конфликтующие строки могут оказаться в разных партициях.
- Ограничение проверяется на `INSERT` и `UPDATE`; нарушение сразу прерывает текущую транзакцию (`23P01`).

## 4. Drizzle: схема, диапазоны и коммитимая миграция

### 4.1. Чего в Drizzle нет

На проверенных версиях (`drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`):

- нет нативного типа колонки `tstzrange`/`tsrange` — список типов заканчивается `interval`, `point`, `line` и т. п.; диапазоны объявляются через `customType`;
- нет builder-а для `EXCLUDE`; `index().using('gist', ...)` умеет обычный GiST-индекс, но не exclusion constraint;
- `check()` есть и генерируется в `CREATE TABLE` (проверено);
- `generatedAlwaysAs()` есть и генерирует `GENERATED ALWAYS AS (...) STORED` (проверено).

### 4.2. Схема

```ts
// src/db/schema.ts
import { sql, type SQL } from 'drizzle-orm';
import {
  bigserial,
  check,
  customType,
  index,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';

const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tstzrange';
  },
});

export const appointments = pgTable(
  'appointments',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    startsAt: timestamp('starts_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    endsAt: timestamp('ends_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    during: tstzrange('during').generatedAlwaysAs(
      (): SQL =>
        sql`tstzrange(${appointments.startsAt}, ${appointments.endsAt}, '[)')`,
    ),
  },
  (t) => [
    check('appointments_time_order', sql`${t.endsAt} > ${t.startsAt}`),
    index('appointments_starts_at_idx').on(t.startsAt),
  ],
);
```

`drizzle-kit generate` для этой схемы выдаёт (фактический вывод):

```sql
CREATE TABLE "appointments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"during" "tstzrange" GENERATED ALWAYS AS (tstzrange("appointments"."starts_at", "appointments"."ends_at", '[)')) STORED,
	CONSTRAINT "appointments_time_order" CHECK ("appointments"."ends_at" > "appointments"."starts_at")
);
--> statement-breakpoint
CREATE INDEX "appointments_starts_at_idx" ON "appointments" USING btree ("starts_at");
```

Обратите внимание: `"tstzrange"` в кавычках — валидная ссылка на тип из `pg_catalog`; миграция применяется без ошибок (проверено). Drizzle не пытается вставлять `during` при `INSERT` — generated column остаётся за БД (проверено).

### 4.3. Custom-миграция с ограничением

```bash
npx drizzle-kit generate --custom --name=slot-overlap
```

Команда создаёт пустой `drizzle/0001_slot-overlap.sql` **и запись в `drizzle/meta/_journal.json`**. Просто положить `.sql`-файл в папку недостаточно: и `drizzle-kit migrate`, и runtime-мигратор читают журнал, а не список файлов (проверено: файл без записи в журнале не применяется).

Содержимое `0001_slot-overlap.sql` для одного календаря:

```sql
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist ("during" WITH &&);
```

Для варианта с ресурсом/специалистом:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist ("specialist_id" WITH =, "during" WITH &&);
--> statement-breakpoint
CREATE INDEX "appointments_specialist_starts_at_idx"
  ON "appointments" USING btree ("specialist_id", "starts_at");
```

Строки разделяются маркером `--> statement-breakpoint`. Runtime-мигратор (`migrate()` из `drizzle-orm/node-postgres/migrator`) режет файл по этому маркеру и выполняет каждый кусок отдельно; вся миграция идёт в одной транзакции. Поэтому:

- `CREATE EXTENSION btree_gist` внутри транзакции работает (проверено на 17.12);
- `CREATE INDEX CONCURRENTLY` в такой миграции невозможен — Postgres запрещает его в транзакции; для новой пустой таблицы обычный `CREATE INDEX` и так мгновенный;
- при старте приложения миграции применяются последовательно; один инстанс — гонки миграций нет. При масштабировании понадобится advisory lock (вне скоупа).

`drizzle-kit generate` после появления custom-миграции пишет `No schema changes, nothing to migrate` и **не** пытается удалить незнакомое ограничение (проверено). Но `drizzle-kit push` сверяет живую БД со схемой и может удалить объекты, которых нет в Drizzle-схеме (в эксперименте он удалил custom-индекс, не объявленный в схеме). В этом проекте доставка идёт миграциями, `push` не использовать.

## 5. Overlap-запросы и индексы

### 5.1. Предварительная проверка

Сильный вариант — тот же `during`, по которому построен GiST-индекс ограничения:

```ts
const overlaps = await db
  .select({ id: appointments.id })
  .from(appointments)
  .where(
    sql`${appointments.during} && tstzrange(${start}, ${end}, '[)')`,
  );
```

`EXPLAIN` подтверждает использование индекса ограничения:

```text
Bitmap Heap Scan on appointments
  Recheck Cond: (during && '["2026-12-01 10:15:00+00","2026-12-01 10:45:00+00")'::tstzrange)
  ->  Bitmap Index Scan on appointments_no_overlap
        Index Cond: (during && ...)
```

Эквивалент через обычные сравнения (понятнее ORM, работает и без `during`):

```ts
const overlaps = await db
  .select({ id: appointments.id })
  .from(appointments)
  .where(
    and(
      lt(appointments.startsAt, end),
      gt(appointments.endsAt, start),
    ),
  );
```

Условие пересечения полуоткрытых интервалов: `existing.starts_at < new.end AND existing.ends_at > new.start`. Оно использует btree по `starts_at` как диапазонный скан + фильтр по `ends_at`; для точной проверки лучше `&&` по GiST.

**Предварительная проверка не является защитой от гонки.** Между `SELECT` и `INSERT` другой запрос может занять слот; источник истины — ограничение БД. Проверка нужна только для UX (показать 409/подсказку до вставки), а вставку всё равно выполняем и обрабатываем `23P01`.

### 5.2. Индексы и их роли

| Индекс | Зачем |
| --- | --- |
| `appointments_no_overlap` — GiST по `during` | Создаётся `EXCLUDE`; ускоряет `&&`, `@>`, `<@`, `<<`, `>>`, `-\|-`, `&<`, `&>`; обслуживает проверку пересечения и overlap-запросы. |
| `appointments_starts_at_idx` — btree по `starts_at` | Список встреч/слотов за день или окно, `ORDER BY starts_at`, `starts_at >= now() AND starts_at < now() + interval '14 days'`. |
| `appointments_specialist_starts_at_idx` — btree по `(specialist_id, starts_at)` | Список по конкретному специалисту с сортировкой по времени. |
| `appointments_no_overlap` при `specialist_id WITH =, during WITH &&` | Один многоколоночный GiST обслуживает и равенство, и пересечение; отдельный GiST по `during` не нужен. |

Проверено `EXPLAIN` (при `enable_seqscan = off`):

- `WHERE during && tstzrange(...)` → `Bitmap Index Scan on appointments_no_overlap`;
- `WHERE starts_at >= ... AND starts_at < ... ORDER BY starts_at` → `Bitmap Index Scan on appointments_starts_at_idx` + `Sort`;
- `WHERE specialist_id = ... AND during && ...` → `Index Scan using specialist_no_overlap`.

GiST по диапазону не заменяет btree для сортировки и точечных выборок по `starts_at`: диапазонный тип имеет B-tree порядок, но он «довольно произвольный» и для реальных запросов бесполезен. Поэтому btree по времени нужен отдельно.

### 5.3. `NULL` и пустые интервалы в запросах

- При `NOT NULL` + `CHECK` неограниченных и пустых диапазонов в таблице нет, и `&&` ведёт себя предсказуемо.
- Если ослабить `NOT NULL`, `tstzrange(NULL, end)` начнёт пересекаться со всеми встречами до `end`; это почти наверняка не то, что нужно.
- Пустой диапазон (`start = end`) не пересекается ни с чем и не блокирует слот — ещё одна причина для `CHECK`.

## 6. Ошибка `23P01` → `409 SLOT_TAKEN`

### 6.1. Что приходит от Postgres и `pg`

В приложении ошибок Postgres (`Appendix A`) код `23P01` — `exclusion_violation`. `node-postgres` разбирает поля ErrorResponse в `DatabaseError`; в объекте есть, среди прочего:

```text
severity, code, detail, hint, schema, table, column, constraint, file, line, routine
```

Проверено на конфликте:

```text
code:       23P01
constraint: appointments_no_overlap
table:      appointments
detail:     Key (during)=(...) conflicts with existing key (during)=(...)
```

Имя ограничения в `constraint` — ключ к тому, чтобы не принять за «слот занят» другую ошибку с тем же кодом (если ограничений несколько).

### 6.2. Что делает Drizzle

`drizzle-orm` оборачивает ошибку драйвера в `DrizzleQueryError`:

```ts
class DrizzleQueryError extends Error {
  query: string;
  params: any[];
  cause?: Error;
}
```

`error.code` у обёртки **отсутствует**, а `error.cause` — исходный `DatabaseError` (проверено: `thrown: DrizzleQueryError`, `wrapper.code: undefined`, `cause: DatabaseError 23P01 appointments_no_overlap`). Поэтому наивная проверка `error.code === '23P01'` в Drizzle-коде не сработает.

### 6.3. Хелпер и NestJS-маппинг

```ts
type PgError = {
  code?: string;
  constraint?: string;
  severity?: string;
  detail?: string;
  table?: string;
  schema?: string;
};

const SLOT_CONSTRAINT = 'appointments_no_overlap';

/** Достаёт ошибку Postgres из DrizzleQueryError (и не падает на чужих ошибках). */
function findPgError(error: unknown): PgError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') return undefined;
    const candidate = current as PgError & { cause?: unknown };
    if (typeof candidate.code === 'string') return candidate;
    current = candidate.cause;
  }
  return undefined;
}

export function isSlotOverlap(error: unknown): boolean {
  const pgError = findPgError(error);
  return pgError?.code === '23P01' && pgError.constraint === SLOT_CONSTRAINT;
}
```

В сервисе:

```ts
import { ConflictException } from '@nestjs/common';

try {
  return await db.insert(appointments).values(input).returning();
} catch (error) {
  if (isSlotOverlap(error)) {
    throw new ConflictException({
      code: 'SLOT_TAKEN',
      message: 'This time slot has just been taken',
    });
  }
  throw error; // 23505, 23503, 22P02, сетевые и все остальные — наверх
}
```

Правила:

- маппить только `23P01` **и** только своё ограничение; остальные `23P01` (если появятся другие exclusion constraints) пробрасывать;
- не ловить `Error` целиком и не превращать в 409: `23505`, `23503`, `22P02`, `57014`, сетевые ошибки должны дойти до общего обработчика;
- если вставка была внутри `db.transaction`, после `23P01` транзакция уже aborted; ловить снаружи транзакции и отдавать 409, повторять запрос внутри той же транзакции нельзя;
- `detail` с конкретными интервалами не отдавать гостю — это утечка чужих данных; логировать на сервере, клиенту отдавать только `SLOT_TAKEN`.

### 6.4. Ретрай на `40P01`/`40001`

Конкурентные вставки в GiST-индекс могут образовать цикл ожиданий; Postgres детектирует deadlock и аварийно завершает одну из транзакций с `40P01` (`deadlock_detected`). Документация рекомендует в таких случаях повторять транзакцию. В одном из ранних прогонов 10 параллельных вставок 9 ошибок пришли именно как `40P01`; в 22 последующих прогонах (10 и 25 одновременных вставок) — стабильно `23P01`. Практический вывод: односрочный `INSERT` можно обернуть в bounded retry (1–2 попытки) на `40P01`/`40001`; после того как победитель закоммитился, повтор получит `23P01` и станет 409. Для транзакции повторять нужно всю транзакцию, а не отдельный запрос.

### 6.5. Альтернатива без исключения: `ON CONFLICT DO NOTHING`

Postgres разрешает `ON CONFLICT DO NOTHING` для exclusion-ограничений (но не `DO UPDATE`: exclusion constraint не может быть арбитром для `ON CONFLICT DO UPDATE`). Проверено: из 10 параллельных вставок одна вернула строку, девять — пустой результат; в таблице одна строка.

```ts
const inserted = await db
  .insert(appointments)
  .values(input)
  .onConflictDoNothing()
  .returning({ id: appointments.id });

if (inserted.length === 0) {
  throw new ConflictException({ code: 'SLOT_TAKEN' });
}
```

Плюсы: не нужно разбирать `DatabaseError`. Минусы: без `conflict_target` `DO NOTHING` глушит конфликты **всех** usable-ограничений таблицы (если появится ещё один unique index, его нарушение тоже станет «слот занят»); Drizzle принимает в `target` только колонки, а не имя exclusion constraint, поэтому точечно указать `ON CONFLICT ON CONSTRAINT appointments_no_overlap` через ORM нельзя — только сырым SQL. Для одной таблицы с единственным ограничением вариант рабочий; для явного контракта ошибок лучше `23P01`-маппинг.

## 7. Тест на гонку: 10 параллельных вставок → ровно одна успешна

Тест должен идти против реального Postgres (e2e-тир), а не на моках. Пул обязан давать минимум 10 одновременных соединений; при `max < 10` часть запросов ждёт свободный коннект и гонки не будет.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const RETRYABLE = new Set(['40P01', '40001']);

async function insertWithRetry(startsAt: Date, endsAt: Date) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await pool.query(
        `INSERT INTO appointments (starts_at, ends_at)
         VALUES ($1, $2)
         RETURNING id`,
        [startsAt, endsAt],
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (RETRYABLE.has(code ?? '') && attempt < 4) continue;
      throw error;
    }
  }
}

describe('appointments exclusion constraint', () => {
  beforeAll(async () => {
    await pool.query('TRUNCATE appointments RESTART IDENTITY');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lets exactly one of ten overlapping inserts win', async () => {
    const base = Date.parse('2030-01-01T10:00:00Z');
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      startsAt: new Date(base + i * 1_000),
      endsAt: new Date(base + 30 * 60_000 + i * 1_000),
    }));

    const results = await Promise.allSettled(
      attempts.map(({ startsAt, endsAt }) =>
        insertWithRetry(startsAt, endsAt),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const failure of rejected) {
      expect(failure.reason.code).toBe('23P01');
      expect(failure.reason.constraint).toBe('appointments_no_overlap');
    }

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM appointments',
    );
    expect(rows[0].n).toBe(1);
  });
});
```

Фактический результат того же сценария (10 вставок, каждая сдвинута на `i` секунд, все пересекаются):

```text
plain insert: ok = 1 failures = { '23P01': 9 }
```

Дополнительно проверено:

- 25 параллельных вставок — `ok = 1`, `24 × 23P01`;
- в 22 прогонах по 10 и по 25 одновременных вставок — всегда ровно одна успешная, остальные `23P01`;
- `ON CONFLICT DO NOTHING` — `inserted = 1`, `empty = 9`, в таблице одна строка;
- вариант через Drizzle (`db.insert(...).returning()`) — 1 успех, 9 отклонений, у каждого `cause.code === '23P01'` и `cause.constraint === 'appointments_no_overlap'`;
- одиночная проверка через psql: соседние `[10:00, 10:30)` и `[10:30, 11:00)` вставляются обе, а `[10:29, 10:59)` падает с `23P01`.

Если тест запускается в общем e2e-наборе, брать уникальное окно времени на прогон (или `TRUNCATE` в `beforeAll`), иначе остатки предыдущих тестов дадут ложный `23P01` на первой же вставке.

## 8. Чеклист реализации

1. `starts_at`, `ends_at` — `timestamptz NOT NULL`; `CHECK (ends_at > starts_at)`.
2. `during tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED`; в Drizzle — `customType` + `.generatedAlwaysAs()`.
3. Ограничение `EXCLUDE USING gist (during WITH &&)` — только custom-SQL миграцией, созданной через `drizzle-kit generate --custom` (файл обязан попасть в `_journal.json`).
4. `btree_gist` — только если в ограничении есть `= ` по скалярному столбцу; иначе не ставить.
5. Индекс btree по `starts_at` (и `(specialist_id, starts_at)`, если есть ресурс) — для списков и 14-дневного окна.
6. Вставка всегда защищена ограничением; предварительный `SELECT ... &&` — только UX.
7. `23P01` + имя ограничения → `409 SLOT_TAKEN`; всё остальное — наверх; `40P01`/`40001` — bounded retry.
8. E2E-тест: 10 параллельных вставок, пул ≥ 10, ровно один успех и девять `23P01`.
9. `detail` с интервалами не отдавать клиенту.

## Источники

Документация PostgreSQL 17:

- [5.5.6. Exclusion Constraints](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION) — синтаксис `EXCLUDE`, автоматический индекс, пример с `btree_gist`.
- [CREATE TABLE ... EXCLUDE](https://www.postgresql.org/docs/17/sql-createtable.html#SQL-CREATETABLE-EXCLUDE) — грамматика `exclude_element`, коммутативность оператора, ограничения access method, `DEFERRABLE`, партиционирование.
- [8.17. Range Types](https://www.postgresql.org/docs/17/rangetypes.html) — `[)`-границы, пустые диапазоны, `&&`, GiST-индексы, exclusion constraints на диапазонах.
- [F.8. btree_gist](https://www.postgresql.org/docs/17/btree-gist.html) — поддерживаемые типы, trusted-расширение, пример с `cage WITH =, animal WITH <>`.
- [8.5. Date/Time Types](https://www.postgresql.org/docs/17/datatype-datetime.html) — хранение `timestamptz` в UTC, вывод в `TimeZone` сессии, 23/25-часовые дни при DST.
- [Appendix A. PostgreSQL Error Codes](https://www.postgresql.org/docs/17/errcodes-appendix.html) — `23P01 exclusion_violation`.
- [INSERT ... ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html#SQL-ON-CONFLICT) — exclusion constraints как арбитр для `DO NOTHING`, запрет для `DO UPDATE`.
- [13.3.4. Deadlocks](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-DEADLOCKS) — обнаружение deadlock, аварийное завершение одной транзакции, рекомендация retry.

Drizzle ORM:

- [PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg) — список типов, отсутствие range-типов, `timestamp withTimezone`, `mode: 'date'`.
- [Custom types](https://orm.drizzle.team/docs/custom-types) — `customType<{ data, driverData }>`, `dataType`, `fromDriver`, `toDriver`.
- [Generated columns](https://orm.drizzle.team/docs/generated-columns) — `.generatedAlwaysAs()` и `STORED`.
- [Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) — `index()`, `uniqueIndex()`, `.using('gist', ...)`, `check()`.
- [Custom migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — `drizzle-kit generate --custom --name=...`, пустой файл, запуск через `drizzle-kit migrate`.
- [drizzle-orm `errors.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/errors.ts) — `DrizzleQueryError` с полями `query`, `params`, `cause`.
- [drizzle-orm `pg-core/session.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/session.ts) — оборачивание ошибок драйвера в `DrizzleQueryError`.
- [drizzle-orm `migrator.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/migrator.ts) и [`pg-core/dialect.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/dialect.ts) — чтение `_journal.json`, разбиение по `--> statement-breakpoint`, одна транзакция на миграцию.

node-postgres:

- [`pg-protocol` parser.ts](https://github.com/brianc/node-postgres/blob/master/packages/pg-protocol/src/parser.ts) — поля `DatabaseError` (`code`, `constraint`, `detail`, `table`, `schema`, ...).
- [`pg-protocol` messages.ts](https://github.com/brianc/node-postgres/blob/master/packages/pg-protocol/src/messages.ts) — класс `DatabaseError`.
