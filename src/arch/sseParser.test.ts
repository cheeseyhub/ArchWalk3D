import assert from 'node:assert/strict';
import test from 'node:test';
import { SseStreamParser, parseSseEventBlock } from './sseParser';

test('parseSseEventBlock handles LF, CRLF, comments, and multi-line data', () => {
  const crlf = 'event: complete\r\ndata: {"blueprint":{"name":"Studio"}}\r\n';
  const parsed = parseSseEventBlock(crlf);
  assert.deepEqual(parsed, {
    event: 'complete',
    data: { blueprint: { name: 'Studio' } },
  });

  assert.equal(parseSseEventBlock(': keepalive comment'), null);
});

test('SseStreamParser reassembles split chunks and flushes trailing event at EOF', () => {
  const parser = new SseStreamParser();
  const c1 = 'event: stage\ndata: {"stage":"analyzing"}\n\nevent: compl';
  const c2 = 'ete\r\ndata: {"blueprint":{"name":"Sunlit Living Room"}}';

  const first = parser.push(c1);
  assert.equal(first.length, 1);
  assert.equal(first[0].event, 'stage');

  const second = parser.push(c2);
  assert.equal(second.length, 0);

  // Even without a trailing \n\n at EOF, flush() recovers the complete event
  const flushed = parser.flush();
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].event, 'complete');
  assert.deepEqual(flushed[0].data, { blueprint: { name: 'Sunlit Living Room' } });
});
