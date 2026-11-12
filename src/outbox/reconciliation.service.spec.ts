import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OutboxReconciliationService } from './reconciliation.service.js';
import { OutboxService } from './outbox.service.js';
import { Ticket } from '../tickets/schemas/ticket.schema.js';
import { AiOutboxJob } from './schemas/ai-outbox-job.schema.js';


describe('OutboxReconciliationService', () => {
  let service: OutboxReconciliationService;
  let outboxService: OutboxService;

  const ticketId1 = new Types.ObjectId();
  const ticketId2 = new Types.ObjectId();

  const mockOutboxService = {
    recoverStaleLocks: vi.fn(),
    createOutboxJobsForTicket: vi.fn(),
  };

  const mockTicketModel = {
    find: vi.fn(),
  };

  const mockOutboxModel = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOutboxService.recoverStaleLocks.mockResolvedValue(0);
    mockOutboxService.createOutboxJobsForTicket.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxReconciliationService,
        { provide: OutboxService, useValue: mockOutboxService },
        { provide: getModelToken(Ticket.name), useValue: mockTicketModel },
        { provide: getModelToken(AiOutboxJob.name), useValue: mockOutboxModel },
      ],
    }).compile();

    service = module.get<OutboxReconciliationService>(OutboxReconciliationService);
    outboxService = module.get<OutboxService>(OutboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startReconciliationWorker() / stopReconciliationWorker()', () => {
    it('should start and stop the reconciliation interval without error', () => {
      service.startReconciliationWorker();
      expect(service['timer']).not.toBeNull();
      service.stopReconciliationWorker();
      expect(service['timer']).toBeNull();
    });

    it('should not create a second timer if already running', () => {
      service.startReconciliationWorker();
      const firstTimer = service['timer'];
      service.startReconciliationWorker();
      expect(service['timer']).toBe(firstTimer); // same reference
      service.stopReconciliationWorker();
    });
  });

  describe('runReconciliation()', () => {
    it('should recover stale locks and report the count', async () => {
      mockOutboxService.recoverStaleLocks.mockResolvedValue(3);
      mockTicketModel.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
        }),
      });

      const result = await service.runReconciliation();
      expect(result.recoveredLocks).toBe(3);
      expect(outboxService.recoverStaleLocks).toHaveBeenCalledOnce();
    });

    it('should recreate missing outbox jobs for tickets with no corresponding job entries', async () => {
      mockOutboxService.recoverStaleLocks.mockResolvedValue(0);
      mockTicketModel.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([
              { _id: ticketId1 },
              { _id: ticketId2 },
            ]),
          }),
        }),
      });

      // No existing jobs found for any ticket/modelType combination
      mockOutboxModel.findOne.mockReturnValue({ select: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }) });

      const result = await service.runReconciliation();
      // 2 tickets * 2 model types = 4 missing job checks → 4 recreated jobs
      expect(result.recreatedJobs).toBe(4);
      expect(outboxService.createOutboxJobsForTicket).toHaveBeenCalledTimes(4);
    });

    it('should NOT recreate jobs that already exist (idempotency)', async () => {
      mockOutboxService.recoverStaleLocks.mockResolvedValue(0);
      mockTicketModel.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([{ _id: ticketId1 }]),
          }),
        }),
      });

      // Jobs already exist for all model types
      mockOutboxModel.findOne.mockReturnValue({
        select: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }) }),
      });

      const result = await service.runReconciliation();
      expect(result.recreatedJobs).toBe(0);
      expect(outboxService.createOutboxJobsForTicket).not.toHaveBeenCalled();
    });

    it('should handle an empty ticket window gracefully', async () => {
      mockOutboxService.recoverStaleLocks.mockResolvedValue(0);
      mockTicketModel.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
        }),
      });

      const result = await service.runReconciliation();
      expect(result.recoveredLocks).toBe(0);
      expect(result.recreatedJobs).toBe(0);
    });
  });
});
