import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';

/** Importable by any tool module; nothing in the platform calls the LLM itself. */
@Global()
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
