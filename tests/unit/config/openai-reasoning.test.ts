import { describe, expect, it } from 'vitest';

import {
  getOpenAIReasoningEffortsForModel,
  getOpenAIReasoningSettingOptionsForModel,
  normalizeOpenAIReasoningSettingForModel,
  resolveOpenAIReasoningEffortForModel,
  supportsOpenAIReasoningForModel,
} from '../../../src/config/openai-reasoning';

describe('openai reasoning capability helpers', () => {
  it('reports reasoning support only for reasoning-capable model families', () => {
    expect(supportsOpenAIReasoningForModel('gpt-5.2')).toBe(true);
    expect(supportsOpenAIReasoningForModel('o3')).toBe(true);
    expect(supportsOpenAIReasoningForModel('gpt-4o')).toBe(false);
  });

  it('returns model-specific reasoning options', () => {
    expect(getOpenAIReasoningEffortsForModel('gpt-5.3-chat-latest')).toEqual([
      'medium',
    ]);
    expect(getOpenAIReasoningEffortsForModel('gpt-5.1')).toEqual([
      'none',
      'low',
      'medium',
      'high',
    ]);
    expect(getOpenAIReasoningEffortsForModel('gpt-5.3-codex')).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(getOpenAIReasoningEffortsForModel('gpt-4o')).toEqual([]);
  });

  it('provides UI setting options only when reasoning is supported', () => {
    expect(getOpenAIReasoningSettingOptionsForModel('gpt-5.2')).toEqual([
      'default',
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(getOpenAIReasoningSettingOptionsForModel('gpt-4o')).toEqual([]);
  });

  it('resolves unsupported settings to the nearest lower supported effort', () => {
    expect(resolveOpenAIReasoningEffortForModel('gpt-5.3-chat-latest', 'xhigh')).toBe(
      'medium',
    );
    expect(resolveOpenAIReasoningEffortForModel('gpt-5.1', 'xhigh')).toBe('high');
    expect(resolveOpenAIReasoningEffortForModel('gpt-5', 'none')).toBeUndefined();
    expect(resolveOpenAIReasoningEffortForModel('gpt-4o', 'high')).toBeUndefined();
  });

  it('normalizes invalid model-setting combinations for UI state', () => {
    expect(normalizeOpenAIReasoningSettingForModel('gpt-5.1', 'xhigh')).toBe('high');
    expect(normalizeOpenAIReasoningSettingForModel('gpt-4o', 'high')).toBe('default');
  });
});
