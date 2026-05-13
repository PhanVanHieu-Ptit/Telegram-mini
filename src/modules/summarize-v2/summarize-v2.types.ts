
export interface SummarizeRequest {
  /** Raw messages string (pre-formatted). Required if conversationId not provided. */
  messages?: string;
  /** Fetch messages from DB by conversationId. Required if messages not provided. */
  conversationId?: string;
  senderFilter?: string;
  startTime?: string;
  endTime?: string;
}

/** Structured result from a single chunk or final merge */
export interface SummaryResult {
  summary: string;
  resolved: string[];
  pending: string[];
  language: 'vi';
}

export interface SummarizeResponse extends SummaryResult {
  success: boolean;
  message?: string;
}

export interface HuggingFaceResponse {
  summary_text?: string;
  error?: string;
  estimated_time?: number;
}
