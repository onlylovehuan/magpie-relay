import * as vscode from 'vscode';
import { MagpieRelayProvider } from '../provider/index.js';

let provider: MagpieRelayProvider | undefined;

export function registerProvider(context: vscode.ExtensionContext): MagpieRelayProvider {
  provider = new MagpieRelayProvider(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('magpie-relay.setEndpoint', () => provider?.setEndpoint()),
    vscode.commands.registerCommand('magpie-relay.setGatewayKey', () => provider?.setGatewayKey()),
    vscode.commands.registerCommand('magpie-relay.setApiKey', () => provider?.setUpstreamKey()),
    vscode.commands.registerCommand('magpie-relay.refreshModels', () => provider?.refreshModels()),
    vscode.commands.registerCommand('magpie-relay.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'magpie-relay');
    }),
    vscode.commands.registerCommand('magpie-relay.clearAll', () => provider?.clearAll())
  );

  // Register as Copilot Chat language model provider
  // Use 'any' to bypass version-specific type differences
  const regProvider = provider as any;
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('magpie', regProvider)
  );

  console.log('[Magpie Relay] Provider registered');

  return provider;
}

export function getProvider(): MagpieRelayProvider | undefined {
  return provider;
}
