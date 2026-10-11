import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { integerValidator } from '../../common/schema-validators';

/** A seat position stored inside a booking (element of `bookings[].seats`). */
@Schema({ _id: false, versionKey: false })
export class BookedSeat {
  @Prop({ required: true, min: 1, validate: integerValidator })
  row: number;

  @Prop({ required: true, min: 1, validate: integerValidator })
  seat: number;
}

export const BookedSeatSchema = SchemaFactory.createForClass(BookedSeat);
