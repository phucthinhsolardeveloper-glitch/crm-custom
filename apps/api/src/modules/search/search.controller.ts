import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  async search(@Query('q') query: string, @CurrentUser() user: any, @Query('limit') limit?: number) {
    if (!query || query.length < 2) return { data: { leads: [], customers: [], orders: [] } };
    return { data: await this.service.search(query, limit ?? 10, user) };
  }
}
