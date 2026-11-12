import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { AiConsumerService } from './ai-consumer.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AiBridgeService } from './ai-bridge.service.js';
import { Ticket, TicketStatus } from '../tickets/schemas/ticket.schema.js';
import { AiModelType } from '../outbox/enums/outbox.enums.js';

describe('AiConsumerService', () => {
  let service: AiConsumerService;

  const mockOutboxService = {
    claimJob: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
  };

  const mockAiBridgeService = {
    summarize: vi.fn().mockResolvedValue({ summary: 'موجز الشكوى التجريبي' }),
    classifyRoute: vi.fn().mockResolvedValue({
      recommendedBranch: 'الاسكندرية',
      recommendedDepartment: 'شؤون التعليم والطلاب',
      confidence: 0.95,
    }),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'AI_CONSUMER_ENABLED') return 'false'; // disable interval timer during tests
      return null;
    }),
  };

  const createMockTicket = () => ({
    _id: '507f1f77bcf86cd799439011',
    ticketNumber: 'TCK-TEST1234',
    subject: 'موضوع الشكوى',
    description: 'تفاصيل الشكوى الأكاديمية للطالب',
    category: 'أكاديمي',
    status: TicketStatus.Open,
    aiAnalysis: {},
    routing: { isEscalatedToPresident: false },
    timeline: [],
    save: vi.fn().mockResolvedValue(true),
  });

  const mockTicketModel = {
    findById: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiConsumerService,
        { provide: OutboxService, useValue: mockOutboxService },
        { provide: AiBridgeService, useValue: mockAiBridgeService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getModelToken(Ticket.name), useValue: mockTicketModel },
      ],
    }).compile();

    service = module.get<AiConsumerService>(AiConsumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process Model 1 (SUMMARIZE) job and attach summary while preserving status', async () => {
    const fakeTicket = createMockTicket();
    mockTicketModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(fakeTicket),
    });

    const job = {
      _id: 'job_sum_1',
      ticketId: fakeTicket._id,
      modelType: AiModelType.SUMMARIZE,
    };

    await service.processJob(job, 'lock_token_1');

    expect(mockAiBridgeService.summarize).toHaveBeenCalled();
    expect(fakeTicket.aiAnalysis.summary).toBe('موجز الشكوى التجريبي');
    expect(fakeTicket.status).toBe(TicketStatus.Open); // Advisory AI invariance
    expect(fakeTicket.save).toHaveBeenCalled();
    expect(mockOutboxService.completeJob).toHaveBeenCalledWith('job_sum_1', 'lock_token_1');
  });

  it('should process Model 2 (CLASSIFY_ROUTE) job and attach recommendation without auto-routing', async () => {
    const fakeTicket = createMockTicket();
    mockTicketModel.findById.mockReturnValue({
      exec: vi.fn().mockResolvedValue(fakeTicket),
    });

    const job = {
      _id: 'job_cls_1',
      ticketId: fakeTicket._id,
      modelType: AiModelType.CLASSIFY_ROUTE,
    };

    await service.processJob(job, 'lock_token_2');

    expect(mockAiBridgeService.classifyRoute).toHaveBeenCalled();
    expect(fakeTicket.aiAnalysis.recommendedBranch).toBe('الاسكندرية');
    expect(fakeTicket.aiAnalysis.recommendedDepartment).toBe('شؤون التعليم والطلاب');
    expect(fakeTicket.aiAnalysis.confidence).toBe(0.95);
    expect(fakeTicket.routing.assignedBranchId).toBeUndefined(); // Zero automated authority
    expect(fakeTicket.status).toBe(TicketStatus.Open);
    expect(fakeTicket.save).toHaveBeenCalled();
    expect(mockOutboxService.completeJob).toHaveBeenCalledWith('job_cls_1', 'lock_token_2');
  });

  it('should call failJob on error', async () => {
    mockTicketModel.findById.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('Database error')),
    });

    const job = {
      _id: 'job_err_1',
      ticketId: '507f1f77bcf86cd799439011',
      modelType: AiModelType.SUMMARIZE,
    };

    await service.processJob(job, 'lock_token_err');
    expect(mockOutboxService.failJob).toHaveBeenCalledWith('job_err_1', 'lock_token_err', 'Database error');
  });
});
