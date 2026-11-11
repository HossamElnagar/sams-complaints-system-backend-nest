import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TicketsService } from './tickets.service.js';
import { Ticket } from './schemas/ticket.schema.js';
import { OutboxService } from '../outbox/outbox.service.js';

describe('TicketsService', () => {
  let service: TicketsService;

  const mockTicketModel = {
    new: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
  };

  const mockOutboxService = {
    persistTicketWithJobs: vi.fn(),
    createOutboxJobsForTicket: vi.fn(),
    claimJob: vi.fn(),
    completeJob: vi.fn(),
    failJob: vi.fn(),
    recoverStaleLocks: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        {
          provide: getModelToken(Ticket.name),
          useValue: mockTicketModel,
        },
        {
          provide: OutboxService,
          useValue: mockOutboxService,
        },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
