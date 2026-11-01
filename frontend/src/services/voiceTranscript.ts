interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
}

/** 한 번의 음성 인식에서 얻은 최신 텍스트를 종료 시 분석에 전달한다. */
export function createVoiceTranscriptHandlers(
  onChange: (text: string) => void,
  onComplete: (text: string) => void,
) {
  let transcript = '';
  return {
    onresult(event: SpeechResultEvent) {
      transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join('');
      onChange(transcript);
    },
    onend() {
      onComplete(transcript.trim());
    },
  };
}
