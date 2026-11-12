import {
  Controller,
  Get,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guards.js';
import { RolesGuard } from '../auth/guards/roles.guards.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  AdminRole.SUPER_ADMIN,
  AdminRole.ACADEMY_PRESIDENT,
  AdminRole.CENTRAL_COMPLAINTS_HEAD,
)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  async getSummary() {
    return this.analyticsService.getExecutiveSummary();
  }

  @Get('branches')
  async getBranchBreakdown() {
    return this.analyticsService.getBranchBreakdown();
  }

  @Get('categories')
  async getCategoryBreakdown() {
    return this.analyticsService.getCategoryBreakdown();
  }

  @Get('escalations')
  async getRecentEscalations(@Query('limit') limit?: string) {
    const numLimit = limit ? Math.min(Number(limit), 50) : 10;
    return this.analyticsService.getRecentEscalations(numLimit);
  }

  @Get('export/csv')
  async exportCsv(@Res() res: Response) {
    const csvContent = await this.analyticsService.generateCsvReport();

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `sams-complaints-report-${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  }
}
