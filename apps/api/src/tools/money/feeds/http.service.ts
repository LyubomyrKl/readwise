import { Injectable } from '@nestjs/common';

export interface HttpResult {
  status: number;
  text: string;
}

/** Outbound GET for the daily feeds; one seam for tests to replace. */
@Injectable()
export class MoneyHttp {
  async get(url: string, timeoutMs = 60_000): Promise<HttpResult> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'workbench-money/1 (+personal finance)', accept: '*/*' },
    });
    return { status: response.status, text: await response.text() };
  }
}
