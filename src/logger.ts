import type * as vscode from 'vscode';
import { safeStringify } from './json.js';

class Logger {
  private channel: vscode.OutputChannel | undefined;

  private ensureChannel(): vscode.OutputChannel | undefined {
    try {
      const vscode: typeof import('vscode') | undefined = (globalThis as any)?.require?.('vscode');
      if (typeof vscode?.window === 'undefined') return undefined;
      this.channel ??= vscode.window.createOutputChannel('Magpie Relay');
      return this.channel;
    } catch {
      return undefined;
    }
  }

  debug(message: string, ...values: unknown[]): void {
    this.write('DEBUG', message, values);
  }

  warn(message: string, ...values: unknown[]): void {
    this.write('WARN', message, values);
  }

  error(message: string, ...values: unknown[]): void {
    this.write('ERROR', message, values);
  }

  show(): void {
    this.ensureChannel()?.show();
  }

  private write(level: string, message: string, values: unknown[]): void {
    const line = `[${new Date().toISOString()}] [${level}] ${message}${
      values.length > 0 ? ` ${values.map(value => safeStringify(value)).join(' ')}` : ''
    }`;
    const channel = this.ensureChannel();
    if (channel) channel.appendLine(line);
    else console.warn(line);
  }
}

export const logger = new Logger();
