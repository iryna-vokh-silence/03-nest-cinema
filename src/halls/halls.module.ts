import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Showing, ShowingSchema } from '../showings/schemas/showing.schema';
import { HallsController } from './halls.controller';
import { HallsService } from './halls.service';
import { Hall, HallSchema } from './schemas/hall.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hall.name, schema: HallSchema },
      // Read-only use: "does any showing reference this hall?" before delete.
      { name: Showing.name, schema: ShowingSchema },
    ]),
  ],
  controllers: [HallsController],
  providers: [HallsService],
  exports: [HallsService],
})
export class HallsModule {}
