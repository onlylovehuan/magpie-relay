/**
 * Simple i18n: picks Chinese when VS Code locale starts with 'zh'.
 */
import * as vscode from 'vscode';

const strings: Record<string, Record<string, string>> = {
  en: {
    'status.thinking': 'Thinking effort',
    'thinking.none': 'Off',
    'thinking.none.desc': 'Disable thinking, fastest responses',
    'thinking.low': 'Low',
    'thinking.low.desc': 'Light reasoning for quick edits',
    'thinking.medium': 'Medium',
    'thinking.medium.desc': 'Balanced speed and depth',
    'thinking.high': 'High',
    'thinking.high.desc': 'Deep reasoning for complex tasks',
    'capability.thinking': 'Thinking',
  },
  'zh-hans': {
    'status.thinking': '思考模式',
    'thinking.none': '停用',
    'thinking.none.desc': '停用思考，响应更快',
    'thinking.low': '轻量',
    'thinking.low.desc': '轻量推理，适合快速编辑',
    'thinking.medium': '标准',
    'thinking.medium.desc': '平衡速度与深度',
    'thinking.high': '深度',
    'thinking.high.desc': '深度推理，适合复杂任务',
    'capability.thinking': '思考',
  },
};

function locale(): string {
  const lang = vscode.env.language.toLowerCase();
  if (lang.startsWith('zh')) return 'zh-hans';
  return 'en';
}

export function t(key: string): string {
  return strings[locale()][key] ?? strings['en'][key] ?? key;
}
