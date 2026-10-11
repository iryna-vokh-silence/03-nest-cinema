import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isObjectIdString, objectIdMessage } from '../object-id';

/**
 * Checks a route parameter BEFORE the request reaches the database:
 * anything that is not a 24-character hex string gives 400 with an
 * explanation of the expected format. The value is returned in lower case
 * (the canonical text form of an ObjectId).
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown, metadata: ArgumentMetadata): string {
    if (!isObjectIdString(value)) {
      throw new BadRequestException(objectIdMessage(metadata.data ?? 'id'));
    }
    return value.toLowerCase();
  }
}
