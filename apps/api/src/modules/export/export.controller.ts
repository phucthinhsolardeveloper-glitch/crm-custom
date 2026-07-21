import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { ExportService } from './export.service';
import { Roles } from '../auth/decorators/roles-required.decorator';

@Controller('exports')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
export class ExportController {
  constructor(private readonly service: ExportService) {}

  @Get('leads')
  async exportLeads(
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('sourceId') sourceId?: string,
  ) {
    const csv = await this.service.exportLeads({ status, departmentId, sourceId });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${date}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  }

  @Get('customers')
  async exportCustomers(
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const csv = await this.service.exportCustomers({ status, departmentId });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-export-${date}.csv"`);
    res.send('\uFEFF' + csv);
  }

  @Get('orders')
  async exportOrders(
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    const csv = await this.service.exportOrders({ status, customerId });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-export-${date}.csv"`);
    res.send('\uFEFF' + csv);
  }
}
