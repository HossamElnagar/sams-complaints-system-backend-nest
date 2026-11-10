import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OutboxService } from './outbox.service.js';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema.js';
import { AiOutboxJob, AiOutboxJobDocument } from './schemas/ai-outbox-job.schema.js';
import { AiModelType } from './enums/outbox.enums.js';

@Injectable()
export class OutboxReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly INTERVAL_MS = 60 * 1000; // Run reconciliation check every 60 seconds

  constructor(
    private readonly outboxService: OutboxService,
    @InjectModel(Ticket.name) private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(AiOutboxJob.name) private readonly outboxModel: Model<AiOutboxJobDocument>,
  ) {}

  onModuleInit() {
    this.startReconciliationWorker();
  }

  onModuleDestroy() {
    this.stopReconciliationWorker();
  }

  startReconciliationWorker() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      try {
        await this.runReconciliation();
      } catch (err: any) {
        this.logger.error(`Reconciliation run failed: ${err.message}`, err.stack);
      }
    }, this.INTERVAL_MS);
    this.logger.log('Outbox reconciliation background worker initialized.');
  }

  stopReconciliationWorker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Reconciliation cycle:
   * 1. Recovers stale locks (> 5 min).
   * 2. Finds recent tickets without corresponding AI outbox jobs and recreates them using deterministic idempotency keys.
   */
  async runReconciliation(): Promise<{ recoveredLocks: number; recreatedJobs: number }> {
    // 1. Recover stale locks
    const recoveredLocks = await this.outboxService.recoverStaleLocks();

    // 2. Query tickets created in the last 24h
    const lookbackTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTickets = await this.ticketModel
      .find({ createdAt: { $gte: lookbackTime } })
      .select('_id')
      .limit(200)
      .exec();

    let recreatedJobs = 0;

    for (const ticket of recentTickets) {
      for (const modelType of [AiModelType.SUMMARIZE, AiModelType.CLASSIFY_ROUTE]) {
        const idempotencyKey = `${ticket._id}_${modelType}`;
        const existingJob = await this.outboxModel.findOne({ idempotencyKey }).select('_id').exec();

        if (!existingJob) {
          await this.outboxService.createOutboxJobsForTicket(ticket._id);
          recreatedJobs++;
          this.logger.warn(`Reconciliation restored missing outbox job for key: ${idempotencyKey}`);
        }
      }
    }

    return { recoveredLocks, recreatedJobs };
  }
}
