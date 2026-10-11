import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsModule } from './bookings/bookings.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { FilmsModule } from './films/films.module';
import { HallsModule } from './halls/halls.module';
import { ShowingsModule } from './showings/showings.module';

type Env = ConfigService<EnvironmentVariables, true>;

@Module({
  imports: [
    // Reads .env and validates it with EnvironmentVariables: the app does not
    // start if MONGODB_URI is missing or invalid.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: Env) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        // Fail fast at startup instead of waiting 30 s for an unreachable server.
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    FilmsModule,
    HallsModule,
    ShowingsModule,
    BookingsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
