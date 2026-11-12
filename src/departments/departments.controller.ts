import { Controller, Get, Param, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get('branch/:branchId')
  async findByBranch(
    @Param('branchId') branchId: string,
    @Query('active') active?: string,
  ) {
    const onlyActive = active !== 'false';
    return this.departmentsService.findByBranch(branchId, onlyActive);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.departmentsService.findById(id);
  }
}
