import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  Schema,
  type AI,
  type GenerativeModel,
  type HybridParams,
} from 'firebase/ai';
import { languageName, type RuntimeConfig } from '../config';
import type { Source } from '../types';
import type { HybridModel, ModelFactory, ModelSpec } from './engine';
import { explainSystemPrompt, gistSystemPrompt, rewriteSystemPrompt, wordsSystemPrompt } from './prompts';

/**
 * Firebase AI Logic hybrid inference: this is the only file that creates models.
 *
 * Each model is created with a hybrid `mode` plus two parallel configurations:
 *   - inCloudParams  -> Gemini in the cloud (Gemini Developer API, free tier)
 *   - onDeviceParams -> Chrome's built-in Gemini Nano via the Prompt API
 * The same system prompt and, for "Words to know", the same JSON schema go to
 * both, so the answer has the same shape wherever it was produced.
 */

/** Structured output schema shared by the cloud and on-device models. */
const WORDS_SCHEMA = Schema.object({
  properties: {
    words: Schema.array({
      items: Schema.object({
        properties: {
          term: Schema.string(),
          meaning: Schema.string(),
        },
      }),
    }),
  },
});

function systemPromptFor(spec: ModelSpec, config: RuntimeConfig): string {
  const language = languageName(spec.language);
  switch (spec.kind) {
    case 'rewrite':
      return rewriteSystemPrompt(spec.level, language, config.styleGuidance);
    case 'gist':
      return gistSystemPrompt(language);
    case 'words':
      return wordsSystemPrompt(language);
    case 'explain':
      return explainSystemPrompt(language);
  }
}

function buildModel(ai: AI, spec: ModelSpec, config: RuntimeConfig): GenerativeModel {
  const system = systemPromptFor(spec, config);
  const structured = spec.kind === 'words';
  // The on-device model only writes a few languages. The router never sends
  // other languages there, but the session still needs a valid output language.
  const deviceLanguage = config.deviceLanguages.includes(spec.language) ? spec.language : 'en';

  const params: HybridParams = {
    mode: spec.mode as InferenceMode,
    inCloudParams: {
      model: config.cloudModel,
      systemInstruction: system,
      generationConfig: structured
        ? { temperature: 0.2, responseMimeType: 'application/json', responseSchema: WORDS_SCHEMA }
        : { temperature: 0.3 },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: [deviceLanguage] }],
        // The SDK does not pass systemInstruction to the local model, so the
        // system prompt is supplied the Prompt API way.
        initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
      },
      ...(structured ? { promptOptions: { responseConstraint: WORDS_SCHEMA } } : {}),
    },
  };

  return getGenerativeModel(ai, params);
}

function toSource(source: InferenceSource | undefined): Source {
  return source === InferenceSource.ON_DEVICE ? 'device' : 'cloud';
}

function adapt(model: GenerativeModel): HybridModel {
  return {
    async *stream(prompt, signal) {
      const result = await model.generateContentStream(prompt, signal ? { signal } : undefined);
      for await (const chunk of result.stream) {
        let text = '';
        try {
          text = chunk.text();
        } catch {
          text = '';
        }
        // The SDK tells us where each piece was actually generated.
        yield { text, source: toSource(chunk.inferenceSource) };
      }
    },
    async generate(prompt, signal) {
      const result = await model.generateContent(prompt, signal ? { signal } : undefined);
      return { text: result.response.text(), source: toSource(result.response.inferenceSource) };
    },
  };
}

/** Models are cached per configuration; the SDK keeps a warm local session for each. */
export function createModelFactory(ai: AI, getConfig: () => RuntimeConfig): ModelFactory {
  const cache = new Map<string, HybridModel>();
  return (spec) => {
    const config = getConfig();
    const key = JSON.stringify([spec, config.cloudModel, config.styleGuidance, config.deviceLanguages]);
    let model = cache.get(key);
    if (!model) {
      model = adapt(buildModel(ai, spec, config));
      cache.set(key, model);
    }
    return model;
  };
}

/**
 * Starts (or joins) the download of the on-device model. Must be called from
 * a click or key press: Chrome only allows the download after a user gesture.
 */
export async function downloadDeviceModel(ai: AI, onProgress: (fraction: number) => void): Promise<void> {
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
    },
  });
  await model.initializeDeviceModel(onProgress);
}
