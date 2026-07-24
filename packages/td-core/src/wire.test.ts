import { describe, expect, it } from 'vitest'
import { escapeNewlines, parse, PROTOCOL_VERSION, unescapeNewlines } from './wire'

describe('parse', () => {
  it('parses each known message type', () => {
    expect(parse('{"type":"hello","protocol":1}')).toEqual({ type: 'hello', protocol: 1 })
    expect(parse('{"type":"snapshot-request"}')).toEqual({ type: 'snapshot-request' })
    expect(parse('{"type":"welcome","protocol":1}')).toEqual({ type: 'welcome', protocol: 1 })
    expect(parse('{"type":"welcome","protocol":1,"instance":"render"}')).toEqual({
      type: 'welcome',
      protocol: 1,
      instance: 'render',
    })
    expect(parse('{"type":"snapshot","params":{"a":1}}')).toEqual({
      type: 'snapshot',
      params: { a: 1 },
    })
    expect(parse('{"type":"update","params":{"a":1}}')).toEqual({
      type: 'update',
      params: { a: 1 },
    })
    expect(parse('{"type":"pulse","name":"reset"}')).toEqual({ type: 'pulse', name: 'reset' })
    expect(parse('{"type":"ping"}')).toEqual({ type: 'ping' })
    expect(parse('{"type":"pong"}')).toEqual({ type: 'pong' })
  })

  it('parses error messages, keeping optional message/ref only when strings', () => {
    expect(parse('{"type":"error","code":"unknown_param","message":"no param","ref":"foo"}')).toEqual({
      type: 'error',
      code: 'unknown_param',
      message: 'no param',
      ref: 'foo',
    })
    // A connection-scoped error carries no ref — omitted, not null.
    expect(parse('{"type":"error","code":"internal"}')).toEqual({
      type: 'error',
      code: 'internal',
    })
    // Non-string code is structurally invalid.
    expect(parse('{"type":"error","code":42}')).toBeNull()
    expect(parse('{"type":"error"}')).toBeNull()
  })

  it('accepts every wire-legal value shape in a params map', () => {
    const msg = parse(
      '{"type":"update","params":{"n":1.5,"s":"hi","b":true,"arr":[1,0,0,1]}}',
    )
    expect(msg).toEqual({
      type: 'update',
      params: { n: 1.5, s: 'hi', b: true, arr: [1, 0, 0, 1] },
    })
  })

  it('returns null for malformed JSON', () => {
    expect(parse('{not json')).toBeNull()
    expect(parse('')).toBeNull()
  })

  it('returns null for non-object payloads', () => {
    expect(parse('42')).toBeNull()
    expect(parse('"hello"')).toBeNull()
    expect(parse('[1,2,3]')).toBeNull()
    expect(parse('null')).toBeNull()
  })

  it('drops unknown message types', () => {
    expect(parse('{"type":"rtc-offer","sdp":"..."}')).toBeNull()
    expect(parse('{"type":"totally-made-up"}')).toBeNull()
    expect(parse('{"protocol":1}')).toBeNull()
  })

  it('rejects structurally invalid known types', () => {
    expect(parse('{"type":"welcome"}')).toBeNull() // missing protocol
    expect(parse('{"type":"hello","protocol":"1"}')).toBeNull() // wrong protocol type
    expect(parse('{"type":"snapshot"}')).toBeNull() // missing params
    expect(parse('{"type":"update","params":42}')).toBeNull() // params not a map
    expect(parse('{"type":"update","params":{"bad":{"nested":1}}}')).toBeNull()
    expect(parse('{"type":"update","params":{"arr":[1,"x"]}}')).toBeNull() // mixed array
    expect(parse('{"type":"pulse"}')).toBeNull() // missing name
    expect(parse('{"type":"pulse","name":42}')).toBeNull() // wrong name type
  })

  it('exports the current protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})

describe('newline escaping', () => {
  it('encodes every line-break flavour as the two-character \\n', () => {
    expect(escapeNewlines('a\nb')).toBe('a\\nb')
    expect(escapeNewlines('a\r\nb')).toBe('a\\nb')
    expect(escapeNewlines('a\rb')).toBe('a\\nb')
    expect(escapeNewlines('a\n\nb')).toBe('a\\n\\nb')
  })

  it('leaves text without line breaks untouched', () => {
    expect(escapeNewlines('hello world')).toBe('hello world')
    expect(unescapeNewlines('hello world')).toBe('hello world')
  })

  it('round-trips through TD and back', () => {
    expect(unescapeNewlines(escapeNewlines('line one\nline two\n'))).toBe('line one\nline two\n')
  })
})
