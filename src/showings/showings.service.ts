import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { WithId } from '../common/schema-validators';
import { FilmsService } from '../films/films.service';
import { Film } from '../films/schemas/film.schema';
import { computeSeats } from '../halls/hall-seats';
import { HallsService } from '../halls/halls.service';
import { Hall } from '../halls/schemas/hall.schema';
import { CreateShowingDto } from './dto/create-showing.dto';
import { FindShowingsQueryDto } from './dto/find-showings-query.dto';
import { PaginatedShowingsDto } from './dto/paginated-showings.dto';
import { SeatStatus } from './dto/seat-status.dto';
import { ShowingResponseDto } from './dto/showing-response.dto';
import { Showing } from './schemas/showing.schema';
import { ShowingSeat } from './schemas/showing-seat.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The arrays are never sent with a showing: they are excluded by projection. */
const WITHOUT_ARRAYS = { seats: 0, bookings: 0 } as const;

/** A showing read with populate('film', 'title') and populate('hall', 'name'). */
type PopulatedShowing = Omit<
  WithId<Showing>,
  'film' | 'hall' | 'seats' | 'bookings'
> & {
  film: WithId<Pick<Film, 'title'>> | null;
  hall: WithId<Pick<Hall, 'name'>> | null;
};

@Injectable()
export class ShowingsService implements OnModuleInit {
  constructor(
    @InjectModel(Showing.name) private readonly showingModel: Model<Showing>,
    private readonly filmsService: FilmsService,
    private readonly hallsService: HallsService,
  ) {}

  /** Builds the indexes of the showings collection before serving requests. */
  async onModuleInit(): Promise<void> {
    await this.showingModel.init();
  }

  /**
   * Creates the showing together with its seat map: the hall's rows ×
   * seatsPerRow are expanded into `seats` (every bookingId = null) and
   * `bookings` starts empty.
   */
  async create(dto: CreateShowingDto): Promise<ShowingResponseDto> {
    // The referenced documents come from the request body, so a missing one
    // is a bad request (400), not a missing resource (404).
    const film = await this.filmsService.findById(dto.filmId);
    if (!film) {
      throw new BadRequestException(`Film with id ${dto.filmId} not found`);
    }
    const hall = await this.hallsService.findById(dto.hallId);
    if (!hall) {
      throw new BadRequestException(`Hall with id ${dto.hallId} not found`);
    }
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException(
        'startsAt must be a valid ISO 8601 date-time',
      );
    }
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startsAt must be in the future');
    }

    const seats: ShowingSeat[] = computeSeats(hall).map((s) => ({
      row: s.row,
      seat: s.seat,
      bookingId: null,
    }));
    const showing = await this.showingModel.create({
      film: film._id,
      hall: hall._id,
      startsAt,
      price: dto.price,
      seats,
      bookings: [],
    });

    return ShowingResponseDto.from({
      id: showing._id.toString(),
      filmTitle: film.title,
      hallName: hall.name,
      startsAt: showing.startsAt,
      price: showing.price,
    });
  }

  /**
   * Filtering, sorting and paging are done by MongoDB: find() with
   * sort/skip/limit returns only one page, countDocuments() counts all
   * matches. Filters combine with AND; order: startsAt (asc|desc), then _id.
   */
  async findAll(query: FindShowingsQueryDto): Promise<PaginatedShowingsDto> {
    const { filmId, date, page, limit, sort } = query;

    const filter: FilterQuery<Showing> = {};
    if (filmId) {
      filter.film = new Types.ObjectId(filmId);
    }
    if (date) {
      // The UTC day [date 00:00Z, next day 00:00Z) — an index-friendly range.
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      filter.startsAt = { $gte: dayStart, $lt: dayEnd };
    }

    const [showings, total] = await Promise.all([
      this.showingModel
        .find(filter, WITHOUT_ARRAYS)
        .sort({ startsAt: sort === 'desc' ? -1 : 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('film', 'title')
        .populate('hall', 'name')
        .lean<PopulatedShowing[]>(),
      this.showingModel.countDocuments(filter),
    ]);

    return {
      items: showings.map((s) => this.toResponse(s)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<ShowingResponseDto> {
    const showing = await this.showingModel
      .findById(id, WITHOUT_ARRAYS)
      .populate('film', 'title')
      .populate('hall', 'name')
      .lean<PopulatedShowing>();
    if (!showing) {
      throw this.notFound(id);
    }
    return this.toResponse(showing);
  }

  /**
   * Seat map of a showing. Only the `seats` array is read (projection);
   * isBooked is derived from bookingId.
   */
  async getSeatStatuses(id: string): Promise<SeatStatus[]> {
    const showing = await this.showingModel
      .findById(id, { seats: 1 })
      .lean<Pick<WithId<Showing>, '_id' | 'seats'>>();
    if (!showing) {
      throw this.notFound(id);
    }
    return showing.seats.map((s) => ({
      row: s.row,
      seat: s.seat,
      isBooked: s.bookingId !== null && s.bookingId !== undefined,
    }));
  }

  private toResponse(showing: PopulatedShowing): ShowingResponseDto {
    return ShowingResponseDto.from({
      id: showing._id.toString(),
      filmTitle: showing.film?.title ?? '',
      hallName: showing.hall?.name ?? '',
      startsAt: showing.startsAt,
      price: showing.price,
    });
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException(`Showing with id ${id} not found`);
  }
}
