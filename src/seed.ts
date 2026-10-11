import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from './app.module';
import { buildBookSeatsUpdate } from './bookings/booking-update';
import { WithId } from './common/schema-validators';
import { Film } from './films/schemas/film.schema';
import { computeSeats } from './halls/hall-seats';
import { Hall, HALL_NAME_COLLATION } from './halls/schemas/hall.schema';
import { Showing } from './showings/schemas/showing.schema';

/**
 * Seed data for manual checks: 2 films, 2 halls, 4 showings on different
 * dates and 1 booking.
 *
 * Run with `npm run seed` (MongoDB from docker compose must be running).
 * Works on an empty database and is idempotent: every document is upserted
 * by its natural key (film title + year, hall name, film + hall + start
 * time), and the booking is made with the same conditional update as the
 * API, which matches nothing when its seats are already taken. A repeated
 * run therefore creates no duplicates.
 */
const FILMS = [
  { title: 'Interstellar', durationMinutes: 169, releaseYear: 2014 },
  { title: 'Dune: Part Two', durationMinutes: 166, releaseYear: 2024 },
];

const HALLS = [
  { name: 'Red Hall', rows: 5, seatsPerRow: 8 },
  { name: 'Blue Hall', rows: 3, seatsPerRow: 5 },
];

/** film/hall are indexes in FILMS/HALLS; prices are in kopecks. */
const SHOWINGS = [
  { film: 0, hall: 0, startsAt: '2030-01-15T18:00:00.000Z', price: 15000 },
  { film: 1, hall: 1, startsAt: '2030-01-16T19:30:00.000Z', price: 18000 },
  { film: 0, hall: 1, startsAt: '2030-01-17T12:00:00.000Z', price: 12000 },
  { film: 1, hall: 0, startsAt: '2030-01-18T21:00:00.000Z', price: 20000 },
];

/** One booking of two seats for the first showing. */
const BOOKING = {
  showing: 0,
  seats: [
    { row: 1, seat: 1 },
    { row: 1, seat: 2 },
  ],
};

export interface SeedModels {
  film: Model<Film>;
  hall: Model<Hall>;
  showing: Model<Showing>;
}

export interface SeedResult {
  films: number;
  halls: number;
  showings: number;
  bookings: number;
  /** false if the booking already existed (repeated run). */
  bookingCreated: boolean;
}

const UPSERT = { upsert: true, new: true, runValidators: true } as const;

/** Seeds the database behind the given models. */
export async function seed(models: SeedModels): Promise<SeedResult> {
  // Make sure the collections and indexes (unique hall name) exist,
  // also when the database was dropped while the application was running.
  await Promise.all([
    models.film.createIndexes(),
    models.hall.createIndexes(),
    models.showing.createIndexes(),
  ]);

  const films: WithId<Film>[] = [];
  for (const data of FILMS) {
    films.push(
      await models.film
        .findOneAndUpdate(
          { title: data.title, releaseYear: data.releaseYear },
          { $setOnInsert: data },
          UPSERT,
        )
        .lean<WithId<Film>>()
        .orFail(),
    );
  }

  const halls: WithId<Hall>[] = [];
  for (const data of HALLS) {
    halls.push(
      await models.hall
        .findOneAndUpdate({ name: data.name }, { $setOnInsert: data }, UPSERT)
        .collation(HALL_NAME_COLLATION)
        .lean<WithId<Hall>>()
        .orFail(),
    );
  }

  const showings: WithId<Showing>[] = [];
  for (const data of SHOWINGS) {
    const hall = halls[data.hall];
    showings.push(
      await models.showing
        .findOneAndUpdate(
          {
            film: films[data.film]._id,
            hall: hall._id,
            startsAt: new Date(data.startsAt),
          },
          {
            $setOnInsert: {
              price: data.price,
              seats: computeSeats(hall).map((s) => ({ ...s, bookingId: null })),
              bookings: [],
            },
          },
          UPSERT,
        )
        .lean<WithId<Showing>>()
        .orFail(),
    );
  }

  const showing = showings[BOOKING.showing];
  const { filter, update, options } = buildBookSeatsUpdate({
    showingId: showing._id,
    bookingId: new Types.ObjectId(),
    seats: BOOKING.seats,
    totalPrice: showing.price * BOOKING.seats.length,
  });
  const booked = await models.showing.updateOne(filter, update, options);

  const [bookingCount] = await models.showing.aggregate<{ total: number }>([
    { $group: { _id: null, total: { $sum: { $size: '$bookings' } } } },
  ]);

  return {
    films: await models.film.countDocuments(),
    halls: await models.hall.countDocuments(),
    showings: await models.showing.countDocuments(),
    bookings: bookingCount?.total ?? 0,
    bookingCreated: booked.matchedCount === 1,
  };
}

async function main(): Promise<void> {
  // The application context validates the environment and connects exactly
  // like the API does (MONGODB_URI from .env).
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await seed({
      film: app.get<Model<Film>>(getModelToken(Film.name)),
      hall: app.get<Model<Hall>>(getModelToken(Hall.name)),
      showing: app.get<Model<Showing>>(getModelToken(Showing.name)),
    });
    console.log(
      `Seed complete. Documents in the database: ${result.films} films, ` +
        `${result.halls} halls, ${result.showings} showings, ` +
        `${result.bookings} bookings` +
        (result.bookingCreated ? '.' : ' (the seed booking already existed).'),
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
