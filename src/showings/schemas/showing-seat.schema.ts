import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { integerValidator } from '../../common/schema-validators';

/**
 * One seat of the hall inside a showing document (element of `seats`).
 * `bookingId` is null while the seat is free; otherwise it is the _id of the
 * element of `bookings` that took the seat. This array is the source of
 * truth about occupancy.
 */
@Schema({ _id: false, versionKey: false })
export class ShowingSeat {
  @Prop({ required: true, min: 1, validate: integerValidator })
  row: number;

  @Prop({ required: true, min: 1, validate: integerValidator })
  seat: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  bookingId: Types.ObjectId | null;
}

export const ShowingSeatSchema = SchemaFactory.createForClass(ShowingSeat);
