import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { MAX_PRICE_KOPECKS } from '../../common/limits';
import { integerValidator } from '../../common/schema-validators';
import { Film } from '../../films/schemas/film.schema';
import { Hall } from '../../halls/schemas/hall.schema';
import { Booking, BookingSchema } from './booking.schema';
import { ShowingSeat, ShowingSeatSchema } from './showing-seat.schema';

/**
 * Collection `showings`: a showing together with its seats and bookings.
 *
 * `film` and `hall` are references (ObjectId + ref) and are expanded with
 * populate() where the response needs the film title or hall name.
 * `seats` and `bookings` are embedded: a booking changes both arrays, and an
 * update of ONE document is atomic in MongoDB, so no transaction is needed.
 * Both arrays are bounded by the size of the hall (≤ 50 × 50 seats).
 */
@Schema({ collection: 'showings', versionKey: false })
export class Showing {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Film.name, required: true })
  film: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Hall.name,
    required: true,
    index: true,
  })
  hall: Types.ObjectId;

  @Prop({ required: true })
  startsAt: Date;

  /** Price of one seat in kopecks (125 UAH = 12500). */
  @Prop({
    required: true,
    min: 1,
    max: MAX_PRICE_KOPECKS,
    validate: integerValidator,
  })
  price: number;

  /** Every seat of the hall; filled when the showing is created. */
  @Prop({ type: [ShowingSeatSchema], default: [] })
  seats: ShowingSeat[];

  @Prop({ type: [BookingSchema], default: [] })
  bookings: Booking[];
}

export type ShowingDocument = HydratedDocument<Showing>;
export const ShowingSchema = SchemaFactory.createForClass(Showing);

// GET /showings: sort by start time with _id as the tie-breaker.
ShowingSchema.index(
  { startsAt: 1, _id: 1 },
  { name: 'IDX_showings_starts_at' },
);
// GET /showings?filmId=...&date=... and the "film has showings" check.
ShowingSchema.index(
  { film: 1, startsAt: 1 },
  { name: 'IDX_showings_film_starts_at' },
);
// DELETE /bookings/:id finds the showing by the embedded booking id.
ShowingSchema.index({ 'bookings._id': 1 }, { name: 'IDX_showings_booking_id' });
