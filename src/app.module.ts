import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { AiModule } from './ai/ai.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sadat-ticketing-service',
    ),

    AuthModule,
    BranchesModule,
    DepartmentsModule,
    OutboxModule,
    AiModule,
    TicketsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
