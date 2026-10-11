import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { WithId } from '../common/schema-validators';
import { Showing } from '../showings/schemas/showing.schema';
import { CreateHallDto } from './dto/create-hall.dto';
import { HallResponseDto, HallWithSeatsDto } from './dto/hall-response.dto';
import { computeSeats } from './hall-seats';
import { Hall, HALL_NAME_COLLATION } from './schemas/hall.schema';

@Injectable()
export class HallsService implements OnModuleInit {
  constructor(
    @InjectModel(Hall.name) private readonly hallModel: Model<Hall>,
    @InjectModel(Showing.name) private readonly showingModel: Model<Showing>,
  ) {}

  /**
   * Waits until Mongoose has built the indexes of the schema, so the unique
   * index on the hall name exists before the first request is served.
   */
  async onModuleInit(): Promise<void> {
    await this.hallModel.init();
  }

  /**
   * Names are unique case-insensitively. The service checks first (with the
   * collation of the index) to give a friendly message; the unique index
   * UQ_halls_name catches the race when two equal names arrive at once.
   */
  async create(dto: CreateHallDto): Promise<HallResponseDto> {
    const name = dto.name.trim();
    const exists = await this.hallModel
      .exists({ name })
      .collation(HALL_NAME_COLLATION);
    if (exists) {
      throw this.duplicateName(name);
    }
    try {
      const hall = await this.hallModel.create({
        name,
        rows: dto.rows,
        seatsPerRow: dto.seatsPerRow,
      });
      return HallResponseDto.fromDocument(hall.toObject());
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw this.duplicateName(name);
      }
      throw error;
    }
  }

  async findAll(): Promise<HallResponseDto[]> {
    const halls = await this.hallModel
      .find()
      .sort({ name: 1, _id: 1 })
      .lean<WithId<Hall>[]>();
    return halls.map((h) => HallResponseDto.fromDocument(h));
  }

  /** Returns the hall with its computed seat list, or throws 404. */
  async findOneWithSeats(id: string): Promise<HallWithSeatsDto> {
    const hall = await this.findById(id);
    if (!hall) {
      throw this.notFound(id);
    }
    return HallWithSeatsDto.fromHall(hall, computeSeats(hall));
  }

  /** Non-throwing lookup for other modules. */
  findById(id: string): Promise<WithId<Hall> | null> {
    return this.hallModel.findById(id).lean<WithId<Hall>>();
  }

  /**
   * No foreign keys in MongoDB: the service checks that no showing
   * references the hall (409) before deleting it.
   */
  async remove(id: string): Promise<void> {
    const hall = await this.findById(id);
    if (!hall) {
      throw this.notFound(id);
    }
    const referenced = await this.showingModel.exists({ hall: id });
    if (referenced) {
      throw new ConflictException(
        `Hall with id ${id} cannot be deleted because it has showings`,
      );
    }
    const result = await this.hallModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw this.notFound(id);
    }
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException(`Hall with id ${id} not found`);
  }

  private duplicateName(name: string): ConflictException {
    return new ConflictException(`Hall with name "${name}" already exists`);
  }
}
