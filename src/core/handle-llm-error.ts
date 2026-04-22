import { LLMError } from "./llm";
import { notify } from "./notify";
import { AUTH_PAUSE_MS } from "./constants";

export interface LLMErrorContext {
	recordApiFailure: () => void;
	recordRateLimitHit: () => void;
	pauseApi: (ms: number) => void;
}

/**
 * Handle an LLM error with standard resilience logic.
 * Returns false if the error is fatal (auth) and the caller should stop.
 * Returns true if the error was handled and the caller can continue.
 */
export function handleLLMError(
	e: unknown,
	ctx: LLMErrorContext,
	fileContext?: string
): boolean {
	if (!(e instanceof LLMError)) {
		if (fileContext) console.error(`Second Thoughts: ${fileContext}`, e);
		return true;
	}

	if (e.kind === "auth") {
		ctx.pauseApi(AUTH_PAUSE_MS);
		notify("API key rejected. Check plugin settings.");
		return false;
	}

	if (e.kind === "rate_limit") {
		ctx.recordRateLimitHit();
	} else {
		ctx.recordApiFailure();
	}

	if (e.kind === "rate_limit" || e.kind === "network") {
		notify(e.message);
	}

	if (fileContext) {
		console.error(`Second Thoughts: ${fileContext}`, e);
	}

	return true;
}
