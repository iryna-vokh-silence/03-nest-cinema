import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ApiObjectIdParam } from '../common/swagger/api-object-id-param.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';

/**
 * Bookings of a single showing. Lives in the bookings module so that
 * ShowingsModule never needs to depend on BookingsModule.
 */
@ApiTags('bookings')
@Controller('showings/:id/bookings')
export class ShowingBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Book seats for a showing (all-or-nothing)',
    description:
      'One updateOne() of the showing document: its filter requires every ' +
      'requested seat to be free ($elemMatch with bookingId: null), the update ' +
      'sets seats[].bookingId (arrayFilters) and pushes the booking. If any seat ' +
      'is taken, matchedCount is 0, nothing changes and the answer is 409. ' +
      'Hall bounds and duplicate seats are checked before the update (400).',
  })
  @ApiObjectIdParam('Showing id')
  @ApiCreatedResponse({
    type: BookingResponseDto,
    description: 'Booking created',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'id is not an ObjectId, seats empty or an item without both numbers, non-positive/non-integer numbers, duplicate seat, or seat outside the hall',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Showing not found',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'At least one seat is already booked; nothing is booked',
  })
  create(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.create(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List bookings of a showing (its bookings array)' })
  @ApiObjectIdParam('Showing id')
  @ApiOkResponse({ type: BookingResponseDto, isArray: true })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not an ObjectId (24 hex characters)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Showing not found',
  })
  findByShowing(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<BookingResponseDto[]> {
    return this.bookingsService.findByShowing(id);
  }
}
