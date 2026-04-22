import { requestUrl, RequestUrlResponse } from "obsidian";

export type LLMErrorKind =
	| "auth"
	| "rate_limit"
	| "server"
	| "network"
	| "unknown";

export class LLMError extends Error {
	constructor(
		public kind: LLMErrorKind,
		message: string,
		public status?: number
	) {
		super(message);
		this.name = "LLMError";
	}
}

export interface LLMProvider {
	complete(
		prompt: string,
		opts?: { maxTokens?: number; model?: string }
	): Promise<string | null>;
	embed(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
}

export class OpenAIProvider implements LLMProvider {
	constructor(private getApiKey: () => string) {}

	async complete(
		prompt: string,
		opts: { maxTokens?: number; model?: string } = {}
	): Promise<string | null> {
		const response = await this.post(
			"https://api.openai.com/v1/chat/completions",
			{
				model: opts.model || "gpt-4o-mini",
				messages: [{ role: "user", content: prompt }],
				temperature: 0.7,
				max_tokens: opts.maxTokens || 500,
			}
		);

		let json: any;
		try {
			json = response.json;
		} catch {
			throw new LLMError("server", "Invalid JSON response from OpenAI");
		}
		if (!json?.choices?.length) return null;
		return json.choices[0]?.message?.content?.trim() || null;
	}

	async embed(text: string): Promise<number[]> {
		const vecs = await this.embedBatch([text]);
		return vecs[0];
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		const response = await this.post(
			"https://api.openai.com/v1/embeddings",
			{
				model: "text-embedding-3-small",
				input: texts,
			}
		);

		let json: any;
		try {
			json = response.json;
		} catch {
			throw new LLMError("server", "Invalid JSON response from OpenAI");
		}
		if (!json?.data?.length) {
			throw new LLMError("unknown", "Embedding API returned no data");
		}
		const sorted = json.data.sort(
			(a: { index: number }, b: { index: number }) => a.index - b.index
		);
		return sorted.map((item: { embedding: number[] }) => item.embedding);
	}

	private async post(
		url: string,
		body: unknown
	): Promise<RequestUrlResponse> {
		const MAX_ATTEMPTS = 3;
		const RETRYABLE: Set<LLMErrorKind> = new Set(["network", "server"]);
		let lastError: LLMError | undefined;

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			try {
				return await this.postOnce(url, body);
			} catch (e) {
				if (e instanceof LLMError && RETRYABLE.has(e.kind) && attempt < MAX_ATTEMPTS - 1) {
					lastError = e;
					const baseMs = 1000 * Math.pow(2, attempt); // 1s, 2s
					const jitter = Math.random() * 200;
					await this.sleep(baseMs + jitter);
					continue;
				}
				throw e;
			}
		}

		// Unreachable in practice, but satisfies the compiler
		throw lastError!;
	}

	/** Visible for testing — override in tests to avoid real delays. */
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async postOnce(
		url: string,
		body: unknown
	): Promise<RequestUrlResponse> {
		let response: RequestUrlResponse;
		try {
			response = await requestUrl({
				url,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.getApiKey()}`,
				},
				body: JSON.stringify(body),
				throw: false,
			});
		} catch (e) {
			throw new LLMError(
				"network",
				e instanceof Error ? e.message : String(e)
			);
		}

		const { status } = response;
		if (status >= 200 && status < 300) return response;

		if (status === 401 || status === 403) {
			throw new LLMError(
				"auth",
				"OpenAI rejected the API key",
				status
			);
		}
		if (status === 429) {
			throw new LLMError(
				"rate_limit",
				"OpenAI rate limit exceeded",
				status
			);
		}
		if (status >= 500) {
			throw new LLMError(
				"server",
				`OpenAI server error (${status})`,
				status
			);
		}
		throw new LLMError(
			"unknown",
			`OpenAI request failed (${status})`,
			status
		);
	}
}
