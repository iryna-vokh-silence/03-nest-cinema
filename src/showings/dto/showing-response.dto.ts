import { ApiProperty } from '@nestjs/swagger';
import { OBJECT_ID_EXAMPLE } from '../../common/object-id';

/** Fields a showing response is built from (after populate of film and hall). */
export interface ShowingResponseSource {
  id: string;
  filmTitle: string;
  hallName: string;
  startsAt: Date;
  price: number;
}

/**
 * Public shape of a showing: the film title and hall name (expanded with
 * populate) instead of references. The `seats` and `bookings` arrays of the
 * document are never part of this response.
 */
export class ShowingResponseDto {
  @ApiProperty({
    example: OBJECT_ID_EXAMPLE,
    description: 'ObjectId as a 24-character hex string',
  })
  id: string;

  @ApiProperty({ example: 'Interstellar' })
  filmTitle: string;

  @ApiProperty({ example: 'Red Hall' })
  hallName: string;

  @ApiProperty({
    example: '2030-01-15T18:00:00.000Z',
    description: 'ISO 8601, normalized to UTC',
  })
  startsAt: string;

  @ApiProperty({
    type: 'integer',
    example: 15000,
    description: 'Price per seat in kopecks',
  })
  price: number;

  static from(source: ShowingResponseSource): ShowingResponseDto {
    const dto = new ShowingResponseDto();
    dto.id = source.id;
    dto.filmTitle = source.filmTitle;
    dto.hallName = source.hallName;
    dto.startsAt = source.startsAt.toISOString();
    dto.price = source.price;
    return dto;
  }
}
