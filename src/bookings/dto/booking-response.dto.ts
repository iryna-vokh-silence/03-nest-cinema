import { ApiProperty } from '@nestjs/swagger';
import { OBJECT_ID_EXAMPLE } from '../../common/object-id';
import { Seat } from '../../common/seat';
import { Booking } from '../../showings/schemas/booking.schema';

/**
 * Booking as returned by the API. Bookings are stored inside the showing
 * document, so `showingId` is the _id of that document.
 */
export class BookingResponseDto {
  @ApiProperty({
    example: '6650f1a2b3c4d5e6f7a8b9c3',
    description: 'ObjectId of the booking as a 24-character hex string',
  })
  id: string;

  @ApiProperty({
    example: OBJECT_ID_EXAMPLE,
    description: 'Id of the showing that contains the booking',
  })
  showingId: string;

  @ApiProperty({ type: Seat, isArray: true })
  seats: Seat[];

  @ApiProperty({
    type: 'integer',
    example: 30000,
    description: 'Showing price × number of seats, in kopecks',
  })
  totalPrice: number;

  @ApiProperty({ example: '2030-01-10T12:00:00.000Z' })
  createdAt: string;

  static fromBooking(
    showingId: { toString(): string },
    booking: Booking,
  ): BookingResponseDto {
    const dto = new BookingResponseDto();
    dto.id = booking._id.toString();
    dto.showingId = showingId.toString();
    dto.seats = booking.seats.map((s) => ({ row: s.row, seat: s.seat }));
    dto.totalPrice = booking.totalPrice;
    dto.createdAt = new Date(booking.createdAt).toISOString();
    return dto;
  }
}
