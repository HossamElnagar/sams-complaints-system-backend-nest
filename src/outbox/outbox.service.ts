import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { AiOutboxJob, AiOutboxJobDocument } from './schemas/ai-outbox-job.schema.js';
import { TaskProcessingStatus, AiModelType } from './enums/outbox.enums.js';
import { TicketDocument } from '../tickets/schemas/ticket.schema.js';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AiOutboxJob.name)
    private readonly outboxModel: Model<AiOutboxJobDocument>,
  ) {}

  /**
   * Persists a ticket and its corresponding AI outbox jobs atomically using MongoDB transactions
   * with automatic fallback for standalone MongoDB instances without replica sets.
   */
  async persistTicketWithJobs(ticketInstance: TicketDocument): Promise<TicketDocument> {
    const session = await this.connection.startSession();

    try {
      let savedTicket: TicketDocument | null = null;

      try {
        await session.withTransaction(async () => {
          savedTicket = await ticketInstance.save({ session });

          const jobs = [
            {
              idempotencyKey: `${savedTicket._id}_${AiModelType.SUMMARIZE}`,
              ticketId: savedTicket._id,
              modelType: AiModelType.SUMMARIZE,
              status: TaskProcessingStatus.PENDING,
              attempts: 0,
              nextRunAt: new Date(),
              lockToken: null,
              lockedAt: null,
              errorHistory: [],
            },
            {
              idempotencyKey: `${savedTicket._id}_${AiModelType.CLASSIFY_ROUTE}`,
              ticketId: savedTicket._id,
              modelType: AiModelType.CLASSIFY_ROUTE,
              status: TaskProcessingStatus.PENDING,
              attempts: 0,
              nextRunAt: new Date(),
              lockToken: null,
              lockedAt: null,
              errorHistory: [],
            },
          ];

          await this.outboxModel.insertMany(jobs, { session });
        });

        this.logger.log(`Ticket ${savedTicket!._id} and AI outbox jobs persisted atomically via transaction.`);
        return savedTicket!;
      } catch (txnError: any) {
        // Check if error is due to standalone MongoDB (transactions not supported)
        const isStandaloneError =
          txnError?.message?.includes('replica set') ||
          txnError?.message?.includes('Transaction numbers are only allowed on a replica set') ||
          txnError?.code === 20;

        if (isStandaloneError) {
          this.logger.warn(
            '[OutboxService] Standalone MongoDB detected (no replica set). Executing two-phase fallback; relying on reconciliation worker for atomicity.',
          );

          // 2-Phase Fallback: Insert ticket first, then insert outbox records
          savedTicket = await ticketInstance.save();

          await this.createOutboxJobsForTicket(savedTicket._id);
          return savedTicket;
        }

        throw txnError;
      }
    } finally {
      await session.endSession();
    }
  }

  /**
   * Safely creates or ensures deterministic outbox jobs for a ticket.
   */
  async createOutboxJobsForTicket(ticketId: Types.ObjectId | string): Promise<void> {
    const objectId = typeof ticketId === 'string' ? new Types.ObjectId(ticketId) : ticketId;

    const models = [AiModelType.SUMMARIZE, AiModelType.CLASSIFY_ROUTE];

    for (const modelType of models) {
      const idempotencyKey = `${objectId}_${modelType}`;
      await this.outboxModel
        .updateOne(
          { idempotencyKey },
          {
            $setOnInsert: {
              idempotencyKey,
              ticketId: objectId,
              modelType,
              status: TaskProcessingStatus.PENDING,
              attempts: 0,
              nextRunAt: new Date(),
              lockToken: null,
              lockedAt: null,
              errorHistory: [],
            },
          },
          { upsert: true },
        )
        .exec();
    }
  }

  /**
   * Atomically claims a job from PENDING or expired lock state using compare-and-swap.
   */
  async claimJob(modelType?: AiModelType): Promise<{ job: AiOutboxJobDocument; lockToken: string } | null> {
    const lockToken = randomUUID();
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - this.STALE_LOCK_THRESHOLD_MS);

    const query: any = {
      $or: [
        { status: TaskProcessingStatus.PENDING, nextRunAt: { $lte: now } },
        { status: TaskProcessingStatus.PROCESSING, lockedAt: { $lt: staleThreshold } },
      ],
    };

    if (modelType) {
      query.modelType = modelType;
    }

    const claimed = await this.outboxModel
      .findOneAndUpdate(
        query,
        {
          $set: {
            status: TaskProcessingStatus.PROCESSING,
            lockToken,
            lockedAt: now,
          },
        },
        { new: true, sort: { nextRunAt: 1 } },
      )
      .exec();

    if (!claimed) {
      return null;
    }

    return { job: claimed, lockToken };
  }

  /**
   * Handles job success.
   */
  async completeJob(jobId: string | Types.ObjectId, lockToken: string): Promise<boolean> {
    const res = await this.outboxModel
      .updateOne(
        { _id: jobId, lockToken },
        {
          $set: {
            status: TaskProcessingStatus.COMPLETED,
            lockToken: null,
            lockedAt: null,
          },
        },
      )
      .exec();

    return res.modifiedCount > 0;
  }

  /**
   * Handles job failure with exponential backoff (up to 3 retries).
   */
  async failJob(jobId: string | Types.ObjectId, lockToken: string, errorMessage: string): Promise<void> {
    const job = await this.outboxModel.findOne({ _id: jobId, lockToken }).exec();
    if (!job) return;

    const nextAttempts = job.attempts + 1;
    const isExhausted = nextAttempts >= 3;

    // Exponential backoff: 30s * 2^attempts
    const backoffDelayMs = Math.pow(2, nextAttempts) * 30 * 1000;
    const nextRunAt = new Date(Date.now() + backoffDelayMs);

    await this.outboxModel
      .updateOne(
        { _id: jobId, lockToken },
        {
          $set: {
            status: isExhausted ? TaskProcessingStatus.FAILED : TaskProcessingStatus.PENDING,
            attempts: nextAttempts,
            nextRunAt: isExhausted ? job.nextRunAt : nextRunAt,
            lockToken: null,
            lockedAt: null,
          },
          $push: {
            errorHistory: `[${new Date().toISOString()}] Attempt ${nextAttempts}: ${errorMessage}`,
          },
        },
      )
      .exec();

    if (isExhausted) {
      this.logger.error(`Outbox job ${jobId} failed permanently after ${nextAttempts} attempts.`);
    } else {
      this.logger.warn(`Outbox job ${jobId} retry scheduled for ${nextRunAt.toISOString()}`);
    }
  }

  /**
   * Recovers stale locks exceeding 5 minutes.
   */
  async recoverStaleLocks(): Promise<number> {
    const staleThreshold = new Date(Date.now() - this.STALE_LOCK_THRESHOLD_MS);

    const result = await this.outboxModel
      .updateMany(
        {
          status: TaskProcessingStatus.PROCESSING,
          lockedAt: { $lt: staleThreshold },
        },
        {
          $set: {
            status: TaskProcessingStatus.PENDING,
            lockToken: null,
            lockedAt: null,
          },
        },
      )
      .exec();

    if (result.modifiedCount > 0) {
      this.logger.warn(`Recovered ${result.modifiedCount} stale outbox job locks.`);
    }

    return result.modifiedCount;
  }
}
