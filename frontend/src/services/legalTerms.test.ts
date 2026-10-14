import { describe, it, expect } from 'vitest';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '../constants/legalTerms';

describe('회원가입약관 및 개인정보보호정책 규격 검증', () => {
  it('회원가입 약관(TERMS_OF_SERVICE)에 필수 조항 및 핵심 서비스 규정이 포함되어야 한다', () => {
    expect(TERMS_OF_SERVICE).toBeDefined();
    expect(TERMS_OF_SERVICE.length).toBeGreaterThan(100);
    // 핵심 조항 검증
    expect(TERMS_OF_SERVICE).toContain('제1조 (목적)');
    expect(TERMS_OF_SERVICE).toContain('Local-First 데이터');
    expect(TERMS_OF_SERVICE).toContain('제5조 (위치기반서비스 이용)');
    expect(TERMS_OF_SERVICE).toContain('200m');
    expect(TERMS_OF_SERVICE).toContain('제6조 (이용자의 의무 및 안전 수칙)');
  });

  it('개인정보보호정책(PRIVACY_POLICY)에 Local-First 및 공간 마스킹 원칙이 포함되어야 한다', () => {
    expect(PRIVACY_POLICY).toBeDefined();
    expect(PRIVACY_POLICY.length).toBeGreaterThan(100);
    // 핵심 개인정보 처리 원칙 검증
    expect(PRIVACY_POLICY).toContain('개인정보 처리방침');
    expect(PRIVACY_POLICY).toContain('Local-First Architecture');
    expect(PRIVACY_POLICY).toContain('200m Cloaking');
    expect(PRIVACY_POLICY).toContain('AsyncStorage');
    expect(PRIVACY_POLICY).toContain('위치정보 (GPS)');
    expect(PRIVACY_POLICY).toContain('개인정보 보호책임자');
  });
});
