import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/app.setup';
import { clearAll } from './db-utils';

/** Valid ObjectId format, but no document has it. */
const MISSING_ID = '000000000000000000000000';
const OBJECT_ID = /^[0-9a-f]{24}$/;
const FUTURE = '2030-01-15T18:00:00.000Z';
const PAST = '2020-01-01T10:00:00.000Z';

interface IdBody {
  id: string;
}
interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}
interface RawShowing {
  _id: Types.ObjectId;
  film: Types.ObjectId;
  hall: Types.ObjectId;
  startsAt: Date;
  price: number;
  seats: { row: number; seat: number; bookingId: Types.ObjectId | null }[];
  bookings: {
    _id: Types.ObjectId;
    seats: { row: number; seat: number }[];
    totalPrice: number;
    createdAt: Date;
  }[];
}
interface ShowingsPage {
  items: IdBody[];
  total: number;
  page: number;
  limit: number;
}

/** Joins validation messages (array) or a single message into one string. */
function messageOf(body: unknown): string {
  const { message } = body as ErrorBody;
  return Array.isArray(message) ? message.join('; ') : message;
}

/** Creates the application exactly like main.ts does (without listen). */
async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  setupSwagger(app);
  // A real port: parallel supertest requests then share one server.
  await app.listen(0);
  return app;
}

describe('Cinema API (e2e, MongoDB)', () => {
  let app: INestApplication<App>;
  let http: App;
  let db: Connection;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    db = app.get<Connection>(getConnectionToken());
  });

  // Every test starts with empty collections (the indexes stay).
  beforeEach(async () => {
    await clearAll(db);
  });

  afterAll(async () => {
    await app.close();
  });

  function count(collection: string): Promise<number> {
    return db.collection(collection).countDocuments();
  }

  /** The raw showing document as stored in MongoDB. */
  async function rawShowing(id: string): Promise<RawShowing> {
    const doc = await db
      .collection('showings')
      .findOne({ _id: new Types.ObjectId(id) });
    if (!doc) throw new Error(`showing ${id} is not in the database`);
    return doc as unknown as RawShowing;
  }

  function bookedSeats(showing: RawShowing): string[] {
    return showing.seats
      .filter((s) => s.bookingId !== null)
      .map((s) => `${s.row}:${s.seat}=${s.bookingId!.toString()}`);
  }

  // ---------- helpers ----------

  async function createFilm(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(http)
      .post('/films')
      .send({
        title: 'Interstellar',
        durationMinutes: 169,
        releaseYear: 2014,
        ...overrides,
      })
      .expect(201);
    return (res.body as IdBody).id;
  }

  async function createHall(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(http)
      .post('/halls')
      .send({ name: 'Red Hall', rows: 3, seatsPerRow: 5, ...overrides })
      .expect(201);
    return (res.body as IdBody).id;
  }

  async function createShowing(
    filmId: string,
    hallId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(http)
      .post('/showings')
      .send({ filmId, hallId, startsAt: FUTURE, price: 15000, ...overrides })
      .expect(201);
    return (res.body as IdBody).id;
  }

  async function setupShowing(): Promise<{
    filmId: string;
    hallId: string;
    showingId: string;
  }> {
    const filmId = await createFilm();
    const hallId = await createHall();
    const showingId = await createShowing(filmId, hallId);
    return { filmId, hallId, showingId };
  }

  // ---------- general ----------

  it('strips unknown properties (whitelist)', async () => {
    const res = await request(http)
      .post('/films')
      .send({
        title: 'Dune',
        durationMinutes: 155,
        releaseYear: 2021,
        isAdmin: true,
        id: 'hacked',
      })
      .expect(201);
    expect(res.body).not.toHaveProperty('isAdmin');
    expect((res.body as IdBody).id).not.toBe('hacked');
    expect(Object.keys(res.body as object).sort()).toEqual([
      'durationMinutes',
      'id',
      'releaseYear',
      'title',
    ]);
    expect((res.body as IdBody).id).toMatch(OBJECT_ID);
  });

  it('serves the Swagger document at /docs-json', async () => {
    const res = await request(http).get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<string, Record<string, { tags: string[] }>>;
      components: {
        schemas: Record<
          string,
          { properties: Record<string, { type?: string; maximum?: number }> }
        >;
      };
    };
    expect(doc.paths['/showings/{id}/seats'].get.tags).toEqual(['showings']);
    const { schemas } = doc.components;
    expect(schemas.ErrorResponseDto).toBeDefined();
    expect(schemas.CreateHallDto.properties.rows).toMatchObject({
      type: 'integer',
      maximum: 50,
    });
    expect(schemas.CreateShowingDto.properties.price.type).toBe('integer');
    expect(schemas.Seat.properties.row.type).toBe('integer');
    expect(schemas.BookingResponseDto.properties.totalPrice.type).toBe(
      'integer',
    );
    expect(Object.keys(schemas.ErrorResponseDto.properties)).toEqual(
      expect.arrayContaining(['statusCode', 'message', 'path']),
    );
    expect(Object.keys(schemas.PaginatedShowingsDto.properties).sort()).toEqual(
      ['items', 'limit', 'page', 'total'],
    );
  });

  it('documents the paging query parameters of GET /showings', async () => {
    const res = await request(http).get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters: { name: string; in: string }[];
            responses: Record<string, { content?: unknown }>;
          }
        >
      >;
    };
    const op = doc.paths['/showings'].get;
    const names = op.parameters
      .filter((p) => p.in === 'query')
      .map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(['filmId', 'date', 'page', 'limit', 'sort']),
    );
    expect(JSON.stringify(op.responses['200'])).toContain(
      'PaginatedShowingsDto',
    );
  });

  it('documents the ObjectId format and the response codes of every route', async () => {
    const res = await request(http).get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters?: {
              name: string;
              in: string;
              schema?: { pattern?: string };
            }[];
            responses: Record<string, unknown>;
          }
        >
      >;
    };
    const expected: [string, string, string[]][] = [
      ['/films', 'post', ['201', '400']],
      ['/films', 'get', ['200']],
      ['/films/{id}', 'get', ['200', '400', '404']],
      ['/films/{id}', 'patch', ['200', '400', '404']],
      ['/films/{id}', 'delete', ['204', '400', '404', '409']],
      ['/halls', 'post', ['201', '400', '409']],
      ['/halls', 'get', ['200']],
      ['/halls/{id}', 'get', ['200', '400', '404']],
      ['/halls/{id}', 'delete', ['204', '400', '404', '409']],
      ['/showings', 'post', ['201', '400']],
      ['/showings', 'get', ['200', '400']],
      ['/showings/{id}', 'get', ['200', '400', '404']],
      ['/showings/{id}/seats', 'get', ['200', '400', '404']],
      ['/showings/{id}/bookings', 'post', ['201', '400', '404', '409']],
      ['/showings/{id}/bookings', 'get', ['200', '400', '404']],
      ['/bookings', 'get', ['200']],
      ['/bookings/{id}', 'delete', ['204', '400', '404']],
    ];
    for (const [path, method, codes] of expected) {
      const op = doc.paths[path][method];
      expect({ path, method, codes: Object.keys(op.responses).sort() }).toEqual(
        { path, method, codes },
      );
      if (path.includes('{id}')) {
        const id = op.parameters?.find((p) => p.name === 'id');
        expect({ path, pattern: id?.schema?.pattern }).toEqual({
          path,
          pattern: '^[0-9a-fA-F]{24}$',
        });
      }
    }
  });

  it('returns 400 with the expected format for a malformed :id on every route', async () => {
    const bad = [
      'abc',
      '123',
      'aaaaaaaaaaaa', // 12 characters: ObjectId.isValid() would accept it
      '6650f1a2b3c4d5e6f7a8b9cz',
      '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f7a8b9c',
    ];
    for (const id of bad) {
      const requests = [
        request(http).get(`/films/${id}`),
        request(http).patch(`/films/${id}`).send({ title: 'X' }),
        request(http).delete(`/films/${id}`),
        request(http).get(`/halls/${id}`),
        request(http).delete(`/halls/${id}`),
        request(http).get(`/showings/${id}`),
        request(http).get(`/showings/${id}/seats`),
        request(http).get(`/showings/${id}/bookings`),
        request(http)
          .post(`/showings/${id}/bookings`)
          .send({ seats: [{ row: 1, seat: 1 }] }),
        request(http).delete(`/bookings/${id}`),
      ];
      for (const res of await Promise.all(requests)) {
        expect({ id, status: res.status }).toEqual({ id, status: 400 });
        expect(messageOf(res.body)).toBe(
          'id must be a MongoDB ObjectId: a 24-character hexadecimal string (e.g. 6650f1a2b3c4d5e6f7a8b9c0)',
        );
      }
    }
  });

  it('accepts upper-case hex ids', async () => {
    const id = await createFilm();
    await request(http).get(`/films/${id.toUpperCase()}`).expect(200);
  });

  it('returns string ids and never exposes _id or ObjectId internals', async () => {
    const { showingId } = await setupShowing();
    const booking = await request(http)
      .post(`/showings/${showingId}/bookings`)
      .send({ seats: [{ row: 1, seat: 1 }] })
      .expect(201);
    const bodies: unknown[] = [
      (await request(http).get('/films')).body,
      (await request(http).get('/halls')).body,
      (await request(http).get('/showings')).body,
      (await request(http).get(`/showings/${showingId}`)).body,
      (await request(http).get('/bookings')).body,
      (await request(http).get(`/showings/${showingId}/bookings`)).body,
      booking.body,
    ];
    for (const body of bodies) {
      const json = JSON.stringify(body);
      expect(json).not.toContain('_id');
      expect(json).not.toContain('buffer');
      expect(json).not.toContain('$oid');
    }
    const b = booking.body as { id: string; showingId: string };
    expect(b.id).toMatch(OBJECT_ID);
    expect(b.showingId).toBe(showingId);
    expect(showingId).toMatch(OBJECT_ID);
  });

  // ---------- films ----------

  describe('films', () => {
    it('POST /films creates a film (201)', async () => {
      const res = await request(http)
        .post('/films')
        .send({
          title: 'Interstellar',
          durationMinutes: 169,
          releaseYear: 2014,
        })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        title: 'Interstellar',
        durationMinutes: 169,
        releaseYear: 2014,
      });
    });

    it('POST /films returns 400 for missing fields', async () => {
      const res = await request(http)
        .post('/films')
        .send({ title: 'Only title' })
        .expect(400);
      expect(messageOf(res.body)).toContain('durationMinutes');
      expect(messageOf(res.body)).toContain('releaseYear');
    });

    it('POST /films returns 400 for wrong types and ranges', async () => {
      await request(http)
        .post('/films')
        .send({ title: 42, durationMinutes: 100, releaseYear: 2000 })
        .expect(400);
      await request(http)
        .post('/films')
        .send({ title: 'A', durationMinutes: '100', releaseYear: 2000 })
        .expect(400);
      await request(http)
        .post('/films')
        .send({ title: 'A', durationMinutes: 0, releaseYear: 2000 })
        .expect(400);
      await request(http)
        .post('/films')
        .send({ title: 'A', durationMinutes: 90.5, releaseYear: 2000 })
        .expect(400);
      await request(http)
        .post('/films')
        .send({ title: 'A', durationMinutes: 90, releaseYear: 1999.5 })
        .expect(400);
    });

    it('GET /films returns an array', async () => {
      await request(http).get('/films').expect(200).expect([]);
      await createFilm();
      await createFilm({ title: 'Dune' });
      const res = await request(http).get('/films').expect(200);
      expect(res.body).toHaveLength(2);
    });

    it('GET /films/:id returns the film or 404', async () => {
      const id = await createFilm();
      const res = await request(http).get(`/films/${id}`).expect(200);
      expect(res.body).toMatchObject({ id, title: 'Interstellar' });
      await request(http).get(`/films/${MISSING_ID}`).expect(404);
    });

    it('PATCH /films/:id updates any subset', async () => {
      const id = await createFilm();
      const res = await request(http)
        .patch(`/films/${id}`)
        .send({ title: 'Interstellar (IMAX)' })
        .expect(200);
      expect(res.body).toEqual({
        id,
        title: 'Interstellar (IMAX)',
        durationMinutes: 169,
        releaseYear: 2014,
      });
      await request(http)
        .patch(`/films/${id}`)
        .send({ durationMinutes: 170, releaseYear: 2015 })
        .expect(200)
        .expect((r) =>
          expect(r.body).toMatchObject({
            durationMinutes: 170,
            releaseYear: 2015,
          }),
        );
    });

    it('PATCH /films/:id returns 400 for invalid values and 404 for missing', async () => {
      const id = await createFilm();
      await request(http)
        .patch(`/films/${id}`)
        .send({ durationMinutes: -5 })
        .expect(400);
      await request(http)
        .patch(`/films/${id}`)
        .send({ title: null })
        .expect(400);
      await request(http)
        .patch(`/films/${MISSING_ID}`)
        .send({ title: 'X' })
        .expect(404);
    });

    it('DELETE /films/:id returns 204, then 404', async () => {
      const id = await createFilm();
      const res = await request(http).delete(`/films/${id}`).expect(204);
      expect(res.text).toBe('');
      await request(http).get(`/films/${id}`).expect(404);
      await request(http).delete(`/films/${id}`).expect(404);
    });

    it('DELETE /films/:id returns 409 when a showing references the film', async () => {
      const { filmId } = await setupShowing();
      const res = await request(http).delete(`/films/${filmId}`).expect(409);
      expect(messageOf(res.body)).toContain('showings');
      await request(http).get(`/films/${filmId}`).expect(200);
    });
  });

  // ---------- halls ----------

  describe('halls', () => {
    it('POST /halls creates a hall (201)', async () => {
      const res = await request(http)
        .post('/halls')
        .send({ name: 'Red Hall', rows: 3, seatsPerRow: 5 })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        name: 'Red Hall',
        rows: 3,
        seatsPerRow: 5,
      });
    });

    it('POST /halls returns 400 for missing, wrong type, non-positive', async () => {
      await request(http).post('/halls').send({ name: 'A' }).expect(400);
      await request(http)
        .post('/halls')
        .send({ name: 'A', rows: '3', seatsPerRow: 5 })
        .expect(400);
      await request(http)
        .post('/halls')
        .send({ name: 'A', rows: 0, seatsPerRow: 5 })
        .expect(400);
      await request(http)
        .post('/halls')
        .send({ name: 'A', rows: 3, seatsPerRow: -1 })
        .expect(400);
      await request(http)
        .post('/halls')
        .send({ name: 'A', rows: 2.5, seatsPerRow: 5 })
        .expect(400);
    });

    it('POST /halls returns 409 for a duplicate name', async () => {
      await createHall({ name: 'Red Hall' });
      const res = await request(http)
        .post('/halls')
        .send({ name: 'Red Hall', rows: 1, seatsPerRow: 1 })
        .expect(409);
      expect(messageOf(res.body)).toContain('Red Hall');
      // case-insensitive, surrounding spaces ignored
      await request(http)
        .post('/halls')
        .send({ name: '  red hall ', rows: 1, seatsPerRow: 1 })
        .expect(409);
    });

    it('GET /halls returns an array', async () => {
      await createHall({ name: 'A' });
      await createHall({ name: 'B' });
      const res = await request(http).get('/halls').expect(200);
      expect(res.body).toHaveLength(2);
    });

    it('GET /halls/:id returns 15 seats for 3×5, or 404', async () => {
      const id = await createHall({ rows: 3, seatsPerRow: 5 });
      const res = await request(http).get(`/halls/${id}`).expect(200);
      const body = res.body as {
        seats: { row: number; seat: number }[];
      };
      expect(body).toMatchObject({ id, rows: 3, seatsPerRow: 5 });
      expect(body.seats).toHaveLength(15);
      expect(body.seats[0]).toEqual({ row: 1, seat: 1 });
      expect(body.seats[14]).toEqual({ row: 3, seat: 5 });
      await request(http).get(`/halls/${MISSING_ID}`).expect(404);
    });

    it('DELETE /halls/:id returns 204, then 404', async () => {
      const id = await createHall();
      await request(http).delete(`/halls/${id}`).expect(204);
      await request(http).get(`/halls/${id}`).expect(404);
      await request(http).delete(`/halls/${id}`).expect(404);
    });

    it('DELETE /halls/:id returns 409 when a showing references the hall', async () => {
      const { hallId } = await setupShowing();
      await request(http).delete(`/halls/${hallId}`).expect(409);
      await request(http).get(`/halls/${hallId}`).expect(200);
    });
  });

  // ---------- showings ----------

  describe('showings', () => {
    it('POST /showings creates a showing (201) with title and hall name', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const res = await request(http)
        .post('/showings')
        .send({ filmId, hallId, startsAt: FUTURE, price: 15000 })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        filmTitle: 'Interstellar',
        hallName: 'Red Hall',
        startsAt: FUTURE,
        price: 15000,
      });
    });

    it('POST /showings returns 400 (not 404) naming a missing film or hall', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const r1 = await request(http)
        .post('/showings')
        .send({ filmId: MISSING_ID, hallId, startsAt: FUTURE, price: 100 })
        .expect(400);
      expect(messageOf(r1.body)).toBe(`Film with id ${MISSING_ID} not found`);
      const r2 = await request(http)
        .post('/showings')
        .send({ filmId, hallId: MISSING_ID, startsAt: FUTURE, price: 100 })
        .expect(400);
      expect(messageOf(r2.body)).toBe(`Hall with id ${MISSING_ID} not found`);
    });

    it('POST /showings returns 400 for malformed filmId/hallId before any lookup', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const r1 = await request(http)
        .post('/showings')
        .send({ filmId: 'abc', hallId, startsAt: FUTURE, price: 100 })
        .expect(400);
      expect(messageOf(r1.body)).toContain(
        'filmId must be a MongoDB ObjectId: a 24-character hexadecimal string',
      );
      const r2 = await request(http)
        .post('/showings')
        .send({ filmId, hallId: 42, startsAt: FUTURE, price: 100 })
        .expect(400);
      expect(messageOf(r2.body)).toContain('hallId must be a MongoDB ObjectId');
      expect(await count('showings')).toBe(0);
    });

    it('POST /showings returns 400 for invalid or past startsAt', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      for (const startsAt of [
        'not-a-date',
        '2030-13-01T10:00:00Z',
        '2030-02-30T10:00:00Z',
        '2030-01-15',
        '2030-01-15T18:00:00',
        12345,
      ]) {
        const res = await request(http)
          .post('/showings')
          .send({ filmId, hallId, startsAt, price: 100 })
          .expect(400);
        expect(messageOf(res.body)).toContain('startsAt');
      }
      const past = await request(http)
        .post('/showings')
        .send({ filmId, hallId, startsAt: PAST, price: 100 })
        .expect(400);
      expect(messageOf(past.body)).toBe('startsAt must be in the future');
    });

    it('POST /showings returns 400 for a non-positive or non-integer price', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      for (const price of [0, -100, 99.5, '100']) {
        const res = await request(http)
          .post('/showings')
          .send({ filmId, hallId, startsAt: FUTURE, price })
          .expect(400);
        expect(messageOf(res.body)).toContain('price');
      }
    });

    it('POST /showings normalizes startsAt with offset to UTC', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const res = await request(http)
        .post('/showings')
        .send({
          filmId,
          hallId,
          startsAt: '2030-01-16T01:30:00+03:00',
          price: 100,
        })
        .expect(201);
      expect((res.body as { startsAt: string }).startsAt).toBe(
        '2030-01-15T22:30:00.000Z',
      );
    });

    it('GET /showings sorts by startsAt asc, ties by id', async () => {
      const filmId = await createFilm();
      const hallA = await createHall({ name: 'A' });
      const hallB = await createHall({ name: 'B' });
      const late = await createShowing(filmId, hallA, {
        startsAt: '2030-01-17T10:00:00.000Z',
      });
      const tie1 = await createShowing(filmId, hallA, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const tie2 = await createShowing(filmId, hallB, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const early = await createShowing(filmId, hallB, {
        startsAt: '2030-01-14T10:00:00.000Z',
      });

      const res = await request(http).get('/showings').expect(200);
      const page = res.body as ShowingsPage;
      const ids = page.items.map((s) => s.id);
      const ties = [tie1, tie2].sort();
      expect(ids).toEqual([early, ...ties, late]);
      expect(page).toMatchObject({ total: 4, page: 1, limit: 20 });
      const first = page.items[0] as unknown as Record<string, unknown>;
      expect(first).toEqual({
        id: early,
        filmTitle: 'Interstellar',
        hallName: 'B',
        startsAt: '2030-01-14T10:00:00.000Z',
        price: 15000,
      });
      expect(first).not.toHaveProperty('filmId');
      expect(first).not.toHaveProperty('hallId');
    });

    it('GET /showings filters by filmId and date (AND, UTC date)', async () => {
      const film1 = await createFilm({ title: 'One' });
      const film2 = await createFilm({ title: 'Two' });
      const hallId = await createHall();
      const a = await createShowing(film1, hallId, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const b = await createShowing(film1, hallId, {
        startsAt: '2030-01-16T10:00:00.000Z',
      });
      const c = await createShowing(film2, hallId, {
        startsAt: '2030-01-15T12:00:00.000Z',
      });
      // 23:30 UTC on the 15th, although it is already the 16th in Kyiv
      const d = await createShowing(film2, hallId, {
        startsAt: '2030-01-16T01:30:00+02:00',
      });

      const ids = async (query: string): Promise<string[]> => {
        const res = await request(http).get(`/showings${query}`).expect(200);
        return (res.body as ShowingsPage).items.map((s) => s.id);
      };

      expect(await ids(`?filmId=${film1}`)).toEqual([a, b]);
      expect(await ids('?date=2030-01-15')).toEqual([a, c, d]);
      expect(await ids(`?filmId=${film2}&date=2030-01-15`)).toEqual([c, d]);
      expect(await ids(`?filmId=${film1}&date=2030-01-16`)).toEqual([b]);
      expect(await ids('?date=2031-01-01')).toEqual([]);
      expect(await ids(`?filmId=${MISSING_ID}`)).toEqual([]);
    });

    it('GET /showings returns 400 for a bad date or filmId filter', async () => {
      for (const date of ['15-01-2030', '2030-1-5', '2030-02-30', 'today']) {
        const res = await request(http)
          .get(`/showings?date=${date}`)
          .expect(400);
        expect(messageOf(res.body)).toContain('date');
      }
      const res = await request(http).get('/showings?filmId=abc').expect(400);
      expect(messageOf(res.body)).toContain(
        'filmId must be a MongoDB ObjectId',
      );
    });

    it('GET /showings/:id returns the view or 404', async () => {
      const { showingId } = await setupShowing();
      const res = await request(http).get(`/showings/${showingId}`).expect(200);
      expect(res.body).toEqual({
        id: showingId,
        filmTitle: 'Interstellar',
        hallName: 'Red Hall',
        startsAt: FUTURE,
        price: 15000,
      });
      await request(http).get(`/showings/${MISSING_ID}`).expect(404);
    });

    it('GET /showings/:id/seats returns all hall seats with status, or 404', async () => {
      const { showingId } = await setupShowing();
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 2, seat: 3 }] })
        .expect(201);
      const res = await request(http)
        .get(`/showings/${showingId}/seats`)
        .expect(200);
      const seats = res.body as {
        row: number;
        seat: number;
        isBooked: boolean;
      }[];
      expect(seats).toHaveLength(15);
      expect(seats.filter((s) => s.isBooked)).toEqual([
        { row: 2, seat: 3, isBooked: true },
      ]);
      expect(seats[0]).toEqual({ row: 1, seat: 1, isBooked: false });
      await request(http).get(`/showings/${MISSING_ID}/seats`).expect(404);
    });
  });

  // ---------- trimming, limits and messages ----------

  describe('trimming, limits and validation messages', () => {
    it('trims film titles and rejects whitespace-only titles (create + PATCH)', async () => {
      const created = await request(http)
        .post('/films')
        .send({ title: '  Dune  ', durationMinutes: 155, releaseYear: 2021 })
        .expect(201);
      expect((created.body as { title: string }).title).toBe('Dune');
      const id = (created.body as IdBody).id;

      const blank = await request(http)
        .post('/films')
        .send({ title: '   ', durationMinutes: 155, releaseYear: 2021 })
        .expect(400);
      expect(messageOf(blank.body)).toBe('title should not be empty');

      await request(http)
        .patch(`/films/${id}`)
        .send({ title: ' \t ' })
        .expect(400);
      await request(http)
        .patch(`/films/${id}`)
        .send({ title: '  Dune: Part Two ' })
        .expect(200)
        .expect((r) =>
          expect((r.body as { title: string }).title).toBe('Dune: Part Two'),
        );
    });

    it('trims hall names and rejects whitespace-only names', async () => {
      const res = await request(http)
        .post('/halls')
        .send({ name: '   ', rows: 3, seatsPerRow: 5 })
        .expect(400);
      expect(messageOf(res.body)).toBe('name should not be empty');
      const created = await request(http)
        .post('/halls')
        .send({ name: '  Blue  ', rows: 3, seatsPerRow: 5 })
        .expect(201);
      expect((created.body as { name: string }).name).toBe('Blue');
    });

    it('limits durationMinutes to 1000', async () => {
      await createFilm({ durationMinutes: 1000 });
      const res = await request(http)
        .post('/films')
        .send({ title: 'Long', durationMinutes: 1001, releaseYear: 2000 })
        .expect(400);
      expect(messageOf(res.body)).toBe(
        'durationMinutes must not be greater than 1000',
      );
    });

    it('limits rows and seatsPerRow to 50', async () => {
      const id = await createHall({ name: 'Max', rows: 50, seatsPerRow: 50 });
      const hall = await request(http).get(`/halls/${id}`).expect(200);
      expect((hall.body as { seats: unknown[] }).seats).toHaveLength(2500);

      const res = await request(http)
        .post('/halls')
        .send({ name: 'Huge', rows: 100000, seatsPerRow: 100000 })
        .expect(400);
      expect(messageOf(res.body)).toBe(
        'rows must not be greater than 50; seatsPerRow must not be greater than 50',
      );
      await request(http)
        .post('/halls')
        .send({ name: 'Wide', rows: 1, seatsPerRow: 51 })
        .expect(400);
    });

    it('limits price to 10 000 000 kopecks', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      await createShowing(filmId, hallId, { price: 10_000_000 });
      const res = await request(http)
        .post('/showings')
        .send({ filmId, hallId, startsAt: FUTURE, price: 10_000_001 })
        .expect(400);
      expect(messageOf(res.body)).toBe(
        'price must not exceed 10000000 kopecks',
      );
    });

    it('reports one message per missing field', async () => {
      const res = await request(http).post('/films').send({}).expect(400);
      expect((res.body as ErrorBody).message).toEqual([
        'title should not be null or undefined',
        'durationMinutes should not be null or undefined',
        'releaseYear should not be null or undefined',
      ]);
    });

    it('gives clear messages for malformed seats', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const message = async (body: object): Promise<string> =>
        messageOf((await request(http).post(url).send(body).expect(400)).body);

      expect(await message({})).toBe('seats should not be null or undefined');
      expect(await message({ seats: 'A1' })).toBe(
        'seats must be an array of {row, seat} objects',
      );
      expect(await message({ seats: [] })).toBe(
        'seats must contain at least one seat',
      );
      expect(await message({ seats: [null, null] })).toBe(
        'each seat must be an object {row, seat}',
      );
      expect(await message({ seats: [{ row: 1 }] })).toBe(
        'seats.0.seat should not be null or undefined',
      );
      expect(
        await message({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 1 },
          ],
        }),
      ).toBe('seats must not contain duplicate seats');
    });
  });

  // ---------- bookings ----------

  describe('bookings', () => {
    it('POST /showings/:id/bookings creates a booking with totalPrice', async () => {
      const { showingId } = await setupShowing();
      const res = await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 1, seat: 1, vip: true },
            { row: 1, seat: 2 },
          ],
        })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        showingId,
        seats: [
          { row: 1, seat: 1 },
          { row: 1, seat: 2 },
        ],
        totalPrice: 30000,
        createdAt: expect.any(String) as string,
      });
    });

    it('POST /showings/:id/bookings returns 404 for a missing showing', async () => {
      await request(http)
        .post(`/showings/${MISSING_ID}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(404);
    });

    it('POST /showings/:id/bookings returns 400 for invalid bodies', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;

      const empty = await request(http).post(url).send({ seats: [] });
      expect(empty.status).toBe(400);
      expect(messageOf(empty.body)).toContain('at least one seat');

      await request(http).post(url).send({}).expect(400);
      await request(http).post(url).send({ seats: 'A1' }).expect(400);
      await request(http)
        .post(url)
        .send({ seats: [{ row: 1 }] })
        .expect(400);
      await request(http)
        .post(url)
        .send({ seats: [{ row: '1', seat: 1 }] })
        .expect(400);
      await request(http)
        .post(url)
        .send({ seats: [{ row: 0, seat: 1 }] })
        .expect(400);
      await request(http)
        .post(url)
        .send({ seats: [{ row: 1, seat: -2 }] })
        .expect(400);
      await request(http)
        .post(url)
        .send({ seats: [{ row: 1, seat: 1.5 }] })
        .expect(400);
      await request(http)
        .post(url)
        .send({ seats: [null] })
        .expect(400);

      const dup = await request(http)
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(400);
      expect(messageOf(dup.body)).toContain('duplicate');

      const outRow = await request(http)
        .post(url)
        .send({ seats: [{ row: 4, seat: 1 }] })
        .expect(400);
      expect(messageOf(outRow.body)).toContain('outside hall');
      const outSeat = await request(http)
        .post(url)
        .send({ seats: [{ row: 1, seat: 6 }] })
        .expect(400);
      expect(messageOf(outSeat.body)).toContain('row 1 seat 6');

      // nothing was booked by any of the failing requests
      await request(http)
        .get(`/showings/${showingId}/bookings`)
        .expect(200, []);
    });

    it('is all-or-nothing: 409 if any seat is taken, nothing is booked', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      await request(http)
        .post(url)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);

      const res = await request(http)
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 2 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(409);
      expect(messageOf(res.body)).toContain('row 1 seat 1');

      const seats = await request(http)
        .get(`/showings/${showingId}/seats`)
        .expect(200);
      const booked = (seats.body as { isBooked: boolean }[]).filter(
        (s) => s.isBooked,
      );
      expect(booked).toHaveLength(1); // row 1 seat 2 stayed free
      const list = await request(http).get(url).expect(200);
      expect(list.body).toHaveLength(1);

      // a seat outside the hall in the same request also books nothing
      await request(http)
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 2 },
            { row: 9, seat: 9 },
          ],
        })
        .expect(400);
      await request(http)
        .get(url)
        .expect(200)
        .expect((r) => expect(r.body).toHaveLength(1));
    });

    it('same seat can be booked for different showings', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const other = await createShowing(filmId, hallId, {
        startsAt: '2030-01-16T18:00:00.000Z',
      });
      const body = { seats: [{ row: 1, seat: 1 }] };
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send(body)
        .expect(201);
      await request(http)
        .post(`/showings/${other}/bookings`)
        .send(body)
        .expect(201);
    });

    it('GET /showings/:id/bookings lists bookings of a showing, or 404', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const other = await createShowing(filmId, hallId, {
        startsAt: '2030-01-16T18:00:00.000Z',
      });
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);
      await request(http)
        .post(`/showings/${other}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);
      const res = await request(http)
        .get(`/showings/${showingId}/bookings`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Record<string, unknown>[])[0]).toMatchObject({
        showingId,
      });
      await request(http).get(`/showings/${MISSING_ID}/bookings`).expect(404);
    });

    it('GET /bookings lists all bookings', async () => {
      await request(http).get('/bookings').expect(200, []);
      const { showingId } = await setupShowing();
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);
      const res = await request(http).get('/bookings').expect(200);
      expect(res.body).toHaveLength(1);
    });

    it('DELETE /bookings/:id frees seats (204), then 404', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const created = await request(http)
        .post(url)
        .send({
          seats: [
            { row: 3, seat: 4 },
            { row: 3, seat: 5 },
          ],
        })
        .expect(201);
      const bookingId = (created.body as IdBody).id;

      await request(http)
        .post(url)
        .send({ seats: [{ row: 3, seat: 5 }] })
        .expect(409);

      const del = await request(http)
        .delete(`/bookings/${bookingId}`)
        .expect(204);
      expect(del.text).toBe('');

      const seats = await request(http)
        .get(`/showings/${showingId}/seats`)
        .expect(200);
      expect(
        (seats.body as { isBooked: boolean }[]).every((s) => !s.isBooked),
      ).toBe(true);
      await request(http)
        .post(url)
        .send({ seats: [{ row: 3, seat: 5 }] })
        .expect(201);

      await request(http).delete(`/bookings/${bookingId}`).expect(404);
      await request(http).delete(`/bookings/${MISSING_ID}`).expect(404);
    });
  });

  // ---------- HW2: unified error format ----------

  describe('global exception filter', () => {
    it('returns { statusCode, message, error, path, timestamp } for every error', async () => {
      const cases: [() => request.Test, number, string][] = [
        [
          () => request(http).get(`/films/${MISSING_ID}`),
          404,
          `/films/${MISSING_ID}`,
        ],
        [() => request(http).get('/films/abc'), 400, '/films/abc'],
        [() => request(http).post('/films').send({}), 400, '/films'],
        [
          () => request(http).get('/showings?limit=0'),
          400,
          '/showings?limit=0',
        ],
        [() => request(http).get('/nope'), 404, '/nope'],
      ];
      for (const [send, status, path] of cases) {
        const res = await send().expect(status);
        const body = res.body as ErrorBody;
        expect(Object.keys(body).sort()).toEqual([
          'error',
          'message',
          'path',
          'statusCode',
          'timestamp',
        ]);
        expect(body.statusCode).toBe(status);
        expect(body.path).toBe(path);
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      }
    });
  });

  // ---------- HW2: pagination, filtering and sorting in the database ----------

  describe('GET /showings pagination', () => {
    async function createMany(n: number): Promise<string[]> {
      const filmId = await createFilm();
      const hallId = await createHall();
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const day = String(10 + i).padStart(2, '0');
        ids.push(
          await createShowing(filmId, hallId, {
            startsAt: `2030-03-${day}T18:00:00.000Z`,
          }),
        );
      }
      return ids;
    }

    async function getPage(query: string): Promise<ShowingsPage> {
      const res = await request(http).get(`/showings${query}`).expect(200);
      return res.body as ShowingsPage;
    }

    it('defaults to page=1, limit=20, sort=asc and returns items/total/page/limit', async () => {
      await request(http)
        .get('/showings')
        .expect(200, { items: [], total: 0, page: 1, limit: 20 });
      const ids = await createMany(3);
      const page = await getPage('');
      expect(page).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(page.items.map((s) => s.id)).toEqual(ids);
    });

    it('splits results into pages; total counts all matching showings', async () => {
      const ids = await createMany(5);
      const p1 = await getPage('?page=1&limit=2');
      const p2 = await getPage('?page=2&limit=2');
      const p3 = await getPage('?page=3&limit=2');
      const p4 = await getPage('?page=4&limit=2');
      expect(p1).toMatchObject({ total: 5, page: 1, limit: 2 });
      expect(p1.items.map((s) => s.id)).toEqual(ids.slice(0, 2));
      expect(p2.items.map((s) => s.id)).toEqual(ids.slice(2, 4));
      expect(p3.items.map((s) => s.id)).toEqual(ids.slice(4));
      expect(p4).toEqual({ items: [], total: 5, page: 4, limit: 2 });
      const max = await getPage('?limit=100');
      expect(max.items).toHaveLength(5);
    });

    it('sorts by start time asc/desc, equal start times by id', async () => {
      const filmId = await createFilm();
      const hallA = await createHall({ name: 'A' });
      const hallB = await createHall({ name: 'B' });
      const early = await createShowing(filmId, hallA, {
        startsAt: '2030-01-14T10:00:00.000Z',
      });
      const tieA = await createShowing(filmId, hallA, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const tieB = await createShowing(filmId, hallB, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const late = await createShowing(filmId, hallB, {
        startsAt: '2030-01-16T10:00:00.000Z',
      });
      const ties = [tieA, tieB].sort();

      const asc = await getPage('?sort=asc');
      expect(asc.items.map((s) => s.id)).toEqual([early, ...ties, late]);
      const desc = await getPage('?sort=desc');
      expect(desc.items.map((s) => s.id)).toEqual([late, ...ties, early]);
      // paging is stable for equal start times
      const descPage2 = await getPage('?sort=desc&limit=2&page=2');
      expect(descPage2.items.map((s) => s.id)).toEqual([ties[1], early]);
    });

    it('combines filters with paging: total reflects the filters', async () => {
      const film1 = await createFilm({ title: 'One' });
      const film2 = await createFilm({ title: 'Two' });
      const hallId = await createHall();
      for (const hour of ['10', '12', '14']) {
        await createShowing(film1, hallId, {
          startsAt: `2030-02-01T${hour}:00:00.000Z`,
        });
      }
      await createShowing(film2, hallId, {
        startsAt: '2030-02-01T16:00:00.000Z',
      });
      await createShowing(film1, hallId, {
        startsAt: '2030-02-02T10:00:00.000Z',
      });
      const page = await getPage(
        `?filmId=${film1}&date=2030-02-01&limit=2&page=2&sort=desc`,
      );
      expect(page.total).toBe(3);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        startsAt: '2030-02-01T10:00:00.000Z',
      });
    });

    it('returns 400 for invalid page, limit or sort', async () => {
      const bad = [
        'page=0',
        'page=-1',
        'page=1.5',
        'page=abc',
        'page=',
        'page=1&page=2',
        'limit=0',
        'limit=101',
        'limit=2.5',
        'limit=ten',
        'limit=1e1',
        'sort=up',
        'sort=ASC',
        'sort=',
      ];
      for (const query of bad) {
        const res = await request(http).get(`/showings?${query}`);
        expect({ query, status: res.status }).toEqual({ query, status: 400 });
        const param = query.split('=')[0];
        expect(messageOf(res.body)).toContain(param);
      }
    });
  });

  // ---------- HW3: embedded seats and bookings ----------

  describe('document model: seats and bookings inside the showing', () => {
    it('stores films, halls and showings only (no bookings collections)', async () => {
      await setupShowing();
      const names = (await db.db!.listCollections().toArray())
        .map((c) => c.name)
        .filter((n) => !n.startsWith('system.'))
        .sort();
      expect(names).toEqual(['films', 'halls', 'showings']);
    });

    it('fills seats from the hall when a showing is created; bookings is empty', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const doc = await rawShowing(showingId);
      expect(doc.film.toString()).toBe(filmId);
      expect(doc.hall.toString()).toBe(hallId);
      expect(doc.film).toBeInstanceOf(Types.ObjectId);
      expect(doc.startsAt).toBeInstanceOf(Date);
      expect(doc.price).toBe(15000);
      expect(doc.seats).toHaveLength(15);
      expect(doc.seats[0]).toEqual({ row: 1, seat: 1, bookingId: null });
      expect(doc.seats[14]).toEqual({ row: 3, seat: 5, bookingId: null });
      expect(doc.bookings).toEqual([]);
      // the arrays are not part of any showing response
      const res = await request(http).get(`/showings/${showingId}`).expect(200);
      expect(res.body).not.toHaveProperty('seats');
      expect(res.body).not.toHaveProperty('bookings');
    });

    it('a booking sets bookingId on its seats and adds one element to bookings', async () => {
      const { showingId } = await setupShowing();
      const res = await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 2, seat: 3 },
            { row: 2, seat: 1 },
            { row: 2, seat: 2 },
          ],
        })
        .expect(201);
      const id = (res.body as IdBody).id;
      expect(id).toMatch(OBJECT_ID);

      const doc = await rawShowing(showingId);
      expect(bookedSeats(doc)).toEqual([`2:1=${id}`, `2:2=${id}`, `2:3=${id}`]);
      expect(doc.bookings).toHaveLength(1);
      const [booking] = doc.bookings;
      expect(booking._id.toString()).toBe(id);
      expect(booking.seats).toEqual([
        { row: 2, seat: 1 },
        { row: 2, seat: 2 },
        { row: 2, seat: 3 },
      ]);
      expect(booking.totalPrice).toBe(45000);
      expect(booking.createdAt).toBeInstanceOf(Date);
      expect((res.body as { createdAt: string }).createdAt).toBe(
        booking.createdAt.toISOString(),
      );
    });

    it('409 leaves the document unchanged: no seat of the failed request is taken', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      await request(http)
        .post(url)
        .send({ seats: [{ row: 3, seat: 3 }] })
        .expect(201);
      const before = await rawShowing(showingId);

      // free seats come first in the request, the taken one is last
      const res = await request(http)
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 2 },
            { row: 3, seat: 3 },
          ],
        })
        .expect(409);
      expect((res.body as ErrorBody).message).toBe(
        'Seats already booked for this showing: row 3 seat 3',
      );
      expect(await rawShowing(showingId)).toEqual(before);
    });

    it('a seat outside the hall gives 400 (not 409), even if it is the only problem', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      for (const seat of [
        { row: 4, seat: 1 },
        { row: 1, seat: 6 },
        { row: 99, seat: 99 },
      ]) {
        const res = await request(http)
          .post(url)
          .send({ seats: [seat] })
          .expect(400);
        expect(messageOf(res.body)).toContain('outside hall');
      }
      expect((await rawShowing(showingId)).bookings).toEqual([]);
    });

    it('duplicate seats are rejected before the update: no double booking, no double price', async () => {
      const { showingId } = await setupShowing();
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(400);
      expect((await rawShowing(showingId)).bookings).toEqual([]);
    });

    it('concurrent requests for the same seat: exactly one succeeds, the rest get 409', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          request(http)
            .post(url)
            // every request wants seat 1/1 plus a different free seat
            .send({
              seats: [
                { row: 1, seat: 1 },
                { row: 2 + (i % 2), seat: 1 + Math.floor(i / 2) },
              ],
            }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)]);
      const doc = await rawShowing(showingId);
      expect(doc.bookings).toHaveLength(1);
      expect(bookedSeats(doc)).toHaveLength(2);
    });

    it('concurrent requests with overlapping seats in opposite order: one wins', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const forward = Array.from({ length: 5 }, (_, i) => ({
        row: 1,
        seat: i + 1,
      }));
      const backward = [...forward].reverse();
      const results = await Promise.all(
        [forward, backward, forward, backward].map((seats) =>
          request(http).post(url).send({ seats }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(bookedSeats(await rawShowing(showingId))).toHaveLength(5);
    });

    it('DELETE /bookings/:id frees the seats and removes the booking in one update', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const keep = await request(http)
        .post(url)
        .send({ seats: [{ row: 3, seat: 1 }] })
        .expect(201);
      const created = await request(http)
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 2 },
          ],
        })
        .expect(201);
      expect(bookedSeats(await rawShowing(showingId))).toHaveLength(3);

      await request(http)
        .delete(`/bookings/${(created.body as IdBody).id}`)
        .expect(204);
      const doc = await rawShowing(showingId);
      const keepId = (keep.body as IdBody).id;
      expect(bookedSeats(doc)).toEqual([`3:1=${keepId}`]);
      expect(doc.bookings.map((b) => b._id.toString())).toEqual([keepId]);
      expect(doc.seats).toHaveLength(15);

      await request(http)
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 2 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(201);
    });

    it('lists seats of a stored booking ordered by row and seat', async () => {
      const { showingId } = await setupShowing();
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 2, seat: 5 },
            { row: 1, seat: 3 },
            { row: 2, seat: 1 },
          ],
        })
        .expect(201)
        .expect((r) =>
          // the created booking keeps the request order
          expect((r.body as { seats: unknown[] }).seats).toEqual([
            { row: 2, seat: 5 },
            { row: 1, seat: 3 },
            { row: 2, seat: 1 },
          ]),
        );
      const res = await request(http).get('/bookings').expect(200);
      expect((res.body as { seats: unknown[] }[])[0].seats).toEqual([
        { row: 1, seat: 3 },
        { row: 2, seat: 1 },
        { row: 2, seat: 5 },
      ]);
    });

    it('GET /bookings collects the bookings of every showing', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const other = await createShowing(filmId, hallId, {
        startsAt: '2030-01-16T18:00:00.000Z',
      });
      const ids: string[] = [];
      for (const [showing, seat] of [
        [showingId, 1],
        [other, 1],
        [showingId, 2],
      ] as const) {
        const res = await request(http)
          .post(`/showings/${showing}/bookings`)
          .send({ seats: [{ row: 1, seat }] })
          .expect(201);
        ids.push((res.body as IdBody).id);
      }
      const res = await request(http).get('/bookings').expect(200);
      const list = res.body as { id: string; showingId: string }[];
      expect(list.map((b) => b.id)).toEqual(ids); // ordered by createdAt
      expect(list.map((b) => b.showingId)).toEqual([
        showingId,
        other,
        showingId,
      ]);
    });
  });

  // ---------- HW3: no foreign keys, checks in the services ----------

  describe('delete rules', () => {
    it('a film or hall with showings is not deleted and nothing is cascaded', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);

      const film = await request(http).delete(`/films/${filmId}`).expect(409);
      expect(messageOf(film.body)).toBe(
        `Film with id ${filmId} cannot be deleted because it has showings`,
      );
      const hall = await request(http).delete(`/halls/${hallId}`).expect(409);
      expect(messageOf(hall.body)).toBe(
        `Hall with id ${hallId} cannot be deleted because it has showings`,
      );

      expect(await count('films')).toBe(1);
      expect(await count('halls')).toBe(1);
      expect(await count('showings')).toBe(1);
      expect((await rawShowing(showingId)).bookings).toHaveLength(1);
    });

    it('a film or hall without showings is deleted', async () => {
      const { showingId } = await setupShowing();
      const freeFilm = await createFilm({ title: 'Unused' });
      const freeHall = await createHall({ name: 'Unused' });
      await request(http).delete(`/films/${freeFilm}`).expect(204);
      await request(http).delete(`/halls/${freeHall}`).expect(204);
      expect(await count('films')).toBe(1);
      expect(await count('halls')).toBe(1);
      await request(http).get(`/showings/${showingId}`).expect(200);
    });
  });

  // ---------- HW3: schemas and indexes ----------

  describe('schemas and indexes', () => {
    interface IndexInfo {
      name: string;
      key: Record<string, number>;
      unique?: boolean;
      collation?: { locale: string; strength: number };
    }
    const indexes = async (collection: string): Promise<IndexInfo[]> =>
      (await db.collection(collection).indexes()) as unknown as IndexInfo[];

    it('has a unique (case-insensitive) index on the hall name', async () => {
      const name = (await indexes('halls')).find(
        (i) => i.name === 'UQ_halls_name',
      );
      expect(name).toMatchObject({
        key: { name: 1 },
        unique: true,
        collation: { locale: 'en', strength: 2 },
      });
    });

    it('the database itself rejects a second hall with the same name', async () => {
      await createHall({ name: 'Unique' });
      await expect(
        db
          .collection('halls')
          .insertOne({ name: 'UNIQUE', rows: 1, seatsPerRow: 1 }),
      ).rejects.toMatchObject({ code: 11000 });
      // parallel requests: one 201, the other 409 (not 500)
      const results = await Promise.all(
        ['Twin', 'twin', 'TWIN'].map((name) =>
          request(http).post('/halls').send({ name, rows: 1, seatsPerRow: 1 }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it('has the indexes used by the showing queries', async () => {
      const keys = (await indexes('showings')).map((i) => i.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          { startsAt: 1, _id: 1 },
          { film: 1, startsAt: 1 },
          { hall: 1 },
          { 'bookings._id': 1 },
        ]),
      );
    });

    it('schema validation rejects documents without required fields', async () => {
      const Film = db.model('Film');
      const Showing = db.model('Showing');
      await expect(Film.create({ title: 'No duration' })).rejects.toThrow(
        /durationMinutes.*required/,
      );
      await expect(
        Showing.create({ price: 100, startsAt: new Date() }),
      ).rejects.toThrow(/film.*required|hall.*required/);
      await expect(
        Film.create({ title: 'X', durationMinutes: 1.5, releaseYear: 2000 }),
      ).rejects.toThrow(/integer/);
    });
  });

  // ---------- data lives in MongoDB ----------

  describe('persistence', () => {
    it('keeps data after the application is restarted', async () => {
      const { filmId, showingId } = await setupShowing();
      const booking = await request(http)
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 4 }] })
        .expect(201);

      const second = await createApp();
      try {
        const http2 = second.getHttpServer();
        await request(http2)
          .get(`/films/${filmId}`)
          .expect(200)
          .expect((r) =>
            expect(r.body).toMatchObject({ title: 'Interstellar' }),
          );
        await request(http2)
          .get('/bookings')
          .expect(200)
          .expect((r) => expect(r.body).toEqual([booking.body]));
        await request(http2)
          .post(`/showings/${showingId}/bookings`)
          .send({ seats: [{ row: 1, seat: 4 }] })
          .expect(409);
      } finally {
        await second.close();
      }
    });
  });
});
