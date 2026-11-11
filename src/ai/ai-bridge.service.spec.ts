import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiBridgeService } from './ai-bridge.service.js';

describe('AiBridgeService', () => {
  let service: AiBridgeService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'AI_SERVICE_MOCK') return 'true';
      if (key === 'AI_SUMMARIZE_URL') return 'http://127.0.0.1:8001/summarize';
      if (key === 'AI_CLASSIFY_ROUTE_URL') return 'http://127.0.0.1:8002/classify-route';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiBridgeService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AiBridgeService>(AiBridgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate Arabic summary in mock mode', async () => {
    const res = await service.summarize({
      ticketId: '123',
      subject: 'تأخير في رصد درجات مادة الإحصاء',
      description: 'أود الاستفسار عن سبب تأخر إعلان نتيجة أعمال السنة لمادة الإحصاء بالفرع',
    });

    expect(res.summary).toBeDefined();
    expect(res.summary).toContain('تأخير في رصد درجات مادة الإحصاء');
  });

  it('should generate classification and routing with confidence score in mock mode', async () => {
    const res = await service.classifyRoute({
      ticketId: '123',
      subject: 'طلب مراجعة نتيجة امتحان',
      description: 'أرغب في تقديم التماس لإعادة رصد درجات مادة الإدارة العامة',
      category: 'أكاديمي',
    });

    expect(res.recommendedBranch).toBe('القاهرة');
    expect(res.recommendedDepartment).toBe('شؤون التعليم والطلاب');
    expect(res.confidence).toBeGreaterThan(0.8);
    expect(res.confidence).toBeLessThanOrEqual(1.0);
  });
});
