import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ApiObjectIdParam } from '../common/swagger/api-object-id-param.decorator';
import { BookingsService } from './bookings.service';
import { BookingResponseDto } from './dto/booking-response.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all bookings',
    description:
      'Bookings are embedded in showing documents; an aggregation ($unwind) collects them from every showing.',
  })
  @ApiOkResponse({ type: BookingResponseDto, isArray: true })
  findAll(): Promise<BookingResponseDto[]> {
    return this.bookingsService.findAll();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel a booking (its seats become free)',
    description:
      'One update of the showing that contains the booking: seats[].bookingId is set back to null and the booking is $pull-ed from bookings.',
  })
  @ApiObjectIdParam('Booking id')
  @ApiNoContentResponse({ description: 'Booking cancelled' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not an ObjectId (24 hex characters)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No showing contains a booking with this id',
  })
  remove(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    return this.bookingsService.remove(id);
  }
}
