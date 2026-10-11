import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WithId } from '../common/schema-validators';
import { Showing } from '../showings/schemas/showing.schema';
import { CreateFilmDto } from './dto/create-film.dto';
import { FilmResponseDto } from './dto/film-response.dto';
import { UpdateFilmDto } from './dto/update-film.dto';
import { Film } from './schemas/film.schema';

@Injectable()
export class FilmsService {
  constructor(
    @InjectModel(Film.name) private readonly filmModel: Model<Film>,
    @InjectModel(Showing.name) private readonly showingModel: Model<Showing>,
  ) {}

  async create(dto: CreateFilmDto): Promise<FilmResponseDto> {
    const film = await this.filmModel.create({
      title: dto.title,
      durationMinutes: dto.durationMinutes,
      releaseYear: dto.releaseYear,
    });
    return FilmResponseDto.fromDocument(film.toObject());
  }

  async findAll(): Promise<FilmResponseDto[]> {
    const films = await this.filmModel
      .find()
      .sort({ title: 1, _id: 1 })
      .lean<WithId<Film>[]>();
    return films.map((f) => FilmResponseDto.fromDocument(f));
  }

  /** Returns the film or throws 404. */
  async findOne(id: string): Promise<FilmResponseDto> {
    return FilmResponseDto.fromDocument(await this.getOrThrow(id));
  }

  /** Non-throwing lookup for other modules (showings need 400, not 404). */
  findById(id: string): Promise<WithId<Film> | null> {
    return this.filmModel.findById(id).lean<WithId<Film>>();
  }

  /** Only the fields present in the body are changed ($set), in one query. */
  async update(id: string, dto: UpdateFilmDto): Promise<FilmResponseDto> {
    const changes: Partial<Film> = {};
    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.durationMinutes !== undefined) {
      changes.durationMinutes = dto.durationMinutes;
    }
    if (dto.releaseYear !== undefined) changes.releaseYear = dto.releaseYear;

    const film = await this.filmModel
      .findByIdAndUpdate(
        id,
        { $set: changes },
        { new: true, runValidators: true },
      )
      .lean<WithId<Film>>();
    if (!film) {
      throw this.notFound(id);
    }
    return FilmResponseDto.fromDocument(film);
  }

  /**
   * MongoDB has no foreign keys, so the service itself checks that no
   * showing references the film (409) before deleting it. Showings are
   * never deleted together with the film.
   */
  async remove(id: string): Promise<void> {
    await this.getOrThrow(id); // 404
    const referenced = await this.showingModel.exists({ film: id });
    if (referenced) {
      throw new ConflictException(
        `Film with id ${id} cannot be deleted because it has showings`,
      );
    }
    const result = await this.filmModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw this.notFound(id); // deleted by a parallel request
    }
  }

  private async getOrThrow(id: string): Promise<WithId<Film>> {
    const film = await this.findById(id);
    if (!film) {
      throw this.notFound(id);
    }
    return film;
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException(`Film with id ${id} not found`);
  }
}
