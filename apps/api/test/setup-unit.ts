import { Logger } from '@nestjs/common';

// Keep Nest's own log lines out of test output; the code under test still calls the logger.
Logger.overrideLogger(false);

// the specs register several users; the registration policy has its own test
process.env.REGISTRATION ??= 'open';
