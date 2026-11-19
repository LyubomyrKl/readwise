import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { CategoriesService } from './categories.service';
import { CategoryResponse, CreateCategoryDto, MergeCategoryDto, UpdateCategoryDto } from './category.models';

@ApiTags('money')
@Controller('money/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiQuery({ name: 'archived', required: false })
  @ApiEndpoint({ summary: 'Income and expense categories (flat; parentId nests them)', response: [CategoryResponse] })
  list(@Req() req: UserModel, @Query('archived') archived?: string) {
    return this.categories.list(req.user.userId, archived === 'true');
  }

  @Post()
  @ApiEndpoint({ summary: 'Create a category', response: CategoryResponse })
  create(@Req() req: UserModel, @Body() dto: CreateCategoryDto) {
    return this.categories.create(req.user.userId, dto);
  }

  @Patch(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Rename, move or archive a category', response: CategoryResponse })
  update(@Req() req: UserModel, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(req.user.userId, id, dto);
  }

  @Post(':id/merge')
  @ApiParam({ name: 'id', description: 'the category that goes away' })
  @ApiEndpoint({
    summary: 'Merge this category into another: it leaves the lists, its history shows and counts under the other one; nothing posted changes',
    response: CategoryResponse,
  })
  merge(@Req() req: UserModel, @Param('id') id: string, @Body() dto: MergeCategoryDto) {
    return this.categories.merge(req.user.userId, id, dto.intoId);
  }
}
