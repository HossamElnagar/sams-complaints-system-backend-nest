import { Controller, Get, Param, Query } from '@nestjs/common';
import { BranchesService } from './branches.service.js';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  async findAll(@Query('active') active?: string) {
    const onlyActive = active !== 'false';
    return this.branchesService.findAll(onlyActive);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.branchesService.findById(id);
  }
}
