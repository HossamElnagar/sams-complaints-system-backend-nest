import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AnalyticsService } from './analytics.service.js';
import { Ticket } from '../tickets/schemas/ticket.schema.js';
import { Branch } from '../branches/schemas/branch.schema.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const branchId1 = new Types.ObjectId();
  const branchId2 = new Types.ObjectId();

  const mockBranchList = [
    { _id: branchId1, name: 'فرع القاهرة', code: 'CAI', isActive: true },
    { _id: branchId2, name: 'فرع الإسكندرية', code: 'ALX', isActive: true },
  ];

  const mockTicketModel = {
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
    find: vi.fn(),
  };

  const mockBranchModel = {
    find: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockBranchModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockBranchList),
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getModelToken(Ticket.name), useValue: mockTicketModel },
        { provide: getModelToken(Branch.name), useValue: mockBranchModel },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getExecutiveSummary()', () => {
    it('should aggregate and calculate executive KPIs accurately', async () => {
      // Mock counts: total=10, open=3, inProgress=2, resolved=4, rejected=1, escalated=2
      mockTicketModel.countDocuments
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(10) }) // total
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(3) })  // open
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(2) })  // inProgress
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(4) })  // resolved
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(1) })  // rejected
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(2) }); // escalated

      mockTicketModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([{ _id: null, avgHours: 24.5 }]),
      });

      const summary = await service.getExecutiveSummary();

      expect(summary.totalTickets).toBe(10);
      expect(summary.openTickets).toBe(3);
      expect(summary.inProgressTickets).toBe(2);
      expect(summary.resolvedTickets).toBe(4);
      expect(summary.rejectedTickets).toBe(1);
      expect(summary.escalatedCount).toBe(2);
      expect(summary.resolutionRate).toBe(40); // 4 / 10 * 100
      expect(summary.averageResolutionHours).toBe(24.5);
    });

    it('should return 0 resolutionRate when totalTickets is 0', async () => {
      mockTicketModel.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      });
      mockTicketModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const summary = await service.getExecutiveSummary();
      expect(summary.totalTickets).toBe(0);
      expect(summary.resolutionRate).toBe(0);
      expect(summary.averageResolutionHours).toBe(0);
    });
  });

  describe('getBranchBreakdown()', () => {
    it('should return branch breakdown with resolution rate per branch', async () => {
      mockTicketModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: branchId1,
            total: 10,
            resolved: 8,
            inProgress: 2,
            escalated: 1,
          },
        ]),
      });

      const result = await service.getBranchBreakdown();

      expect(result).toHaveLength(2);
      const cairo = result.find((b) => b.code === 'CAI');
      expect(cairo).toBeDefined();
      expect(cairo?.total).toBe(10);
      expect(cairo?.resolved).toBe(8);
      expect(cairo?.resolutionRate).toBe(80);

      const alex = result.find((b) => b.code === 'ALX');
      expect(alex).toBeDefined();
      expect(alex?.total).toBe(0);
      expect(alex?.resolutionRate).toBe(0);
    });
  });

  describe('getCategoryBreakdown()', () => {
    it('should group tickets by category and compute percentage', async () => {
      mockTicketModel.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(100),
      });

      mockTicketModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          { _id: 'أكاديمي', count: 60 },
          { _id: 'مالي', count: 40 },
        ]),
      });

      const result = await service.getCategoryBreakdown();

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('أكاديمي');
      expect(result[0].count).toBe(60);
      expect(result[0].percentage).toBe(60);

      expect(result[1].category).toBe('مالي');
      expect(result[1].percentage).toBe(40);
    });
  });

  describe('getRecentEscalations()', () => {
    it('should query tickets with isEscalatedToPresident=true up to the specified limit', async () => {
      const mockEscalatedTickets = [{ _id: 'ticket1', routing: { isEscalatedToPresident: true } }];

      mockTicketModel.find.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  exec: vi.fn().mockResolvedValue(mockEscalatedTickets),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await service.getRecentEscalations(5);
      expect(result).toHaveLength(1);
      expect(mockTicketModel.find).toHaveBeenCalledWith({ 'routing.isEscalatedToPresident': true });
    });
  });

  describe('generateCsvReport()', () => {
    it('should generate properly formatted UTF-8 Arabic CSV string', async () => {
      const mockTickets = [
        {
          _id: new Types.ObjectId(),
          ticketNumber: 'TCK-001',
          createdAt: new Date('2026-11-01'),
          studentName: 'أحمد محمود',
          studentPhone: '01012345678',
          studentEmail: 'ahmed@academy.edu',
          category: 'أكاديمي',
          priority: 'عاجلة',
          status: 'تم الحل',
          branch: 'القاهرة',
          routing: { isEscalatedToPresident: false },
          resolution: {
            justification: 'تمت معالجة الطلب بالكامل',
            resolvedAt: new Date('2026-11-02'),
          },
        },
      ];

      mockTicketModel.find.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue(mockTickets),
              }),
            }),
          }),
        }),
      });

      const csv = await service.generateCsvReport();

      // Check UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('رقم الشكوى');
      expect(csv).toContain('TCK-001');
      expect(csv).toContain('أحمد محمود');
      expect(csv).toContain('تمت معالجة الطلب بالكامل');
    });
  });
});
