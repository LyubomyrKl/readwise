import { Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { CurrencyResponse } from './currency.models';

/** The seeded ISO 4217 table (rule 6): the only source of currencies and their minor units. */
@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CurrencyResponse[]> {
    const rows = await this.prisma.moneyCommodity.findMany({
      where: { kind: 'currency' },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, decimals: true },
    });
    return rows;
  }
}
