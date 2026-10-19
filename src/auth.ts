import * as vscode from 'vscode';
import { CONFIG_SECTION, SECRET_GATEWAY_KEY, SECRET_UPSTREAM_KEY } from './consts.js';

export function getEndpoint(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('endpoint') || 'http://127.0.0.1:3425';
}

export function getMaxTokens(): number {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<number>('maxTokens') || 4096;
}

export function getReasoningEffort(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('reasoningEffort') || 'medium';
}

export function isDebugMode(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('debugMode') || false;
}

export async function updateConfig(key: string, value: any): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}

export class AuthManager {
  constructor(private secretStorage: vscode.SecretStorage) {}

  async getGatewayKey(): Promise<string | undefined> {
    // Try secret storage first
    const secret = await this.secretStorage.get(SECRET_GATEWAY_KEY);
    if (secret) return secret;

    // Fallback to config
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<string>('gatewayKey');
  }

  async setGatewayKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (trimmed) {
      await this.secretStorage.store(SECRET_GATEWAY_KEY, trimmed);
    } else {
      await this.secretStorage.delete(SECRET_GATEWAY_KEY);
    }
    await updateConfig('gatewayKey', undefined);
  }

  async getUpstreamKey(): Promise<string | undefined> {
    const secret = await this.secretStorage.get(SECRET_UPSTREAM_KEY);
    if (secret) return secret;

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<string>('upstreamApiKey');
  }

  async setUpstreamKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (trimmed) {
      await this.secretStorage.store(SECRET_UPSTREAM_KEY, trimmed);
    } else {
      await this.secretStorage.delete(SECRET_UPSTREAM_KEY);
    }
    await updateConfig('upstreamApiKey', undefined);
  }

  async hasAnyKey(): Promise<boolean> {
    const gateway = await this.getGatewayKey();
    const upstream = await this.getUpstreamKey();
    return !!(gateway || upstream);
  }

  async clearAll(): Promise<void> {
    await this.secretStorage.delete(SECRET_GATEWAY_KEY);
    await this.secretStorage.delete(SECRET_UPSTREAM_KEY);
  }
}
