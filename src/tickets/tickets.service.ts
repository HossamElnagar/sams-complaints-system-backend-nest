import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ticket, TicketDocument, TicketStatus } from './schemas/ticket.schema.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { DispatchTicketDto } from './dto/dispatch-ticket.dto.js';
import { ResolveTicketDto } from './dto/resolve-ticket.dto.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { TenancyScoper, AuthenticatedUser } from '../common/scopers/tenancy.scoper.js';

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

  /**
   * Milestone 3: Dispatch or Escalate a Ticket.
   * Central Complaints Head retains sole authority to inspect AI predictions and dispatch/escalate.
   */
  async dispatch(id: string, dto: DispatchTicketDto, user: AuthenticatedUser): Promise<TicketDocument> {
    TenancyScoper.assertCanDispatch(user);

    const ticket = await this.ticketmodel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    if (!ticket.routing) {
      ticket.routing = { isEscalatedToPresident: false };
    }

    const adminObjectId = new Types.ObjectId(user.userId);
    const now = new Date();

    if (dto.isEscalatedToPresident) {
      ticket.routing.isEscalatedToPresident = true;
      ticket.routing.escalationReason = dto.escalationReason;
      ticket.routing.dispatchedBy = adminObjectId;
      ticket.routing.dispatchedAt = now;
      ticket.status = TicketStatus.InProgress;

      ticket.timeline.push({
        action: 'تصعيد الشكوى لرئيس الأكاديمية',
        note: dto.escalationReason ? `سبب التصعيد: ${dto.escalationReason}` : 'تم التصعيد لمكتب رئيس الأكاديمية للبت المباشر',
        performedBy: adminObjectId,
        timestamp: now,
      });
    } else {
      if (!dto.assignedBranchId || !dto.assignedDepartmentId) {
        throw new ForbiddenException('يجب تحديد الفرع والقسم المستهدف للتوجيه');
      }

      const branchObjectId = new Types.ObjectId(dto.assignedBranchId);
      const deptObjectId = new Types.ObjectId(dto.assignedDepartmentId);

      ticket.branchId = branchObjectId;
      ticket.routing.assignedBranchId = branchObjectId;
      ticket.routing.assignedDepartmentId = deptObjectId;
      ticket.routing.isEscalatedToPresident = false;
      ticket.routing.dispatchedBy = adminObjectId;
      ticket.routing.dispatchedAt = now;
      ticket.status = TicketStatus.InProgress;

      ticket.timeline.push({
        action: 'توجيه الشكوى للفرع المختص',
        note: dto.dispatchNote || 'تم توجيه الشكوى رسمياً إلى الفرع والقسم المعني لاتخاذ اللازم',
        performedBy: adminObjectId,
        timestamp: now,
      });
    }

    return ticket.save();
  }

  /**
   * Milestone 3: Staff Resolution or Rejection.
   * Requires mandatory written human justification.
   */
  async resolve(id: string, dto: ResolveTicketDto, user: AuthenticatedUser): Promise<TicketDocument> {
    if (!dto.justification || dto.justification.trim().length < 10) {
      throw new BadRequestException('مبرر القرار إلزامي ويجب ألا يقل عن 10 أحرف');
    }

    const ticket = await this.ticketmodel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة');
    }

    // Verify user has authority to resolve this specific ticket
    TenancyScoper.assertCanResolve(user, ticket);

    const adminObjectId = new Types.ObjectId(user.userId);
    const now = new Date();

    ticket.status = dto.status;
    ticket.resolution = {
      justification: dto.justification.trim(),
      resolvedBy: adminObjectId,
      resolvedAt: now,
    };

    const actionText = dto.status === TicketStatus.Resolved ? 'اعتماد حل الشكوى' : 'رفض الشكوى رسمياً';
    ticket.timeline.push({
      action: actionText,
      note: `القرار: ${dto.justification.trim()}`,
      performedBy: adminObjectId,
      timestamp: now,
    });

    return ticket.save();
  }

  /**
   * Returns tickets strictly filtered by authenticated user's tenancy scope.
   */
  async findScoped(user: AuthenticatedUser, filters?: { status?: string; category?: string }) {
    const baseScope = TenancyScoper.getTicketQueryScope(user);
    const query: any = { ...baseScope };

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.category) {
      query.category = filters.category;
    }

    return this.ticketmodel
      .find(query)
      .populate('branchId', 'name code')
      .populate('routing.assignedBranchId', 'name code')
      .populate('routing.assignedDepartmentId', 'name code')
      .sort({ createdAt: -1 })
      .exec();
  }

  // Admin: get all tickets for admin dashboard
  async findAll() {
    return this.ticketmodel.find().sort({ createdAt: -1 }).exec();
  }

  // Get ticket by student
  async findOneByStudent(ticketNumber: string) {
    const ticket = await this.ticketmodel
      .findOne({ ticketNumber: ticketNumber.trim().toUpperCase() })
      .populate('branchId', 'name code')
      .populate('routing.assignedBranchId', 'name code')
      .populate('routing.assignedDepartmentId', 'name code')
      .exec();

    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة أو رمز الوصول غير صحيح');
    }

    return ticket;
  }

  // Admin: get one ticket
  async findOneById(id: string) {
    const ticket = await this.ticketmodel
      .findById(id)
      .populate('branchId', 'name code')
      .populate('routing.assignedBranchId', 'name code')
      .populate('routing.assignedDepartmentId', 'name code')
      .exec();

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
