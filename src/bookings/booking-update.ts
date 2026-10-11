import { Types } from 'mongoose';
import { Seat } from '../common/seat';

/**
 * The single updateOne() that books seats of a showing.
 *
 * filter:  the showing, and — for EVERY requested seat — an element of
 *          `seats` with that row/seat whose bookingId is still null
 *          ($and of $elemMatch). If any seat is taken, nothing matches.
 * update:  $set bookingId on the requested elements of `seats`
 *          (positional $[target] + arrayFilters) and $push the booking into
 *          `bookings`. Both happen in one atomic document update, or not at all.
 *
 * Shared by BookingsService and the seed script.
 */
export function buildBookSeatsUpdate(params: {
  showingId: Types.ObjectId | string;
  bookingId: Types.ObjectId;
  seats: Seat[];
  totalPrice: number;
  createdAt?: Date;
}) {
  const { showingId, bookingId, seats, totalPrice } = params;
  // Stored ordered by row, then seat (the request order is irrelevant).
  const ordered = [...seats]
    .map((s) => ({ row: s.row, seat: s.seat }))
    .sort((a, b) => a.row - b.row || a.seat - b.seat);

  const filter = {
    _id: showingId,
    $and: ordered.map((s) => ({
      seats: { $elemMatch: { row: s.row, seat: s.seat, bookingId: null } },
    })),
  };
  const update = {
    $set: { 'seats.$[target].bookingId': bookingId },
    $push: {
      bookings: {
        _id: bookingId,
        seats: ordered,
        totalPrice,
        createdAt: params.createdAt ?? new Date(),
      },
    },
  };
  const options = {
    arrayFilters: [
      {
        $or: ordered.map((s) => ({
          'target.row': s.row,
          'target.seat': s.seat,
        })),
      },
    ],
  };
  return { filter, update, options };
}

/**
 * The single updateOne() that cancels a booking: the showing is found by the
 * embedded booking id, its seats get bookingId = null again and the booking
 * is removed from `bookings` ($pull) — atomically.
 */
export function buildCancelBookingUpdate(bookingId: Types.ObjectId) {
  return {
    filter: { 'bookings._id': bookingId },
    update: {
      $set: { 'seats.$[target].bookingId': null },
      $pull: { bookings: { _id: bookingId } },
    },
    options: { arrayFilters: [{ 'target.bookingId': bookingId }] },
  };
}
