import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as crypto from 'crypto';

export type TicketDocument = HydratedDocument<Ticket>;

export enum TicketCategory {
  Academic = 'أكاديمي',
  Financial = 'مالي',
  Administrative = 'إداري',
  Services = 'خدمات وتجهيزات',
  Other = 'أخرى',
}

export enum TicketPriority {
  Low = 'منخفضة',
  Medium = 'متوسطة',
  High = 'عالية',
  Urgent = 'عاجلة',
}

export enum TicketStatus {
  Open = 'قيد الانتظار',
  InProgress = 'قيد المعالجة',
  Resolved = 'تم الحل',
  Rejected = 'مرفوضة',
}

@Schema({ _id: false })
export class AiAnalysis {
  @Prop({ trim: true, type: String })
  summary?: string;

  @Prop({ trim: true, type: String })
  recommendedBranch?: string;

  @Prop({ trim: true, type: String })
  recommendedDepartment?: string;

  @Prop({ type: Number, min: 0, max: 1 })
  confidence?: number;

  @Prop({ type: Date })
  analyzedAt?: Date;
}

@Schema({ _id: false })
export class TicketRouting {
  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null })
  assignedBranchId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  assignedDepartmentId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Admin', default: null })
  dispatchedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  dispatchedAt?: Date | null;

  @Prop({ default: false, type: Boolean })
  isEscalatedToPresident: boolean;

  @Prop({ trim: true, type: String })
  escalationReason?: string;
}

@Schema({ _id: false })
export class TicketResolution {
  @Prop({ trim: true, type: String })
  justification?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin', default: null })
  resolvedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;
}

@Schema({ _id: false })
export class TicketTimelineEntry {
  @Prop({ required: true, trim: true, type: String })
  action: string;

  @Prop({ trim: true, type: String })
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin', default: null })
  performedBy?: Types.ObjectId | null;

  @Prop({ default: Date.now, type: Date })
  timestamp: Date;
}

@Schema({ timestamps: true })
export class Ticket {
  @Prop({
    unique: true,
    index: true,
    default: () => `TCK-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
  })
  ticketNumber: string;

  @Prop({ required: true, trim: true, maxLength: 100, type: String })
  studentName: string;

  @Prop({ required: true, trim: true, lowercase: true, maxLength: 100, type: String, index: true })
  studentEmail: string;

  @Prop({ required: true, trim: true, maxLength: 50, type: String })
  studentPhone: string;

  @Prop({ required: true, trim: true, maxLength: 120, type: String })
  subject: string;

  @Prop({ required: true, trim: true, maxLength: 2000, type: String })
  description: string;

  @Prop({
    type: String,
    enum: TicketCategory,
    default: TicketCategory.Other,
  })
  category: TicketCategory;

  @Prop({
    type: String,
    enum: TicketPriority,
    default: TicketPriority.Medium,
  })
  priority: TicketPriority;

  @Prop({
    type: String,
    enum: TicketStatus,
    default: TicketStatus.Open,
    index: true,
  })
  status: TicketStatus;

  // Preserved branch string field for backward compatibility
  @Prop({ type: String, required: false, default: 'القاهرة' })
  branch?: string;

  // New dynamic branch reference
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: false, index: true })
  branchId?: Types.ObjectId;

  // Advisory AI Analysis subdocument
  @Prop({ type: AiAnalysis, default: () => ({}) })
  aiAnalysis?: AiAnalysis;

  // Administrative Routing subdocument
  @Prop({ type: TicketRouting, default: () => ({ isEscalatedToPresident: false }) })
  routing?: TicketRouting;

  // Staff Resolution subdocument
  @Prop({ type: TicketResolution, default: () => ({}) })
  resolution?: TicketResolution;

  // Lifecycle Timeline History
  @Prop({ type: [TicketTimelineEntry], default: [] })
  timeline: TicketTimelineEntry[];
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ ticketNumber: 1 }, { unique: true });
TicketSchema.index({ createdAt: -1 });
