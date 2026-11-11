export interface SummarizeRequest {
  ticketId: string;
  subject: string;
  description: string;
}

export interface SummarizeResponse {
  summary: string;
}

export interface ClassifyRouteRequest {
  ticketId: string;
  subject: string;
  description: string;
  category?: string;
}

export interface ClassifyRouteResponse {
  recommendedBranch: string;
  recommendedDepartment: string;
  confidence: number;
}
