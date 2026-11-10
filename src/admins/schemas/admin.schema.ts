import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import { HydratedDocument , Types, Schema as MongooseSchema } from 'mongoose';
import {AdminRole} from '../enums/admin-role.enum.js'
import { Branches } from '../enums/branches.enum.js';
export type AdminDocument = HydratedDocument<Admin>;

@Schema({timestamps: true})
export class Admin {
    @Prop({ required:true, trim: true , minlength: 3, maxlength: 50 , type: String})
        fullName: string
    
    @Prop({
        required:true,
        unique:true,
        lowercase: true,
        trim:true,
        minlength: 5,
        maxlength: 100,
        type: String
    })
    email: string

    @Prop({required: true, select:false, minlength: 12, maxlength: 100, type: String})
    password: string

    @Prop({required:true, enum: AdminRole ,default: AdminRole.BRANCH_STAFF ,type: String})
    role:AdminRole
    
    @Prop({required:true, enum:Branches, default: Branches.Cairo ,type: String})
    branch : Branches
}

export const AdminSchema = SchemaFactory.createForClass(Admin)