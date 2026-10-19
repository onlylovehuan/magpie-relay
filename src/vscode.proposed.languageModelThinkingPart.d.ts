// Copied from VS Code repository (src/vscode-dts/vscode.proposed.languageModelThinkingPart.d.ts).
// Defines the proposed `languageModelThinkingPart` API not yet in @types/vscode.
// Can be removed once the API graduates to stable.

declare module 'vscode' {
	export class LanguageModelThinkingPart {
		value: string | string[];
		id?: string;
		metadata?: { readonly [key: string]: any };
		constructor(value: string | string[], id?: string, metadata?: { readonly [key: string]: any });
	}
}
