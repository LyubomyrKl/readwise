import { applyDecorators, Type } from '@nestjs/common';
import { ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Authenticated } from './authenticated.decorator';

interface ApiEndpointOptions {
  summary: string;
  response: Type<unknown> | [Type<unknown>];
  auth?: boolean;
}

export function ApiEndpoint(options: ApiEndpointOptions) {
  const { summary, response, auth = true } = options;

  const isArray = Array.isArray(response);
  const responseType = isArray ? response[0] : response;

  const decorators = [
    ApiOperation({ summary }),
    ApiOkResponse({
      type: responseType,
      isArray,
    }),
  ];

  if (auth) {
    decorators.unshift(Authenticated());
  }

  return applyDecorators(...decorators);
}