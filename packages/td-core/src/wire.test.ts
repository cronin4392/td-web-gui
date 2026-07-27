import { describe, expect, it } from 'vitest';
import { escapeNewlines, parse, PROTOCOL_VERSION, unescapeNewlines } from './wire';

describe('parse', () => {
  it('parses each known message type', () => {
    expect(parse('{"type":"hello","protocol":1}')).toEqual({ type: 'hello', protocol: 1 });
    expect(parse('{"type":"snapshot-request"}')).toEqual({ type: 'snapshot-request' });
    expect(parse('{"type":"welcome","protocol":1}')).toEqual({ type: 'welcome', protocol: 1 });
    expect(parse('{"type":"welcome","protocol":1,"instance":"render"}')).toEqual({
      type: 'welcome',
      protocol: 1,
      instance: 'render',
    });
    expect(parse('{"type":"snapshot","params":{"a":1}}')).toEqual({
      type: 'snapshot',
      params: { a: 1 },
    });
    expect(parse('{"type":"update","params":{"a":1}}')).toEqual({
      type: 'update',
      params: { a: 1 },
    });
    expect(parse('{"type":"pulse","name":"reset"}')).toEqual({ type: 'pulse', name: 'reset' });
    expect(parse('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parse('{"type":"pong"}')).toEqual({ type: 'pong' });
  });

  it('parses error messages, keeping optional message/ref only when strings', () => {
    expect(
      parse('{"type":"error","code":"unknown_param","message":"no param","ref":"foo"}'),
    ).toEqual({
      type: 'error',
      code: 'unknown_param',
      message: 'no param',
      ref: 'foo',
    });
    // A connection-scoped error carries no ref — omitted, not null.
    expect(parse('{"type":"error","code":"internal"}')).toEqual({
      type: 'error',
      code: 'internal',
    });
    // Non-string code is structurally invalid.
    expect(parse('{"type":"error","code":42}')).toBeNull();
    expect(parse('{"type":"error"}')).toBeNull();
  });

  it('parses the WebRTC signaling messages (5.1)', () => {
    expect(parse('{"type":"rtc-offer","sdp":"v=0..."}')).toEqual({
      type: 'rtc-offer',
      sdp: 'v=0...',
    });
    expect(parse('{"type":"rtc-answer","sdp":"v=0..."}')).toEqual({
      type: 'rtc-answer',
      sdp: 'v=0...',
    });
    expect(
      parse('{"type":"rtc-ice","candidate":"candidate:1 1 udp","sdpMid":"0","sdpMLineIndex":0}'),
    ).toEqual({
      type: 'rtc-ice',
      candidate: 'candidate:1 1 udp',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
    expect(
      parse('{"type":"streams","streams":[{"id":"main","mid":"0","label":"Render A"}]}'),
    ).toEqual({ type: 'streams', streams: [{ id: 'main', mid: '0', label: 'Render A' }] });
    expect(parse('{"type":"streams","streams":[]}')).toEqual({ type: 'streams', streams: [] });
  });

  it('keeps end-of-candidates distinct from a missing candidate', () => {
    // `candidate: null` is the end-of-gathering signal, so it must survive parse
    // rather than being treated as a malformed frame.
    expect(parse('{"type":"rtc-ice","candidate":null}')).toEqual({
      type: 'rtc-ice',
      candidate: null,
    });
    // An explicit null m-line association is preserved; an omitted one stays omitted.
    expect(parse('{"type":"rtc-ice","candidate":"c","sdpMid":null,"sdpMLineIndex":null}')).toEqual({
      type: 'rtc-ice',
      candidate: 'c',
      sdpMid: null,
      sdpMLineIndex: null,
    });
    expect(parse('{"type":"rtc-ice"}')).toBeNull();
  });

  it('rejects structurally invalid signaling messages', () => {
    expect(parse('{"type":"rtc-offer"}')).toBeNull();
    expect(parse('{"type":"rtc-answer","sdp":42}')).toBeNull();
    expect(parse('{"type":"rtc-ice","candidate":42}')).toBeNull();
    expect(parse('{"type":"rtc-ice","candidate":"c","sdpMid":7}')).toBeNull();
    expect(parse('{"type":"streams"}')).toBeNull();
    expect(parse('{"type":"streams","streams":[{"id":"main"}]}')).toBeNull(); // missing mid
    expect(parse('{"type":"streams","streams":[{"id":1,"mid":"0"}]}')).toBeNull();
  });

  it('accepts every wire-legal value shape in a params map', () => {
    const msg = parse('{"type":"update","params":{"n":1.5,"s":"hi","b":true,"arr":[1,0,0,1]}}');
    expect(msg).toEqual({
      type: 'update',
      params: { n: 1.5, s: 'hi', b: true, arr: [1, 0, 0, 1] },
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parse('{not json')).toBeNull();
    expect(parse('')).toBeNull();
  });

  it('returns null for non-object payloads', () => {
    expect(parse('42')).toBeNull();
    expect(parse('"hello"')).toBeNull();
    expect(parse('[1,2,3]')).toBeNull();
    expect(parse('null')).toBeNull();
  });

  it('drops unknown message types', () => {
    expect(parse('{"type":"totally-made-up"}')).toBeNull();
    expect(parse('{"protocol":1}')).toBeNull();
  });

  it('rejects structurally invalid known types', () => {
    expect(parse('{"type":"welcome"}')).toBeNull(); // missing protocol
    expect(parse('{"type":"hello","protocol":"1"}')).toBeNull(); // wrong protocol type
    expect(parse('{"type":"snapshot"}')).toBeNull(); // missing params
    expect(parse('{"type":"update","params":42}')).toBeNull(); // params not a map
    expect(parse('{"type":"pulse"}')).toBeNull(); // missing name
    expect(parse('{"type":"pulse","name":42}')).toBeNull(); // wrong name type
  });

  it('parses a table readout as string[][]', () => {
    const raw = '{"type":"update","params":{"cues":[["name","time"],["intro","0:00"]]}}';
    expect(parse(raw)).toEqual({
      type: 'update',
      params: {
        cues: [
          ['name', 'time'],
          ['intro', '0:00'],
        ],
      },
    });
  });

  it('reads an empty array as a valid value rather than a malformed one', () => {
    // Ambiguous between number[] and string[][], and correct either way — there
    // is nothing in it to disagree about. An empty table or an empty ParGroup
    // must not take the whole message down.
    expect(parse('{"type":"update","params":{"empty":[]}}')).toEqual({
      type: 'update',
      params: { empty: [] },
    });
  });

  it('drops only the offending param, keeping the rest of the map', () => {
    // The whole point of per-entry validation: one unrecognised value must not
    // cost the client every other param in the message. Rejecting the map
    // wholesale would mean a single bad entry in a SNAPSHOT leaves the UI
    // entirely empty, pointing nowhere near the cause — and it is what would
    // make every future wire-type addition a breaking change.
    const raw =
      '{"type":"update","params":{"good":1,"nested":{"a":1},"mixed":[1,"x"],"ragged":[["ok"],[2]],"also":"fine"}}';
    expect(parse(raw)).toEqual({
      type: 'update',
      params: { good: 1, also: 'fine' },
    });
  });

  it('keeps an empty params map rather than nulling the message', () => {
    // A snapshot from a project with an empty REGISTRY is legitimate, and is
    // what flips the connection to `synced`.
    expect(parse('{"type":"snapshot","params":{}}')).toEqual({ type: 'snapshot', params: {} });
  });

  it('parses a menus announcement', () => {
    // A real TD audio-device key, not a tidied-up one: it carries braces, dots,
    // pipes and parentheses, and any encoding that mangled it would send back a
    // device id TD no longer recognises.
    const key =
      '{0.0.1.00000000}.{feb5e51a-d9cd-45c0-8aff-4770ba283ba0}||Voicemeeter_Out_A4_(VB-Audio_Voicemeeter_VAIO)||1';
    const raw = JSON.stringify({
      type: 'menus',
      menus: { audiodevice: [{ value: key, label: 'Voicemeeter Out A4' }] },
    });

    expect(parse(raw)).toEqual({
      type: 'menus',
      menus: { audiodevice: [{ value: key, label: 'Voicemeeter Out A4' }] },
    });
  });

  it('parses a menus-request (the reload-devices action)', () => {
    expect(parse('{"type":"menus-request"}')).toEqual({ type: 'menus-request' });
  });

  it('accepts an empty menus map and an empty option list', () => {
    expect(parse('{"type":"menus","menus":{}}')).toEqual({ type: 'menus', menus: {} });
    expect(parse('{"type":"menus","menus":{"m":[]}}')).toEqual({ type: 'menus', menus: { m: [] } });
  });

  it('rejects malformed menus', () => {
    expect(parse('{"type":"menus"}')).toBeNull(); // missing map
    expect(parse('{"type":"menus","menus":[]}')).toBeNull(); // not an object
    expect(parse('{"type":"menus","menus":{"m":"x"}}')).toBeNull(); // options not a list
    // Both fields are required: a labelless entry has nothing to render, and a
    // valueless one can't be sent back as a menu key.
    expect(parse('{"type":"menus","menus":{"m":[{"value":"a"}]}}')).toBeNull();
    expect(parse('{"type":"menus","menus":{"m":[{"label":"A"}]}}')).toBeNull();
    expect(parse('{"type":"menus","menus":{"m":[{"value":1,"label":"A"}]}}')).toBeNull();
  });

  it('exports the current protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe('newline escaping', () => {
  it('encodes every line-break flavour as the two-character \\n', () => {
    expect(escapeNewlines('a\nb')).toBe('a\\nb');
    expect(escapeNewlines('a\r\nb')).toBe('a\\nb');
    expect(escapeNewlines('a\rb')).toBe('a\\nb');
    expect(escapeNewlines('a\n\nb')).toBe('a\\n\\nb');
  });

  it('leaves text without line breaks untouched', () => {
    expect(escapeNewlines('hello world')).toBe('hello world');
    expect(unescapeNewlines('hello world')).toBe('hello world');
  });

  it('round-trips through TD and back', () => {
    expect(unescapeNewlines(escapeNewlines('line one\nline two\n'))).toBe('line one\nline two\n');
  });
});
