
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { Branches } from '../../admins/enums/branches.enum.js';
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

@Schema({ timestamps: true })
export class Ticket {
  @Prop({
    unique: true,
    default: () => `TCK-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
  })
  ticketNumber: string;


  @Prop({ required: true, trim: true ,maxLength:50 })
  studentName: string;

  @Prop({ required: true, trim: true, lowercase: true ,maxLength:50 })
  studentEmail: string;

  @Prop({ required: true, trim: true ,maxLength:50})
  studentPhone: string;

  @Prop({ required: true, trim: true ,maxLength:50 })
  subject: string;

  @Prop({ required: true, trim: true ,maxLength:500 })
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
  })
  status: TicketStatus;

   @Prop({ required: true, enum:Branches, default: Branches.Cairo })
  branch : Branches
}


export const TicketSchema = SchemaFactory.createForClass(Ticket);