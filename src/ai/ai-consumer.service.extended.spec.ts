import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AiConsumerService } from './ai-consumer.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AiBridgeService } from './ai-bridge.service.js';
import { Ticket } from '../tickets/schemas/ticket.schema.js';
import { AiModelType } from '../outbox/enums/outbox.enums.js';
import { TicketStatus } from '../tickets/schemas/ticket.schema.js';

describe('AiConsumerService (Extended)', () => {
  let service: AiConsumerService;

  const ticketId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const lockToken = 'test-lock-uuid';

  const makeTicketDoc = (overrides = {}) => ({
    _id: ticketId,
    ticketNumber: 'TCK-AI001',
    subject: 'اعتراض على النتيجة',
    description: 'تقدمت بشكوى بشأن نتيجة مادة المحاسبة',
    category: 'أكاديمي',
    status: TicketStatus.Open,
    aiAnalysis: null as any,
    timeline: [] as any[],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const mockOutboxService = {
    claimJob: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
  };

  const mockAiBridgeService = {
    summarize: vi.fn(),
    classifyRoute: vi.fn(),
  };

  const mockTicketModel = {
    findById: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string): string => {
      if (key === 'AI_CONSUMER_ENABLED') return 'true';
      if (key === 'AI_POLL_INTERVAL_MS') return '5000';
      return '';
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOutboxService.claimJob.mockResolvedValue(null);
    mockOutboxService.completeJob.mockResolvedValue(true);
    mockOutboxService.failJob.mockResolvedValue(undefined);

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

  afterEach(() => {
    service.stopWorker();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startWorker() / stopWorker()', () => {
    it('should start and stop the polling worker without error', () => {
      service.startWorker();
      expect(service['timer']).not.toBeNull();
      service.stopWorker();
      expect(service['timer']).toBeNull();
    });

    it('should not create a second timer if already started', () => {
      service.startWorker();
      const firstTimer = service['timer'];
      service.startWorker();
      expect(service['timer']).toBe(firstTimer);
      service.stopWorker();
    });
  });

  describe('processNextBatch()', () => {
    it('should do nothing when no claimable job exists', async () => {
      mockOutboxService.claimJob.mockResolvedValue(null);

      await service.processNextBatch();

      expect(mockOutboxService.completeJob).not.toHaveBeenCalled();
      expect(mockOutboxService.failJob).not.toHaveBeenCalled();
    });

    it('should not run concurrently when already processing', async () => {
      service['isProcessing'] = true;
      await service.processNextBatch();
      expect(mockOutboxService.claimJob).not.toHaveBeenCalled();
      service['isProcessing'] = false;
    });
  });

  describe('processJob() - SUMMARIZE model type', () => {
    it('should call summarize bridge, update aiAnalysis, push timeline, preserve Open status, complete job', async () => {
      const ticket = makeTicketDoc();
      mockTicketModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(ticket) });
      mockAiBridgeService.summarize.mockResolvedValue({
        summary: 'ملخص استشاري تلقائي لمضمون الشكوى',
      });

      const fakeJob = { _id: jobId, ticketId, modelType: AiModelType.SUMMARIZE };

      await service.processJob(fakeJob, lockToken);

      expect(mockAiBridgeService.summarize).toHaveBeenCalledWith({
        ticketId: ticket._id.toString(),
        subject: ticket.subject,
        description: ticket.description,
      });

      // Advisory AI invariance: status must remain Open
      expect(ticket.status).toBe(TicketStatus.Open);

      // AI analysis written
      expect(ticket.aiAnalysis.summary).toBe('ملخص استشاري تلقائي لمضمون الشكوى');

      // Timeline event appended
      expect(ticket.timeline).toHaveLength(1);
      expect(ticket.timeline[0].action).toBe('توليد ملخص الذكاء الاصطناعي');

      // Save and complete job called
      expect(ticket.save).toHaveBeenCalled();
      expect(mockOutboxService.completeJob).toHaveBeenCalledWith(jobId, lockToken);
    });
  });

  describe('processJob() - CLASSIFY_ROUTE model type', () => {
    it('should call classifyRoute bridge, update aiAnalysis with routing recommendation, push timeline, preserve Open status', async () => {
      const ticket = makeTicketDoc();
      mockTicketModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(ticket) });
      mockAiBridgeService.classifyRoute.mockResolvedValue({
        recommendedBranch: 'القاهرة',
        recommendedDepartment: 'شؤون التعليم والطلاب',
        confidence: 0.92,
      });

      const fakeJob = { _id: jobId, ticketId, modelType: AiModelType.CLASSIFY_ROUTE };

      await service.processJob(fakeJob, lockToken);

      expect(mockAiBridgeService.classifyRoute).toHaveBeenCalledWith({
        ticketId: ticket._id.toString(),
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
      });

      // Advisory AI invariance: status must remain Open
      expect(ticket.status).toBe(TicketStatus.Open);

      expect(ticket.aiAnalysis.recommendedBranch).toBe('القاهرة');
      expect(ticket.aiAnalysis.recommendedDepartment).toBe('شؤون التعليم والطلاب');
      expect(ticket.aiAnalysis.confidence).toBe(0.92);

      // Timeline entry contains confidence percentage
      expect(ticket.timeline[0].note).toContain('92.0%');

      expect(mockOutboxService.completeJob).toHaveBeenCalledWith(jobId, lockToken);
    });
  });

  describe('processJob() - error handling', () => {
    it('should call failJob and not rethrow when ticket is not found', async () => {
      mockTicketModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const fakeJob = { _id: jobId, ticketId, modelType: AiModelType.SUMMARIZE };

      await service.processJob(fakeJob, lockToken);

      expect(mockOutboxService.failJob).toHaveBeenCalledWith(
        jobId,
        lockToken,
        expect.stringContaining('not found'),
      );
      expect(mockOutboxService.completeJob).not.toHaveBeenCalled();
    });

    it('should call failJob when AI bridge throws a network error', async () => {
      const ticket = makeTicketDoc();
      mockTicketModel.findById.mockReturnValue({ exec: vi.fn().mockResolvedValue(ticket) });
      mockAiBridgeService.summarize.mockRejectedValue(new Error('Connection refused'));

      const fakeJob = { _id: jobId, ticketId, modelType: AiModelType.SUMMARIZE };

      await service.processJob(fakeJob, lockToken);

      expect(mockOutboxService.failJob).toHaveBeenCalledWith(
        jobId,
        lockToken,
        'Connection refused',
      );
      expect(mockOutboxService.completeJob).not.toHaveBeenCalled();
    });
  });
});
