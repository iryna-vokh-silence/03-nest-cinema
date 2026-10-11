import { ApiProperty } from '@nestjs/swagger';
import { OBJECT_ID_EXAMPLE } from '../../common/object-id';
import { WithId } from '../../common/schema-validators';
import { Seat } from '../../common/seat';
import { Hall } from '../schemas/hall.schema';

/** Hall as returned by the API: `_id` becomes the string `id`. */
export class HallResponseDto {
  @ApiProperty({
    example: OBJECT_ID_EXAMPLE,
    description: 'ObjectId as a 24-character hex string',
  })
  id: string;

  @ApiProperty({ example: 'Red Hall' })
  name: string;

  @ApiProperty({ type: 'integer', example: 3, minimum: 1 })
  rows: number;

  @ApiProperty({ type: 'integer', example: 5, minimum: 1 })
  seatsPerRow: number;

  static fromDocument(hall: WithId<Hall>): HallResponseDto {
    const dto = new HallResponseDto();
    dto.id = hall._id.toString();
    dto.name = hall.name;
    dto.rows = hall.rows;
    dto.seatsPerRow = hall.seatsPerRow;
    return dto;
  }
}

/** GET /halls/:id: the hall plus its computed seat list. */
export class HallWithSeatsDto extends HallResponseDto {
  @ApiProperty({
    type: Seat,
    isArray: true,
    description:
      'All seats of the hall (rows × seatsPerRow), 1-based; computed, not stored',
  })
  seats: Seat[];

  static fromHall(hall: WithId<Hall>, seats: Seat[]): HallWithSeatsDto {
    const dto = Object.assign(
      new HallWithSeatsDto(),
      HallResponseDto.fromDocument(hall),
    );
    dto.seats = seats;
    return dto;
  }
}
