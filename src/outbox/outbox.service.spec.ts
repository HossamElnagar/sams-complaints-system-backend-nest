import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { OutboxService } from './outbox.service.js';
import { AiOutboxJob } from './schemas/ai-outbox-job.schema.js';
import { TaskProcessingStatus, AiModelType } from './enums/outbox.enums.js';

describe('OutboxService', () => {
  let service: OutboxService;

  const mockOutboxModel = {
    updateOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) }),
    updateMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 2 }) }),
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
    insertMany: vi.fn(),
  };

  const mockConnection = {
    startSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: getModelToken(AiOutboxJob.name),
          useValue: mockOutboxModel,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should atomically claim a pending job', async () => {
    const fakeJob = {
      _id: 'job_123',
      idempotencyKey: 'ticket_1_SUMMARIZE',
      modelType: AiModelType.SUMMARIZE,
      status: TaskProcessingStatus.PROCESSING,
    };

    mockOutboxModel.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(fakeJob),
    });

    const claimed = await service.claimJob(AiModelType.SUMMARIZE);
    expect(claimed).not.toBeNull();
    expect(claimed?.job._id).toBe('job_123');
    expect(claimed?.lockToken).toBeDefined();
  });

  it('should recover stale locks older than 5 minutes', async () => {
    mockOutboxModel.updateMany.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
    });

    const recovered = await service.recoverStaleLocks();
    expect(recovered).toBe(3);
    expect(mockOutboxModel.updateMany).toHaveBeenCalled();
  });
});
