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

  async summarizeV2(input: SummarizeInput): Promise<SummarizeResult> {
    const HF_MODELS = [
      'Qwen/Qwen2.5-7B-Instruct',
      'google/gemma-2-9b-it',
      'mistralai/Mistral-Nemo-Instruct-2407',
    ];

    const hfToken =
      process.env.HUGGING_FACE_TOKEN ||
      process.env.HF_TOKEN ||
      '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (hfToken) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    const TIMEOUT = 15000;
    const MAX_RETRIES = 2;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const fetchWithTimeout = async (url: string, options: any) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT);

      try {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        return res;
      } finally {
        clearTimeout(id);
      }
    };

    try {
      const filteredText = filterMessages(
        input.messages,
        input.senderFilter,
        input.startTime,
        input.endTime,
      );

      if (!filteredText.trim()) {
        return { success: true, summary: [] };
      }

      // ✅ Prompt chuẩn cho HF
      const prompt = `${SYSTEM_PROMPT}

Dưới đây là hội thoại:
${filteredText}

Yêu cầu:
- Tóm tắt ngắn gọn
- Dạng bullet point
- Nêu rõ việc đã xong và việc còn tồn đọng
`;

      let lastError = '';

      for (const model of HF_MODELS) {
        // Try OpenAI-compatible endpoint first
        const CHAT_URL = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
        const LEGACY_URL = `https://api-inference.huggingface.co/models/${model}`;

        console.log('[HF MODEL]', model);
        console.log('[HF URL]', CHAT_URL);

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            // Step 1: Try Chat completions
            console.log(`[HF DEBUG] Attempting Chat API for ${model} (attempt ${attempt + 1})...`);
            const chatPayload = {
              model: model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
              ],
              max_tokens: 500,
              temperature: 0.3,
            };

            const chatResponse = await fetchWithTimeout(CHAT_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify(chatPayload),
            });

            const chatRawText = await chatResponse.text();

            if (chatResponse.ok && !chatRawText.startsWith('<!DOCTYPE html>')) {
              try {
                const data = JSON.parse(chatRawText);
                if (data?.choices?.[0]?.message?.content) {
                  console.log(`[HF DEBUG] Success using Chat API for ${model}`);
                  return {
                    success: true,
                    summary: parseSummaryText(data.choices[0].message.content),
                  };
                }
              } catch (e) {
                console.log(`[HF DEBUG] Chat JSON parse failed for ${model}`);
              }
            }

            // Step 2: Fallback to Legacy Text Generation API
            console.log(`[HF DEBUG] Chat API failed for ${model}, trying Legacy API...`);
            const legacyPayload = {
              inputs: prompt,
              parameters: {
                max_new_tokens: 500,
                temperature: 0.3,
              },
            };

            const legacyResponse = await fetchWithTimeout(LEGACY_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify(legacyPayload),
            });

            const legacyRawText = await legacyResponse.text();
            console.log(`[HF RAW ${model}]`, legacyRawText.substring(0, 200));

            if (!legacyResponse.ok) {
              if (legacyResponse.status === 503 || legacyRawText.toLowerCase().includes('loading')) {
                console.log(`[HF DEBUG] Model ${model} is loading, retrying in 2s...`);
                await sleep(2000);
                continue;
              }
              lastError = `Model ${model} error: ${legacyRawText}`;
              break; // Try next model
            }

            const data = JSON.parse(legacyRawText);
            let content = '';
            if (Array.isArray(data)) {
              content = data[0]?.generated_text || '';
            } else if (data?.generated_text) {
              content = data.generated_text;
            }

            if (content && content.trim()) {
              console.log(`[HF DEBUG] Success using Legacy API for ${model}`);
              return {
                success: true,
                summary: parseSummaryText(content),
              };
            }

            lastError = `Model ${model} returned empty content`;
          } catch (err: any) {
            if (err.name === 'AbortError') {
              lastError = 'Timeout';
            } else {
              lastError = err?.message || 'Unknown error';
            }
            console.error(`[HF DEBUG] Error for ${model}:`, lastError);
            // On network error, we might want to retry or skip
            await sleep(1000);
          }
        }
      }

      return {
        success: false,
        message: `HF summarize failed: ${lastError}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Unexpected error',
      };
    }
  }
}

export const messageSummarizeService = new MessageSummarizeService();
