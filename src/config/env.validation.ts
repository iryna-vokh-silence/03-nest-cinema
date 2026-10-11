import { plainToInstance, Transform } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/** "3000" -> 3000; anything that is not a plain integer stays as is (and fails IsInt). */
const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;

const required = { message: '$property is required' };

/** mongodb://host:port/db or mongodb+srv://host/db (with a database name). */
export const MONGODB_URI_REGEX = /^mongodb(\+srv)?:\/\/[^/\s]+\/[^/?\s]+/;

/**
 * Environment variables of the application. Described with the same
 * class-validator decorators as the DTOs and checked once at startup by
 * ConfigModule: if a required variable is missing or invalid, the
 * application does not start.
 */
export class EnvironmentVariables {
  @Max(65535)
  @Min(1)
  @IsInt()
  @IsOptional()
  @Transform(toInt)
  PORT: number = 3000;

  /** Connection string of MongoDB, including the database name. */
  @Matches(MONGODB_URI_REGEX, {
    message:
      'MONGODB_URI must be a MongoDB connection string with a database name, e.g. mongodb://localhost:27017/cinema',
  })
  @IsNotEmpty()
  @IsString()
  @IsDefined(required)
  MONGODB_URI: string;
}

/**
 * Used by ConfigModule.forRoot({ validate }).
 * Decorators run bottom-up and stop at the first failure (presence, type, format).
 * Returns the typed, converted config or throws with every problem listed.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    stopAtFirstError: true,
  });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return validated;
}
