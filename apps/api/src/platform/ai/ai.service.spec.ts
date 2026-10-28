import { ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { fakeConfig } from '../../../test/fakes/fake-prisma';

const config = (values: Record<string, unknown> = {}) =>
  fakeConfig({ OLLAMA_BASE_URL: 'http://ollama:11434', OLLAMA_MODEL: 'qwen', OLLAMA_EMBED_MODEL: 'bge', ...values }) as never;

const service = (fetchImpl: typeof fetch, values: Record<string, unknown> = {}) => {
  const ai = new AiService(config(values));
  ai.fetchImpl = fetchImpl;
  return ai;
};

describe('AiService', () => {
  it('completes through the OpenAI-compatible chat endpoint of the configured host', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json({ model: 'qwen', choices: [{ message: { content: '  Hello  ' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    ) as unknown as typeof fetch;
    const ai = service(fetchImpl);

    const result = await ai.complete('Say hello', { system: 'Be brief', maxTokens: 10 });

    expect(result).toMatchObject({ content: 'Hello', model: 'qwen', promptTokens: 5, completionTokens: 2 });
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/v1/chat/completions');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'qwen',
      max_tokens: 10,
      messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Say hello' }],
    });
  });

  it('reports availability and turns host failures into 503s', async () => {
    const down = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const ai = service(down);
    await expect(ai.available()).resolves.toBe(false);
    await expect(ai.complete('x')).rejects.toBeInstanceOf(ServiceUnavailableException);

    const unconfigured = service(down, { OLLAMA_BASE_URL: '', OLLAMA_MODEL: '' });
    expect(unconfigured.configured).toBe(false);
    await expect(unconfigured.complete('x')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('embeds with the embedding model and accepts both response shapes', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(Response.json({ embeddings: [[0.1, 0.2]] }))
      .mockResolvedValueOnce(Response.json({ data: [{ embedding: [0.3] }] })) as unknown as typeof fetch;
    const ai = service(fetchImpl);
    await expect(ai.embed('a')).resolves.toEqual([0.1, 0.2]);
    await expect(ai.embed('b')).resolves.toEqual([0.3]);
    expect((fetchImpl as jest.Mock).mock.calls[0][0]).toBe('http://ollama:11434/api/embed');
  });
});
