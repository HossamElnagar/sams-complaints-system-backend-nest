import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';

import { UseGuards } from '@nestjs/common';
import { Branches } from '../admins/enums/branches.enum.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guards.js';
import { RolesGuard } from '../auth/guards/roles.guards.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // 1- create a new ticket
  // POST /tickets
  @Post()
  async create(@Body() createTicketDto: CreateTicketDto) {
    const ticket = await this.ticketsService.create(createTicketDto);
    
    // return ticket number 
    return {
      message: 'تم إنشاء الشكوى بنجاح',
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
    };
  }

  // 2. 
  // GET /tickets/track?ticketNumber=TCK-XXXX&accessSecret=YYYY
  @Get('track')
  async trackTicket(
    @Query('ticketNumber') ticketNumber: string,
  
  ) {
    return this.ticketsService.findOneByStudent(ticketNumber);
  }

  // 3. Admin: 
  // GET /tickets/admin/all
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CENTRAL_COMPLAINTS_OFFICER, AdminRole.CENTRAL_DEPARTMENT_STAFF, AdminRole.ACADEMY_PRESIDENT)
  async findAllForAdmin() {
    return this.ticketsService.findAll();
  }

  

  // 5. Admin: my branch tickets
 @Get('admin/branch')
 @UseGuards(JwtAuthGuard, RolesGuard)
 @Roles(AdminRole.BRANCH_MANAGER, AdminRole.BRANCH_STAFF , AdminRole.SUPER_ADMIN)
 async findAllTicketsBranch(@Req() req: any){
  return this.ticketsService.findByBranch(req.user.branch);
 }
  
 // 4. Admin: 
  // GET /tickets/admin/:id
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CENTRAL_COMPLAINTS_OFFICER, AdminRole.CENTRAL_DEPARTMENT_STAFF, AdminRole.ACADEMY_PRESIDENT)
  async findOneForAdmin(@Param('id') id: string) {
    return this.ticketsService.findOneById(id);
  }



}

