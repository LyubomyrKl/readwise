import { JwtService } from '@nestjs/jwt';
import { trackerOf } from './throttle.guard';

describe('session throttling key', () => {
  const secret = 'throttle-test-secret';
  const sign = (payload: object, key = secret) => new JwtService({}).sign(payload, { secret: key, expiresIn: 60 });
  let previous: string | undefined;

  beforeAll(() => {
    previous = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = secret;
  });

  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = previous;
  });

  it('keys requests with a valid access token by their session', () => {
    const a = trackerOf({ headers: { authorization: `Bearer ${sign({ sub: 'u1', sid: 's1' })}` }, ip: '10.0.0.2' });
    const b = trackerOf({ headers: { authorization: `bearer ${sign({ sub: 'u1', sid: 's2' })}` }, ip: '10.0.0.2' });
    expect([a, b]).toEqual(['session:s1', 'session:s2']);
  });

  it('keys a made-up, foreign or expired token by the client address, like no token', () => {
    const expired = new JwtService({}).sign({ sub: 'u1', sid: 's1', exp: Math.floor(Date.now() / 1000) - 10 }, { secret });
    for (const token of ['junk-1', 'junk-2', sign({ sub: 'u1', sid: 's1' }, 'another-secret'), expired, sign({ sub: 'u1' })]) {
      expect(trackerOf({ headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.9' }, ip: '10.0.0.2' })).toBe('ip:203.0.113.9');
    }
  });

  it('keys anonymous requests by the forwarded client address, falling back to the socket', () => {
    expect(trackerOf({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }, ip: '10.0.0.2' })).toBe('ip:203.0.113.9');
    expect(trackerOf({ headers: { 'x-forwarded-for': ['203.0.113.9'] }, ip: '10.0.0.2' })).toBe('ip:203.0.113.9');
    expect(trackerOf({ headers: {}, ip: '10.0.0.2' })).toBe('ip:10.0.0.2');
    expect(trackerOf({ headers: { authorization: 'Basic abc' }, ip: '10.0.0.2' })).toBe('ip:10.0.0.2');
    expect(trackerOf({})).toBe('ip:unknown');
  });
});
