import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsInt,
  IsISO8601,
  IsMongoId,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { MAX_PRICE_KOPECKS } from '../../common/limits';
import {
  OBJECT_ID_EXAMPLE,
  OBJECT_ID_FORMAT,
  objectIdMessage,
} from '../../common/object-id';

/** Full date-time with an explicit time zone (Z or ±HH:MM). */
const ISO_DATE_TIME_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// Decorators run bottom-up; with stopAtFirstError only the first failure
// is reported.
export class CreateShowingDto {
  @ApiProperty({
    example: OBJECT_ID_EXAMPLE,
    pattern: '^[0-9a-fA-F]{24}$',
    description: `Film id, ${OBJECT_ID_FORMAT}; the film must exist (400 otherwise)`,
  })
  @IsMongoId({ message: objectIdMessage('filmId') })
  @IsDefined()
  filmId: string;

  @ApiProperty({
    example: '6650f1a2b3c4d5e6f7a8b9c1',
    pattern: '^[0-9a-fA-F]{24}$',
    description: `Hall id, ${OBJECT_ID_FORMAT}; the hall must exist (400 otherwise)`,
  })
  @IsMongoId({ message: objectIdMessage('hallId') })
  @IsDefined()
  hallId: string;

  @ApiProperty({
    example: '2030-01-15T18:00:00.000Z',
    description:
      'ISO 8601 date-time with time zone (Z or ±HH:MM); must be in the future',
  })
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'startsAt must be a valid ISO 8601 date-time' },
  )
  @Matches(ISO_DATE_TIME_WITH_ZONE, {
    message:
      'startsAt must be a full ISO 8601 date-time with time zone, e.g. 2030-01-15T18:00:00.000Z',
  })
  @IsDefined()
  startsAt: string;

  @ApiProperty({
    type: 'integer',
    example: 15000,
    minimum: 1,
    maximum: MAX_PRICE_KOPECKS,
    description: 'Price per seat in kopecks (positive integer)',
  })
  @Max(MAX_PRICE_KOPECKS, {
    message: `price must not exceed ${MAX_PRICE_KOPECKS} kopecks`,
  })
  @Min(1, { message: 'price must be a positive integer (kopecks)' })
  @IsInt({ message: 'price must be an integer number of kopecks' })
  @IsDefined()
  price: number;
}
