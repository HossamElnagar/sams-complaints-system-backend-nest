import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiBridgeService } from './ai-bridge.service.js';

describe('AiBridgeService (Extended)', () => {
  let service: AiBridgeService;

  const mockConfigService = {
    get: vi.fn((key: string): string | undefined => {
      const config: Record<string, string> = {
        AI_SUMMARIZE_URL: 'http://127.0.0.1:8001/summarize',
        AI_CLASSIFY_ROUTE_URL: 'http://127.0.0.1:8002/classify-route',
        AI_SERVICE_MOCK: 'true', // Mock mode enabled for unit tests
        AI_TIMEOUT_MS: '10000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiBridgeService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiBridgeService>(AiBridgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('summarize() - mock mode', () => {
    it('should return a non-empty Arabic summary string', async () => {
      const result = await service.summarize({
        ticketId: 'ticket_001',
        subject: 'اعتراض على نتيجة امتحان',
        description: 'تقدمت بشكوى بشأن درجات مادة المحاسبة للفصل الدراسي الأول',
      });

      expect(result).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(10);
      expect(result.summary).toContain('اعتراض على نتيجة امتحان');
    });

    it('should include a truncated description in the mock summary', async () => {
      const description = 'ل'.repeat(200);
      const result = await service.summarize({
        ticketId: 'ticket_002',
        subject: 'موضوع الشكوى',
        description,
      });

      // Mock truncates at 80 chars
      expect(result.summary).toContain('ل'.repeat(80));
    });
  });

  describe('classifyRoute() - mock mode', () => {
    it('should return a valid routing recommendation with confidence score', async () => {
      const result = await service.classifyRoute({
        ticketId: 'ticket_001',
        subject: 'مشكلة في السكن',
        description: 'أواجه مشكلة في السكن الجامعي',
        category: 'إداري',
      });

      expect(result).toBeDefined();
      expect(typeof result.recommendedBranch).toBe('string');
      expect(typeof result.recommendedDepartment).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should recommend academic department for academic category tickets', async () => {
      const result = await service.classifyRoute({
        ticketId: 'ticket_003',
        subject: 'تظلم على درجات',
        description: 'تظلم على درجات الاختبار النهائي',
        category: 'أكاديمي',
      });

      expect(result.recommendedDepartment).toContain('شؤون التعليم');
    });

    it('should recommend student welfare for non-academic tickets not containing exam keywords', async () => {
      const result = await service.classifyRoute({
        ticketId: 'ticket_004',
        subject: 'شكوى خدمية',
        description: 'خدمة المكتبة غير كافية',
        category: 'إداري',
      });

      expect(result.recommendedDepartment).toContain('رعاية الطلاب');
    });

    it('should detect academic intent from description keywords (امتحان)', async () => {
      const result = await service.classifyRoute({
        ticketId: 'ticket_005',
        subject: 'سؤال',
        description: 'تأجيل موعد الامتحان النهائي',
        category: 'إداري',
      });

      expect(result.recommendedDepartment).toContain('شؤون التعليم');
    });
  });

  describe('summarize() - live HTTP mode (stubbed fetch)', () => {
    let liveModeService: AiBridgeService;

    const liveModeConfig = {
      get: vi.fn((key: string): string | undefined => {
        const config: Record<string, string> = {
          AI_SERVICE_MOCK: 'false',
          AI_TIMEOUT_MS: '5000',
          AI_SUMMARIZE_URL: 'http://127.0.0.1:8001/summarize',
          AI_CLASSIFY_ROUTE_URL: 'http://127.0.0.1:8002/classify-route',
        };
        return config[key];
      }),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiBridgeService,
          { provide: ConfigService, useValue: liveModeConfig },
        ],
      }).compile();

      liveModeService = module.get<AiBridgeService>(AiBridgeService);
    });

    it('should throw when microservice returns non-OK status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: vi.fn().mockResolvedValue('Service unavailable'),
      });

      vi.stubGlobal('fetch', mockFetch);

      await expect(
        liveModeService.summarize({
          ticketId: 't1',
          subject: 'موضوع',
          description: 'وصف',
        }),
      ).rejects.toThrow(/503/);

      vi.unstubAllGlobals();
    });

    it('should throw when microservice returns invalid payload structure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ unexpected_field: 'value' }),
      });

      vi.stubGlobal('fetch', mockFetch);

      await expect(
        liveModeService.summarize({
          ticketId: 't1',
          subject: 'موضوع',
          description: 'وصف',
        }),
      ).rejects.toThrow(/invalid payload structure/i);

      vi.unstubAllGlobals();
    });

    it('should return valid classifyRoute response when microservice is healthy', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          recommendedBranch: 'الإسكندرية',
          recommendedDepartment: 'شؤون التعليم والطلاب',
          confidence: 0.87,
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const result = await liveModeService.classifyRoute({
        ticketId: 't2',
        subject: 'تظلم',
        description: 'تظلم على النتيجة',
        category: 'أكاديمي',
      });

      expect(result.recommendedBranch).toBe('الإسكندرية');
      expect(result.confidence).toBe(0.87);

      vi.unstubAllGlobals();
    });
  });
});
