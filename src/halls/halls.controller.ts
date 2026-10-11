import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CreateHallDto } from './dto/create-hall.dto';
import { HallResponseDto, HallWithSeatsDto } from './dto/hall-response.dto';
import { HallsService } from './halls.service';

@ApiTags('halls')
@Controller('halls')
export class HallsController {
  constructor(private readonly hallsService: HallsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a hall' })
  @ApiCreatedResponse({ type: HallResponseDto, description: 'Hall created' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Missing field, wrong type or not a positive integer',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Hall with this name already exists',
  })
  create(@Body() dto: CreateHallDto): Promise<HallResponseDto> {
    return this.hallsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all halls' })
  @ApiOkResponse({ type: HallResponseDto, isArray: true })
  findAll(): Promise<HallResponseDto[]> {
    return this.hallsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a hall with its computed seat list' })
  @ApiObjectIdParam('Hall id')
  @ApiOkResponse({ type: HallWithSeatsDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not an ObjectId (24 hex characters)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Hall not found',
  })
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<HallWithSeatsDto> {
    return this.hallsService.findOneWithSeats(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a hall' })
  @ApiObjectIdParam('Hall id')
  @ApiNoContentResponse({ description: 'Hall deleted' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not an ObjectId (24 hex characters)',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Hall not found',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'At least one showing references the hall (checked by a query: MongoDB has no foreign keys)',
  })
  remove(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    return this.hallsService.remove(id);
  }
}
