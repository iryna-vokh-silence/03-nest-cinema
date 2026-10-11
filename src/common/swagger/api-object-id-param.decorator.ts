import { applyDecorators } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { OBJECT_ID_EXAMPLE, OBJECT_ID_FORMAT } from '../object-id';

/** Documents a path parameter that must be an ObjectId (400 otherwise). */
export function ApiObjectIdParam(
  description: string,
  name = 'id',
): MethodDecorator {
  return applyDecorators(
    ApiParam({
      name,
      description: `${description}. Must be ${OBJECT_ID_FORMAT}; any other value gives 400 before the database is queried.`,
      schema: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        example: OBJECT_ID_EXAMPLE,
      },
    }),
  );
}
