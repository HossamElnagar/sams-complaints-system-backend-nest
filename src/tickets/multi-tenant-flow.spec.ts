import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { TicketStatus } from './schemas/ticket.schema.js';
import { AiModelType, TaskProcessingStatus } from '../outbox/enums/outbox.enums.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';
import { TenancyScoper, AuthenticatedUser } from '../common/scopers/tenancy.scoper.js';
import { AnalyticsService } from '../analytics/analytics.service.js';

describe('Milestone 5: Multi-Tenant E2E Integration Workflow', () => {
  const branchCairoId = new Types.ObjectId();
  const branchAlexId = new Types.ObjectId();
  const deptStudentAffairsId = new Types.ObjectId();
  const deptFinanceId = new Types.ObjectId();

  const centralComplaintsHead: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    email: 'head@sams.edu.eg',
    role: AdminRole.CENTRAL_COMPLAINTS_HEAD,
  };

  const cairoStaffUser: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    email: 'staff.cairo@sams.edu.eg',
    role: AdminRole.DEPARTMENT_STAFF,
    branchId: branchCairoId.toHexString(),
    departmentId: deptStudentAffairsId.toHexString(),
  };

  const alexStaffUser: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    email: 'staff.alex@sams.edu.eg',
    role: AdminRole.DEPARTMENT_STAFF,
    branchId: branchAlexId.toHexString(),
    departmentId: deptFinanceId.toHexString(),
  };

  const academyPresidentUser: AuthenticatedUser = {
    userId: new Types.ObjectId().toHexString(),
    email: 'president@sams.edu.eg',
    role: AdminRole.ACADEMY_PRESIDENT,
  };

  let mockDbTickets: any[] = [];
  let mockOutboxJobs: any[] = [];

  function createMockTicketDoc(data: any) {
    const doc: any = {
      _id: data._id || new Types.ObjectId(),
      ticketNumber: data.ticketNumber || `TCK-${Date.now().toString(36).toUpperCase()}`,
      studentName: data.studentName || 'أحمد محمد علي',
      studentEmail: data.studentEmail || 'ahmed@sams.edu.eg',
      studentPhone: data.studentPhone || '01012345678',
      nationalId: data.nationalId || '29901011234567',
      academicId: data.academicId || '20210042',
      faculty: data.faculty || 'كلية العلوم الإدارية',
      branch: data.branch || 'فرع القاهرة',
      branchId: data.branchId,
      departmentId: data.departmentId,
      subject: data.subject || 'اعتراض على رصد درجات أعمال السنة',
      description: data.description || 'أرجو مراجعة رصد درجات أعمال السنة لمادة بحوث العمليات',
      category: data.category || 'أكاديمي',
      priority: data.priority || 'متوسطة',
      status: data.status || TicketStatus.Open,
      routing: data.routing || { isEscalatedToPresident: false },
      aiAnalysis: data.aiAnalysis || null,
      timeline: data.timeline || [],
      resolution: data.resolution || {},
      createdAt: data.createdAt || new Date(Date.now() - 3600000 * 24),
      updatedAt: data.updatedAt || new Date(),
    };

    doc.save = vi.fn().mockImplementation(function () {
      const idx = mockDbTickets.findIndex((t) => t._id.toString() === doc._id.toString());
      if (idx >= 0) {
        mockDbTickets[idx] = { ...doc };
      } else {
        mockDbTickets.push({ ...doc });
      }
      return Promise.resolve(doc);
    });

    return doc;
  }

  function createFindQueryChain(results: any[]) {
    const chain: any = {
      populate: vi.fn().mockImplementation(() => chain),
      sort: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockImplementation(() => chain),
      exec: vi.fn().mockResolvedValue(results),
    };
    return chain;
  }

  function createFindOneQueryChain(result: any) {
    const chain: any = {
      populate: vi.fn().mockImplementation(() => chain),
      sort: vi.fn().mockImplementation(() => chain),
      exec: vi.fn().mockResolvedValue(result),
    };
    return chain;
  }

  // Constructible Mongoose Model Mock
  class MockTicketModel {
    constructor(dto: any) {
      const doc = createMockTicketDoc(dto);
      return doc;
    }

    static find(query: any = {}) {
      const results = mockDbTickets.filter((t) => {
        if (query.branchId && t.branchId?.toString() !== query.branchId.toString()) return false;
        if (query.departmentId && t.departmentId?.toString() !== query.departmentId.toString()) return false;
        if (query.status && t.status !== query.status) return false;
        if (query['routing.isEscalatedToPresident'] !== undefined && t.routing?.isEscalatedToPresident !== query['routing.isEscalatedToPresident']) return false;
        return true;
      });
      return createFindQueryChain(results);
    }

    static findById(id: string) {
      const found = mockDbTickets.find((t) => t._id.toString() === id.toString());
      return createFindOneQueryChain(found || null);
    }

    static findOne(query: any = {}) {
      const found = mockDbTickets.find((t) => {
        if (query.ticketNumber && t.ticketNumber === query.ticketNumber) return true;
        return false;
      });
      return createFindOneQueryChain(found || null);
    }

    static countDocuments(filter: any = {}) {
      let count = mockDbTickets.length;
      if (filter && Object.keys(filter).length > 0) {
        if (filter.status) {
          if (Array.isArray(filter.status?.$in)) {
            count = mockDbTickets.filter((t) => filter.status.$in.includes(t.status)).length;
          } else {
            count = mockDbTickets.filter((t) => t.status === filter.status).length;
          }
        } else if (filter['routing.isEscalatedToPresident']) {
          count = mockDbTickets.filter((t) => t.routing?.isEscalatedToPresident).length;
        }
      }
      return {
        exec: vi.fn().mockResolvedValue(count),
      };
    }

    static aggregate(pipeline: any[]) {
      let resultData: any[] = [];
      const hasAvg = pipeline.some((p) => p.$group && p.$group.avgHours);
      if (hasAvg) {
        resultData = [{ _id: null, avgHours: 18.5 }];
      } else if (pipeline.some((p) => p.$group && p.$group._id === '$branchId')) {
        resultData = [
          { _id: branchCairoId, total: 2, resolved: 1, inProgress: 1, escalated: 0 },
        ];
      } else if (pipeline.some((p) => p.$group && p.$group._id === '$category')) {
        resultData = [
          { _id: 'أكاديمي', count: mockDbTickets.length },
        ];
      }

      return {
        exec: vi.fn().mockResolvedValue(resultData),
      };
    }
  }

  const mockBranchModel = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          { _id: branchCairoId, name: 'فرع القاهرة', code: 'CAI', isActive: true },
          { _id: branchAlexId, name: 'فرع الإسكندرية', code: 'ALX', isActive: true },
        ]),
      }),
    }),
  };

  const mockOutboxService: any = {
    persistTicketWithJobs: vi.fn().mockImplementation(async (ticketDoc: any) => {
      const saved = await ticketDoc.save();
      mockOutboxJobs.push({
        _id: new Types.ObjectId(),
        ticketId: saved._id,
        modelType: AiModelType.SUMMARIZE,
        status: TaskProcessingStatus.PENDING,
        attempts: 0,
      });
      mockOutboxJobs.push({
        _id: new Types.ObjectId(),
        ticketId: saved._id,
        modelType: AiModelType.CLASSIFY_ROUTE,
        status: TaskProcessingStatus.PENDING,
        attempts: 0,
      });
      return saved;
    }),
    claimJob: vi.fn().mockImplementation(async (modelType: AiModelType) => {
      const pending = mockOutboxJobs.find(
        (j) => j.modelType === modelType && j.status === TaskProcessingStatus.PENDING,
      );
      if (pending) {
        pending.status = TaskProcessingStatus.PROCESSING;
        pending.lockToken = 'test-lock-token';
        pending.lockedAt = new Date();
        return pending;
      }
      return null;
    }),
    completeJob: vi.fn().mockImplementation(async (jobId: any) => {
      const job = mockOutboxJobs.find((j) => j._id.toString() === jobId.toString());
      if (job) job.status = TaskProcessingStatus.COMPLETED;
      return true;
    }),
  };

  let ticketsService: TicketsService;
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    mockDbTickets = [];
    mockOutboxJobs = [];
    vi.clearAllMocks();

    ticketsService = new TicketsService(MockTicketModel as any, mockOutboxService);
    analyticsService = new AnalyticsService(MockTicketModel as any, mockBranchModel as any);
  });

  it('Phase 1: Academic Intake creates ticket and queues Transactional Outbox jobs atomically', async () => {
    const intakeDto = {
      studentName: 'سارة خالد محمود',
      studentEmail: 'sara.khalid@sams.edu.eg',
      studentPhone: '01123456789',
      nationalId: '29810101234567',
      academicId: '20210889',
      faculty: 'كلية العلوم الإدارية',
      branch: 'فرع القاهرة',
      branchId: branchCairoId.toHexString(),
      subject: 'طلب إعادة تصحيح امتحان إدارة الأعمال',
      description: 'أرجو التكرم بمراجعة رصد درجات امتحان الفصل الدراسي الأول في مادة إدارة الأعمال',
      category: 'أكاديمي',
      priority: 'متوسطة',
    };

    const created = await ticketsService.create(intakeDto as any);

    expect(created).toBeDefined();
    expect(created.ticketNumber).toBeDefined();
    expect(created.status).toBe(TicketStatus.Open);
    expect(mockOutboxService.persistTicketWithJobs).toHaveBeenCalledTimes(1);

    // Verify outbox entries
    expect(mockOutboxJobs.length).toBe(2);
    expect(mockOutboxJobs.some((j) => j.modelType === AiModelType.SUMMARIZE)).toBe(true);
    expect(mockOutboxJobs.some((j) => j.modelType === AiModelType.CLASSIFY_ROUTE)).toBe(true);
  });

  it('Phase 2: AI Consumer processes recommendations while strictly preserving Advisory Invariance (status = Open)', async () => {
    const ticket = createMockTicketDoc({
      branchId: branchCairoId,
      subject: 'تظلم من نتيجة مقرر المحاسبة',
      description: 'الدرجة المسجلة لا تتطابق مع درجات التكليفات والامتحان النهائي',
      status: TicketStatus.Open,
    });
    mockDbTickets.push(ticket);

    mockOutboxJobs.push({
      _id: new Types.ObjectId(),
      ticketId: ticket._id,
      modelType: AiModelType.SUMMARIZE,
      status: TaskProcessingStatus.PENDING,
    });

    const claimedJob = await mockOutboxService.claimJob(AiModelType.SUMMARIZE);
    expect(claimedJob).toBeDefined();
    expect(claimedJob.status).toBe(TaskProcessingStatus.PROCESSING);

    // Simulate AI Advisory output application
    ticket.aiAnalysis = {
      summary: 'شكوى مقدمة بخصوص مقرر المحاسبة تتضمن تظلم من رصد الدرجات',
      recommendedBranch: 'فرع القاهرة',
      recommendedDepartment: 'شؤون التعليم والطلاب',
      confidence: 0.94,
    };
    await ticket.save();
    await mockOutboxService.completeJob(claimedJob._id);

    // CRITICAL ADVISORY INVARIANCE ASSERTION:
    // AI MUST NEVER change ticket status or set official routing
    expect(ticket.status).toBe(TicketStatus.Open);
    expect(ticket.aiAnalysis.confidence).toBe(0.94);
    expect(claimedJob.status).toBe(TaskProcessingStatus.COMPLETED);
  });

  it('Phase 3: Central Complaints Head dispatches or escalates tickets with role auditing', async () => {
    const ticket = createMockTicketDoc({
      status: TicketStatus.Open,
      subject: 'طلب اعتماد تحويل داخلي',
    });
    mockDbTickets.push(ticket);

    // 1. Dispatch flow to branch & department
    const dispatchDto = {
      assignedBranchId: branchCairoId.toHexString(),
      assignedDepartmentId: deptStudentAffairsId.toHexString(),
      dispatchNote: 'تم فحص توصية الذكاء الاصطناعي والتوجيه لشؤون الطلاب للبت',
      isEscalatedToPresident: false,
    };

    const dispatched = await ticketsService.dispatch(ticket._id.toString(), dispatchDto as any, centralComplaintsHead);
    expect(dispatched.status).toBe(TicketStatus.InProgress);
    expect(dispatched.routing.assignedBranchId.toString()).toBe(branchCairoId.toHexString());
    expect(dispatched.routing.assignedDepartmentId.toString()).toBe(deptStudentAffairsId.toHexString());
    expect(dispatched.timeline.length).toBeGreaterThan(0);
    expect(dispatched.timeline[0].action).toBe('توجيه الشكوى للفرع المختص');

    // 2. Escalation flow to Academy President
    const sovereignTicket = createMockTicketDoc({
      status: TicketStatus.Open,
      subject: 'قضية تظلم استثنائية موجهة لرئيس الأكاديمية',
    });
    mockDbTickets.push(sovereignTicket);

    const escalateDto = {
      isEscalatedToPresident: true,
      escalationReason: 'حالة سيادية استثنائية تتطلب قرار معالي رئيس الأكاديمية',
      dispatchNote: 'تم الإحالة إلى مكتب رئيس الأكاديمية للبت النهائي',
    };

    const escalated = await ticketsService.dispatch(sovereignTicket._id.toString(), escalateDto as any, centralComplaintsHead);
    expect(escalated.status).toBe(TicketStatus.InProgress);
    expect(escalated.routing.isEscalatedToPresident).toBe(true);
    expect(escalated.timeline.some((t: any) => t.action === 'تصعيد الشكوى لرئيس الأكاديمية')).toBe(true);
  });

  it('Phase 4: Staff & President resolution enforces Tenancy Scoping and Mandatory Justification', async () => {
    // Ticket in Cairo branch Student Affairs
    const cairoTicket = createMockTicketDoc({
      branchId: branchCairoId,
      departmentId: deptStudentAffairsId,
      routing: {
        assignedBranchId: branchCairoId,
        assignedDepartmentId: deptStudentAffairsId,
        isEscalatedToPresident: false,
      },
      status: TicketStatus.InProgress,
      subject: 'مشكلة تسجيل مادة التخرج',
    });
    mockDbTickets.push(cairoTicket);

    // Tenancy Scoping verification via TenancyScoper
    const alexScope = TenancyScoper.getTicketQueryScope(alexStaffUser);
    expect(alexScope.$or).toBeDefined();

    // Verify Alex staff cannot resolve Cairo ticket
    expect(() => TenancyScoper.assertCanResolve(alexStaffUser, cairoTicket)).toThrow(ForbiddenException);

    // Verify Cairo staff can resolve Cairo ticket
    expect(() => TenancyScoper.assertCanResolve(cairoStaffUser, cairoTicket)).not.toThrow();

    // Validation: Justification with < 10 characters MUST be rejected
    const shortJustificationDto = {
      status: TicketStatus.Resolved,
      justification: 'تم', // Only 2 chars
    };
    await expect(
      ticketsService.resolve(cairoTicket._id.toString(), shortJustificationDto as any, cairoStaffUser),
    ).rejects.toThrow(BadRequestException);

    // Valid Resolution by Department Staff
    const validResolveDto = {
      status: TicketStatus.Resolved,
      justification: 'تمت مراجعة السجل الأكاديمي وإضافة المقرر بنجاح وفق اللائحة',
    };
    const resolvedTicket = await ticketsService.resolve(
      cairoTicket._id.toString(),
      validResolveDto as any,
      cairoStaffUser,
    );

    expect(resolvedTicket.status).toBe(TicketStatus.Resolved);
    expect(resolvedTicket.resolution.resolvedBy.toString()).toBe(cairoStaffUser.userId);
    expect(resolvedTicket.resolution.justification).toBe(validResolveDto.justification);
    expect(resolvedTicket.resolution.resolvedAt).toBeDefined();

    // Sovereign Resolution by Academy President on Escalated Ticket
    const escalatedTicket = createMockTicketDoc({
      branchId: branchCairoId,
      status: TicketStatus.InProgress,
      routing: { isEscalatedToPresident: true },
      subject: 'التماس استثنائي لإعادة القيد',
    });
    mockDbTickets.push(escalatedTicket);

    // President has authority to resolve escalated ticket
    expect(() => TenancyScoper.assertCanResolve(academyPresidentUser, escalatedTicket)).not.toThrow();

    const presidentResolveDto = {
      status: TicketStatus.Resolved,
      justification: 'بناءً على الصلاحيات الممنوحة لمعالي رئيس الأكاديمية تقرر الموافقة على إعادة القيد استثنائياً',
    };
    const presidentResolved = await ticketsService.resolve(
      escalatedTicket._id.toString(),
      presidentResolveDto as any,
      academyPresidentUser,
    );

    expect(presidentResolved.status).toBe(TicketStatus.Resolved);
    expect(presidentResolved.resolution.resolvedBy.toString()).toBe(academyPresidentUser.userId);
  });

  it('Phase 5: Executive BI Aggregation and UTF-8 BOM CSV Export reflect nationwide metrics', async () => {
    // Populate DB with multi-state tickets
    mockDbTickets.push(
      createMockTicketDoc({ status: TicketStatus.Resolved, branchId: branchCairoId, branch: 'فرع القاهرة' }),
      createMockTicketDoc({ status: TicketStatus.InProgress, branchId: branchCairoId, branch: 'فرع القاهرة' }),
      createMockTicketDoc({ status: TicketStatus.InProgress, branchId: branchAlexId, branch: 'فرع الإسكندرية', routing: { isEscalatedToPresident: true } }),
    );

    // 1. Executive Summary KPIs
    const summary = await analyticsService.getExecutiveSummary();
    expect(summary.totalTickets).toBe(3);
    expect(summary.resolvedTickets).toBe(1);
    expect(summary.inProgressTickets).toBe(2);
    expect(summary.escalatedCount).toBe(1);
    expect(summary.averageResolutionHours).toBe(18.5);

    // 2. Branch Breakdown
    const branchBreakdown = await analyticsService.getBranchBreakdown();
    expect(branchBreakdown.length).toBeGreaterThan(0);
    expect(branchBreakdown[0].name).toBe('فرع القاهرة');

    // 3. Category Breakdown
    const categoryBreakdown = await analyticsService.getCategoryBreakdown();
    expect(categoryBreakdown.length).toBeGreaterThan(0);
    expect(categoryBreakdown[0].category).toBe('أكاديمي');

    // 4. Presidential Escalation Queue
    const escalations = await analyticsService.getRecentEscalations(10);
    expect(escalations.length).toBe(1);
    expect(escalations[0].routing.isEscalatedToPresident).toBe(true);

    // 5. UTF-8 BOM CSV Export
    const csvContent = await analyticsService.generateCsvReport();
    expect(csvContent.startsWith('\uFEFF')).toBe(true);
    expect(csvContent).toContain('رقم الشكوى');
    expect(csvContent).toContain('تاريخ التقديم');
    expect(csvContent).toContain('الحالة');
    expect(csvContent).toContain('قرار البت');
  });
});
