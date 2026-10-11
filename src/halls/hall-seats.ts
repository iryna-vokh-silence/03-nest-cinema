import { Seat } from '../common/seat';

type HallSize = { rows: number; seatsPerRow: number };

/** All seats of a hall in row-major order, 1-based (3 × 5 -> 15 seats). */
export function computeSeats(hall: HallSize): Seat[] {
  const seats: Seat[] = [];
  for (let row = 1; row <= hall.rows; row++) {
    for (let seat = 1; seat <= hall.seatsPerRow; seat++) {
      seats.push({ row, seat });
    }
  }
  return seats;
}

export function isSeatInHall(hall: HallSize, seat: Seat): boolean {
  return (
    Number.isInteger(seat.row) &&
    Number.isInteger(seat.seat) &&
    seat.row >= 1 &&
    seat.row <= hall.rows &&
    seat.seat >= 1 &&
    seat.seat <= hall.seatsPerRow
  );
}
