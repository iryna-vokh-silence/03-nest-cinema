import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ApiObjectIdParam } from '../common/swagger/api-object-id-param.decorator';
import { CreateFilmDto } from './dto/create-film.dto';
import { UpdateFilmDto } from './dto/update-film.dto';
import { FilmResponseDto } from './dto/film-response.dto';
import { FilmsService } from './films.service';

@ApiTags('films')
@Controller('films')
export class FilmsController {
  constructor(private readonly filmsService: FilmsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a film' })
  @ApiCreatedResponse({ type: FilmResponseDto, description: 'Film created' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Missing field or wrong type/range',
  })
  create(@Body() dto: CreateFilmDto): Promise<FilmResponseDto> {
    return this.filmsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all films' })
  @ApiOkResponse({ type: FilmResponseDto, isArray: true })
  findAll(): Promise<FilmResponseDto[]> {
    return this.filmsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a film by id' })
  @ApiObjectIdParam('Film id')
  @ApiOkResponse({ type: FilmResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not an ObjectId (24 hex characters)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Film not found',
  })
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<FilmResponseDto> {
    return this.filmsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update any subset of film fields' })
  @ApiObjectIdParam('Film id')
  @ApiOkResponse({ type: FilmResponseDto, description: 'Updated film' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid field, or id is not an ObjectId',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Film not found',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateFilmDto,
  ): Promise<FilmResponseDto> {
    return this.filmsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a film' })
  @ApiObjectIdParam('Film id')
  @ApiNoContentResponse({ description: 'Film deleted' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not an ObjectId (24 hex characters)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Film not found',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'At least one showing references the film (checked by a query: MongoDB has no foreign keys)',
  })
  remove(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    return this.filmsService.remove(id);
  }
}
