import { ForbiddenException, Injectable ,NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Ticket,TicketDocument,TicketStatus } from './schemas/ticket.schema.js';
import {CreateTicketDto} from './dto/create-ticket.dto.js'
import { Branches } from '../admins/enums/branches.enum.js';

@Injectable()
export class TicketsService {
    constructor(
        @InjectModel(Ticket.name)
        private ticketmodel: Model<TicketDocument>

    ){}

    async create(createTicketDto:CreateTicketDto){

        const ticket = new this.ticketmodel({
            ...createTicketDto,
            status:TicketStatus.Open
        })

        return ticket.save();

    }

    //admin : get all tickets for admin dashboard
  async findAll() {
    return this.ticketmodel.find().sort({ createdAt: -1 }).exec();
  }

  // get ticket by student
  async findOneByStudent(ticketNumber: string) {
    const ticket = await this.ticketmodel.findOne({
      ticketNumber,
    }).exec();

    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة أو رمز الوصول غير صحيح');
    }

    return ticket;
  }

  // admin : get one ticket
  async findOneById(id: string) {
    const ticket = await this.ticketmodel.findById(id).exec();
    
    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    return ticket;
  }

  // admin : get all tickets for a specific branch


async findByBranch(branch: Branches | null) {
  if (!branch) {
    throw new ForbiddenException(
      'الحساب غير مرتبط بفرع',
    );
  }

  return this.ticketmodel
    .find({ branch: branch })
    .sort({ createdAt: -1 });
}

}

