import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ApiObjectIdParam } from '../common/swagger/api-object-id-param.decorator';
import { CreateShowingDto } from './dto/create-showing.dto';
import { FindShowingsQueryDto } from './dto/find-showings-query.dto';
import { PaginatedShowingsDto } from './dto/paginated-showings.dto';
import { SeatStatus } from './dto/seat-status.dto';
import { ShowingResponseDto } from './dto/showing-response.dto';
import { ShowingsService } from './showings.service';

const INVALID_ID = 'id is not an ObjectId (24 hex characters)';

@ApiTags('showings')
@Controller('showings')
export class ShowingsController {
  constructor(private readonly showingsService: ShowingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a showing',
    description:
      'The seat map of the hall is copied into the showing document ' +
      '(`seats`, every seat free) and `bookings` starts empty. ' +
      'Neither array is returned.',
  })
  @ApiCreatedResponse({
    type: ShowingResponseDto,
    description: 'Showing created',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'filmId/hallId not an ObjectId, film or hall not found, startsAt invalid or in the past, price not a positive integer',
  })
  create(@Body() dto: CreateShowingDto): Promise<ShowingResponseDto> {
    return this.showingsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List showings (filters, sorting, pagination)',
    description:
      'Optional filters combine with AND. `date` matches the UTC date of startsAt. ' +
      'Sorted by startsAt (`sort=asc|desc`, default asc); showings with the same ' +
      'start time are ordered by _id. Paged with `page` (from 1, default 1) and ' +
      '`limit` (1–100, default 20). Filtering, sorting and paging run in MongoDB ' +
      '(find + sort + skip + limit, countDocuments for total).',
  })
  @ApiOkResponse({
    type: PaginatedShowingsDto,
    description: 'One page of showings: { items, total, page, limit }',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'filmId not an ObjectId, date not in YYYY-MM-DD, page/limit not an integer or out of range, sort not asc/desc',
  })
  findAll(@Query() query: FindShowingsQueryDto): Promise<PaginatedShowingsDto> {
    return this.showingsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a showing with film title and hall name' })
  @ApiObjectIdParam('Showing id')
  @ApiOkResponse({ type: ShowingResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: INVALID_ID })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Showing not found',
  })
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<ShowingResponseDto> {
    return this.showingsService.findOne(id);
  }

  @Get(':id/seats')
  @ApiOperation({
    summary: 'Seat map of a showing with booking status',
    description:
      'One element per hall seat; isBooked is derived from seats[].bookingId of the showing document.',
  })
  @ApiObjectIdParam('Showing id')
  @ApiOkResponse({ type: SeatStatus, isArray: true })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: INVALID_ID })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Showing not found',
  })
  getSeats(@Param('id', ParseObjectIdPipe) id: string): Promise<SeatStatus[]> {
    return this.showingsService.getSeatStatuses(id);
  }
}
