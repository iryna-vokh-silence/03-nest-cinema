import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Showing, ShowingSchema } from '../showings/schemas/showing.schema';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ShowingBookingsController } from './showing-bookings.controller';

/**
 * Bookings have no collection of their own: they live in `showings.bookings`,
 * so this module works with the Showing model.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Showing.name, schema: ShowingSchema }]),
  ],
  controllers: [BookingsController, ShowingBookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
