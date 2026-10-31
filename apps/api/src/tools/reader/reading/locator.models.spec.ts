import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHighlightDto, UpdateHighlightDto } from './highlight.models';
import { LocatorDto, locatorJson } from './locator.models';

/** The app's ValidationPipe settings: unknown fields anywhere are refused. */
async function errors(body: unknown, cls: new () => object = LocatorDto) {
  const instance = plainToInstance(cls, body);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

const epub = {
  v: 2,
  format: 'epub',
  href: 'OEBPS/ch03.xhtml',
  blocks: ['b12', 'b13'],
  cfi: 'epubcfi(/6/8!/4/2,/1:0,/1:20)',
  quote: { exact: 'розбили коронне військо', prefix: 'Під Пилявцями козаки ', suffix: '. Після' },
  position: { start: 120, end: 143 },
  progression: 0.42,
  totalProgression: 0.18,
  engine: 'foliate-78914ae',
};
const pdf = {
  v: 2,
  format: 'pdf',
  page: 41,
  pageLabel: 'xlii',
  quads: [[72.1, 640.3, 300.5, 640.3, 72.1, 628, 300.5, 628]],
  continuation: [{ page: 42, quads: [[72, 700, 200, 700, 72, 688, 200, 688]] }],
  quote: { exact: 'the quick brown fox' },
};

describe('LocatorDto', () => {
  it.each([['EPUB', epub], ['PDF', pdf]])('accepts a %s locator', async (_name, body) => {
    expect(await errors(body)).toEqual([]);
  });

  it.each([
    ['another version', { ...epub, v: 1 }],
    ['an unknown format', { ...epub, format: 'docx' }],
    ['an unknown field', { ...epub, extra: true }],
    ['an unknown field in the quote', { ...epub, quote: { exact: 'x', note: 'y' } }],
    ['a page below 0', { ...pdf, page: -1 }],
    ['quads that are not numbers', { ...pdf, quads: [['a']] }],
    ['a quad of 6 numbers', { ...pdf, quads: [[1, 2, 3, 4, 5, 6]] }],
    ['a progression over 1', { ...epub, progression: 1.5 }],
    ['a context longer than 64', { ...epub, quote: { exact: 'x', prefix: 'p'.repeat(65) } }],
    ['three blocks', { ...epub, blocks: ['a', 'b', 'c'] }],
  ])('refuses %s', async (_name, body) => {
    expect(await errors(body)).not.toEqual([]);
  });

  it('validates the anchor of a new highlight, and a note id that is a cuid', async () => {
    expect(await errors({ text: 'x', anchor: epub, noteId: 'cmvvjce2t0001k401epv0ah5l' }, CreateHighlightDto)).toEqual([]);
    expect(await errors({ text: 'x', anchor: { type: 'epub', cfi: 'x' } }, CreateHighlightDto)).not.toEqual([]);
  });

  it('validates a refreshed anchor on a highlight update', async () => {
    expect(await errors({ anchor: epub }, UpdateHighlightDto)).toEqual([]);
    expect(await errors({ anchor: { ...pdf, quads: [[1, 2]] } }, UpdateHighlightDto)).not.toEqual([]);
  });

  it('stores plain JSON', () => {
    const json = locatorJson(plainToInstance(LocatorDto, pdf));
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
    expect(json).toEqual(pdf);
  });
});
