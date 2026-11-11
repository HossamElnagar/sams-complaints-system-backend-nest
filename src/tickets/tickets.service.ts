import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ticket, TicketDocument, TicketStatus } from './schemas/ticket.schema.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { OutboxService } from '../outbox/outbox.service.js';

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketmodel: Model<TicketDocument>,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Enhanced create ticket flow:
   * Preserves existing fields & cryptographic ticketNumber generation,
   * while persisting atomically with AI outbox jobs.
   */
  async create(createTicketDto: CreateTicketDto): Promise<TicketDocument> {
    const ticketData: any = {
      ...createTicketDto,
      status: TicketStatus.Open,
      timeline: [
        {
          action: 'إنشاء الشكوى',
          note: 'تم استلام الشكوى بنجاح وبدء معالجتها آلياً',
          timestamp: new Date(),
        },
      ],
    };

    if (createTicketDto.branchId && Types.ObjectId.isValid(createTicketDto.branchId)) {
      ticketData.branchId = new Types.ObjectId(createTicketDto.branchId);
    }

    const ticket = new this.ticketmodel(ticketData);

    // Atomically persist ticket along with decoupled AI outbox jobs
    return this.outboxService.persistTicketWithJobs(ticket);
  }

  // Admin: get all tickets for admin dashboard
  async findAll() {
    return this.ticketmodel.find().sort({ createdAt: -1 }).exec();
  }

  // Get ticket by student
  async findOneByStudent(ticketNumber: string) {
    const ticket = await this.ticketmodel
      .findOne({ ticketNumber: ticketNumber.trim().toUpperCase() })
      .exec();

    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة أو رمز الوصول غير صحيح');
    }

    return ticket;
  }

  // Admin: get one ticket
  async findOneById(id: string) {
    const ticket = await this.ticketmodel.findById(id).exec();

    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    return ticket;
  }

  // Admin: get all tickets for a specific branch
  async findByBranch(branch: string | null) {
    if (!branch) {
      throw new ForbiddenException('الحساب غير مرتبط بفرع');
    }

    return this.ticketmodel
      .find({
        $or: [
          { branch },
          ...(Types.ObjectId.isValid(branch) ? [{ branchId: new Types.ObjectId(branch) }] : []),
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }
}
