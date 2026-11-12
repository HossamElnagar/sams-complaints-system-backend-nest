import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: AnalyticsService;

  const mockAnalyticsService = {
    getExecutiveSummary: vi.fn(),
    getBranchBreakdown: vi.fn(),
    getCategoryBreakdown: vi.fn(),
    getRecentEscalations: vi.fn(),
    generateCsvReport: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /analytics/summary', () => {
    it('should return executive summary KPIs', async () => {
      const mockSummary = {
        totalTickets: 50,
        openTickets: 10,
        inProgressTickets: 15,
        resolvedTickets: 20,
        rejectedTickets: 5,
        escalatedCount: 3,
        resolutionRate: 40,
        averageResolutionHours: 18.5,
      };
      mockAnalyticsService.getExecutiveSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSummary();
      expect(analyticsService.getExecutiveSummary).toHaveBeenCalledOnce();
      expect(result.totalTickets).toBe(50);
      expect(result.resolutionRate).toBe(40);
    });
  });

  describe('GET /analytics/branches', () => {
    it('should return branch breakdown list', async () => {
      const mockBranches = [
        { branchId: '1', name: 'فرع القاهرة', code: 'CAI', total: 30, resolved: 25, inProgress: 5, escalated: 1, resolutionRate: 83 },
      ];
      mockAnalyticsService.getBranchBreakdown.mockResolvedValue(mockBranches);

      const result = await controller.getBranchBreakdown();
      expect(analyticsService.getBranchBreakdown).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('CAI');
    });
  });

  describe('GET /analytics/categories', () => {
    it('should return category breakdown list', async () => {
      const mockCats = [
        { category: 'أكاديمي', count: 35, percentage: 70 },
        { category: 'مالي', count: 15, percentage: 30 },
      ];
      mockAnalyticsService.getCategoryBreakdown.mockResolvedValue(mockCats);

      const result = await controller.getCategoryBreakdown();
      expect(analyticsService.getCategoryBreakdown).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
    });
  });

  describe('GET /analytics/escalations', () => {
    it('should return recent escalations with default limit of 10', async () => {
      mockAnalyticsService.getRecentEscalations.mockResolvedValue([{ _id: 'e1' }]);

      const result = await controller.getRecentEscalations(undefined);
      expect(analyticsService.getRecentEscalations).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(1);
    });

    it('should respect custom limit query parameter capped at 50', async () => {
      mockAnalyticsService.getRecentEscalations.mockResolvedValue([]);

      await controller.getRecentEscalations('25');
      expect(analyticsService.getRecentEscalations).toHaveBeenCalledWith(25);

      await controller.getRecentEscalations('100');
      expect(analyticsService.getRecentEscalations).toHaveBeenCalledWith(50);
    });
  });

  describe('GET /analytics/export/csv', () => {
    it('should set headers and stream CSV text to response', async () => {
      const mockCsv = '\uFEFFرقم الشكوى,تاريخ التقديم\nTCK-01,2026-11-12\n';
      mockAnalyticsService.generateCsvReport.mockResolvedValue(mockCsv);

      const mockResponse: any = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await controller.exportCsv(mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename='),
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.send).toHaveBeenCalledWith(mockCsv);
    });
  });
});
