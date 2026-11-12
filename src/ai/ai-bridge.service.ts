import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SummarizeRequest,
  SummarizeResponse,
  ClassifyRouteRequest,
  ClassifyRouteResponse,
} from './interfaces/ai.interfaces.js';

@Injectable()
export class AiBridgeService {
  private readonly logger = new Logger(AiBridgeService.name);
  private readonly summarizeUrl: string;
  private readonly classifyRouteUrl: string;
  private readonly isMockEnabled: boolean;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.summarizeUrl =
      this.configService.get<string>('AI_SUMMARIZE_URL') || 'http://127.0.0.1:8001/summarize';
    this.classifyRouteUrl =
      this.configService.get<string>('AI_CLASSIFY_ROUTE_URL') ||
      'http://127.0.0.1:8002/classify-route';
    this.isMockEnabled = this.configService.get<string>('AI_SERVICE_MOCK') === 'true';
    this.timeoutMs = Number(this.configService.get<string>('AI_TIMEOUT_MS')) || 10000;
  }

  /**
   * Calls Model 1 (FastAPI Endpoint /summarize): Generates concise Arabic text summary.
   */
  async summarize(request: SummarizeRequest): Promise<SummarizeResponse> {
    if (this.isMockEnabled) {
      return this.generateMockSummary(request);
    }

    try {
      const response = await fetch(this.summarizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `AI Summarize microservice returned status ${response.status}: ${errorBody || response.statusText}`,
        );
      }

      const data = (await response.json()) as SummarizeResponse;
      if (!data || typeof data.summary !== 'string') {
        throw new Error('AI Summarize microservice returned invalid payload structure.');
      }

      return data;
    } catch (error: any) {
      this.logger.error(`Failed to call AI Summarize microservice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calls Model 2 (FastAPI Endpoint /classify-route): Predicts recommended Branch, Department, and Confidence.
   */
  async classifyRoute(request: ClassifyRouteRequest): Promise<ClassifyRouteResponse> {
    if (this.isMockEnabled) {
      return this.generateMockClassification(request);
    }

    try {
      const response = await fetch(this.classifyRouteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `AI Classify/Route microservice returned status ${response.status}: ${errorBody || response.statusText}`,
        );
      }

      const data = (await response.json()) as ClassifyRouteResponse;
      if (
        !data ||
        typeof data.recommendedBranch !== 'string' ||
        typeof data.recommendedDepartment !== 'string' ||
        typeof data.confidence !== 'number'
      ) {
        throw new Error('AI Classify/Route microservice returned invalid payload structure.');
      }

      return data;
    } catch (error: any) {
      this.logger.error(`Failed to call AI Classify/Route microservice: ${error.message}`);
      throw error;
    }
  }

  // Fallback mock generators for development/offline test runs
  private generateMockSummary(request: SummarizeRequest): SummarizeResponse {
    const summary = `ملخص الشكوى: ${request.subject}. تتناول الشكوى موضوع: ${request.description.slice(0, 80)}...`;
    return { summary };
  }

  private generateMockClassification(request: ClassifyRouteRequest): ClassifyRouteResponse {
    const isAcademic = request.category === 'أكاديمي' || request.description.includes('امتحان') || request.description.includes('دكتور');
    return {
      recommendedBranch: 'القاهرة',
      recommendedDepartment: isAcademic ? 'شؤون التعليم والطلاب' : 'الإدارة العامة لرعاية الطلاب',
      confidence: 0.92,
    };
  }
}
