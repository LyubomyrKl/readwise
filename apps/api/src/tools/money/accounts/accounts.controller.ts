import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { toDate } from '../common/parse';
import {
  AccountResponse,
  AddCurrencyDto,
  SubAccountUpdateDto,
  MergeAccountDto,
  CreateAccountDto,
  CreateInstitutionDto,
  InstitutionResponse,
  ListAccountsQuery,
  UpdateAccountDto,
  UpdateInstitutionDto,
} from './account.models';
import { AccountsService } from './accounts.service';

@ApiTags('money')
@Controller('money')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('institutions')
  @ApiEndpoint({ summary: 'Banks, brokers, bond registries, lenders, cash', response: [InstitutionResponse] })
  listInstitutions(@Req() req: UserModel) {
    return this.accounts.listInstitutions(req.user.userId);
  }

  @Post('institutions')
  @ApiEndpoint({ summary: 'Create an institution', response: InstitutionResponse })
  createInstitution(@Req() req: UserModel, @Body() dto: CreateInstitutionDto) {
    return this.accounts.createInstitution(req.user.userId, dto);
  }

  @Patch('institutions/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Rename or retype an institution', response: InstitutionResponse })
  updateInstitution(@Req() req: UserModel, @Param('id') id: string, @Body() dto: UpdateInstitutionDto) {
    return this.accounts.updateInstitution(req.user.userId, id, dto);
  }

  @Get('accounts')
  @ApiEndpoint({ summary: 'Accounts with the balance of each sub-account (currency or asset)', response: [AccountResponse] })
  list(@Req() req: UserModel, @Query() query: ListAccountsQuery) {
    return this.accounts.list(req.user.userId, {
      includeArchived: query.archived === 'true',
      asOf: query.asOf ? toDate(query.asOf, 'asOf') : undefined,
    });
  }

  @Get('accounts/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'One account with its balances', response: AccountResponse })
  get(@Req() req: UserModel, @Param('id') id: string, @Query() query: ListAccountsQuery) {
    return this.accounts.get(req.user.userId, id, query.asOf ? toDate(query.asOf, 'asOf') : undefined);
  }

  @Post('accounts')
  @ApiEndpoint({ summary: 'Create an account with its currencies and opening balances', response: AccountResponse })
  create(@Req() req: UserModel, @Body() dto: CreateAccountDto) {
    return this.accounts.create(req.user.userId, dto);
  }

  @Patch('accounts/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Change an account', response: AccountResponse })
  update(@Req() req: UserModel, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(req.user.userId, id, dto);
  }

  @Post('accounts/:id/archive')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Archive an account; its history stays', response: AccountResponse })
  archive(@Req() req: UserModel, @Param('id') id: string) {
    return this.accounts.setArchived(req.user.userId, id, true);
  }

  @Post('accounts/:id/unarchive')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Bring an archived account back', response: AccountResponse })
  unarchive(@Req() req: UserModel, @Param('id') id: string) {
    return this.accounts.setArchived(req.user.userId, id, false);
  }

  @Post('accounts/:id/currencies')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Add a currency sub-account', response: AccountResponse })
  addCurrency(@Req() req: UserModel, @Param('id') id: string, @Body() dto: AddCurrencyDto) {
    return this.accounts.addCurrency(req.user.userId, id, dto.currency);
  }

  @Post('accounts/:id/merge')
  @ApiParam({ name: 'id', description: 'the account that goes away' })
  @ApiEndpoint({ summary: 'Merge this account into another: its currencies move over with their history', response: AccountResponse })
  merge(@Req() req: UserModel, @Param('id') id: string, @Body() dto: MergeAccountDto) {
    return this.accounts.merge(req.user.userId, id, dto.intoAccountId, { name: dto.name });
  }

  @Patch('accounts/:id/currencies/:currency')
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'currency', example: 'PLN' })
  @ApiEndpoint({ summary: "Set the IBAN or account number of one of the account's currencies", response: AccountResponse })
  updateCurrency(@Req() req: UserModel, @Param('id') id: string, @Param('currency') currency: string, @Body() dto: SubAccountUpdateDto) {
    return this.accounts.setNumber(req.user.userId, id, currency, dto.number);
  }
}
