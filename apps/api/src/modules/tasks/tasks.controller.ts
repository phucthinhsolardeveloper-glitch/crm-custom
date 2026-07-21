import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode } from '@nestjs/common';
import { IsOptional, IsEnum } from 'class-validator';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser } from '../auth/decorators/current-user-param.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

class TaskListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query() query: TaskListQueryDto,
  ) {
    return this.service.list(user.id, query);
  }

  @Post()
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: any) {
    // Default assignedTo to current user if not provided
    if (!dto.assignedTo) {
      dto.assignedTo = user.id.toString();
    }
    return { data: await this.service.create(dto, user.id) };
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.complete(id, user.id, user.role) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    return { data: await this.service.cancel(id, user.id, user.role) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: any,
  ) {
    return { data: await this.service.update(id, dto, user.id, user.role) };
  }

  @Delete(':id')
  async remove(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
    await this.service.remove(id, user.id, user.role);
    return { data: { success: true } };
  }
}
