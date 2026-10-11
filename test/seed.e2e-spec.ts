import { INestApplicationContext } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Film } from '../src/films/schemas/film.schema';
import { Hall } from '../src/halls/schemas/hall.schema';
import { seed, SeedModels } from '../src/seed';
import { Showing } from '../src/showings/schemas/showing.schema';

describe('Seed script (e2e, MongoDB)', () => {
  let app: INestApplicationContext;
  let models: SeedModels;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = await moduleRef.init();
    models = {
      film: app.get<Model<Film>>(getModelToken(Film.name)),
      hall: app.get<Model<Hall>>(getModelToken(Hall.name)),
      showing: app.get<Model<Showing>>(getModelToken(Showing.name)),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('fills an empty database and creates no duplicates when run again', async () => {
    // an empty database: no collections at all
    await app.get<Connection>(getConnectionToken()).dropDatabase();

    const first = await seed(models);
    expect(first).toEqual({
      films: 2,
      halls: 2,
      showings: 4,
      bookings: 1,
      bookingCreated: true,
    });

    const second = await seed(models);
    expect(second).toEqual({ ...first, bookingCreated: false });

    // four showings on four different dates, with seats filled from the hall
    const showings = await models.showing.find().lean();
    const dates = new Set(
      showings.map((s) => s.startsAt.toISOString().slice(0, 10)),
    );
    expect(dates.size).toBe(4);
    for (const s of showings) {
      const hall = await models.hall.findById(s.hall).lean();
      expect(s.seats).toHaveLength(hall!.rows * hall!.seatsPerRow);
    }
    // the booking took exactly its two seats
    const booked = showings.flatMap((s) =>
      s.seats.filter((seat) => seat.bookingId !== null),
    );
    expect(booked).toHaveLength(2);
    // the unique index on the hall name exists after seeding an empty db
    const indexes = await models.hall.collection.indexes();
    expect(indexes.some((i) => i.name === 'UQ_halls_name' && i.unique)).toBe(
      true,
    );
  });
});
