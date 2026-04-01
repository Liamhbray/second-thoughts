import { requestUrl } from "obsidian";

export interface LLMProvider {
	complete(
		prompt: string,
		opts?: { maxTokens?: number; model?: string }
	): Promise<string | null>;
	embed(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
}

export class OpenAIProvider implements LLMProvider {
	constructor(private apiKey: string) {}

	async complete(
		prompt: string,
		opts: { maxTokens?: number; model?: string } = {}
	): Promise<string | null> {
		const response = await requestUrl({
			url: "https://api.openai.com/v1/chat/completions",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: opts.model || "gpt-4o-mini",
				messages: [{ role: "user", content: prompt }],
				temperature: 0.7,
				max_tokens: opts.maxTokens || 500,
			}),
		});

		const json = response.json;
		if (!json?.choices?.length) return null;
		return json.choices[0]?.message?.content?.trim() || null;
	}

	async embed(text: string): Promise<number[]> {
		const vecs = await this.embedBatch([text]);
		return vecs[0];
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		const response = await requestUrl({
			url: "https://api.openai.com/v1/embeddings",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: "text-embedding-3-small",
				input: texts,
			}),
		});

		const json = response.json;
		if (!json?.data?.length) {
			throw new Error("Second Thoughts: embedding API returned no data");
		}
		const sorted = json.data.sort(
			(a: { index: number }, b: { index: number }) => a.index - b.index
		);
		return sorted.map((item: { embedding: number[] }) => item.embedding);
	}
}
