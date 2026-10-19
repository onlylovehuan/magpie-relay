import * as vscode from 'vscode';
import { registerProvider } from './provider.js';
import { clearModelCache } from '../provider/catalog.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const version = context.extension.packageJSON.version;
  console.log(`[Magpie Relay v${version}] Extension activating...`);

  // Register the language model provider
  const provider = registerProvider(context);

  // Some Copilot builds cache picker metadata before BYOK providers expose
  // configurationSchema. Activate first, then ask it to re-query our provider.
  await activateCopilotChat();
  provider.refreshModelPicker();

  console.log(`[Magpie Relay v${version}] Extension activated successfully`);
}

export function deactivate(): void {
  // Clear cache on deactivate
  clearModelCache();
  console.log('[Magpie Relay] Extension deactivated');
}

async function activateCopilotChat(): Promise<void> {
  try {
    await vscode.extensions.getExtension('github.copilot-chat')?.activate();
  } catch (error) {
    console.warn('[Magpie Relay] Copilot Chat activation unavailable; model picker refresh may be delayed', error);
  }
}
