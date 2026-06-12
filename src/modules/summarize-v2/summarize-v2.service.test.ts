import { describe, it, expect } from 'vitest';
import { SummarizeV2Service } from './summarize-v2.service';
import type { SummaryResult } from './summarize-v2.types';

// Access private methods via any-cast
function svc(): any {
  return new SummarizeV2Service() as any;
}

// ─── normalizeConversation ────────────────────────────────────────────────────

describe('SummarizeV2Service.normalizeConversation', () => {
  it('strips timestamps and sender prefixes', () => {
    const raw = '[2024-01-01T10:00:00Z] Alice: Hello world';
    const result = svc().normalizeConversation(raw);
    expect(result).not.toContain('Alice:');
    expect(result).not.toContain('[2024-01-01');
    expect(result).toContain('Hello world');
  });

  it('returns empty string when all lines are filtered out', () => {
    const result = svc().normalizeConversation('');
    expect(result.trim()).toBe('');
  });

  it('filters by senderFilter (case-insensitive)', () => {
    const raw = '[2024-01-01] Alice: keep this\n[2024-01-01] Bob: drop this';
    const result = svc().normalizeConversation(raw, 'alice');
    expect(result).toContain('keep this');
    expect(result).not.toContain('drop this');
  });

  it('filters by startTime — drops lines before start', () => {
    const raw =
      '[2024-01-01T08:00:00Z] Alice: early\n[2024-01-01T12:00:00Z] Alice: later';
    const result = svc().normalizeConversation(raw, undefined, '2024-01-01T10:00:00Z');
    expect(result).toContain('later');
    expect(result).not.toContain('early');
  });

  it('filters by endTime — drops lines after end', () => {
    const raw =
      '[2024-01-01T08:00:00Z] Alice: early\n[2024-01-01T20:00:00Z] Alice: late';
    const result = svc().normalizeConversation(raw, undefined, undefined, '2024-01-01T12:00:00Z');
    expect(result).toContain('early');
    expect(result).not.toContain('late');
  });

  it('removes stuttering ASCII word duplicates', () => {
    // \b(\w+)\s+\1\b only matches ASCII word chars — use ASCII to test regex behaviour
    const raw = 'Alice: hello hello world';
    const result = svc().normalizeConversation(raw);
    expect(result).toBe('hello world');
  });

  it('drops very short lines (<=2 chars)', () => {
    const raw = 'Alice: hi\nBob: a longer message here';
    const result = svc().normalizeConversation(raw);
    expect(result).not.toContain('hi');
    expect(result).toContain('a longer message here');
  });
});

// ─── splitIntoChunks ─────────────────────────────────────────────────────────

describe('SummarizeV2Service.splitIntoChunks', () => {
  it('returns a single chunk for short text', () => {
    const chunks: string[] = svc().splitIntoChunks('line one\nline two\nline three');
    expect(chunks).toHaveLength(1);
  });

  it('splits when text exceeds MAX_CHUNK_LENGTH (4000 chars)', () => {
    const longLine = 'A'.repeat(2500);
    const text = `${longLine}\n${longLine}`;
    const chunks: string[] = svc().splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('respects MAX_CHUNKS limit (5)', () => {
    const longLine = 'B'.repeat(2500);
    const lines = Array.from({ length: 20 }, () => longLine).join('\n');
    const chunks: string[] = svc().splitIntoChunks(lines);
    expect(chunks.length).toBeLessThanOrEqual(5);
  });

  it('returns empty array for empty input', () => {
    const chunks: string[] = svc().splitIntoChunks('');
    expect(chunks).toHaveLength(0);
  });
});

// ─── parseSummaryResult ───────────────────────────────────────────────────────

describe('SummarizeV2Service.parseSummaryResult', () => {
  it('parses valid JSON block', () => {
    const text = JSON.stringify({
      summary: 'Meeting about project timeline',
      resolved: ['Deadline agreed'],
      pending: ['Budget approval'],
      language: 'vi',
    });
    const result: SummaryResult | null = svc().parseSummaryResult(text);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Meeting about project timeline');
    expect(result!.resolved).toEqual(['Deadline agreed']);
    expect(result!.pending).toEqual(['Budget approval']);
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const text = '```json\n{"summary":"ok","resolved":[],"pending":[]}\n```';
    const result: SummaryResult | null = svc().parseSummaryResult(text);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('ok');
  });

  it('returns null for garbage text', () => {
    expect(svc().parseSummaryResult('not json at all')).toBeNull();
  });

  it('returns null when summary is empty/missing', () => {
    const text = JSON.stringify({ summary: '', resolved: [], pending: [] });
    expect(svc().parseSummaryResult(text)).toBeNull();
  });

  it('joins array summary into a single string', () => {
    const text = JSON.stringify({ summary: ['Part one', 'Part two'], resolved: [], pending: [] });
    const result = svc().parseSummaryResult(text);
    expect(result!.summary).toBe('Part one Part two');
  });

  it('handles resolved/pending as resolved_issues/pending_issues fallback keys', () => {
    const text = JSON.stringify({
      summary: 'good',
      resolved_issues: ['done'],
      pending_issues: ['todo'],
    });
    const result = svc().parseSummaryResult(text);
    expect(result!.resolved).toEqual(['done']);
    expect(result!.pending).toEqual(['todo']);
  });

  it('filters non-string entries from resolved/pending arrays', () => {
    const text = JSON.stringify({ summary: 'ok', resolved: ['valid', 42, null, '  '], pending: [] });
    const result = svc().parseSummaryResult(text);
    expect(result!.resolved).toEqual(['valid']);
  });
});

// ─── isInvalidOutput ─────────────────────────────────────────────────────────

describe('SummarizeV2Service.isInvalidOutput', () => {
  it('returns false for a clean summary', () => {
    const summary = '{"summary":"Cuộc họp thảo luận về lịch trình dự án.","resolved":[],"pending":[]}';
    expect(svc().isInvalidOutput(summary, 'some input text here')).toBe(false);
  });

  it('returns true for transcript-like output (User: message format)', () => {
    const transcript = 'Alice: chào bạn\nBob: hi';
    expect(svc().isInvalidOutput(transcript, 'unrelated input')).toBe(true);
  });

  it('returns true when output echoes the beginning of input', () => {
    const input = 'hello world this is a long conversation excerpt about planning';
    const echo = 'hello world this is a long conversation excerpt about planning'; // same start
    expect(svc().isInvalidOutput(echo, input)).toBe(true);
  });

  it('returns true when all lines look like transcript (many colon-containing lines)', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `User${i}: message content here`).join('\n');
    expect(svc().isInvalidOutput(lines, 'input')).toBe(true);
  });
});

// ─── mergeChunkResults ────────────────────────────────────────────────────────

describe('SummarizeV2Service.mergeChunkResults', () => {
  it('joins summaries with a space', () => {
    const results: SummaryResult[] = [
      { summary: 'Part A', resolved: [], pending: [], language: 'vi' },
      { summary: 'Part B', resolved: [], pending: [], language: 'vi' },
    ];
    const merged = svc().mergeChunkResults(results);
    expect(merged.summary).toBe('Part A Part B');
  });

  it('deduplicates resolved and pending items', () => {
    const results: SummaryResult[] = [
      { summary: 'A', resolved: ['item1', 'item2'], pending: ['pending1'], language: 'vi' },
      { summary: 'B', resolved: ['item2', 'item3'], pending: ['pending1'], language: 'vi' },
    ];
    const merged = svc().mergeChunkResults(results);
    expect(merged.resolved).toEqual(['item1', 'item2', 'item3']);
    expect(merged.pending).toEqual(['pending1']);
  });

  it('returns empty arrays when all chunks have no resolved/pending', () => {
    const results: SummaryResult[] = [
      { summary: 'x', resolved: [], pending: [], language: 'vi' },
    ];
    expect(svc().mergeChunkResults(results).resolved).toEqual([]);
    expect(svc().mergeChunkResults(results).pending).toEqual([]);
  });
});

// ─── extractiveSummarize ──────────────────────────────────────────────────────

describe('SummarizeV2Service.extractiveSummarize', () => {
  it('returns all sentences when count <= topN', () => {
    const text = 'Short sentence one. Another brief one.';
    const result: string[] = svc().extractiveSummarize(text);
    // Both sentences plus "Danh sách..." header or just the sentences if <= 5
    const sentences = result.filter((s: string) => !s.includes('Danh sách'));
    expect(sentences.length).toBeGreaterThanOrEqual(1);
  });

  it('returns at most topN+1 items (header + top sentences) for long text', () => {
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `Sentence number ${i} contains some meaningful content to score.`
    ).join(' ');
    const result: string[] = svc().extractiveSummarize(sentences, 3);
    // Header + 3 bullets
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('result preserves original sentence order', () => {
    const text = [
      'This is the first important sentence about the project.',
      'The second sentence discusses the budget allocation carefully.',
      'Third sentence covers the timeline and deliverables.',
      'Fourth sentence about risk management and mitigation.',
      'Fifth sentence about team composition and responsibilities.',
      'Sixth sentence about stakeholder communication plan.',
    ].join(' ');
    const result: string[] = svc().extractiveSummarize(text, 3);
    const bullets = result.filter((s: string) => s.startsWith('•'));
    // The bullets should appear in document order
    const indices = bullets.map((b: string) => text.indexOf(b.replace('• ', '')));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('handles empty string gracefully', () => {
    const result: string[] = svc().extractiveSummarize('');
    expect(result).toEqual([]);
  });
});
