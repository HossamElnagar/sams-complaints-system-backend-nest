import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AdminRole } from '../enums/admin-role.enum.js';

export type AdminDocument = HydratedDocument<Admin>;

@Schema({ timestamps: true })
export class Admin {
  @Prop({ required: true, trim: true, minlength: 3, maxlength: 50, type: String })
  fullName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 5,
    maxlength: 100,
    type: String,
    index: true,
  })
  email: string;

  @Prop({ required: true, select: false, minlength: 8, maxlength: 120, type: String })
  passwordHash: string;

  // Virtual or fallback for password field
  get password(): string {
    return this.passwordHash;
  }
  set password(val: string) {
    this.passwordHash = val;
  }

  @Prop({ required: true, enum: AdminRole, default: AdminRole.DEPARTMENT_STAFF, type: String })
  role: AdminRole;

  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null })
  branchId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  departmentId?: Types.ObjectId | null;

  @Prop({ default: true, type: Boolean })
  isActive: boolean;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);
AdminSchema.index({ email: 1 }, { unique: true });
