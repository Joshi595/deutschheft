/**
 * Optional AI help. It only ever explains: grading stays in lib/grading.
 * The key is the learner's own, typed into Settings and kept in their browser.
 */

export interface ExplainRequest {
  /** The exercise as the learner saw it. */
  prompt: string;
  expected: string;
  given: string;
  /** Lesson title, for context. */
  topic: string;
}

export interface WritingRequest {
  prompt: string;
  text: string;
  topic: string;
}

export interface AiProvider {
  explainMistake(request: ExplainRequest, signal?: AbortSignal): Promise<string>;
  reviewWriting(request: WritingRequest, signal?: AbortSignal): Promise<string>;
}

const SYSTEM =
  'You are a patient German teacher helping an adult learner. Answer in English, in at most three short sentences. ' +
  'Be concrete: name the rule and show the corrected German. Never invent rules; if the answer is acceptable, say so.';

/** Groq's OpenAI-compatible chat endpoint. */
export function groqProvider(apiKey: string, model: string): AiProvider {
  async function chat(user: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('The API key was rejected. Check it in Settings.');
      if (response.status === 404) throw new Error(`The model "${model}" was not found. Change it in Settings.`);
      if (response.status === 429) throw new Error('Rate limit reached. Try again in a minute.');
      throw new Error(`The AI service returned an error (${response.status}).`);
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('The AI service returned an empty answer.');
    return text;
  }

  return {
    explainMistake: ({ prompt, expected, given, topic }, signal) =>
      chat(
        `Lesson topic: ${topic}\nExercise: ${prompt}\nCorrect answer: ${expected}\nLearner's answer: ${given}\n\n` +
          'Explain why the learner\'s answer is wrong and how to get to the correct one.',
        signal,
      ),
    reviewWriting: ({ prompt, text, topic }, signal) =>
      chat(
        `Lesson topic: ${topic}\nWriting task: ${prompt}\nLearner wrote: ${text}\n\n` +
          'Point out any grammar or word-order mistakes and give the corrected sentence. If it is correct, confirm it.',
        signal,
      ),
  };
}
