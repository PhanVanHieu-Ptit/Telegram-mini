export interface SummarizeInput {
  messages: string;
  senderFilter?: string;
  startTime?: string;
  endTime?: string;
}

export interface SummarizeResult {
  success: boolean;
  summary?: string[];
  message?: string;
}

const LLM_API_URL = 'http://localhost:11434/api/chat';
const LLM_MODEL = 'llama3';

const SYSTEM_PROMPT =
  'Bạn là một trợ lý AI chuyên nghiệp. Nhiệm vụ của bạn là tóm tắt các đoạn hội thoại tin nhắn sau đây. Hãy tập trung vào mục đích chính của cuộc trò chuyện, các vấn đề đã được giải quyết và các đầu việc còn tồn đọng. Trình bày ngắn gọn, khách quan, sử dụng tiếng Việt.';

/**
 * Filters a raw message block by sender and/or time range.
 *
 * Expected line format (flexible): "[HH:MM] SenderName: message body"
 * Lines that don't match the pattern are passed through as-is so free-form
 * blocks still work.
 */
function filterMessages(
  rawMessages: string,
  senderFilter?: string,
  startTime?: string,
  endTime?: string,
): string {
  // If no filters are applied, return the raw block unchanged
  if (!senderFilter && !startTime && !endTime) {
    return rawMessages;
  }

  const lines = rawMessages.split('\n');

  const startDate = startTime ? new Date(startTime) : null;
  const endDate = endTime ? new Date(endTime) : null;

  const filtered = lines.filter((line) => {
    // Try to parse "[timestamp] Sender: content"  or  "Sender [timestamp]: content"
    const timeMatch = line.match(/\[([^\]]+)\]/);
    const senderMatch = line.match(/\[([^\]]+)\]\s+([^:]+):|^([^:]+):/);

    // --- Sender filter ---
    if (senderFilter) {
      const sender = senderMatch?.[2]?.trim() || senderMatch?.[3]?.trim() || '';
      if (!sender.toLowerCase().includes(senderFilter.toLowerCase())) {
        return false;
      }
    }

    // --- Time range filter ---
    if ((startDate || endDate) && timeMatch) {
      const lineDate = new Date(timeMatch[1]);
      if (!isNaN(lineDate.getTime())) {
        if (startDate && lineDate < startDate) return false;
        if (endDate && lineDate > endDate) return false;
      }
    }

    return true;
  });

  return filtered.join('\n');
}

/**
 * Parses the LLM plain-text response into an array of bullet-point strings.
 * Handles lines that begin with "- ", "• ", "* ", or numbered lists.
 */
function parseSummaryText(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets: string[] = [];

  for (const line of lines) {
    // Strip common bullet prefixes
    const cleaned = line
      .replace(/^[-•*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim();

    if (cleaned) {
      bullets.push(cleaned);
    }
  }

  return bullets.length > 0 ? bullets : [text.trim()];
}

export class MessageSummarizeService {
  async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    try {
      const filteredText = filterMessages(
        input.messages,
        input.senderFilter,
        input.startTime,
        input.endTime,
      );

      if (!filteredText.trim()) {
        return {
          success: true,
          summary: [],
        };
      }

      const payload = {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: filteredText },
        ],
        stream: false,
      };

      const response = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return { success: false, message: 'Failed to summarize messages' };
      }

      const data = (await response.json()) as any;

      // Ollama returns: { message: { role, content }, ... }
      const content: string = data?.message?.content ?? '';

      if (!content) {
        return { success: false, message: 'Failed to summarize messages' };
      }

      return {
        success: true,
        summary: parseSummaryText(content),
      };
    } catch {
      return { success: false, message: 'Failed to summarize messages' };
    }
  }
}

export const messageSummarizeService = new MessageSummarizeService();
