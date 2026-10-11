import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  MAX_HALL_NAME_LENGTH,
  MAX_ROWS,
  MAX_SEATS_PER_ROW,
} from '../../common/limits';
import { integerValidator } from '../../common/schema-validators';

/**
 * Comparison rules of the unique index on `name`: strength 2 ignores letter
 * case, so "Red Hall" and "red hall" are the same name (the rule from HW1).
 * Queries that look a hall up by name use the same collation and the index.
 */
export const HALL_NAME_COLLATION = { locale: 'en', strength: 2 } as const;

/**
 * Collection `halls`. The seat list is NOT stored: the service computes it
 * from rows × seatsPerRow.
 */
@Schema({ collection: 'halls', versionKey: false })
export class Hall {
  /** Unique index UQ_halls_name (case-insensitive, see HALL_NAME_COLLATION). */
  @Prop({
    required: true,
    trim: true,
    maxlength: MAX_HALL_NAME_LENGTH,
    index: {
      unique: true,
      name: 'UQ_halls_name',
      collation: HALL_NAME_COLLATION,
    },
  })
  name: string;

  @Prop({ required: true, min: 1, max: MAX_ROWS, validate: integerValidator })
  rows: number;

  @Prop({
    required: true,
    min: 1,
    max: MAX_SEATS_PER_ROW,
    validate: integerValidator,
  })
  seatsPerRow: number;
}

export type HallDocument = HydratedDocument<Hall>;
export const HallSchema = SchemaFactory.createForClass(Hall);
