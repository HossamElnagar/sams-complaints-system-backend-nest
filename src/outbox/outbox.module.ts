import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiOutboxJob, AiOutboxJobSchema } from './schemas/ai-outbox-job.schema.js';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema.js';
import { OutboxService } from './outbox.service.js';
import { OutboxReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiOutboxJob.name, schema: AiOutboxJobSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
  ],
  providers: [OutboxService, OutboxReconciliationService],
  exports: [OutboxService, OutboxReconciliationService, MongooseModule],
})
export class OutboxModule {}
