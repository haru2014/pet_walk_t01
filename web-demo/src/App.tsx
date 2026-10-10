import React, { useState, useEffect } from 'react';
import { TOKENS } from './theme/tokens';
import { CardWrapper } from './components/common/CardWrapper';
import { GradientButton } from './components/common/GradientButton';
import { StatusBadge } from './components/common/StatusBadge';
import { BottomTabBar, TabKey } from './components/common/BottomTabBar';
import { PawIcon, BellIcon, MoreIcon, ArrowRightIcon } from './components/common/Icons';
import { DogProfile, JointCareLevel, calculateRecommendedSpeedKmH, getJointCareLabel } from './types/dogProfile';
import { LocalStorageService } from './services/storage';
import { BackupService } from './services/backupService';
import { FeedbackContextService, FeedbackSummaryPayload } from './services/feedbackContext';
import { STORAGE_KEYS, WalkRecord } from './types/storage';
import { RouteMapView } from './components/map/RouteMapView';
import { SAMPLE_ROUTE, SAMPLE_STEP_PINS } from './services/sampleRoute';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('마이');
  const [profile, setProfile] = useState<DogProfile>({
    id: 'dog_default',
    name: '초코',
    breed: '말티즈',
    ageYears: 9,
    weightKg: 4.2,
    jointCareLevel: 2,
    speedKmH: 2.2,
    photoUri: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=160&h=160&fit=crop&auto=format',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryPayload | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // 로컬 스토리지에서 프로필 및 피드백 요약 로드
  useEffect(() => {
    async function loadData() {
      const savedProfile = await LocalStorageService.getItem<DogProfile>(STORAGE_KEYS.DOG_PROFILE);
      if (savedProfile) {
        setProfile(savedProfile);
      } else {
        await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, profile);
      }

      const summary = await FeedbackContextService.buildRecentFeedbackContext();
      setFeedbackSummary(summary);
    }
    void loadData();
  }, []);

  const showAlert = (msg: string) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 3500);
  };

  // 프로필 필드 변경 핸들러 (속도 자동 재계산)
  const handleProfileChange = (fields: Partial<DogProfile>) => {
    const updated = { ...profile, ...fields };
    updated.speedKmH = calculateRecommendedSpeedKmH(
      updated.weightKg,
      updated.ageYears,
      updated.jointCareLevel
    );
    updated.updatedAt = new Date().toISOString();
    setProfile(updated);
  };

  // 프로필 저장
  const handleSaveProfile = async () => {
    await LocalStorageService.setItem(STORAGE_KEYS.DOG_PROFILE, profile);
    showAlert('🐾 반려견 프로필이 로컬 스토리지에 안전하게 저장되었습니다!');
  };

  // JSON 파일 백업 다운로드
  const handleExportJson = async () => {
    await BackupService.downloadProfileJsonFile(profile);
    showAlert('📁 프로필 JSON 백업 파일이 다운로드되었습니다.');
  };

  // JSON 파일 복원 업로드
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    void (async () => {
      try {
        const content = await file.text();
        const restored = await BackupService.restoreFromJsonString(content);
        if (restored) {
          setProfile(restored);
          showAlert(`🎉 '${restored.name}' 프로필이 파일에서 성공적으로 복원되었습니다!`);
        } else {
          showAlert('❌ 잘못된 형식의 백업 파일입니다.');
        }
      } catch {
        showAlert('❌ 파일 읽기 실패');
      }
    })();
    e.target.value = '';
  };

  // 가상 산책 피드백 주입 시뮬레이션 (US-E3 테스트용)
  const handleInjectSampleWalk = async (dissatisfied: boolean) => {
    const sampleWalk: WalkRecord = {
      id: `walk_${Date.now()}`,
      dogId: profile.id,
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: 28,
      totalDistanceKm: 1.4,
      averageSpeedKmH: profile.speedKmH,
      safeSurfaceRatio: 0.85,
      gpsTrack: [],
      feedback: {
        comfortScore: dissatisfied ? 2 : 5,
        tags: dissatisfied ? ['경사가 가팔랐어요'] : ['완만해요', '그늘많아요'],
        comment: dissatisfied ? '계단과 언덕이 조금 힘들었어요' : '발이 편하고 좋았어요',
      },
    };

    await LocalStorageService.appendWalkRecord(sampleWalk);
    const summary = await FeedbackContextService.buildRecentFeedbackContext();
    setFeedbackSummary(summary);
    showAlert(dissatisfied ? '⚠️ [피드백 기록] 가파른 경사 불만족 1회가 등록되었습니다.' : '👍 [피드백 기록] 만족스러운 완만 산책이 등록되었습니다.');
  };

  return (
    <div
      style={{
        width: '390px',
        height: '844px',
        margin: '20px auto',
        background: TOKENS.colors.background,
        fontFamily: "'Noto Sans KR', system-ui, -apple-system, sans-serif",
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 60px rgba(0,0,0,0.15)',
        borderRadius: `${TOKENS.borderRadius.frame}px`,
        border: '1px solid #E5E7EB',
      }}
    >
      {/* 1. 상단 상태 바 */}
      <div style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: TOKENS.colors.textMain }}>9:41</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: TOKENS.colors.primary, background: TOKENS.colors.primaryLight, padding: '2px 8px', borderRadius: '12px' }}>
            Local-First 🔒
          </span>
        </div>
      </div>

      {/* 알림 토스트 */}
      {alertMessage && (
        <div style={{
          position: 'absolute', top: '50px', left: '20px', right: '20px',
          background: TOKENS.colors.textMain, color: '#FFF',
          padding: '10px 14px', borderRadius: '12px', fontSize: '12px',
          zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          textAlign: 'center', lineHeight: '1.4',
        }}>
          {alertMessage}
        </div>
      )}

      {/* 2. 스크롤 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 20px 20px' }}>
        {/* 상단 앱 타이틀 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${TOKENS.colors.primary}, ${TOKENS.colors.primaryDark})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PawIcon size={20} />
            </div>
            <span style={{ fontSize: '17px', fontWeight: '700', color: TOKENS.colors.textMain }}>편안하개</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}><BellIcon /></button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}><MoreIcon /></button>
          </div>
        </div>

        {activeTab === '산책' && (
          /* ========================================================
             [산책 탭] 코스 프리뷰 지도 & 구간별 Polyline (US-C1)
             ======================================================== */
          <div>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', color: TOKENS.colors.textMuted, marginBottom: '2px' }}>AI 추천 안심 코스</p>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: TOKENS.colors.textMain, margin: 0 }}>{profile.name}와 걷는 순환 코스 🗺️</h2>
            </div>
            <RouteMapView
              route={SAMPLE_ROUTE}
              stepPins={SAMPLE_STEP_PINS}
              speedKmH={profile.speedKmH}
              onStart={() => showAlert('🐾 산책을 시작합니다! (Phase 4: GPS/음성 안내 연동 예정)')}
            />
          </div>
        )}

        {activeTab === '마이' && (
          /* ========================================================
             [마이 탭] 반려견 프로필 관리 & JSON 백업/복원 (US-A2)
             ======================================================== */
          <div>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: TOKENS.colors.textMuted, marginBottom: '2px' }}>반려견 안심 케어 프로필</p>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: TOKENS.colors.textMain, margin: 0 }}>우리 아이 정보 관리 🐾</h2>
            </div>

            {/* 메인 프로필 요약 카드 */}
            <CardWrapper style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                <img
                  src={profile.photoUri}
                  alt={profile.name}
                  style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: `2.5px solid ${TOKENS.colors.primary}` }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: TOKENS.colors.textMain }}>{profile.name}</span>
                    <StatusBadge variant="green">준비 완료</StatusBadge>
                  </div>
                  <p style={{ fontSize: '13px', color: TOKENS.colors.textMuted, margin: '2px 0 4px' }}>
                    {profile.breed} · {profile.ageYears}세 · {profile.weightKg}kg
                  </p>
                  <p style={{ fontSize: '12px', color: TOKENS.colors.primaryDark, fontWeight: '600' }}>
                    권장 속도: {profile.speedKmH} km/h (US-A3 모델)
                  </p>
                </div>
              </div>

              {/* 안심 케어 상태 칩 */}
              <div style={{ background: TOKENS.colors.background, padding: '8px 12px', borderRadius: '12px', fontSize: '12px', color: TOKENS.colors.textMuted }}>
                🛡️ <b>케어 수준:</b> {getJointCareLabel(profile.jointCareLevel)}
              </div>
            </CardWrapper>

            {/* 프로필 편집 폼 */}
            <CardWrapper variant="flat" style={{ marginBottom: '16px', background: '#FFF' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: TOKENS.colors.textMain, marginBottom: '12px' }}>프로필 상세 설정</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div>
                  <label htmlFor="dog-name-input" style={{ display: 'block', color: TOKENS.colors.textMuted, marginBottom: '4px' }}>이름</label>
                  <input
                    id="dog-name-input"
                    type="text"
                    value={profile.name}
                    onChange={(e) => handleProfileChange({ name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${TOKENS.colors.border}`, boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="dog-age-input" style={{ display: 'block', color: TOKENS.colors.textMuted, marginBottom: '4px' }}>나이 (세)</label>
                    <input
                      id="dog-age-input"
                      type="number"
                      value={profile.ageYears}
                      onChange={(e) => handleProfileChange({ ageYears: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${TOKENS.colors.border}`, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="dog-weight-input" style={{ display: 'block', color: TOKENS.colors.textMuted, marginBottom: '4px' }}>체중 (kg)</label>
                    <input
                      id="dog-weight-input"
                      type="number"
                      step="0.1"
                      value={profile.weightKg}
                      onChange={(e) => handleProfileChange({ weightKg: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${TOKENS.colors.border}`, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <span style={{ display: 'block', color: TOKENS.colors.textMuted, marginBottom: '4px' }}>관절 안심 케어 선호도</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[0, 1, 2].map((lvl) => {
                      let careText = '적극보호';
                      if (lvl === 0) careText = '일반';
                      else if (lvl === 1) careText = '안심';

                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => handleProfileChange({ jointCareLevel: lvl as JointCareLevel })}
                          style={{
                            flex: 1, padding: '7px 4px', fontSize: '11px', borderRadius: '10px',
                            border: profile.jointCareLevel === lvl ? `1.5px solid ${TOKENS.colors.primary}` : `1px solid ${TOKENS.colors.border}`,
                            background: profile.jointCareLevel === lvl ? TOKENS.colors.primaryLight : '#FFF',
                            color: profile.jointCareLevel === lvl ? TOKENS.colors.primaryDark : TOKENS.colors.textMuted,
                            fontWeight: profile.jointCareLevel === lvl ? '700' : '400',
                            cursor: 'pointer',
                          }}
                        >
                          {careText}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <GradientButton fullWidth onClick={handleSaveProfile} style={{ marginTop: '8px' }}>
                  로컬 프로필 저장 ✓
                </GradientButton>
              </div>
            </CardWrapper>

            {/* JSON 로컬 백업 & 복원 섹션 (US-A2 DoD) */}
            <CardWrapper variant="highlight" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '15px' }}>🔒</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: TOKENS.colors.primaryDark }}>Local-First JSON 백업 & 복원</span>
              </div>
              <p style={{ fontSize: '12px', color: TOKENS.colors.textMuted, margin: '0 0 12px', lineHeight: '1.4' }}>
                반려견의 민감 정보는 서버 DB로 전송되지 않습니다. 기기 변경 시 백업 파일을 활용하세요.
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleExportJson}
                  style={{
                    flex: 1, padding: '9px 10px', borderRadius: '12px', border: `1px solid ${TOKENS.colors.primaryMint}`,
                    background: '#FFF', color: TOKENS.colors.primaryDark, fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  내보내기 (JSON) 📥
                </button>

                <label
                  htmlFor="json-file-input"
                  style={{
                    flex: 1, padding: '9px 10px', borderRadius: '12px', border: `1px solid ${TOKENS.colors.primaryMint}`,
                    background: TOKENS.colors.primary, color: '#FFF', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    textAlign: 'center', boxSizing: 'border-box', display: 'inline-block',
                  }}
                >
                  불러오기 (복원) 📤
                </label>
                <input
                  id="json-file-input"
                  type="file"
                  accept=".json"
                  onChange={handleImportJson}
                  style={{ display: 'none' }}
                />
              </div>
            </CardWrapper>

            {/* 피드백 기반 무상태 AI 추천 보정 위젯 (US-E3) */}
            <CardWrapper variant="flat" style={{ marginBottom: '16px', background: '#F8FAF9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: TOKENS.colors.textMain }}>
                  🤖 최근 피드백 AI 보정 (US-E3)
                </span>
                <span style={{ fontSize: '11px', color: TOKENS.colors.primaryDark }}>Stateless</span>
              </div>

              {feedbackSummary && (
                <div style={{ fontSize: '12px', color: TOKENS.colors.textMuted, lineHeight: '1.5' }}>
                  <p style={{ margin: '2px 0' }}>• 최근 산책 분석: <b>{feedbackSummary.recent_walk_count}회</b></p>
                  <p style={{ margin: '2px 0' }}>• 경사도 불만족 횟수: <b style={{ color: feedbackSummary.slope_dissatisfaction_count > 0 ? '#EF4444' : '#10B981' }}>{feedbackSummary.slope_dissatisfaction_count}회</b></p>
                  <p style={{ margin: '2px 0' }}>• 최대 경사도 보정치: <b>{feedbackSummary.recommended_max_slope_offset}%</b></p>
                  <p style={{ margin: '6px 0 0', padding: '6px 10px', background: '#FFF', borderRadius: '8px', border: '1px solid #E5E7EB', color: TOKENS.colors.textMain }}>
                    💬 <i>"{FeedbackContextService.generateBriefingNotice(feedbackSummary) || '현재 기본 안심 산책 경로를 추천 중입니다.'}"</i>
                  </p>
                </div>
              )}

              {/* 시뮬레이션 버튼 */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                <button
                  onClick={() => handleInjectSampleWalk(true)}
                  style={{ flex: 1, padding: '6px', fontSize: '11px', borderRadius: '8px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', cursor: 'pointer' }}
                >
                  + 가파름 불만족 주입
                </button>
                <button
                  onClick={() => handleInjectSampleWalk(false)}
                  style={{ flex: 1, padding: '6px', fontSize: '11px', borderRadius: '8px', border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#065F46', cursor: 'pointer' }}
                >
                  + 만족 완만길 주입
                </button>
              </div>
            </CardWrapper>
          </div>
        )}

        {(activeTab === '홈' || activeTab === '커뮤니티' || activeTab === '액션') && (
          /* ========================================================
             [홈/산책 탭] 홈 미리보기
             ======================================================== */
          <div>
            <div style={{ padding: '4px 0 16px' }}>
              <p style={{ fontSize: '13px', color: TOKENS.colors.textMuted, marginBottom: '2px' }}>오늘도 편안하게,</p>
              <h2 style={{ fontSize: '22px', fontWeight: '700', color: TOKENS.colors.textMain, margin: 0 }}>우리 아이와 걸어요. 🐾</h2>
            </div>

            <CardWrapper style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <img src={profile.photoUri} alt={profile.name} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '16px', fontWeight: '700' }}>{profile.name}</span>
                    <StatusBadge variant="green">준비 완료</StatusBadge>
                  </div>
                  <p style={{ fontSize: '12px', color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>속도 {profile.speedKmH}km/h · 폭신한 길 위주</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <StatusBadge>⏱ 30분 산책</StatusBadge>
                  <StatusBadge>🌿 폭신한 길</StatusBadge>
                </div>
                <GradientButton size="sm" onClick={() => setActiveTab('산책')}>산책 시작 →</GradientButton>
              </div>
            </CardWrapper>

            <CardWrapper variant="flat" onClick={() => setActiveTab('마이')} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: TOKENS.colors.textMain, margin: 0 }}>반려견 프로필 & 백업 설정</p>
                  <p style={{ fontSize: '12px', color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>마이 탭에서 2단계 기능을 바로 테스트하세요.</p>
                </div>
                <ArrowRightIcon />
              </div>
            </CardWrapper>
          </div>
        )}
      </div>

      {/* 3. 하단 5개 탭 바 */}
      <BottomTabBar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onActionPress={() => setActiveTab('산책')}
      />
    </div>
  );
}
