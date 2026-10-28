import { ReaderModule } from '@tools/reader/reader.module';
import { MoneyToolModule } from '@tools/money/money-tool.module';

/**
 * The only file that knows which tools exist. Adding a tool means adding its
 * NestJS module here (and its schema file under prisma/schema/).
 */
export const TOOL_MODULES = [ReaderModule, MoneyToolModule];
