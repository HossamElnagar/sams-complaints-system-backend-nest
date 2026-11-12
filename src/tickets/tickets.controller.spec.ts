import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketStatus } from './schemas/ticket.schema.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';
import { AuthenticatedUser } from '../common/scopers/tenancy.scoper.js';

describe('TicketsController', () => {
  let controller: TicketsController;
  let ticketsService: TicketsService;

  const ticketId = new Types.ObjectId();
  const branchId = new Types.ObjectId();
  const deptId = new Types.ObjectId();

  const mockTicket = {
    _id: ticketId,
    ticketNumber: 'TCK-CTRL001',
    subject: 'موضوع الشكوى',
    description: 'تفاصيل الشكوى الاختبارية',
    category: 'أكاديمي',
    status: TicketStatus.Open,
    routing: { isEscalatedToPresident: false },
    timeline: [],
    resolution: {},
  };

  const mockTicketsService = {
    create: vi.fn(),
    findOneByStudent: vi.fn(),
    findAll: vi.fn(),
    findByBranch: vi.fn(),
    findOneById: vi.fn(),
    findScoped: vi.fn(),
    dispatch: vi.fn(),
    resolve: vi.fn(),
  };

  const makeCentralHeadReq = (): { user: AuthenticatedUser } => ({
    user: {
      userId: new Types.ObjectId().toString(),
      email: 'head@academy.edu',
      role: AdminRole.CENTRAL_COMPLAINTS_HEAD,
    },
  });

  const makeStaffReq = (): { user: AuthenticatedUser } => ({
    user: {
      userId: new Types.ObjectId().toString(),
      email: 'staff@branch.edu',
      role: AdminRole.DEPARTMENT_STAFF,
      branchId: branchId.toString(),
      departmentId: deptId.toString(),
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        { provide: TicketsService, useValue: mockTicketsService },
      ],
    }).compile();

    controller = module.get<TicketsController>(TicketsController);
    ticketsService = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /tickets (create)', () => {
    it('should create a ticket and return ticketNumber and status', async () => {
      mockTicketsService.create.mockResolvedValue(mockTicket);

      const result = await controller.create({
        studentName: 'محمد أحمد',
        studentId: '123456789012345',
        studentEmail: 'student@academy.edu',
        studentPhone: '01012345678',
        title: 'موضوع الشكوى',
        description: 'تفاصيل الشكوى',
        category: 'أكاديمي',
        priority: 'عادي',
      } as any);

      expect(ticketsService.create).toHaveBeenCalledOnce();
      expect(result.message).toContain('تم إنشاء الشكوى');
      expect(result.ticketNumber).toBe('TCK-CTRL001');
      expect(result.status).toBe(TicketStatus.Open);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /tickets/track (trackTicket)', () => {
    it('should return ticket details for a valid ticket number', async () => {
      mockTicketsService.findOneByStudent.mockResolvedValue(mockTicket);

      const result = await controller.trackTicket('TCK-CTRL001');
      expect(ticketsService.findOneByStudent).toHaveBeenCalledWith('TCK-CTRL001');
      expect(result.ticketNumber).toBe('TCK-CTRL001');
    });

    it('should propagate NotFoundException for an unknown ticket number', async () => {
      mockTicketsService.findOneByStudent.mockRejectedValue(new NotFoundException('الشكوى غير موجودة'));

      await expect(controller.trackTicket('TCK-UNKNOWN')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /tickets/admin/scoped (findScoped)', () => {
    it('should return scoped tickets for the authenticated user', async () => {
      mockTicketsService.findScoped.mockResolvedValue([mockTicket]);
      const req = makeCentralHeadReq();

      const result = await controller.findScoped(req as any, undefined, undefined);
      expect(ticketsService.findScoped).toHaveBeenCalledWith(req.user, { status: undefined, category: undefined });
      expect(result).toHaveLength(1);
    });

    it('should pass status filter to service when provided', async () => {
      mockTicketsService.findScoped.mockResolvedValue([]);
      const req = makeStaffReq();

      await controller.findScoped(req as any, 'مفتوحة', undefined);
      expect(ticketsService.findScoped).toHaveBeenCalledWith(req.user, { status: 'مفتوحة', category: undefined });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('PATCH /tickets/:id/dispatch (dispatch)', () => {
    it('should dispatch a ticket to a branch and return success message', async () => {
      const dispatchedTicket = { ...mockTicket, status: TicketStatus.InProgress };
      mockTicketsService.dispatch.mockResolvedValue(dispatchedTicket);
      const req = makeCentralHeadReq();

      const dto = {
        assignedBranchId: branchId.toString(),
        assignedDepartmentId: deptId.toString(),
      } as any;

      const result = await controller.dispatch(ticketId.toString(), dto, req as any);
      expect(ticketsService.dispatch).toHaveBeenCalledWith(ticketId.toString(), dto, req.user);
      expect(result.message).toContain('تم توجيه الشكوى');
    });

    it('should return escalation success message when isEscalatedToPresident=true', async () => {
      const escalatedTicket = { ...mockTicket, routing: { isEscalatedToPresident: true } };
      mockTicketsService.dispatch.mockResolvedValue(escalatedTicket);
      const req = makeCentralHeadReq();

      const dto = {
        isEscalatedToPresident: true,
        escalationReason: 'قضية سيادية',
      } as any;

      const result = await controller.dispatch(ticketId.toString(), dto, req as any);
      expect(result.message).toContain('تصعيد الشكوى بنجاح');
    });

    it('should propagate ForbiddenException if unauthorized role attempts dispatch', async () => {
      mockTicketsService.dispatch.mockRejectedValue(
        new ForbiddenException('غير مصرح بهذا الإجراء'),
      );
      const req = makeStaffReq(); // Staff cannot dispatch

      await expect(
        controller.dispatch(ticketId.toString(), {} as any, req as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('PATCH /tickets/:id/resolve (resolve)', () => {
    it('should resolve a ticket and return resolution confirmation message', async () => {
      const resolvedTicket = { ...mockTicket, status: TicketStatus.Resolved };
      mockTicketsService.resolve.mockResolvedValue(resolvedTicket);
      const req = makeStaffReq();

      const dto = {
        status: 'تم الحل',
        justification: 'تمت مراجعة الطعن والبت فيه من قبل لجنة الامتحانات.',
      } as any;

      const result = await controller.resolve(ticketId.toString(), dto, req as any);
      expect(ticketsService.resolve).toHaveBeenCalledWith(ticketId.toString(), dto, req.user);
      expect(result.message).toContain('اعتماد حل الشكوى');
    });

    it('should return rejection message when status is مرفوضة', async () => {
      const rejectedTicket = { ...mockTicket, status: TicketStatus.Rejected };
      mockTicketsService.resolve.mockResolvedValue(rejectedTicket);
      const req = makeStaffReq();

      const dto = {
        status: 'مرفوضة',
        justification: 'لا يوجد سند قانوني للطعن المقدم.',
      } as any;

      const result = await controller.resolve(ticketId.toString(), dto, req as any);
      expect(result.message).toContain('رفض الشكوى رسمياً');
    });

    it('should propagate ForbiddenException when staff resolves out-of-scope ticket', async () => {
      mockTicketsService.resolve.mockRejectedValue(
        new ForbiddenException('غير مصرح بالبت في هذه الشكوى'),
      );
      const req = makeStaffReq();

      await expect(
        controller.resolve(ticketId.toString(), { status: 'تم الحل', justification: 'x'.repeat(15) } as any, req as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /tickets/admin/all (findAllForAdmin)', () => {
    it('should return all tickets for super admin', async () => {
      mockTicketsService.findAll.mockResolvedValue([mockTicket]);

      const result = await controller.findAllForAdmin();
      expect(ticketsService.findAll).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /tickets/admin/:id (findOneForAdmin)', () => {
    it('should return ticket details by id', async () => {
      mockTicketsService.findOneById.mockResolvedValue(mockTicket);

      const result = await controller.findOneForAdmin(ticketId.toString());
      expect(ticketsService.findOneById).toHaveBeenCalledWith(ticketId.toString());
      expect(result.ticketNumber).toBe('TCK-CTRL001');
    });

    it('should propagate NotFoundException for nonexistent ticket id', async () => {
      mockTicketsService.findOneById.mockRejectedValue(new NotFoundException('الشكوى غير موجودة'));

      await expect(controller.findOneForAdmin(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });
});
