import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { OutboxService } from '../outbox/outbox.service.js';
import { AiBridgeService } from './ai-bridge.service.js';
import { Ticket, TicketDocument, TicketStatus } from '../tickets/schemas/ticket.schema.js';
import { AiModelType } from '../outbox/enums/outbox.enums.js';

@Injectable()
export class AiConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiConsumerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly isEnabled: boolean;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly aiBridgeService: AiBridgeService,
    private readonly configService: ConfigService,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
  ) {
    this.isEnabled = this.configService.get<string>('AI_CONSUMER_ENABLED') !== 'false';
    this.pollIntervalMs = Number(this.configService.get<string>('AI_POLL_INTERVAL_MS')) || 5000;
  }

  onModuleInit() {
    if (this.isEnabled) {
      this.startWorker();
    } else {
      this.logger.log('AI Outbox Consumer worker is disabled via configuration.');
    }
  }

  onModuleDestroy() {
    this.stopWorker();
  }

  startWorker() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.processNextBatch();
    }, this.pollIntervalMs);
    this.logger.log(`AI Outbox Consumer worker started. Polling interval: ${this.pollIntervalMs}ms`);
  }

  stopWorker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Processes a single claimable outbox job.
   */
  async processNextBatch(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Claim next pending or stale-locked job
      const claimResult = await this.outboxService.claimJob();
      if (!claimResult) {
        return;
      }

      const { job, lockToken } = claimResult;
      await this.processJob(job, lockToken);
    } catch (err: any) {
      this.logger.error(`Error in AI Outbox Consumer batch run: ${err.message}`, err.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handles processing of an individual claimed job.
   */
  async processJob(job: any, lockToken: string): Promise<void> {
    const ticketId = job.ticketId;

    try {
      const ticket = await this.ticketModel.findById(ticketId).exec();
      if (!ticket) {
        throw new Error(`Associated ticket ${ticketId} not found in database.`);
      }

      if (!ticket.aiAnalysis) {
        ticket.aiAnalysis = {};
      }

      // Model 1: Summarize
      if (job.modelType === AiModelType.SUMMARIZE) {
        const summarizeResult = await this.aiBridgeService.summarize({
          ticketId: ticket._id.toString(),
          subject: ticket.subject,
          description: ticket.description,
        });

        ticket.aiAnalysis.summary = summarizeResult.summary;
        ticket.aiAnalysis.analyzedAt = new Date();

        ticket.timeline.push({
          action: 'توليد ملخص الذكاء الاصطناعي',
          note: 'تم استخراج وتلخيص مضمون الشكوى استشارياً بواسطة النموذج الذكي الأول',
          timestamp: new Date(),
        });
      }

      // Model 2: Classify and Route
      if (job.modelType === AiModelType.CLASSIFY_ROUTE) {
        const classifyResult = await this.aiBridgeService.classifyRoute({
          ticketId: ticket._id.toString(),
          subject: ticket.subject,
          description: ticket.description,
          category: ticket.category,
        });

        ticket.aiAnalysis.recommendedBranch = classifyResult.recommendedBranch;
        ticket.aiAnalysis.recommendedDepartment = classifyResult.recommendedDepartment;
        ticket.aiAnalysis.confidence = classifyResult.confidence;
        ticket.aiAnalysis.analyzedAt = new Date();

        const confidencePercent = (classifyResult.confidence * 100).toFixed(1);
        ticket.timeline.push({
          action: 'توصية التوجيه الاستشاري الذكي',
          note: `توصية التوجيه: ${classifyResult.recommendedBranch} / ${classifyResult.recommendedDepartment} (نسبة الثقة: ${confidencePercent}%)`,
          timestamp: new Date(),
        });
      }

      // INVARIANCE ENFORCEMENT (Standard 4 - Advisory AI Only):
      // The AI NEVER changes the ticket status and NEVER auto-assigns routing.
      ticket.status = TicketStatus.Open;

      await ticket.save();

      // Mark outbox job completed
      await this.outboxService.completeJob(job._id, lockToken);
      this.logger.log(
        `AI Job ${job._id} (${job.modelType}) for Ticket ${ticket.ticketNumber} successfully completed.`,
      );
    } catch (err: any) {
      this.logger.warn(`AI Job ${job._id} (${job.modelType}) execution failed: ${err.message}`);
      await this.outboxService.failJob(job._id, lockToken, err.message);
    }
  }
}
