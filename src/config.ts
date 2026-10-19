import * as vscode from 'vscode';

export const CONFIG_SECTION = 'magpie-relay';

export function getEndpoint(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  let endpoint = config.get<string>('endpoint') || 'http://127.0.0.1:3425';
  // Remove trailing slashes
  endpoint = endpoint.replace(/\/+$/, '');
  return endpoint;
}

export function getMaxTokens(): number {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<number>('maxTokens') || 4096;
}

export function getReasoningEffort(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('reasoningEffort') || 'medium';
}

/**
 * Read the per-model `reasoningEffort` from VS Code's model configuration.
 * `modelConfiguration` is set by the user per-model in the picker dropdown.
 */
export function getModelConfiguredReasoningEffort(
  options: vscode.ProvideLanguageModelChatResponseOptions,
): string | undefined {
  const modelCfg = (options as any)?.modelConfiguration;
  if (typeof modelCfg?.reasoningEffort === 'string') {
    return modelCfg.reasoningEffort;
  }
  return undefined;
}

export function isDebugMode(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('debugMode') || false;
}

export function getEnableTools(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('enableTools') ?? true;
}

export async function updateConfig(key: string, value: any): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}
