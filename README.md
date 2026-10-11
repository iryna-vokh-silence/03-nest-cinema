# 03-nest-cinema — REST API кінотеатру на NestJS + MongoDB (ДЗ 3)

**Студентка:** Вох Ірина (Iryna Vokh)

REST API для кінотеатру: фільми, зали, сеанси та бронювання місць.
Це той самий сервіс, що й у ДЗ 2, перенесений з PostgreSQL + TypeORM на **MongoDB + Mongoose**
(документна гілка проєкту, з неї виросте ДЗ 5 з GraphQL).
Зовнішня поведінка маршрутів не змінилася; змінилися спосіб зберігання даних, формат
ідентифікаторів (ObjectId замість UUID) і спосіб захисту від подвійного бронювання.

Що змінилося порівняно з ДЗ 2:

- MongoDB у Docker Compose, підключення через `MongooseModule.forRootAsync`,
  рядок підключення `MONGODB_URI` читається через `ConfigModule` з валідацією;
- три колекції — `films`, `halls`, `showings`; таблиці `bookings` і `booking_seats` зникли:
  **місця й бронювання вкладені в документ сеансу**;
- бронювання — **одне оновлення документа** (`updateOne` з умовою «всі місця вільні»),
  транзакція не потрібна; скасування — теж одне оновлення;
- зовнішніх ключів немає, тому «на фільм/залу посилається сеанс» перевіряє сервіс запитом;
- ідентифікатори — ObjectId; некоректний формат → 400 ще до звернення до бази,
  у відповідях `id` завжди рядок;
- міграції TypeORM прибрано (індекси описані в схемах і створюються Mongoose).

## Стек

- Node.js 20+ (перевірено на Node 22), TypeScript, NestJS 11
- MongoDB 7 (Docker Compose; потрібна версія 4.2+), Mongoose 8 + `@nestjs/mongoose`
- `@nestjs/config` + `class-validator` — конфігурація з валідацією
- `class-validator` / `class-transformer` — валідація DTO; `@nestjs/swagger` — документація
- Jest + Supertest — e2e-тести на справжній MongoDB; ESLint + Prettier

## Запуск

```bash
# 1. Встановити залежності
npm install

# 2. Створити .env (приклад нижче)
cp .env.example .env

# 3. Підняти MongoDB через Docker Compose
docker compose up -d

# 4. (необов'язково) Засіяти базу даними для перевірки
npm run seed

# 5. Запустити в режимі розробки
npm run start:dev
```

API: <http://localhost:3000>, Swagger UI: <http://localhost:3000/docs>

Колекції та індекси створює сам застосунок під час старту (Mongoose `autoIndex` +
`Model.init()` у сервісах), тому окремий крок міграцій не потрібен.

### Файл `.env`

Зразок — `.env.example`:

```env
# HTTP port of the API
PORT=3000

# MongoDB connection string with the database name (required).
# docker-compose.yml publishes MongoDB on localhost:27017.
MONGODB_URI=mongodb://localhost:27017/cinema

# Database for e2e tests; it is dropped by the tests (optional, this is the default)
MONGODB_TEST_URI=mongodb://localhost:27017/cinema_test

# Host port of the MongoDB container (optional, used by docker-compose.yml)
MONGO_PORT=27017
```

| Змінна | Обов'язкова | Опис |
|---|---|---|
| `PORT` | ні (3000) | порт HTTP-сервера |
| `MONGODB_URI` | **так** | рядок підключення до MongoDB **з назвою бази** (`mongodb://…/cinema` або `mongodb+srv://…/cinema`) |
| `MONGODB_TEST_URI` | ні (`mongodb://localhost:27017/cinema_test`) | окрема база для e2e-тестів (її видаляють тести) |
| `MONGO_PORT` | ні (27017) | порт, на якому Docker Compose публікує MongoDB |

Змінні описані класом `EnvironmentVariables` (`src/config/env.validation.ts`) з декораторами
`class-validator`. `ConfigModule.forRoot({ validate })` перевіряє їх під час старту:
якщо `MONGODB_URI` бракує або це не рядок підключення MongoDB з назвою бази,
**застосунок не стартує** й пише, що саме не так. `MongooseModule.forRootAsync` бере URI
через `ConfigService`, а не через `process.env`.

### Усі команди

```bash
docker compose up -d          # підняти MongoDB
docker compose down           # зупинити (дані лишаються в томі mongodata)
docker compose down -v        # зупинити й видалити дані

npm run seed                  # засіяти базу (повторний запуск не створює дублікатів)
npm run start:dev             # режим розробки
npm run build                 # збірка в dist/
npm run start:prod            # запуск зібраної версії

npm test                      # unit-тести
npm run test:e2e              # e2e-тести (потрібна запущена MongoDB)
npm run lint                  # ESLint
npx prettier --check src test
```

## Модель даних

| Колекція | Поля | Схема |
|---|---|---|
| `films` | `_id`, `title`, `durationMinutes`, `releaseYear` | усі поля `required`; ціле додатне `durationMinutes` |
| `halls` | `_id`, `name`, `rows`, `seatsPerRow` | усі поля `required`; **унікальний індекс `UQ_halls_name`** на `name` (без урахування регістру — collation `{ locale: 'en', strength: 2 }`) |
| `showings` | `_id`, `film` → films, `hall` → halls, `startsAt`, `price` (копійки), `seats[]`, `bookings[]` | `film`, `hall` — `ObjectId` з `ref`, обов'язкові; індекси `{ startsAt, _id }`, `{ film, startsAt }`, `{ hall }`, `{ 'bookings._id' }` |

Вкладені документи сеансу описані **окремими класами зі своїми схемами**
(`src/showings/schemas`):

- `ShowingSeat` — елемент `seats`: `{ row, seat, bookingId }`, `bookingId = null` — місце вільне;
- `Booking` — елемент `bookings`: `{ _id, seats: BookedSeat[], totalPrice, createdAt }`;
- `BookedSeat` — місце всередині бронювання: `{ row, seat }`.

Кожна колекція — клас з `@Schema()` і `@Prop()`, модель створює `SchemaFactory.createForClass`,
а підключається вона у feature-модулі через `MongooseModule.forFeature`
(`FilmsModule`, `HallsModule`, `ShowingsModule`, `BookingsModule`). Сервіси працюють лише
через моделі (`@InjectModel`), без прямих звернень до драйвера.

Місця зали в документі зали не зберігаються — сервіс обчислює їх з `rows × seatsPerRow`
(зала 3 × 5 → 15 місць). Під час створення сеансу цей перелік копіюється в масив `seats`
сеансу (кожне місце з `bookingId: null`), а `bookings` створюється порожнім.

Ціни — цілі числа в копійках (125 грн = `12500`): дробові числа округлюють проміжні результати,
тож гроші ними не рахують. Ділення на 100 — справа клієнта.

### Чому місця й бронювання лежать усередині документа сеансу

- **Неподільність.** У MongoDB оновлення **одного** документа неподільне саме по собі.
  Зміна кількох документів однією операцією вимагає транзакції, а транзакція — replica set.
  Бронювання — це дві дії: позначити місця зайнятими й зберегти запис бронювання.
  Якби місця й бронювання були окремими колекціями, знадобилася б транзакція (і replica set навіть
  локально). Оскільки обидва масиви лежать у сеансі, обидві дії виконує **один `updateOne`** —
  або все, або нічого.
- **Читання одним запитом.** Карта місць сеансу (`GET /showings/:id/seats`) і бронювання сеансу —
  це просто поля одного документа, без `$lookup` чи кількох запитів.
- **Межа застосовності.** Вкладати можна, коли кількість елементів обмежена. Місць у залі —
  до 50 × 50 = 2500 (ліміт валідації), бронювань на сеанс не більше, ніж місць, тож документ
  не росте безмежно й далекий від ліміту MongoDB у 16 МБ. Якби бронювання накопичувалися
  роками без обмеження, вкладення не підійшло б.
- **Посилання там, де дані незалежні.** Фільми й зали живуть самостійно й використовуються
  багатьма сеансами, тому сеанс зберігає на них лише `ObjectId` (`ref`), а назви фільму й зали
  у відповідь підставляє `populate`.

Перелік місць у бронюванні (`bookings[].seats`) дублює те, що видно з `seats` — так бронювання
можна віддати без перебору всіх місць зали. **Джерело істини про зайнятість — `seats`.**

## Маршрути

| Метод | Шлях | Відповіді |
|---|---|---|
| POST | `/films` | 201 · 400 |
| GET | `/films` | 200 масив (за назвою) |
| GET | `/films/:id` | 200 · 400 · 404 |
| PATCH | `/films/:id` | 200 · 400 · 404 |
| DELETE | `/films/:id` | 204 · 400 · 404 · **409, якщо на фільм посилається хоча б один сеанс** |
| POST | `/halls` | 201 · 400 · 409 (назва вже існує, без урахування регістру) |
| GET | `/halls` | 200 масив (за назвою) |
| GET | `/halls/:id` | 200 зала + `seats` · 400 · 404 |
| DELETE | `/halls/:id` | 204 · 400 · 404 · **409, якщо є сеанси в цій залі** |
| POST | `/showings` | 201 · 400 (формат id, фільм/зала не знайдені, дата, ціна) |
| GET | `/showings` | 200 `{ items, total, page, limit }` · 400 |
| GET | `/showings/:id` | 200 · 400 · 404 |
| GET | `/showings/:id/seats` | 200 `[{ row, seat, isBooked }]` · 400 · 404 |
| POST | `/showings/:id/bookings` | 201 · 400 · 404 · 409 (місце зайняте, документ не змінено) |
| GET | `/showings/:id/bookings` | 200 · 400 · 404 |
| GET | `/bookings` | 200 масив (з усіх сеансів) |
| DELETE | `/bookings/:id` | 204 (місця звільняються) · 400 · 404 |

Тіла відповідей ті самі, що в ДЗ 2: сеанс — `{ id, filmTitle, hallName, startsAt, price }`
(масиви `seats` і `bookings` не повертаються ніколи), бронювання —
`{ id, showingId, seats: [{ row, seat }], totalPrice, createdAt }`.

### Ідентифікатори

- Ідентифікатор — ObjectId: рядок із **24 шістнадцяткових символів** (напр. `6650f1a2b3c4d5e6f7a8b9c0`).
- Параметр маршруту `:id` перевіряє `ParseObjectIdPipe` (`src/common/pipes`), поля `filmId`/`hallId`
  у тілі та фільтр `?filmId=` — `@IsMongoId()` у DTO. Перевірка відбувається **до звернення до бази**;
  некоректний формат → 400 з поясненням:
  `id must be a MongoDB ObjectId: a 24-character hexadecimal string (e.g. 6650f1a2b3c4d5e6f7a8b9c0)`.
  `Types.ObjectId.isValid()` навмисно не використовується — він приймає будь-який рядок із 12 символів.
- Коректний за формою id неіснуючого документа → 404 (у тілі `POST /showings` — 400, бо це помилка запиту).
- Документи перетворюються на відповідь класами DTO (`FilmResponseDto.fromDocument`,
  `HallResponseDto`, `ShowingResponseDto`, `BookingResponseDto`): `_id` віддається як рядкове `id`,
  внутрішнє представлення ObjectId у тіло відповіді не потрапляє.

### `GET /showings` — фільтри, сортування, сторінки

| Параметр | За замовчуванням | Опис / помилка 400 |
|---|---|---|
| `filmId` | — | ObjectId фільму |
| `date` | — | `YYYY-MM-DD`, сеанси, що починаються цієї доби (UTC) |
| `page` | `1` | ціле ≥ 1 |
| `limit` | `20` | ціле від 1 до 100 |
| `sort` | `asc` | `asc` або `desc` — порядок за часом початку |

Сеанси з однаковим часом початку впорядковані за `_id` (за зростанням), тому сторінки стабільні.
Відповідь: `{ "items": [...], "total": 42, "page": 1, "limit": 20 }`, де `total` — кількість усіх
сеансів, що відповідають фільтрам. Фільтрація, сортування й обмеження виконуються **запитом до бази**:
`find(filter).sort({ startsAt, _id }).skip().limit()` з проєкцією без `seats`/`bookings` та
`populate('film', 'title')`, `populate('hall', 'name')`; `total` рахує `countDocuments(filter)`.
Масив у застосунку не обрізається.

## Бронювання одним оновленням документа

`BookingsService.create` (`src/bookings`):

1. Читає сеанс (лише `price` і `hall`, зала через `populate`) — 404, якщо сеансу немає.
2. **До оновлення** перевіряє межі зали: ряд ≤ `rows`, місце ≤ `seatsPerRow`, обидва числа цілі додатні.
   Фільтр оновлення не розрізняє неіснуюче й зайняте місце, тож без цієї перевірки місце поза
   схемою дало б 409 замість 400.
3. Повтор місця в запиті відсіює DTO (`@ArrayUnique`) — теж до оновлення: дві однакові умови
   `$elemMatch` задовольнило б одне вільне місце, і в `bookings` потрапили б два записи на одне
   крісло й подвійна ціна.
4. Генерує `bookingId = new Types.ObjectId()` і виконує **один** `updateOne`
   (побудова — `src/bookings/booking-update.ts`):

```ts
filter = {
  _id: showingId,
  $and: seats.map((s) => ({
    seats: { $elemMatch: { row: s.row, seat: s.seat, bookingId: null } },
  })),
};
update = {
  $set: { 'seats.$[target].bookingId': bookingId },
  $push: { bookings: { _id: bookingId, seats, totalPrice, createdAt } },
};
options = {
  arrayFilters: [{ $or: seats.map((s) => ({ 'target.row': s.row, 'target.seat': s.seat })) }],
};
```

5. Перевіряє `result.matchedCount`: `0` означає, що хоча б одне місце вже зайняте → **409**,
   документ не змінено (жодне місце не заброньоване). `modifiedCount` для цього не годиться.
   Лише після відмови сервіс читає сеанс, щоб назвати зайняті місця в повідомленні
   (`Seats already booked for this showing: row 1 seat 2`).

Схеми «прочитати документ → перевірити масив у коді → записати» немає: умова про вільні місця
перевіряється тим самим запитом, що їх займає. Два паралельні запити на те саме місце виконуються
послідовно, і другий отримує `matchedCount = 0` (перевірено e2e-тестом із 10 одночасними запитами —
рівно одне 201).

**Скасування** (`DELETE /bookings/:id`) — теж один `updateOne`: сеанс шукається за вкладеним
`bookings._id`, `$set: { 'seats.$[target].bookingId': null }` з `arrayFilters: [{ 'target.bookingId': id }]`
звільняє місця, `$pull` видаляє бронювання з масиву; `matchedCount = 0` → 404.

`GET /bookings` збирає бронювання з усіх сеансів агрегацією (`$unwind: '$bookings'`, сортування
за `createdAt`).

## Видалення фільмів і зал

У MongoDB немає зовнішніх ключів, тож перед видаленням сервіс перевіряє запитом
`showingModel.exists({ film: id })` (або `{ hall: id }`): якщо сеанс є — 409
(`Film with id … cannot be deleted because it has showings`), сеанси ніколи не видаляються разом
із фільмом чи залою.

## Розподіл перевірок

- **DTO + `class-validator`** перевіряють форму вхідних даних (типи, обов'язковість, діапазони,
  формат ObjectId, дубль місця). `ValidationPipe` зареєстрований глобально (`src/app.setup.ts`).
- **Сервіси** перевіряють доменні правила, для яких потрібен стан бази: існування фільму/зали,
  межі зали, зайнятість місць, унікальність назви зали, наявність сеансів перед видаленням.
- **Схеми Mongoose** дублюють обов'язковість і діапазони — це захищає й записи повз API (seed).

## Формат помилок

Глобальний фільтр `AllExceptionsFilter` (`src/common/filters`) приводить усі помилки до одного вигляду
(у Swagger — `ErrorResponseDto`):

```json
{
  "statusCode": 404,
  "message": "Film with id 000000000000000000000000 not found",
  "error": "Not Found",
  "path": "/films/000000000000000000000000",
  "timestamp": "2026-10-11T07:45:05.228Z"
}
```

Для помилок валідації `message` — масив повідомлень. Невідомі помилки → 500
`Internal server error` (деталі лише в лозі сервера).

## Swagger

<http://localhost:3000/docs> (JSON — `/docs-json`). Для кожного маршруту описані коди відповідей,
для кожного параметра `:id` — формат ObjectId (`pattern: ^[0-9a-fA-F]{24}$`, приклад), для полів
`filmId`/`hallId` і фільтра `filmId` — теж.

## Засівання бази

```bash
npm run seed
```

`src/seed.ts` додає 2 фільми, 2 зали, 4 сеанси в різні дати (15–18.01.2030, з масивами `seats`
за схемою зали) та одне бронювання (2 місця). Працює на порожній базі: спершу створює колекції
та індекси. Кожен документ записується через `findOneAndUpdate(…, { $setOnInsert }, { upsert: true })`
за природним ключем (назва+рік фільму, назва зали, фільм+зала+час), а бронювання — тим самим
умовним оновленням, що й API: якщо місця вже зайняті, воно нічого не змінює. Тому повторний запуск
не створює дублікатів.

## Тести

```bash
docker compose up -d
npm run test:e2e
npm test
```

e2e-тести працюють зі **справжньою MongoDB** в окремій базі (`MONGODB_TEST_URI`, за замовчуванням
`cinema_test`). Перед запуском `test/global-setup.ts` видаляє цю базу; перед кожним тестом колекції
очищаються. Покрито: усі маршрути й помилки з опису (зокрема 400 на некоректний ObjectId у кожному
маршруті й у `filmId`/`hallId`); пагінацію, сортування, фільтри; вміст документа сеансу після
створення, бронювання, відмови з 409 (документ не змінено) і скасування; 400 (а не 409) для місця
поза залою; 10 одночасних бронювань одного місця (рівно одне 201); відсутність `_id` у відповідях;
опис форматів і кодів у Swagger; індекси (унікальний на назві зали, також при паралельних запитах);
валідацію схем; збереження даних після перезапуску; seed на порожній базі та повторний запуск.
Unit-тести: валідація змінних оточення, `ParseObjectIdPipe`, побудова оновлень бронювання.

## requests.http

`requests.http` у корені виконується **згори донизу** (VS Code, розширення REST Client):
фільм → зала → сеанс → бронювання → решта маршрутів (пагінація, сортування, фільтри) →
кожна помилка з опису маршрутів (400 на некоректний ObjectId для кожного маршруту, 404, 409,
неправильні `page`/`limit`/`sort`/`date`/`filmId`, місце поза залою, дубль місця, зайняте місце,
видалення фільму/зали з сеансами) → скасування бронювання й перевірка, що місця звільнилися.
Ідентифікатори підставляються зі змінних (`@filmId = {{createFilm.response.body.id}}`),
біля кожного запиту є `# Expected: <код>`. Перед запуском потрібні `docker compose up -d`
і `npm run start:dev`.

## Структура

```
docker-compose.yml                        # MongoDB 7
src/
  main.ts, app.module.ts, app.setup.ts    # bootstrap, ConfigModule, MongooseModule.forRootAsync, ValidationPipe, Swagger
  config/env.validation.ts                # клас змінних оточення + validateEnv
  seed.ts                                 # npm run seed
  common/                                 # фільтр винятків, ParseObjectIdPipe, ErrorResponseDto, Seat, межі, валідатори
  films/   halls/                         # модуль = контролер + сервіс + dto/ + schemas/
  showings/schemas/                       # Showing + вкладені ShowingSeat, Booking, BookedSeat
  bookings/                               # бронювання (працює з моделлю Showing), booking-update.ts
test/
  app.e2e-spec.ts                         # маршрути, документна модель, конкурентність, індекси
  seed.e2e-spec.ts                        # seed на порожній базі й повторний запуск
  global-setup.ts, test-env.ts, db-utils.ts
requests.http
```

Модулі не мають циклічних залежностей: `showings` використовує `FilmsService`/`HallsService`,
`bookings` працює з моделлю `Showing`; `FilmsModule` і `HallsModule` підключають модель `Showing`
лише для перевірки «є сеанси» перед видаленням.
