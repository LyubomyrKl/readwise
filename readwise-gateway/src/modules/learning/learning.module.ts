import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { LearningExportService } from './learning-export.service';
import { ValidatorService } from './services/validator.service';
import { CardGeneratorService } from './services/card-generator.service';
import { SchedulerService } from './services/scheduler.service';
import { StatsService } from './services/stats.service';

@Module({
  controllers: [LearningController],
  providers: [
    LearningService,
    LearningExportService,
    ValidatorService,
    CardGeneratorService,
    SchedulerService,
    StatsService,
  ],
  exports: [LearningService],
})
export class LearningModule {}
