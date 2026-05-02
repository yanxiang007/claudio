import { describe, it, expect } from 'vitest';
import { parseDecision, parseChat, sanitizeSpokenText } from '../src/adapters/dj-brain.js';

describe('parseDecision', () => {
  it('parses well-formed JSON', () => {
    const raw = '{"shouldSpeak": true, "script": "hello", "nextTrack": {"source": "favorites", "hint": ""}}';
    const d = parseDecision(raw);
    expect(d.shouldSpeak).toBe(true);
    expect(d.script).toBe('hello');
  });

  it('extracts JSON wrapped in prose', () => {
    const raw = 'Here is my decision:\n```json\n{"shouldSpeak": false, "script": null, "nextTrack": {"source": "recommend", "hint": ""}}\n```\n';
    const d = parseDecision(raw);
    expect(d.shouldSpeak).toBe(false);
  });

  it('falls back to safe default on garbage', () => {
    const d = parseDecision('I cannot do that');
    expect(d.shouldSpeak).toBe(false);
    expect(d.nextTrack.source).toBe('recommend');
  });
});

describe('parseChat', () => {
  it('parses play intent', () => {
    const r = parseChat('{"intent":"play","query":"Bon Iver","count":3,"reply":"Sure, putting it on."}');
    expect(r.intent).toBe('play');
    expect(r.query).toBe('Bon Iver');
    expect(r.count).toBe(3);
  });

  it('falls back to chat intent', () => {
    const r = parseChat('not json');
    expect(r.intent).toBe('chat');
    expect(r.reply.length).toBeGreaterThan(0);
  });
});

describe('sanitizeSpokenText', () => {
  it('removes hidden reasoning before text-to-speech', () => {
    const spoken = sanitizeSpokenText('<think>private chain</think>{"reply":"Here is the bit for air."}');
    expect(spoken).toBe('Here is the bit for air.');
  });

  it('keeps only spoken script from a JSON-shaped response', () => {
    const spoken = sanitizeSpokenText('```json\n{"script":"Next, a little neon-lit pop pressure."}\n```');
    expect(spoken).toBe('Next, a little neon-lit pop pressure.');
  });
});
