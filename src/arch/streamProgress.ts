export interface BlueprintStreamProgress {
  detectedName: string | null;
  roofStyle: 'flat' | 'gabled' | null;
  roomsCount: number;
  roomNames: string[];
  wallsCount: number;
  furnitureCount: number;
  charsReceived: number;
}

/**
 * Reads a JSON string literal starting at `startQuoteIndex` (pointing at `"`).
 * Returns the unescaped string and the index of the closing quote, or null if
 * the string is incomplete in the streamed buffer.
 */
function readJsonString(
  text: string,
  startQuoteIndex: number,
): { value: string; endIndex: number } | null {
  let i = startQuoteIndex + 1;
  let out = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      if (i + 1 >= text.length) return null;
      const next = text[i + 1];
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next === '"' || next === '\\' || next === '/') out += next;
      else if (next === 'u' && i + 5 < text.length) {
        const hex = text.slice(i + 2, i + 6);
        const code = Number.parseInt(hex, 16);
        if (!Number.isNaN(code)) {
          out += String.fromCharCode(code);
          i += 6;
          continue;
        }
        out += next;
      } else {
        out += next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') {
      return { value: out, endIndex: i };
    }
    out += ch;
    i += 1;
  }
  return null;
}

function skipWhitespace(text: string, index: number): number {
  let i = index;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
    } else {
      break;
    }
  }
  return i;
}

/**
 * Incrementally parses a partial JSON stream from the Gemini blueprint response
 * and extracts live progress counts (building name, roof style, rooms, walls, furniture).
 * Works safely on arbitrarily truncated JSON without throwing.
 */
export function parseBlueprintStreamProgress(rawText: string): BlueprintStreamProgress {
  const result: BlueprintStreamProgress = {
    detectedName: null,
    roofStyle: null,
    roomsCount: 0,
    roomNames: [],
    wallsCount: 0,
    furnitureCount: 0,
    charsReceived: rawText.length,
  };

  if (!rawText) {
    return result;
  }

  let braceDepth = 0;
  let bracketDepth = 0;
  type TopSection = 'none' | 'roof' | 'rooms' | 'walls' | 'furniture' | 'other';
  let currentSection: TopSection = 'none';
  let i = 0;

  while (i < rawText.length) {
    const ch = rawText[i];

    if (ch === '"') {
      const str = readJsonString(rawText, i);
      if (!str) break; // Incomplete string at stream tail
      const afterStr = skipWhitespace(rawText, str.endIndex + 1);
      const isPropertyKey = afterStr < rawText.length && rawText[afterStr] === ':';

      if (isPropertyKey) {
        const valueStart = skipWhitespace(rawText, afterStr + 1);

        // Top-level object keys (depth 1 brace, depth 0 bracket)
        if (braceDepth === 1 && bracketDepth === 0) {
          const key = str.value;
          if (key === 'name') {
            currentSection = 'other';
            if (valueStart < rawText.length && rawText[valueStart] === '"') {
              const val = readJsonString(rawText, valueStart);
              if (val) {
                const trimmed = val.value.trim();
                if (trimmed) result.detectedName = trimmed;
                i = val.endIndex + 1;
                continue;
              }
              break;
            }
          } else if (key === 'roof') {
            currentSection = 'roof';
          } else if (key === 'rooms') {
            currentSection = 'rooms';
          } else if (key === 'walls') {
            currentSection = 'walls';
          } else if (key === 'furniture') {
            currentSection = 'furniture';
          } else {
            currentSection = 'other';
          }
          i = afterStr + 1;
          continue;
        }

        // Inside roof object (braceDepth 2, bracketDepth 0)
        if (
          currentSection === 'roof' &&
          braceDepth === 2 &&
          bracketDepth === 0 &&
          str.value === 'style'
        ) {
          if (valueStart < rawText.length && rawText[valueStart] === '"') {
            const val = readJsonString(rawText, valueStart);
            if (val) {
              if (val.value === 'flat' || val.value === 'gabled') {
                result.roofStyle = val.value;
              }
              i = val.endIndex + 1;
              continue;
            }
            break;
          }
        }

        // Inside a room object (braceDepth 2, bracketDepth 1)
        if (
          currentSection === 'rooms' &&
          braceDepth === 2 &&
          bracketDepth === 1 &&
          str.value === 'name'
        ) {
          if (valueStart < rawText.length && rawText[valueStart] === '"') {
            const val = readJsonString(rawText, valueStart);
            if (val) {
              const roomName = val.value.trim();
              if (roomName) {
                result.roomNames.push(roomName);
              }
              i = val.endIndex + 1;
              continue;
            }
            break;
          }
        }
      }

      i = str.endIndex + 1;
      continue;
    }

    if (ch === '{') {
      braceDepth += 1;
      // An item object starting inside a top-level array (braceDepth becomes 2, bracketDepth is 1)
      if (braceDepth === 2 && bracketDepth === 1) {
        if (currentSection === 'rooms') result.roomsCount += 1;
        else if (currentSection === 'walls') result.wallsCount += 1;
        else if (currentSection === 'furniture') result.furnitureCount += 1;
      }
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth === 1 && bracketDepth === 0 && currentSection === 'roof') {
        currentSection = 'none';
      }
    } else if (ch === '[') {
      bracketDepth += 1;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      if (braceDepth === 1 && bracketDepth === 0) {
        currentSection = 'none';
      }
    }

    i += 1;
  }

  return result;
}
