import * as https from 'https';
import { SummarizeRequest, SummarizeResponse, SummaryResult } from './summarize-v2.types';

const GROQ_MODEL = 'llama-3.1-8b-instant';
const TIMEOUT = 60000;
const MAX_CHUNKS = 5;
const MAX_CHUNK_LENGTH = 4000;

const SYSTEM_PROMPT = `Bạn là một AI chuyên gia về tóm tắt hội thoại (semantic compression).
Nhiệm vụ của bạn là phân tích cuộc hội thoại và tổng hợp các ý chính một cách ngắn gọn bằng tiếng Việt.

QUY TẮC BẮT BUỘC:
1. NGÔN NGỮ: Luôn trả về tiếng Việt.
2. NỘI DUNG: Chỉ tóm tắt ý chính. Tuyệt đối KHÔNG mô tả "Người A nói...", "Người B trả lời...". Hãy viết thành một đoạn văn mạch lạc.
3. ĐỊNH DẠNG: Không sử dụng định dạng hội thoại hay liệt kê tin nhắn.
4. SAO CHÉP: Không copy nguyên văn tin nhắn. Phải paraphrase và tổng hợp thông tin.
5. JSON: Chỉ trả về duy nhất 1 block JSON hợp lệ.

OUTPUT JSON SCHEMA:
{
  "summary": "Đoạn văn tóm tắt tổng quát bằng tiếng Việt (không dùng tên người dùng)",
  "resolved": ["Các vấn đề đã được giải quyết hoặc thống nhất"],
  "pending": ["Các vấn đề còn tồn đọng hoặc chưa rõ ràng"],
  "language": "vi"
}`;

const STRICT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

LƯU Ý CỰC KỲ QUAN TRỌNG:
Bản tóm tắt trước đó của bạn quá giống transcript hoặc lặp lại nội dung thô.
Lần này, hãy thực hiện tóm tắt ngữ nghĩa thực sự. 
Không lặp lại cách nói của người dùng. Không liệt kê. 
Viết một đoạn văn tóm tắt súc tích, chuyên nghiệp.`;

/** Detects if the model output is a chat transcript instead of a summary */
const TRANSCRIPT_LINE_RE = /^\s*(\[.+?\]\s+)?[\w\s]{1,30}\s*:\s+\S/m;

const EMPTY_RESULT: SummaryResult = {
  summary: '',
  resolved: [],
  pending: [],
  language: 'vi',
};

export class SummarizeV2Service {
  private getLLMConfig(): { hostname: string; path: string; apiKey: string; model: string } {
    const apiKey = (process.env.GROQ_API_KEY || '').replace(/^['"]|['"]$/g, '');
    return {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      apiKey,
      model: GROQ_MODEL,
    };
  }

  async summarize(input: SummarizeRequest): Promise<SummarizeResponse> {
    console.log('[SummarizeV2Service] Received request:', {
      messagesLength: input.messages?.length ?? 0,
      senderFilter: input.senderFilter,
      startTime: input.startTime,
      endTime: input.endTime,
    });

    try {
      const llmConfig = this.getLLMConfig();
      if (!llmConfig.apiKey) {
        throw new Error('GROQ_API_KEY is not configured.');
      }
      console.log(`[SummarizeV2Service] Using Groq (model: ${llmConfig.model})`);

      const normalizedText = this.normalizeConversation(
        input.messages ?? '',
        input.senderFilter,
        input.startTime,
        input.endTime,
      );

      if (!normalizedText.trim()) {
        console.warn('[SummarizeV2Service] No messages after filtering.');
        return {
          success: true,
          ...EMPTY_RESULT,
          message: 'Không tìm thấy tin nhắn nào phù hợp với bộ lọc.',
        };
      }

      const chunks = this.splitIntoChunks(normalizedText);
      console.log(`[SummarizeV2Service] Processing ${chunks.length} chunk(s)...`);

      const chunkResults: SummaryResult[] = [];
      let useExtractive = false;

      for (let i = 0; i < chunks.length; i++) {
        console.log(`[SummarizeV2Service] Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
        try {
          const prompt = this.buildPrompt(chunks[i]);
          let rawOutput = await this.callHuggingFace(prompt, SYSTEM_PROMPT);

          if (!rawOutput) {
            console.warn(`[SummarizeV2Service] Chunk ${i + 1} returned empty output.`);
            continue;
          }

          // Retry strategy for invalid output
          if (this.isInvalidOutput(rawOutput, chunks[i])) {
            console.warn(`[SummarizeV2Service] Chunk ${i + 1} output invalid, retrying with stricter prompt...`);
            rawOutput = await this.callHuggingFace(prompt, STRICT_SYSTEM_PROMPT, {
              temperature: 0.1,
              do_sample: false,
              repetition_penalty: 1.25,
            });
          }

          if (rawOutput && this.isInvalidOutput(rawOutput, chunks[i])) {
            console.warn(`[SummarizeV2Service] Chunk ${i + 1} output still invalid after retry, discarding.`);
            continue;
          }

          const parsed = this.parseSummaryResult(rawOutput ?? '');
          if (parsed) {
            chunkResults.push(parsed);
            console.log(`[SummarizeV2Service] Chunk ${i + 1} parsed successfully.`);
          } else {
            console.warn(`[SummarizeV2Service] Chunk ${i + 1} could not be parsed as structured output.`);
          }
        } catch (groqError: unknown) {
          const msg = groqError instanceof Error ? groqError.message : '';
          if (msg.includes('401') || msg.includes('403')) {
            console.warn('[SummarizeV2Service] Groq API unavailable, switching to extractive fallback.');
            useExtractive = true;
            break;
          }
          throw groqError;
        }
      }

      if (useExtractive || chunkResults.length === 0) {
        console.warn('[SummarizeV2Service] Falling back to extractive summarization.');
        return {
          success: true,
          summary: this.extractiveSummarize(normalizedText).join(' '),
          resolved: [],
          pending: [],
          language: 'vi',
        };
      }

      const merged = this.mergeChunkResults(chunkResults);
      console.log(`[SummarizeV2Service] Done — summary length: ${merged.summary.length}, resolved: ${merged.resolved.length}, pending: ${merged.pending.length}`);
      return { success: true, ...merged };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SummarizeV2Service] Error:', errorMessage);
      return { success: false, ...EMPTY_RESULT, message: errorMessage };
    }
  }

  /**
   * Normalizes conversation input:
   * - Strips leading timestamps (keeps "Sender: message" format)
   * - Filters by sender and time range
   */
  private normalizeConversation(
    raw: string,
    senderFilter?: string,
    startTime?: string,
    endTime?: string,
  ): string {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    console.log(`[SummarizeV2Service] Normalizing ${lines.length} lines.`);

    const startDate = startTime ? new Date(startTime) : null;
    const endDate = endTime ? new Date(endTime) : null;

    const filtered = lines.filter(line => {
      const timeMatch = line.match(/\[([^\]]+)\]/);
      const senderMatch = line.match(/\[([^\]]+)\]\s+([^:]+):|^([^:]+):/);

      if (senderFilter) {
        const sender = senderMatch?.[2]?.trim() || senderMatch?.[3]?.trim() || '';
        if (sender && !sender.toLowerCase().includes(senderFilter.toLowerCase())) return false;
      }

      if (timeMatch && (startDate || endDate)) {
        const lineDate = new Date(timeMatch[1]);
        if (!isNaN(lineDate.getTime())) {
          if (startDate && lineDate < startDate) return false;
          if (endDate && lineDate > endDate) return false;
        }
      }

      return true;
    });

    // Flatten: strip timestamp and role markers
    // Also remove stuttering, duplicated words, and noisy repetitive system patterns
    const normalized = filtered.map(line => {
      let content = line
        .replace(/^\[([^\]]+)\]\s+/, '') // remove timestamp
        .replace(/^([^:]+):\s*/, '')     // remove "Sender:"
        .trim();

      // Remove stuttering: "giúp giúp" -> "giúp"
      content = content.replace(/\b(\w+)\s+\1\b/gi, '$1');

      // Remove common noisy patterns (emojis, etc. if they slipped through)
      // but keep meaningful text
      return content;
    })
      .filter(text => text.length > 2); // Ignore very short/empty messages

    console.log(`[SummarizeV2Service] Lines after filtering: ${normalized.length}`);
    return normalized.join('\n');
  }

  private buildPrompt(text: string): string {
    return `NỘI DUNG HỘI THOẠI CẦN TÓM TẮT:\n${text}\n\nYÊU CẦU: Phân tích hội thoại trên và trả về kết quả JSON theo đúng schema đã hướng dẫn.`;
  }

  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let current = '';

    for (const line of lines) {
      if (current.length + line.length > MAX_CHUNK_LENGTH && current) {
        chunks.push(current);
        current = line;
        if (chunks.length >= MAX_CHUNKS) break;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }

    if (current && chunks.length < MAX_CHUNKS) chunks.push(current);
    return chunks;
  }

  /**
   * Returns true if model output is invalid based on multiple criteria:
   * 1. Transcript pattern (User: ...)
   * 2. Too many conversation lines
   * 3. High overlap with input (simple paraphrase/copy)
   */
  private isInvalidOutput(text: string, input: string): boolean {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      // Check inside the JSON if possible
      try {
        const parsed = JSON.parse(trimmed.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const summary = parsed.summary || '';
        if (typeof summary === 'string') {
          // Check for transcript pattern in summary
          if (TRANSCRIPT_LINE_RE.test(summary)) return true;
          // Check for high overlap (rough estimate)
          if (summary.length > 20 && input.includes(summary.substring(0, 20))) return true;
        }
      } catch { /* ignore */ }
    }

    if (TRANSCRIPT_LINE_RE.test(text)) return true;

    // Detect high similarity/echoing: if the summary contains large chunks of input verbatim
    if (input.length > 50) {
      const cleanedInput = input.toLowerCase().replace(/[^\w\s]/g, '');
      const cleanedSummary = text.toLowerCase().replace(/[^\w\s]/g, '');

      // If summary is just a large portion of input, it's an echo
      if (cleanedSummary.length > 30 && cleanedInput.includes(cleanedSummary.substring(0, 30))) return true;
    }

    const lines = text.split('\n').filter(l => l.trim().length > 5);
    if (lines.length > 8 && lines.every(l => l.includes(':'))) return true;

    return false;
  }

  /**
   * Parses JSON output from the model.
   * Handles markdown code fences and leading/trailing text.
   */
  private parseSummaryResult(text: string): SummaryResult | null {
    const stripped = text.replace(/```(?:json)?\n?/g, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      const toStringArray = (v: unknown): string[] =>
        Array.isArray(v) ? (v as unknown[]).filter(s => typeof s === 'string' && (s as string).trim().length > 0) as string[] : [];

      const summary = Array.isArray(parsed.summary)
        ? parsed.summary.join(' ')
        : (typeof parsed.summary === 'string' ? parsed.summary : '');

      if (!summary) return null;

      return {
        summary: summary,
        resolved: toStringArray(parsed.resolved || parsed.resolved_issues),
        pending: toStringArray(parsed.pending || parsed.pending_issues),
        language: 'vi',
      };
    } catch {
      return null;
    }
  }

  /** Merges results from multiple chunks into one final output */
  private mergeChunkResults(results: SummaryResult[]): SummaryResult {
    return {
      summary: results.map(r => r.summary).join(' '),
      resolved: [...new Set(results.flatMap(r => r.resolved))],
      pending: [...new Set(results.flatMap(r => r.pending))],
      language: 'vi',
    };
  }

  private async callHuggingFace(
    userMessage: string,
    systemPrompt: string,
    overrideConfig: Partial<any> = {},
    attempt = 0
  ): Promise<string | null> {
    const { hostname, path, apiKey, model } = this.getLLMConfig();

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1000,
      temperature: overrideConfig.temperature ?? 0.1,
      top_p: overrideConfig.top_p ?? 0.9,
      stream: false,
    };

    const data = JSON.stringify(requestBody);
    const dataBuffer = Buffer.from(data, 'utf8');

    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': dataBuffer.length,
      },
      timeout: TIMEOUT,
    };

    console.log(`[SummarizeV2Service] [Groq] Attempt ${attempt + 1} → ${options.hostname}${options.path}`);

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode === 503 || res.statusCode === 429 || res.statusCode === 500) {
            if (attempt < 2) {
              console.warn(`[SummarizeV2Service] Groq busy/error (${res.statusCode}), retry in 5s...`);
              setTimeout(() => resolve(this.callHuggingFace(userMessage, systemPrompt, overrideConfig, attempt + 1)), 5000);
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            console.error(`[SummarizeV2Service] Groq API error (${res.statusCode}):`, responseData);
            if (res.statusCode === 403 || res.statusCode === 401) {
              console.error('[SummarizeV2Service] CRITICAL: Groq API key is invalid or expired.');
            }
            reject(new Error(`Groq API error (${res.statusCode}): ${responseData.substring(0, 200)}`));
            return;
          }

          try {
            const result = JSON.parse(responseData);
            const content: string | null = result?.choices?.[0]?.message?.content ?? null;
            resolve(content?.trim() || null);
          } catch {
            reject(new Error('Failed to parse Groq response'));
          }
        });
      });

      req.on('error', e => {
        if (attempt < 2) {
          setTimeout(() => resolve(this.callHuggingFace(userMessage, systemPrompt, overrideConfig, attempt + 1)), 1000);
        } else {
          reject(e);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Groq API request timeout'));
      });

      req.write(dataBuffer);
      req.end();
    });
  }

  /**
   * Extractive summarization fallback — picks top N sentences by TF-IDF-style score.
   * Used when Groq API is unavailable or all chunks fail to produce structured output.
   */
  private extractiveSummarize(text: string, topN = 5): string[] {
    const sentences = text
      .split(/(?<=[.!?\n])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    if (sentences.length <= topN) return sentences;

    const wordFreq: Record<string, number> = {};
    for (const s of sentences) {
      for (const w of s.toLowerCase().match(/\b\w{3,}\b/g) ?? []) {
        wordFreq[w] = (wordFreq[w] ?? 0) + 1;
      }
    }

    const selected = sentences
      .map((sentence, index) => {
        const words = sentence.toLowerCase().match(/\b\w{3,}\b/g) ?? [];
        const score = words.reduce((sum, w) => sum + (wordFreq[w] ?? 0), 0) / (words.length || 1);
        return { sentence, score, index };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .sort((a, b) => a.index - b.index)
      .map(item => item.sentence);

    return [
      "Danh sách các ý chính (Trích xuất tự động):",
      ...selected.map(s => `• ${s}`)
    ];
  }
}

export const summarizeV2Service = new SummarizeV2Service();

