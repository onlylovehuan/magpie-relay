import * as vscode from 'vscode';
import { registerProvider } from './provider.js';
import { clearModelCache } from '../provider/catalog.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Magpie Relay] Extension activating...');

  // Register the language model provider
  registerProvider(context);

  console.log('[Magpie Relay] Extension activated successfully');
}

export function deactivate(): void {
  // Clear cache on deactivate
  clearModelCache();
  console.log('[Magpie Relay] Extension deactivated');
}
