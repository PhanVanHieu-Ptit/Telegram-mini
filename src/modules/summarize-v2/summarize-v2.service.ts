import * as https from 'https';
import { SummarizeRequest, SummarizeResponse, HuggingFaceResponse } from './summarize-v2.types';

const HF_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
const TIMEOUT = 15000; // 15s
const MAX_CHUNKS = 5;
const MAX_CHUNK_LENGTH = 1000;

export class SummarizeV2Service {
  private getApiKey(): string {
    const rawKey = process.env.HUGGINGFACE_API_KEY || process.env.HUGGING_FACE_TOKEN || process.env.HF_TOKEN || '';
    // Trim quotes if they exist in .env
    return rawKey.replace(/^['"]|['"]$/g, '');
  }

  /**
   * Main summarization logic
   */
  async summarize(input: SummarizeRequest): Promise<SummarizeResponse> {
    console.log('[SummarizeV2Service] Received request:', {
      messagesLength: input.messages.length,
      senderFilter: input.senderFilter,
      startTime: input.startTime,
      endTime: input.endTime
    });

    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('HUGGINGFACE_API_KEY is not configured');
      }

      // 1. Clean and normalize
      const cleanedText = this.normalizeMessages(
        input.messages,
        input.senderFilter,
        input.startTime,
        input.endTime
      );

      if (!cleanedText.trim()) {
        console.warn('[SummarizeV2Service] No messages left after filtering.');
        return { 
          success: true, 
          summary: [],
          message: 'Không tìm thấy tin nhắn nào phù hợp với bộ lọc.' 
        };
      }

      // 2. Split into chunks
      const chunks = this.splitIntoChunks(cleanedText);
      console.log(`[SummarizeV2Service] Processing ${chunks.length} chunks...`);
      
      // 3. Summarize each chunk
      const summaryParts: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`[SummarizeV2Service] Sending chunk ${i + 1}/${chunks.length} to AI (${chunks[i].length} chars)`);
        const summary = await this.callHuggingFaceWithRetry(chunks[i]);
        if (summary) {
          console.log(`[SummarizeV2Service] Chunk ${i + 1} summarized successfully.`);
          summaryParts.push(summary);
        } else {
          console.warn(`[SummarizeV2Service] Chunk ${i + 1} returned empty summary.`);
        }
      }

      // 4. Merge and format
      const finalSummary = this.parseSummaryResult(summaryParts.join(' '));
      console.log(`[SummarizeV2Service] Final summary generated with ${finalSummary.length} points.`);

      return {
        success: true,
        summary: finalSummary.length > 0 ? finalSummary : ['Không thể tạo bản tóm tắt từ nội dung đã chọn.']
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SummarizeV2Service] Error:', errorMessage);
      return {
        success: false,
        summary: [],
        message: errorMessage
      };
    }
  }

  /**
   * Normalizes and filters messages
   */
  private normalizeMessages(
    raw: string,
    senderFilter?: string,
    startTime?: string,
    endTime?: string
  ): string {
    const originalLines = raw.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    console.log(`[SummarizeV2Service] Normalizing ${originalLines.length} lines.`);

    const startDate = startTime ? new Date(startTime) : null;
    const endDate = endTime ? new Date(endTime) : null;

    const filteredLines = originalLines.filter(line => {
      // Pattern: [HH:mm:ss] Name: content
      const timeMatch = line.match(/\[(.*?)\]/);
      const nameMatch = line.match(/\]\s*(.*?):/);

      // 1. Filter by Sender (if matchable)
      if (senderFilter && nameMatch) {
        const senderName = nameMatch[1].toLowerCase();
        const filter = senderFilter.toLowerCase();
        if (!senderName.includes(filter)) {
          return false;
        }
      }

      // 2. Filter by Time (if matchable)
      if (timeMatch && (startDate || endDate)) {
        const lineDate = new Date(timeMatch[1]);
        if (!isNaN(lineDate.getTime())) {
          if (startDate && lineDate < startDate) return false;
          if (endDate && lineDate > endDate) return false;
        }
      }

      return true;
    });

    console.log(`[SummarizeV2Service] Lines after filtering: ${filteredLines.length}`);
    return filteredLines.join('\n');
  }

  /**
   * Splits text into manageable chunks for the LLM
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk.length + line.length) > MAX_CHUNK_LENGTH) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
      
      if (chunks.length >= MAX_CHUNKS) break;
    }

    if (currentChunk && chunks.length < MAX_CHUNKS) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Calls HF API using native https module to bypass any interception
   */
  private async callHuggingFaceWithRetry(text: string, attempt: number = 0): Promise<string | null> {
    const apiKey = this.getApiKey();
    const data = JSON.stringify({
      inputs: `Tóm tắt đoạn hội thoại sau đây thành các ý chính bằng tiếng Việt:\n\n${text}`,
      parameters: {
        max_new_tokens: 500,
        return_full_text: false
      }
    });

    const options = {
      hostname: 'api-inference.huggingface.co',
      path: `/models/${HF_MODEL}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: TIMEOUT
    };

    console.log(`[SummarizeV2Service] [HF DEBUG] Attempt ${attempt + 1} - Calling https://${options.hostname}${options.path}`);

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode === 503 || res.statusCode === 429) {
            if (attempt < 1) {
              console.warn(`[SummarizeV2Service] HF API busy (${res.statusCode}), retrying...`);
              setTimeout(() => resolve(this.callHuggingFaceWithRetry(text, attempt + 1)), 3000);
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HF API error (${res.statusCode}): ${responseData.substring(0, 200)}`));
            return;
          }

          try {
            const result = JSON.parse(responseData);
            if (Array.isArray(result) && result[0]?.generated_text) {
              resolve(result[0].generated_text);
            } else if (result?.generated_text) {
              resolve(result.generated_text);
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(new Error('Failed to parse HF response'));
          }
        });
      });

      req.on('error', (e) => {
        if (attempt < 1) {
          setTimeout(() => resolve(this.callHuggingFaceWithRetry(text, attempt + 1)), 1000);
        } else {
          reject(e);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('HF API request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Parses text into bullet points
   */
  private parseSummaryResult(text: string): string[] {
    return text
      .split(/[.!?\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 5) // Slightly more lenient
      .map(s => s.replace(/^[-•*]\s+/, ''));
  }
}

export const summarizeV2Service = new SummarizeV2Service();
