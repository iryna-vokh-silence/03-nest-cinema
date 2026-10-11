import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Shared application configuration. Used by main.ts and by e2e tests,
 * so the tests run against exactly the same validation setup.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      // One message per invalid property, e.g. a missing field reports only
      // "x should not be null or undefined" instead of every failing rule.
      stopAtFirstError: true,
    }),
  );
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Cinema API')
    .setDescription(
      'Films, halls, showings and seat bookings. Data is stored in MongoDB ' +
        '(Mongoose): collections films, halls and showings; the seats and ' +
        'bookings of a showing are embedded in the showing document. ' +
        'Every id is a MongoDB ObjectId written as a 24-character hex string; ' +
        'a malformed id gives 400, an unknown one 404. Every error response ' +
        'has the shape { statusCode, message, error, path, timestamp }.',
    )
    .setVersion('3.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
