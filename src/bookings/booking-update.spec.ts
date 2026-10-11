import { Types } from 'mongoose';
import {
  buildBookSeatsUpdate,
  buildCancelBookingUpdate,
} from './booking-update';

describe('booking updates', () => {
  const showingId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const createdAt = new Date('2030-01-01T00:00:00.000Z');

  it('requires every requested seat to be free and books them in one update', () => {
    const { filter, update, options } = buildBookSeatsUpdate({
      showingId,
      bookingId,
      seats: [
        { row: 2, seat: 1 },
        { row: 1, seat: 3 },
      ],
      totalPrice: 30000,
      createdAt,
    });
    expect(filter).toEqual({
      _id: showingId,
      $and: [
        { seats: { $elemMatch: { row: 1, seat: 3, bookingId: null } } },
        { seats: { $elemMatch: { row: 2, seat: 1, bookingId: null } } },
      ],
    });
    expect(update).toEqual({
      $set: { 'seats.$[target].bookingId': bookingId },
      $push: {
        bookings: {
          _id: bookingId,
          seats: [
            { row: 1, seat: 3 },
            { row: 2, seat: 1 },
          ],
          totalPrice: 30000,
          createdAt,
        },
      },
    });
    expect(options).toEqual({
      arrayFilters: [
        {
          $or: [
            { 'target.row': 1, 'target.seat': 3 },
            { 'target.row': 2, 'target.seat': 1 },
          ],
        },
      ],
    });
  });

  it('cancels by the embedded booking id: frees seats and pulls the booking', () => {
    expect(buildCancelBookingUpdate(bookingId)).toEqual({
      filter: { 'bookings._id': bookingId },
      update: {
        $set: { 'seats.$[target].bookingId': null },
        $pull: { bookings: { _id: bookingId } },
      },
      options: { arrayFilters: [{ 'target.bookingId': bookingId }] },
    });
  });
});
