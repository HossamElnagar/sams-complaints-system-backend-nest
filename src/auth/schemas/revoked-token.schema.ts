import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RevokedTokenDocument = HydratedDocument<RevokedToken>;

@Schema({ timestamps: true })
export class RevokedToken {
  @Prop({ required: true, unique: true, index: true, type: String })
  token: string;

  @Prop({ required: true, type: Date })
  expiresAt: Date;
}

export const RevokedTokenSchema = SchemaFactory.createForClass(RevokedToken);
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
