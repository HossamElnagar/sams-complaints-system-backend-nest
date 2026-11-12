import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TicketsService } from './tickets.service.js';
import { Ticket, TicketStatus } from './schemas/ticket.schema.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';
import { AuthenticatedUser } from '../common/scopers/tenancy.scoper.js';

describe('TicketsService', () => {
  let service: TicketsService;

  const mockTicketInstance = {
    _id: new Types.ObjectId(),
    ticketNumber: 'TCK-M3TEST123',
    subject: 'موضوع الشكوى',
    description: 'تفاصيل الشكوى',
    category: 'أكاديمي',
    status: TicketStatus.Open,
    routing: { isEscalatedToPresident: false },
    timeline: [] as any[],
    resolution: {} as any,
    branchId: undefined as any,
    save: vi.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
  };

  const mockTicketModel = {
    new: vi.fn(),
    find: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue([mockTicketInstance]),
            }),
          }),
        }),
      }),
      sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockTicketInstance]) }),
    }),
    findOne: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(mockTicketInstance),
          }),
        }),
      }),
    }),
    findById: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(mockTicketInstance),
          }),
        }),
      }),
      exec: vi.fn().mockResolvedValue(mockTicketInstance),
    }),
  };

  const mockOutboxService = {
    persistTicketWithJobs: vi.fn().mockResolvedValue(mockTicketInstance),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        {
          provide: getModelToken(Ticket.name),
          useValue: mockTicketModel,
        },
        {
          provide: OutboxService,
          useValue: mockOutboxService,
        },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('Central Complaints Head should dispatch ticket to branch and department', async () => {
    const centralHead: AuthenticatedUser = {
      userId: new Types.ObjectId().toString(),
      email: 'head@academy.edu',
      role: AdminRole.CENTRAL_COMPLAINTS_HEAD,
    };

    const targetBranch = new Types.ObjectId().toString();
    const targetDept = new Types.ObjectId().toString();

    const updated = await service.dispatch(
      mockTicketInstance._id.toString(),
      {
        assignedBranchId: targetBranch,
        assignedDepartmentId: targetDept,
        dispatchNote: 'توجيه للمتابعة العاجلة',
      },
      centralHead,
    );

    expect(updated.status).toBe(TicketStatus.InProgress);
    expect(updated.routing.assignedBranchId?.toString()).toBe(targetBranch);
    expect(updated.routing.assignedDepartmentId?.toString()).toBe(targetDept);
    expect(updated.save).toHaveBeenCalled();
  });

  it('Central Complaints Head should escalate ticket to President Office', async () => {
    const centralHead: AuthenticatedUser = {
      userId: new Types.ObjectId().toString(),
      email: 'head@academy.edu',
      role: AdminRole.CENTRAL_COMPLAINTS_HEAD,
    };

    const updated = await service.dispatch(
      mockTicketInstance._id.toString(),
      {
        isEscalatedToPresident: true,
        escalationReason: 'قضية سيادية تستوجب قرار رئيس الأكاديمية مباشرة',
      },
      centralHead,
    );

    expect(updated.status).toBe(TicketStatus.InProgress);
    expect(updated.routing.isEscalatedToPresident).toBe(true);
    expect(updated.routing.escalationReason).toContain('قضية سيادية');
  });

  it('Staff resolution should succeed when user belongs to assigned branch and department', async () => {
    const branchId = new Types.ObjectId();
    const deptId = new Types.ObjectId();

    mockTicketInstance.routing = {
      assignedBranchId: branchId,
      assignedDepartmentId: deptId,
      isEscalatedToPresident: false,
    } as any;

    const staffUser: AuthenticatedUser = {
      userId: new Types.ObjectId().toString(),
      email: 'staff@academy.edu',
      role: AdminRole.DEPARTMENT_STAFF,
      branchId: branchId.toString(),
      departmentId: deptId.toString(),
    };

    const resolved = await service.resolve(
      mockTicketInstance._id.toString(),
      {
        status: TicketStatus.Resolved,
        justification: 'تمت مراجعة كراسة الإجابة وتعديل الدرجة رسمياً في السجل الأكاديمي.',
      },
      staffUser,
    );

    expect(resolved.status).toBe(TicketStatus.Resolved);
    expect(resolved.resolution?.justification).toContain('تمت مراجعة كراسة الإجابة');
  });

  it('Staff resolution should fail if user does not belong to assigned branch or department', async () => {
    const staffWrongBranch: AuthenticatedUser = {
      userId: new Types.ObjectId().toString(),
      email: 'wrong@academy.edu',
      role: AdminRole.DEPARTMENT_STAFF,
      branchId: new Types.ObjectId().toString(),
      departmentId: new Types.ObjectId().toString(),
    };

    await expect(
      service.resolve(
        mockTicketInstance._id.toString(),
        {
          status: TicketStatus.Resolved,
          justification: 'مبرر غير مصرح به',
        },
        staffWrongBranch,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
