
export interface SummarizeRequest {
  messages: string;
  senderFilter?: string;
  startTime?: string;
  endTime?: string;
}

export interface SummarizeResponse {
  success: boolean;
  summary: string[];
  message?: string;
}

export interface HuggingFaceResponse {
  summary_text?: string;
  error?: string;
  estimated_time?: number;
}
