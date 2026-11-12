import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AiBridgeService } from './ai-bridge.service.js';
import { AiConsumerService } from './ai-consumer.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    OutboxModule,
  ],
  providers: [AiBridgeService, AiConsumerService],
  exports: [AiBridgeService, AiConsumerService],
})
export class AiModule {}
