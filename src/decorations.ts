import {
	EditorView,
	WidgetType,
	Decoration,
	DecorationSet,
} from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";

// --- Effects (consumed by Phase 7b to trigger vault.process) ---

export const acceptCallout = StateEffect.define<{ from: number; to: number }>();
export const rejectCallout = StateEffect.define<{ from: number; to: number }>();

// --- Callout detection ---

interface CalloutRange {
	type: "connection" | "ideation";
	from: number;
	to: number;
}

function findCallouts(text: string): CalloutRange[] {
	const callouts: CalloutRange[] = [];
	const lines = text.split("\n");
	let pos = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^>\s*\[!(connection|ideation)\]\s*$/);

		if (match) {
			const type = match[1] as "connection" | "ideation";
			const from = pos;
			let to = pos + line.length;

			// Consume continuation lines starting with `> `
			let j = i + 1;
			while (j < lines.length && lines[j].startsWith("> ")) {
				to += 1 + lines[j].length;
				j++;
			}

			callouts.push({ type, from, to });
		}

		pos += line.length + 1;
	}

	return callouts;
}

// --- Widget ---

class CalloutButtonWidget extends WidgetType {
	constructor(
		readonly calloutType: "connection" | "ideation",
		readonly from: number,
		readonly to: number
	) {
		super();
	}

	toDOM(view: EditorView): HTMLElement {
		const container = document.createElement("span");
		container.className = "second-thoughts-callout-buttons";
		container.style.cssText =
			"display: inline-flex; gap: 4px; margin-left: 8px; vertical-align: middle;";

		const acceptBtn = document.createElement("button");
		acceptBtn.textContent = "✓ Accept";
		acceptBtn.className = "second-thoughts-accept-btn";
		acceptBtn.style.cssText =
			"font-size: 11px; padding: 1px 6px; cursor: pointer; border-radius: 3px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"background: var(--background-secondary); color: var(--text-normal);";
		acceptBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			view.dispatch({
				effects: acceptCallout.of({ from: this.from, to: this.to }),
			});
		});

		const rejectBtn = document.createElement("button");
		rejectBtn.textContent = "✗ Reject";
		rejectBtn.className = "second-thoughts-reject-btn";
		rejectBtn.style.cssText =
			"font-size: 11px; padding: 1px 6px; cursor: pointer; border-radius: 3px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"background: var(--background-secondary); color: var(--text-normal);";
		rejectBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			view.dispatch({
				effects: rejectCallout.of({ from: this.from, to: this.to }),
			});
		});

		container.appendChild(acceptBtn);
		container.appendChild(rejectBtn);
		return container;
	}

	eq(other: CalloutButtonWidget): boolean {
		return (
			this.calloutType === other.calloutType &&
			this.from === other.from &&
			this.to === other.to
		);
	}

	ignoreEvent(): boolean {
		return false;
	}
}

// --- StateField ---

function buildDecorations(text: string): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const callouts = findCallouts(text);

	for (const callout of callouts) {
		// Place widget at end of the header line `> [!type]`
		const firstNewline = text.indexOf("\n", callout.from);
		const widgetPos =
			firstNewline !== -1 && firstNewline <= callout.to
				? firstNewline
				: callout.to;

		builder.add(
			widgetPos,
			widgetPos,
			Decoration.widget({
				widget: new CalloutButtonWidget(
					callout.type,
					callout.from,
					callout.to
				),
				side: 1,
			})
		);
	}

	return builder.finish();
}

export const calloutDecorationField = StateField.define<DecorationSet>({
	create(state) {
		return buildDecorations(state.doc.toString());
	},

	update(decorations, tr) {
		if (tr.docChanged) {
			return buildDecorations(tr.newDoc.toString());
		}
		return decorations;
	},

	provide(field) {
		return EditorView.decorations.from(field);
	},
});
