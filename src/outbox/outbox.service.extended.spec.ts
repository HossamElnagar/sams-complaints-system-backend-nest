import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OutboxService } from './outbox.service.js';
import { AiOutboxJob } from './schemas/ai-outbox-job.schema.js';
import { TaskProcessingStatus, AiModelType } from './enums/outbox.enums.js';

describe('OutboxService (Extended)', () => {
  let service: OutboxService;

  const jobId = new Types.ObjectId();
  const lockToken = 'test-lock-token-uuid';

  const mockOutboxModel = {
    updateOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) }),
    updateMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 2 }) }),
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    insertMany: vi.fn(),
  };

  const mockConnection = {
    startSession: vi.fn().mockResolvedValue({
      withTransaction: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn().mockResolvedValue(undefined),
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset per-test return values to defaults
    mockOutboxModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });
    mockOutboxModel.updateMany.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) });
    mockOutboxModel.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    mockOutboxModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    mockConnection.startSession.mockResolvedValue({
      withTransaction: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn().mockResolvedValue(undefined),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: getModelToken(AiOutboxJob.name), useValue: mockOutboxModel },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('claimJob()', () => {
    it('should return null when no job is available to claim', async () => {
      mockOutboxModel.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.claimJob(AiModelType.SUMMARIZE);
      expect(result).toBeNull();
    });

    it('should return a claimed job with a UUID lockToken when a pending job is available', async () => {
      const fakeJob = {
        _id: jobId,
        modelType: AiModelType.SUMMARIZE,
        status: TaskProcessingStatus.PROCESSING,
        lockToken: 'claimed-lock',
      };
      mockOutboxModel.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(fakeJob) });

      const claimed = await service.claimJob(AiModelType.SUMMARIZE);
      expect(claimed).not.toBeNull();
      expect(claimed?.job._id).toEqual(jobId);
      expect(typeof claimed?.lockToken).toBe('string');
      expect(claimed?.lockToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should claim jobs without modelType filter when no model specified', async () => {
      const fakeJob = {
        _id: jobId,
        modelType: AiModelType.CLASSIFY_ROUTE,
        status: TaskProcessingStatus.PROCESSING,
      };
      mockOutboxModel.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(fakeJob) });

      const claimed = await service.claimJob();
      expect(claimed).not.toBeNull();
      // findOneAndUpdate should NOT have modelType in its query
      const callArgs = mockOutboxModel.findOneAndUpdate.mock.calls[0][0];
      expect(callArgs.modelType).toBeUndefined();
    });
  });

  describe('completeJob()', () => {
    it('should return true when a job is successfully marked as completed with matching lockToken', async () => {
      mockOutboxModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });

      const result = await service.completeJob(jobId, lockToken);
      expect(result).toBe(true);
      expect(mockOutboxModel.updateOne).toHaveBeenCalledWith(
        { _id: jobId, lockToken },
        expect.objectContaining({ $set: expect.objectContaining({ status: TaskProcessingStatus.COMPLETED }) }),
      );
    });

    it('should return false when lockToken does not match (optimistic concurrency guard)', async () => {
      mockOutboxModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) });

      const result = await service.completeJob(jobId, 'wrong-lock-token');
      expect(result).toBe(false);
    });
  });

  describe('failJob()', () => {
    it('should mark job as PENDING with backoff when attempts < 3', async () => {
      const jobDoc = {
        _id: jobId,
        lockToken,
        attempts: 1,
        nextRunAt: new Date(),
      };
      mockOutboxModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(jobDoc) });
      mockOutboxModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });

      await service.failJob(jobId, lockToken, 'Connection timeout');

      const updateCall = mockOutboxModel.updateOne.mock.calls[0];
      const $set = updateCall[1].$set;
      expect($set.status).toBe(TaskProcessingStatus.PENDING);
      expect($set.attempts).toBe(2);
    });

    it('should mark job as FAILED permanently after 3 attempts', async () => {
      const jobDoc = {
        _id: jobId,
        lockToken,
        attempts: 2,
        nextRunAt: new Date(),
      };
      mockOutboxModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(jobDoc) });
      mockOutboxModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });

      await service.failJob(jobId, lockToken, 'Service unavailable');

      const updateCall = mockOutboxModel.updateOne.mock.calls[0];
      const $set = updateCall[1].$set;
      expect($set.status).toBe(TaskProcessingStatus.FAILED);
      expect($set.attempts).toBe(3);
    });

    it('should do nothing when job is not found (lockToken expired or invalid)', async () => {
      mockOutboxModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      await service.failJob(jobId, 'invalid-lock', 'Error message');
      expect(mockOutboxModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('recoverStaleLocks()', () => {
    it('should update stale PROCESSING jobs back to PENDING and return count', async () => {
      mockOutboxModel.updateMany.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 5 }) });

      const count = await service.recoverStaleLocks();
      expect(count).toBe(5);
      expect(mockOutboxModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskProcessingStatus.PROCESSING }),
        expect.objectContaining({ $set: expect.objectContaining({ status: TaskProcessingStatus.PENDING }) }),
      );
    });

    it('should return 0 when no stale locks exist', async () => {
      mockOutboxModel.updateMany.mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) });

      const count = await service.recoverStaleLocks();
      expect(count).toBe(0);
    });
  });

  describe('createOutboxJobsForTicket()', () => {
    it('should upsert SUMMARIZE and CLASSIFY_ROUTE jobs idempotently', async () => {
      mockOutboxModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ upsertedCount: 1 }) });
      const ticketId = new Types.ObjectId();

      await service.createOutboxJobsForTicket(ticketId);

      // Should be called twice: once for each model type
      expect(mockOutboxModel.updateOne).toHaveBeenCalledTimes(2);

      const firstCallFilter = mockOutboxModel.updateOne.mock.calls[0][0];
      const secondCallFilter = mockOutboxModel.updateOne.mock.calls[1][0];
      expect(firstCallFilter.idempotencyKey).toContain(AiModelType.SUMMARIZE);
      expect(secondCallFilter.idempotencyKey).toContain(AiModelType.CLASSIFY_ROUTE);
    });
  });
});
