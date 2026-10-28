import { trackerOf } from './throttle.guard';

describe('session throttling key', () => {
  it('keys authenticated requests by a hash of the bearer token', () => {
    const a = trackerOf({ headers: { authorization: 'Bearer token-a' }, ip: '10.0.0.2' });
    const b = trackerOf({ headers: { authorization: 'Bearer token-b' }, ip: '10.0.0.2' });
    expect(a).toMatch(/^session:[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('token-a');
    expect(trackerOf({ headers: { authorization: 'bearer token-a' } })).toBe(a);
  });

  it('keys anonymous requests by the forwarded client address, falling back to the socket', () => {
    expect(trackerOf({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }, ip: '10.0.0.2' })).toBe('ip:203.0.113.9');
    expect(trackerOf({ headers: { 'x-forwarded-for': ['203.0.113.9'] }, ip: '10.0.0.2' })).toBe('ip:203.0.113.9');
    expect(trackerOf({ headers: {}, ip: '10.0.0.2' })).toBe('ip:10.0.0.2');
    expect(trackerOf({ headers: { authorization: 'Basic abc' }, ip: '10.0.0.2' })).toBe('ip:10.0.0.2');
    expect(trackerOf({})).toBe('ip:unknown');
  });
});
