import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { Roles } from '../auth/decorators/roles-required.decorator';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';

/**
 * Admin CRUD cho webhook endpoints (Settings > Webhooks UI).
 * Chi SUPER_ADMIN duoc thao tac (giong API Keys).
 */
@Controller('webhook-endpoints')
@Roles(UserRole.SUPER_ADMIN)
export class WebhookEndpointsController {
  constructor(private readonly service: WebhookEndpointsService) {}

  @Get()
  async list() {
    return { data: await this.service.list() };
  }

  @Post()
  async create(@Body() body: CreateWebhookEndpointDto, @CurrentUser() user: any) {
    return { data: await this.service.create(body.name, user.id) };
  }

  @Patch(':id/activate')
  async activate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.activate(id);
    return { data: { message: 'Da kich hoat webhook' } };
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.deactivate(id);
    return { data: { message: 'Da vo hieu webhook' } };
  }

  @Delete(':id')
  async remove(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.service.remove(id);
    return { data: { message: 'Da xoa webhook' } };
  }
}
