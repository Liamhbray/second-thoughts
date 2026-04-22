import { Notice } from "obsidian";

export function notify(message: string, duration?: number): void {
	new Notice(`Second Thoughts: ${message}`, duration);
}
