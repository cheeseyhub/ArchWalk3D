export interface ParsedSseEvent {
  event: string;
  data: unknown;
}

/**
 * Parses a single SSE event block (lines separated by LF or CRLF) into an event
 * name and JSON-decoded payload. Returns null for comment-only or empty blocks.
 */
export function parseSseEventBlock(block: string): ParsedSseEvent | null {
  const normalized = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim() || 'message';
    } else if (line.startsWith('data:')) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }

  if (dataLines.length === 0) return null;
  try {
    return {
      event: eventName,
      data: JSON.parse(dataLines.join('\n')),
    };
  } catch {
    return null;
  }
}

/**
 * Stateful incremental SSE parser that handles arbitrary chunk splits,
 * both LF (\n\n) and CRLF (\r\n\r\n) delimiters, and trailing EOF flush.
 */
export class SseStreamParser {
  private buffer = '';

  push(chunk: string): ParsedSseEvent[] {
    if (!chunk) return [];
    this.buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() ?? '';

    const events: ParsedSseEvent[] = [];
    for (const block of blocks) {
      const parsed = parseSseEventBlock(block);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  flush(): ParsedSseEvent[] {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (!remaining) return [];
    const parsed = parseSseEventBlock(remaining);
    return parsed ? [parsed] : [];
  }
}
