import { useState } from 'react'

// --- Icons ---
const BellIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const MoreIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const ArrowRightIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
)

const HomeIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#10B981' : '#6B756F'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const MapIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#10B981' : '#6B756F'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
)

const UsersIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#10B981' : '#6B756F'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const UserIcon = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#10B981' : '#6B756F'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const PawIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="0.5">
    <ellipse cx="5" cy="6" rx="2" ry="2.5" />
    <ellipse cx="9.5" cy="3.5" rx="2" ry="2.5" />
    <ellipse cx="14.5" cy="3.5" rx="2" ry="2.5" />
    <ellipse cx="19" cy="6" rx="2" ry="2.5" />
    <path d="M12 22c-4 0-8-3-8-7 0-2 1.5-3.5 3.5-4.5 1-.5 2-1.5 2.5-2 .5-.5 1-1 2-1s1.5.5 2 1c.5.5 1.5 1.5 2.5 2C18.5 11.5 20 13 20 15c0 4-4 7-8 7z" />
  </svg>
)

function HomeScreen({ onSelectDog }: { onSelectDog: () => void }) {
  const [activeTab, setActiveTab] = useState('홈')

  const tabs = [
    { label: '홈', icon: <HomeIcon active={activeTab === '홈'} /> },
    { label: '산책', icon: <MapIcon active={activeTab === '산책'} /> },
    { label: '+', icon: null },
    { label: '커뮤니티', icon: <UsersIcon active={activeTab === '커뮤니티'} /> },
    { label: '마이', icon: <UserIcon active={activeTab === '마이'} /> },
  ]

  return (
    <div
      style={{
        width: '390px',
        height: '844px',
        margin: '0 auto',
        background: '#F8FAF9',
        fontFamily: "'Noto Sans KR', ui-sans-serif, system-ui, sans-serif",
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 60px rgba(0,0,0,0.12)',
        borderRadius: '40px',
      }}
    >
      {/* Status Bar */}
      <div style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#17211C' }}>9:41</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="#17211C">
            <rect x="0" y="5" width="3" height="7" rx="1" />
            <rect x="4.5" y="3" width="3" height="9" rx="1" />
            <rect x="9" y="1" width="3" height="11" rx="1" />
            <rect x="13.5" y="0" width="2.5" height="12" rx="1" opacity="0.3" />
          </svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="#17211C">
            <path d="M8 2.4C5.2 2.4 2.7 3.6 1 5.5L0 4.4C2 2.2 4.8 0.8 8 0.8s6 1.4 8 3.6L15 5.5C13.3 3.6 10.8 2.4 8 2.4z" />
            <path d="M8 5.6C6.3 5.6 4.7 6.3 3.5 7.5L2.5 6.4C4 4.9 5.9 4 8 4s4 .9 5.5 2.4l-1 1.1C11.3 6.3 9.7 5.6 8 5.6z" />
            <circle cx="8" cy="10" r="1.5" />
          </svg>
          <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
            <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="#17211C" strokeOpacity="0.35" />
            <rect x="2" y="2" width="17" height="8" rx="2" fill="#17211C" />
            <path d="M23 4v4a2 2 0 0 0 0-4z" fill="#17211C" fillOpacity="0.4" />
          </svg>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px', }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #10B981, #087F5B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PawIcon />
            </div>
            <span style={{ fontSize: '17px', fontWeight: '700', color: '#17211C', letterSpacing: '-0.3px' }}>편안하개</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#17211C',
            }}>
              <BellIcon />
            </button>
            <button style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#17211C',
            }}>
              <MoreIcon />
            </button>
          </div>
        </div>

        {/* Greeting */}
        <div style={{ padding: '4px 20px 20px' }}>
          <p style={{ fontSize: '14px', color: '#6B756F', fontWeight: '400', marginBottom: '4px', lineHeight: '1.4' }}>오늘도 편안하게,</p>
          <p style={{ fontSize: '24px', color: '#17211C', fontWeight: '700', lineHeight: '1.3', letterSpacing: '-0.5px' }}>우리 아이와 걸어요. 🐾</p>
        </div>

        {/* Main Walk Card */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '18px 18px 16px',
            boxShadow: '0 2px 16px rgba(16,185,129,0.10)',
            border: '1px solid #F0F5F2',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
              {/* Dog Profile */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2.5px solid #10B981',
                  overflow: 'hidden',
                }}>
                  <img
                    src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=120&h=120&fit=crop&auto=format"
                    alt="초코"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{
                  position: 'absolute', bottom: '0', right: '0',
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: '#10B981', border: '2px solid #fff',
                }}></div>
              </div>

              {/* Dog Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '17px', fontWeight: '700', color: '#17211C' }}>초코</span>
                  <span style={{ fontSize: '11px', color: '#10B981', fontWeight: '600', background: '#D1FAE5', padding: '1px 7px', borderRadius: '20px' }}>준비 완료</span>
                </div>
                <p style={{ fontSize: '13px', color: '#6B756F', fontWeight: '400', lineHeight: '1.4' }}>오늘 산책 준비됐어요 ☀️</p>
              </div>
            </div>

            {/* Chips + Button Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '12px', color: '#087F5B', fontWeight: '500',
                  background: '#ECFDF5', border: '1px solid #A7F3D0',
                  padding: '4px 10px', borderRadius: '20px',
                }}>⏱ 30분 산책</span>
                <span style={{
                  fontSize: '12px', color: '#087F5B', fontWeight: '500',
                  background: '#ECFDF5', border: '1px solid #A7F3D0',
                  padding: '4px 10px', borderRadius: '20px',
                }}>🌿 폭신한 길 우선</span>
              </div>
              <button onClick={onSelectDog} style={{
                background: 'linear-gradient(135deg, #10B981, #087F5B)',
                color: '#fff', fontWeight: '700', fontSize: '13px',
                border: 'none', borderRadius: '14px',
                padding: '9px 16px', cursor: 'pointer',
                whiteSpace: 'nowrap', letterSpacing: '-0.2px',
                boxShadow: '0 4px 12px rgba(16,185,129,0.35)',
              }}>
                산책 시작 →
              </button>
            </div>
          </div>
        </div>

        {/* 오늘의 산책 Section */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '16px', fontWeight: '700', color: '#17211C', letterSpacing: '-0.3px' }}>오늘의 산책</span>
            <button style={{ fontSize: '12px', color: '#10B981', fontWeight: '500', background: 'none', border: 'none', cursor: 'pointer' }}>전체보기</button>
          </div>

          <div style={{
            background: '#FFFFFF', borderRadius: '20px',
            padding: '18px 18px 16px',
            border: '1px solid #F0F5F2',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>🌤️</span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#17211C' }}>산책하기 좋은 시간</span>
            </div>
            <p style={{ fontSize: '12px', color: '#6B756F', marginBottom: '14px', paddingLeft: '24px' }}>지금은 비교적 편안한 시간이에요.</p>

            {/* Timeline */}
            <div style={{ paddingLeft: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: '#6B756F', fontWeight: '500', width: '38px' }}>14:00</span>
                <div style={{ flex: 1, position: 'relative', height: '6px' }}>
                  {/* Track */}
                  <div style={{ width: '100%', height: '6px', background: '#E8EDEA', borderRadius: '3px' }} />
                  {/* Fill */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '52%', height: '6px',
                    background: 'linear-gradient(90deg, #10B981, #34D399)',
                    borderRadius: '3px',
                  }} />
                  {/* Indicator */}
                  <div style={{
                    position: 'absolute', top: '50%', left: '52%',
                    transform: 'translate(-50%, -50%)',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: '#087F5B', border: '3px solid #fff',
                    boxShadow: '0 0 0 2px #10B981',
                  }} />
                </div>
                <span style={{ fontSize: '11px', color: '#6B756F', fontWeight: '500', width: '38px', textAlign: 'right' }}>17:00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  fontSize: '11px', color: '#087F5B', fontWeight: '600',
                  background: '#ECFDF5', padding: '3px 10px', borderRadius: '20px',
                  border: '1px solid #A7F3D0',
                }}>
                  현재 15:30 · 산책 추천 시간대
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI 산책 도우미 Section */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '16px', fontWeight: '700', color: '#17211C', letterSpacing: '-0.3px' }}>AI 산책 도우미</span>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
            borderRadius: '20px',
            padding: '18px',
            border: '1px solid #A7F3D0',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '15px' }}>✨</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#087F5B' }}>오늘 어디로 산책할까요?</span>
              </div>
              <div style={{
                background: '#fff', borderRadius: '12px',
                padding: '8px 12px', marginBottom: '8px',
                display: 'inline-block',
                boxShadow: '0 1px 4px rgba(8,127,91,0.1)',
              }}>
                <span style={{ fontSize: '13px', color: '#17211C', fontWeight: '500' }}>"30분 정도 걷고 싶어"</span>
              </div>
              <p style={{ fontSize: '12px', color: '#6B756F', fontWeight: '400' }}>원하는 산책을 말해주세요</p>
            </div>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: '#10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
              flexShrink: 0,
              marginLeft: '12px',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

        {/* 최근 산책 Section */}
        <div style={{ padding: '0 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '16px', fontWeight: '700', color: '#17211C', letterSpacing: '-0.3px' }}>최근 산책</span>
            <button style={{ fontSize: '12px', color: '#10B981', fontWeight: '500', background: 'none', border: 'none', cursor: 'pointer' }}>기록 보기</button>
          </div>

          <div style={{
            background: '#FFFFFF', borderRadius: '20px',
            padding: '16px 18px',
            border: '1px solid #F0F5F2',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '14px',
                background: '#ECFDF5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#17211C', marginBottom: '3px' }}>오늘의 산책</p>
                <p style={{ fontSize: '12px', color: '#6B756F', fontWeight: '400' }}>2.4 km · 38분 · 편안한 길 72%</p>
              </div>
            </div>
            <div style={{ color: '#6B756F' }}>
              <ArrowRightIcon />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div style={{
        height: '80px',
        background: '#FFFFFF',
        borderTop: '1px solid #F0F5F2',
        display: 'flex', alignItems: 'flex-start',
        padding: '10px 8px 0',
        flexShrink: 0,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.05)',
      }}>
        {tabs.map((tab) => {
          if (tab.label === '+') {
            return (
              <button
                key="+"
                onClick={() => setActiveTab('+')}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0',
                  background: 'none', border: 'none', cursor: 'pointer',
                  paddingTop: '0',
                }}
              >
                <div style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  background: 'linear-gradient(135deg, #10B981, #087F5B)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
                  marginTop: '-18px',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
              </button>
            )
          }
          const isActive = activeTab === tab.label
          return (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab.label)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              {tab.icon}
              <span style={{
                fontSize: '10px', fontWeight: isActive ? '700' : '400',
                color: isActive ? '#10B981' : '#6B756F',
                letterSpacing: '-0.2px',
              }}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type Dog = {
  id: number
  name: string
  age: string
  breed: string
  preference: string
  photo?: string
}

const initialDogs: Dog[] = [
  {
    id: 1,
    name: '초코',
    age: '3살',
    breed: '말티즈',
    preference: '30분 산책 선호',
    photo: 'https://images.unsplash.com/photo-1647556627515-7ebc41d55913?w=160&h=160&fit=crop&crop=faces&auto=format',
  },
  {
    id: 2,
    name: '콩이',
    age: '5살',
    breed: '푸들',
    preference: '천천히 걷는 산책 선호',
    photo: 'https://images.unsplash.com/photo-1522039553440-46d3e1e61e4a?w=160&h=160&fit=crop&crop=faces&auto=format',
  },
]

const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

const PlusIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const PawOutlineIcon = () => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <ellipse cx="5.5" cy="9" rx="2" ry="3" transform="rotate(-20 5.5 9)" />
    <ellipse cx="11" cy="5.5" rx="2" ry="3" transform="rotate(-8 11 5.5)" />
    <ellipse cx="17" cy="5.5" rx="2" ry="3" transform="rotate(8 17 5.5)" />
    <ellipse cx="22.5" cy="9" rx="2" ry="3" transform="rotate(20 22.5 9)" />
    <path d="M14 12c-2.4 0-3.3 2-5 3.5-1.6 1.5-3.2 2.3-3.2 4.6 0 2.1 1.7 3.8 3.8 3.8 1.6 0 2.6-1 4.4-1s2.8 1 4.4 1c2.1 0 3.8-1.7 3.8-3.8 0-2.3-1.6-3.1-3.2-4.6C17.3 14 16.4 12 14 12Z" />
  </svg>
)

function DogSelection({ onBack }: { onBack: () => void }) {
  const [dogs, setDogs] = useState<Dog[]>(initialDogs)
  const [selectedId, setSelectedId] = useState<number | null>(1)
  const [showRegistration, setShowRegistration] = useState(false)
  const [walkStarted, setWalkStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('')
  const selectedDog = dogs.find((dog) => dog.id === selectedId)

  const tabs = [
    { label: '홈', icon: <HomeIcon active={activeTab === '홈'} /> },
    { label: '산책', icon: <MapIcon active={activeTab === '산책'} /> },
    { label: '+', icon: null },
    { label: '커뮤니티', icon: <UsersIcon active={activeTab === '커뮤니티'} /> },
    { label: '마이', icon: <UserIcon active={activeTab === '마이'} /> },
  ]

  function registerDog(formData: FormData) {
    const name = String(formData.get('name') || '').trim()
    const age = String(formData.get('age') || '').trim()
    const breed = String(formData.get('breed') || '').trim()
    const preference = String(formData.get('preference') || '').trim()
    if (!name || !age || !breed) return
    const newDog = { id: Date.now(), name, age: `${age}살`, breed, preference: preference || '편안한 산책 선호' }
    setDogs((current) => [...current, newDog])
    setSelectedId(newDog.id)
    setShowRegistration(false)
    setWalkStarted(false)
  }

  return (
    <div className="relative mx-auto flex h-[844px] max-h-[100dvh] w-full max-w-[390px] flex-col overflow-hidden rounded-[40px] bg-bg-app font-sans text-text-main shadow-[0_8px_60px_rgba(0,0,0,0.12)] max-[390px]:rounded-none">
      {/* The same status-bar treatment as the home screen. */}
      <div className="flex h-11 shrink-0 items-center justify-between px-6 text-sm font-semibold">
        <span>9:41</span>
        <div className="flex items-center gap-1.5 text-text-main" aria-hidden="true">
          <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><rect x="0" y="5" width="3" height="7" rx="1"/><rect x="4.5" y="3" width="3" height="9" rx="1"/><rect x="9" y="1" width="3" height="11" rx="1"/><rect x="13.5" y="0" width="2.5" height="12" rx="1" opacity="0.3"/></svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.4C5.2 2.4 2.7 3.6 1 5.5L0 4.4C2 2.2 4.8.8 8 .8s6 1.4 8 3.6l-1 1.1C13.3 3.6 10.8 2.4 8 2.4z"/><path d="M8 5.6c-1.7 0-3.3.7-4.5 1.9l-1-1.1C4 4.9 5.9 4 8 4s4 .9 5.5 2.4l-1 1.1C11.3 6.3 9.7 5.6 8 5.6z"/><circle cx="8" cy="10" r="1.5"/></svg>
          <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="currentColor" strokeOpacity=".35"/><rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor"/><path d="M23 4v4a2 2 0 0 0 0-4z" fill="currentColor" fillOpacity=".4"/></svg>
        </div>
      </div>

      <header className="relative flex h-14 shrink-0 items-center justify-center px-5">
        <button type="button" onClick={onBack} aria-label="홈으로 돌아가기" className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-xl text-text-main transition-colors hover:bg-primary-light/40 focus-visible:outline-2 focus-visible:outline-primary">
          <BackIcon />
        </button>
        <span className="text-base font-semibold tracking-tight">강아지 선택</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <div className="pt-9">
          <h1 className="text-2xl font-bold leading-snug tracking-tight">누구와 산책할까요?</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-text-sub">오늘 함께 걸을 강아지를 선택해주세요.</p>
        </div>

        <section className="mt-11" aria-labelledby="my-dogs-title">
          <h2 id="my-dogs-title" className="mb-4 text-lg font-semibold tracking-tight">내 강아지</h2>
          {dogs.length > 0 ? (
            <div className="space-y-3">
              {dogs.map((dog) => {
                const selected = selectedId === dog.id
                return (
                  <button
                    type="button"
                    key={dog.id}
                    aria-pressed={selected}
                    onClick={() => { setSelectedId(dog.id); setWalkStarted(false) }}
                    className={`flex w-full items-center gap-3.5 rounded-[20px] border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? 'border-primary bg-primary-light/25' : 'border-border bg-card hover:border-primary/40'}`}
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-light text-primary-dark">
                      {dog.photo ? <img src={dog.photo} alt={`${dog.name} 사진`} className="h-full w-full object-cover" /> : <PawOutlineIcon />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold leading-6 text-text-main">{dog.name}</div>
                      <div className="mt-0.5 text-[13px] leading-5 text-text-sub">{dog.age} · {dog.breed}</div>
                      <span className="mt-2 inline-block max-w-full truncate rounded-full bg-primary-light/60 px-2.5 py-1 text-[11px] font-medium leading-4 text-primary-dark">{dog.preference}</span>
                    </div>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] ${selected ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`} aria-hidden="true">
                      {selected && <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8 3 3 6-6" /></svg>}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[20px] border border-border bg-card px-6 py-9 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary-dark"><PawOutlineIcon /></div>
              <p className="font-semibold">아직 등록한 강아지가 없어요</p>
              <p className="mt-2 text-sm leading-relaxed text-text-sub">우리 아이를 등록하고 편안한 산책을 시작해보세요.</p>
            </div>
          )}
          <button type="button" onClick={() => setShowRegistration(true)} className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-primary bg-card text-sm font-semibold text-primary-dark transition-colors hover:bg-primary-light/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <PlusIcon size={18} /> {dogs.length ? '새 강아지 등록' : '강아지 등록하기'}
          </button>
        </section>
      </main>

      <div className="shrink-0 px-5 pb-6 pt-3">
        <button type="button" disabled={!selectedDog} onClick={() => setWalkStarted(true)} className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-white transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-text-sub">
          {selectedDog ? `${selectedDog.name}와 산책 시작하기` : '강아지를 선택해주세요'}
        </button>
        {walkStarted && selectedDog && <p role="status" className="pt-2 text-center text-xs text-primary-dark">{selectedDog.name}와 함께할 산책을 준비하고 있어요.</p>}
      </div>

      <nav aria-label="하단 메뉴" className="flex h-20 shrink-0 items-start border-t border-border bg-card px-2 pt-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {tabs.map((tab) => tab.label === '+' ? (
          <button key="+" type="button" aria-label="산책 시작" onClick={() => setActiveTab('+')} className="flex flex-1 flex-col items-center focus-visible:outline-2 focus-visible:outline-primary">
            <span className="-mt-[18px] flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-[0_4px_16px_rgba(16,185,129,0.4)]"><PlusIcon size={22} /></span>
          </button>
        ) : (
          <button key={tab.label} type="button" onClick={() => { if (tab.label === '홈') onBack(); else setActiveTab(tab.label) }} className="flex flex-1 flex-col items-center gap-1 focus-visible:outline-2 focus-visible:outline-primary">
            {tab.icon}
            <span className={`text-[10px] tracking-tight ${activeTab === tab.label ? 'font-bold text-primary' : 'font-normal text-text-sub'}`}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {showRegistration && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-text-main/35" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRegistration(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="registration-title" className="w-full rounded-t-[24px] bg-card px-5 pb-8 pt-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="registration-title" className="text-xl font-bold">새 강아지 등록</h2>
              <button type="button" aria-label="닫기" onClick={() => setShowRegistration(false)} className="flex h-9 w-9 rotate-45 items-center justify-center rounded-full text-text-sub"><PlusIcon /></button>
            </div>
            <form action={registerDog} className="space-y-3">
              <label className="block text-sm font-medium">이름<input name="name" required maxLength={20} autoFocus placeholder="강아지 이름" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg-app px-3 text-text-main outline-primary placeholder:text-text-sub/70" /></label>
              <div className="flex gap-3">
                <label className="block flex-1 text-sm font-medium">나이<input name="age" required type="number" min="0" max="30" placeholder="살" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg-app px-3 text-text-main outline-primary placeholder:text-text-sub/70" /></label>
                <label className="block flex-1 text-sm font-medium">견종<input name="breed" required maxLength={30} placeholder="견종" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg-app px-3 text-text-main outline-primary placeholder:text-text-sub/70" /></label>
              </div>
              <label className="block text-sm font-medium">산책 취향 <span className="font-normal text-text-sub">(선택)</span><input name="preference" maxLength={30} placeholder="예: 천천히 걷는 산책 선호" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg-app px-3 text-text-main outline-primary placeholder:text-text-sub/70" /></label>
              <button type="submit" className="mt-3 h-13 w-full rounded-2xl bg-primary font-semibold text-white">등록하기</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<'selection' | 'home'>('selection')
  return screen === 'selection'
    ? <DogSelection onBack={() => setScreen('home')} />
    : <HomeScreen onSelectDog={() => setScreen('selection')} />
}
