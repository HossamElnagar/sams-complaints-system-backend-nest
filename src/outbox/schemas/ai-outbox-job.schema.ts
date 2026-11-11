import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TaskProcessingStatus, AiModelType } from '../enums/outbox.enums.js';

export type AiOutboxJobDocument = HydratedDocument<AiOutboxJob>;

@Schema({ timestamps: true })
export class AiOutboxJob {
  @Prop({ required: true, unique: true, index: true, type: String })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId, ref: 'Ticket', required: true, index: true })
  ticketId: Types.ObjectId;

  @Prop({ required: true, enum: AiModelType, type: String })
  modelType: AiModelType;

  @Prop({
    required: true,
    enum: TaskProcessingStatus,
    default: TaskProcessingStatus.PENDING,
    type: String,
    index: true,
  })
  status: TaskProcessingStatus;

  @Prop({ default: 0, type: Number })
  attempts: number;

  @Prop({ default: Date.now, type: Date, index: true })
  nextRunAt: Date;

  @Prop({ type: String, default: null, index: true })
  lockToken: string | null;

  @Prop({ type: Date, default: null })
  lockedAt: Date | null;

  @Prop({ type: [String], default: [] })
  errorHistory: string[];
}

export const AiOutboxJobSchema = SchemaFactory.createForClass(AiOutboxJob);
AiOutboxJobSchema.index({ status: 1, nextRunAt: 1 });
AiOutboxJobSchema.index({ idempotencyKey: 1 }, { unique: true });
