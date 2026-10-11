import { ApiProperty } from '@nestjs/swagger';
import { OBJECT_ID_EXAMPLE } from '../../common/object-id';
import { WithId } from '../../common/schema-validators';
import { Film } from '../schemas/film.schema';

/** Film as returned by the API: `_id` becomes the string `id`. */
export class FilmResponseDto {
  @ApiProperty({
    example: OBJECT_ID_EXAMPLE,
    description: 'ObjectId as a 24-character hex string',
  })
  id: string;

  @ApiProperty({ example: 'Interstellar' })
  title: string;

  @ApiProperty({ type: 'integer', example: 169, minimum: 1 })
  durationMinutes: number;

  @ApiProperty({ type: 'integer', example: 2014 })
  releaseYear: number;

  static fromDocument(film: WithId<Film>): FilmResponseDto {
    const dto = new FilmResponseDto();
    dto.id = film._id.toString();
    dto.title = film.title;
    dto.durationMinutes = film.durationMinutes;
    dto.releaseYear = film.releaseYear;
    return dto;
  }
}
