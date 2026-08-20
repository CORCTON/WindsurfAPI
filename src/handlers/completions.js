/**
 * POST /v1/completions — OpenAI legacy Completions API.
 *
 * Translates `prompt` into a single user turn and delegates to
 * handleChatCompletions. Streaming is rejected: this surface always returns a
 * non-stream `text_completion` body.
 */

import { handleChatCompletions } from './chat.js';

function invalidParam(param, message) {
  return {
    status: 400,
    body: {
      error: {
        message,
        type: 'invalid_request_error',
        param,
      },
    },
  };
}

function promptToText(prompt) {
  if (typeof prompt === 'string') return prompt;
  if (Array.isArray(prompt)) {
    if (!prompt.every((p) => typeof p === 'string')) return null;
    return prompt.join('');
  }
  return null;
}

function contentToText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    }).join('');
  }
  return String(content);
}

function toTextCompletion(chatBody) {
  const src = chatBody && typeof chatBody === 'object' ? chatBody : {};
  const { object: _object, choices, ...rest } = src;
  return {
    ...rest,
    object: 'text_completion',
    choices: Array.isArray(choices)
      ? choices.map((choice, index) => ({
          text: contentToText(choice?.message?.content)
            || contentToText(choice?.message?.reasoning_content),
          index: choice?.index ?? index,
          logprobs: choice?.logprobs ?? null,
          finish_reason: choice?.finish_reason ?? null,
        }))
      : [],
  };
}

export async function handleCompletions(body = {}, context = {}) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return invalidParam('body', 'Request body must be a JSON object.');
  }

  if (body.stream) {
    return invalidParam(
      'stream',
      'Streaming is not supported on /v1/completions. Omit stream, or use POST /v1/chat/completions with stream=true.',
    );
  }

  if (body.best_of != null && body.best_of !== 1) {
    return invalidParam(
      'best_of',
      'This proxy only supports best_of=1. The upstream backend returns a single completion per request; omit best_of, or set it to 1.',
    );
  }

  const promptText = promptToText(body.prompt);
  if (promptText == null || !promptText.trim()) {
    return invalidParam(
      'prompt',
      'prompt is required and must be a non-empty string or array of strings.',
    );
  }

  const rest = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'prompt' || key === 'stream' || key === 'messages' || key === 'best_of') continue;
    if (key.startsWith('__')) continue;
    rest[key] = value;
  }
  const chatHandler = context.handleChatCompletions || handleChatCompletions;
  const result = await chatHandler({
    ...rest,
    messages: [{ role: 'user', content: promptText }],
    stream: false,
    __route: 'completions',
  }, context);

  if (result.status !== 200 || result.stream || !result.body) {
    return result;
  }
  return {
    status: 200,
    headers: result.headers,
    body: toTextCompletion(result.body),
  };
}
