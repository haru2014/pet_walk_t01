import { describe, expect, it, vi } from 'vitest';
import { extractLocalVoiceIntent } from './voiceIntentApi';
import { resolveAiEnvironments } from './voiceIntentSettings';
import { createVoiceTranscriptHandlers } from './voiceTranscript';
import { sanitizeVoiceBriefing } from './voiceBriefing';

describe('voice settings and final transcript', () => {
  it.each(['탈진', '화상', '열사병', '관절염', '슬개골', '수술', '질병'])('sanitizes %s before display or speech', (word) => {
    expect(sanitizeVoiceBriefing(`${word} 위험`)).not.toContain(word);
  });

  it('clears previously selected chips when the parsed conditions are false', () => {
    const { intent } = extractLocalVoiceIntent('아스팔트로 계단 포함 30분');
    expect(resolveAiEnvironments(['shade', 'soft', 'stairs', 'quiet'], intent)).toEqual(['quiet']);
  });

  it('applies all supported conditions to an empty selection', () => {
    const { intent } = extractLocalVoiceIntent('유림공원 그늘 흙길 30분');
    expect(resolveAiEnvironments([], intent)).toEqual(['shade', 'soft', 'stairs']);
  });

  it('analyzes the last recognized transcript, including later corrections', () => {
    const changed = vi.fn();
    const complete = vi.fn();
    const handlers = createVoiceTranscriptHandlers(changed, complete);
    handlers.onresult({ results: [[{ transcript: '유림공원 20분' }]] });
    handlers.onresult({ results: [[{ transcript: '송강공원 30분' }]] });
    handlers.onend();
    expect(changed).toHaveBeenLastCalledWith('송강공원 30분');
    expect(complete).toHaveBeenCalledWith('송강공원 30분');
  });

  it('does not reuse a previous session when no new speech is recognized', () => {
    const first = createVoiceTranscriptHandlers(vi.fn(), vi.fn());
    first.onresult({ results: [[{ transcript: '유림공원 30분' }]] });
    const complete = vi.fn();
    createVoiceTranscriptHandlers(vi.fn(), complete).onend();
    expect(complete).toHaveBeenCalledWith('');
  });
});
