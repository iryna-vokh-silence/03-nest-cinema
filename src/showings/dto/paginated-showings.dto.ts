import { ApiProperty } from '@nestjs/swagger';
import { ShowingResponseDto } from './showing-response.dto';

/** Response of GET /showings: one page of showings plus paging info. */
export class PaginatedShowingsDto {
  @ApiProperty({
    type: ShowingResponseDto,
    isArray: true,
    description: 'Showings of the current page',
  })
  items: ShowingResponseDto[];

  @ApiProperty({
    type: 'integer',
    example: 42,
    description: 'Number of showings that match the filters (all pages)',
  })
  total: number;

  @ApiProperty({ type: 'integer', example: 1, description: 'Current page' })
  page: number;

  @ApiProperty({ type: 'integer', example: 20, description: 'Page size' })
  limit: number;
}
