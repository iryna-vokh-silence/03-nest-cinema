import { ApiProperty } from '@nestjs/swagger';

/** Shape of every error response (produced by AllExceptionsFilter). */
export class ErrorResponseDto {
  @ApiProperty({ type: 'integer', example: 404 })
  statusCode: number;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: 'Film with id ... not found' },
      { type: 'array', items: { type: 'string' } },
    ],
    description:
      'A single message, or a list of validation messages for 400 errors',
  })
  message: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error: string;

  @ApiProperty({
    example: '/films/6650f1a2b3c4d5e6f7a8b9c0',
    description: 'Path of the request (with query string)',
  })
  path: string;

  @ApiProperty({ example: '2030-01-15T18:00:00.000Z' })
  timestamp: string;
}
