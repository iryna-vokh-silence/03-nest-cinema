import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WithId } from '../common/schema-validators';
import { formatSeat, Seat, seatKey } from '../common/seat';
import { isSeatInHall } from '../halls/hall-seats';
import { Hall } from '../halls/schemas/hall.schema';
import { Booking } from '../showings/schemas/booking.schema';
import { Showing } from '../showings/schemas/showing.schema';
import {
  buildBookSeatsUpdate,
  buildCancelBookingUpdate,
} from './booking-update';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

type ShowingForBooking = Pick<WithId<Showing>, '_id' | 'price'> & {
  hall: WithId<Pick<Hall, 'name' | 'rows' | 'seatsPerRow'>> | null;
};

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Showing.name) private readonly showingModel: Model<Showing>,
  ) {}

  /**
   * Every booking of the service. They are embedded in showings, so an
   * aggregation unwinds the `bookings` arrays of all showings into one list.
   */
  async findAll(): Promise<BookingResponseDto[]> {
    const rows = await this.showingModel.aggregate<{
      showingId: Types.ObjectId;
      booking: Booking;
    }>([
      { $match: { 'bookings.0': { $exists: true } } },
      { $unwind: '$bookings' },
      { $sort: { 'bookings.createdAt': 1, 'bookings._id': 1 } },
      { $project: { _id: 0, showingId: '$_id', booking: '$bookings' } },
    ]);
    return rows.map((r) =>
      BookingResponseDto.fromBooking(r.showingId, r.booking),
    );
  }

  /** The `bookings` array of one showing (only that field is read). */
  async findByShowing(showingId: string): Promise<BookingResponseDto[]> {
    const showing = await this.showingModel
      .findById(showingId, { bookings: 1 })
      .lean<Pick<WithId<Showing>, '_id' | 'bookings'>>();
    if (!showing) {
      throw this.showingNotFound(showingId);
    }
    return showing.bookings.map((b) =>
      BookingResponseDto.fromBooking(showing._id, b),
    );
  }

  /**
   * All-or-nothing booking with ONE update of the showing document.
   *
   * Checked BEFORE the update (they need no write and must give 400, not 409):
   *  - the showing exists (404);
   *  - duplicates in the request — rejected by CreateBookingDto (ArrayUnique),
   *    because two equal $elemMatch conditions are satisfied by one free seat;
   *  - every seat is inside the hall — the update filter cannot tell a
   *    missing seat from a taken one.
   *
   * The update itself requires every requested seat to be free. MongoDB
   * applies a single-document update atomically, so of two parallel requests
   * for the same seat only one can match; for the other matchedCount is 0 and
   * the document is unchanged -> 409. No document is read and then written.
   */
  async create(
    showingId: string,
    dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    const showing = await this.showingModel
      .findById(showingId, { price: 1, hall: 1 })
      .populate('hall', 'name rows seatsPerRow')
      .lean<ShowingForBooking>();
    if (!showing) {
      throw this.showingNotFound(showingId);
    }
    const { hall } = showing;
    if (!hall) {
      // Cannot happen through the API: a hall with showings is never deleted.
      throw new NotFoundException(`Hall of showing ${showingId} not found`);
    }

    const outside = dto.seats.filter((s) => !isSeatInHall(hall, s));
    if (outside.length > 0) {
      throw new BadRequestException(
        `Seats outside hall "${hall.name}" (${hall.rows} rows × ${hall.seatsPerRow} seats): ${outside.map(formatSeat).join(', ')}`,
      );
    }

    const bookingId = new Types.ObjectId();
    const createdAt = new Date();
    const totalPrice = showing.price * dto.seats.length;
    const { filter, update, options } = buildBookSeatsUpdate({
      showingId: showing._id,
      bookingId,
      seats: dto.seats,
      totalPrice,
      createdAt,
    });

    const result = await this.showingModel.updateOne(filter, update, options);
    // matchedCount (not modifiedCount): 0 means the filter failed, and since
    // existence, bounds and duplicates were checked above, it can only mean
    // that a requested seat is already booked.
    if (result.matchedCount === 0) {
      throw new ConflictException(
        await this.conflictMessage(showing._id, dto.seats),
      );
    }

    // The response keeps the seat order of the request (as in HW1/HW2).
    return BookingResponseDto.fromBooking(showing._id, {
      _id: bookingId,
      seats: dto.seats.map((s) => ({ row: s.row, seat: s.seat })),
      totalPrice,
      createdAt,
    });
  }

  /**
   * Cancels a booking with ONE update: the showing is found by the embedded
   * booking id, its seats are freed and the booking is $pull-ed.
   */
  async remove(id: string): Promise<void> {
    const { filter, update, options } = buildCancelBookingUpdate(
      new Types.ObjectId(id),
    );
    const result = await this.showingModel.updateOne(filter, update, options);
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }
  }

  /**
   * Names the requested seats that are taken. Read only AFTER the update
   * has already been refused, to build a helpful message.
   */
  private async conflictMessage(
    showingId: Types.ObjectId,
    requested: Seat[],
  ): Promise<string> {
    const showing = await this.showingModel
      .findById(showingId, { seats: 1 })
      .lean<Pick<WithId<Showing>, 'seats'>>();
    const booked = new Set(
      (showing?.seats ?? [])
        .filter((s) => s.bookingId !== null && s.bookingId !== undefined)
        .map((s) => seatKey(s)),
    );
    const taken = requested.filter((s) => booked.has(seatKey(s)));
    return taken.length > 0
      ? `Seats already booked for this showing: ${taken.map(formatSeat).join(', ')}`
      : 'One or more seats are already booked for this showing';
  }

  private showingNotFound(id: string): NotFoundException {
    return new NotFoundException(`Showing with id ${id} not found`);
  }
}
