import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { integerValidator } from '../../common/schema-validators';
import { BookedSeat, BookedSeatSchema } from './booked-seat.schema';

/**
 * A booking, embedded in the showing document (element of `bookings`).
 * _id is generated in code before the update, because the same value is
 * written to `seats[].bookingId` by the same update.
 * `seats` duplicates what `showing.seats` already says, so a booking can be
 * returned without scanning every seat of the hall.
 */
@Schema({ versionKey: false })
export class Booking {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({
    type: [BookedSeatSchema],
    required: true,
    validate: {
      validator: (seats: BookedSeat[]): boolean => seats.length > 0,
      message: 'a booking must contain at least one seat',
    },
  })
  seats: BookedSeat[];

  /** Showing price × number of seats, in kopecks. */
  @Prop({ required: true, min: 1, validate: integerValidator })
  totalPrice: number;

  @Prop({ required: true, default: () => new Date() })
  createdAt: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
