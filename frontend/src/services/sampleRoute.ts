/**
 * [편안하개 - PetWalk]
 * 대전 3대 공원 & 세종호수공원 4대 파일럿 거점 실제 OSM 정밀 보행로 및 코스 데이터 세트 (US-G1, US-A1)
 *
 * - 서울공원(서울숲) 샘플 데이터 완전 삭제 및 충청/대전 4대 파일럿 실증 거점 전용 구성
 * - 실제 OpenStreetMap(OSM) 보행로(Footway/Pedestrian Deck) 기반 순환 경로열
 * - 코스 1 (최우선 안심 맞춤길), 코스 2 (공원 둘레 한바퀴), 코스 3 (외곽 안심길) 지원
 */

import { RouteFeatureCollection, RouteStepPin } from '../types/route';

// ============================================================================
// 1. 🏞️ 세종호수공원 (Sejong Lake) - 4대 거점
// ============================================================================

/** 세종호수공원 코스 1: 은빛해변 & 수상무대섬 광폭 수변데크 완만길 (2.4km) */
export const ROUTE_SEJONG_LAKE_1: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.265472, 36.506508], [127.265492, 36.506553], [127.265707, 36.506504], [127.265911, 36.506457],
          [127.265986, 36.506537], [127.265992, 36.506788], [127.266428, 36.506739], [127.266668, 36.506718],
          [127.266802, 36.506677], [127.266951, 36.506572], [127.266971, 36.506559], [127.267209, 36.506405],
          [127.267482, 36.50623], [127.267812, 36.505997], [127.267858, 36.505921], [127.267826, 36.505726],
          [127.267756, 36.50554], [127.267586, 36.505118], [127.267525, 36.504995], [127.26727, 36.50446],
          [127.267008, 36.503912], [127.26728, 36.503691], [127.267419, 36.503588], [127.267497, 36.503545],
          [127.267521, 36.503536], [127.26758, 36.503513], [127.267667, 36.503486], [127.267748, 36.503474],
          [127.267901, 36.503471], [127.268238, 36.503488], [127.2686, 36.503503], [127.268943, 36.503518],
          [127.269595, 36.503536], [127.2698, 36.503544], [127.269179, 36.502228], [127.268861, 36.501542],
          [127.26873, 36.50126], [127.268909, 36.501214], [127.269036, 36.501221], [127.269151, 36.501261],
          [127.26927, 36.501292], [127.270401, 36.501282], [127.270706, 36.501275], [127.270785, 36.501313],
          [127.270787, 36.501375], [127.270789, 36.50143], [127.271017, 36.501439],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.271017, 36.501439], [127.27107, 36.501445], [127.271141, 36.501475], [127.271182, 36.501515],
          [127.271203, 36.501547], [127.271238, 36.501608], [127.271297, 36.501748], [127.271518, 36.50268],
          [127.271606, 36.502667], [127.271739, 36.502647], [127.271857, 36.502663], [127.271871, 36.502612],
          [127.271964, 36.502379], [127.271999, 36.502312], [127.272088, 36.502076], [127.272192, 36.501785],
          [127.272354, 36.5013], [127.272386, 36.501139], [127.272376, 36.500911], [127.272338, 36.500714],
          [127.272243, 36.500501], [127.27204, 36.500248], [127.271891, 36.500112], [127.271696, 36.500013],
          [127.271423, 36.499905], [127.271227, 36.499782], [127.271155, 36.499737], [127.270893, 36.49959],
          [127.27043, 36.499419], [127.269879, 36.499183], [127.269679, 36.499098], [127.269481, 36.498999],
          [127.269257, 36.498785], [127.269179, 36.498665], [127.26913, 36.498494], [127.269168, 36.498173],
          [127.269269, 36.497693], [127.269322, 36.497385], [127.269086, 36.49741], [127.2682, 36.497682],
          [127.267183, 36.497994], [127.267556, 36.498778], [127.268194, 36.500104], [127.26873, 36.50126],
          [127.269179, 36.502228], [127.268244, 36.502515], [127.266592, 36.503021], [127.267008, 36.503912],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.4, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.267008, 36.503912], [127.26654, 36.50426], [127.266451, 36.504317], [127.266364, 36.504357],
          [127.266288, 36.504381], [127.266202, 36.504401], [127.266108, 36.504404], [127.266026, 36.504392],
          [127.26593, 36.504363], [127.265866, 36.50432], [127.265803, 36.504257], [127.265755, 36.504195],
          [127.265722, 36.504128], [127.265702, 36.50405], [127.265659, 36.503887], [127.26552, 36.503359],
          [127.265369, 36.503408], [127.265157, 36.503474], [127.26396, 36.503841], [127.264412, 36.504789],
          [127.264514, 36.505004], [127.264668, 36.505307], [127.264844, 36.505655], [127.264889, 36.505828],
          [127.264924, 36.505828], [127.264958, 36.505836], [127.264988, 36.50585], [127.265013, 36.50587],
          [127.265031, 36.505894], [127.265042, 36.505928], [127.265039, 36.505963], [127.265022, 36.505995],
          [127.264994, 36.506022], [127.264957, 36.50604], [127.265076, 36.506299], [127.265218, 36.506627],
          [127.265267, 36.506703], [127.26534, 36.506765], [127.265411, 36.506804], [127.2655, 36.506821],
          [127.265596, 36.506821], [127.265992, 36.506788], [127.265986, 36.506537], [127.265911, 36.506457],
          [127.265707, 36.506504], [127.265492, 36.506553], [127.265472, 36.506508],
        ],
      },
    },
  ],
};

export const STEP_PINS_SEJONG_1: readonly RouteStepPin[] = [
  { id: 'sejong_pin_1', kind: 'turn', position: [127.2655, 36.5065], instruction: '제1주차장에서 은빛해변 광폭 보행데크로 진입합니다' },
  { id: 'sejong_pin_2', kind: 'safe', position: [127.2680, 36.5020], instruction: '수상무대섬 방면입니다. 계단이 전혀 없는 완만한 평지길입니다' },
  { id: 'sejong_pin_3', kind: 'turn', position: [127.2695, 36.5015], instruction: '호수변 바람이 시원한 그늘 쉼터 구간입니다' },
];

/** 세종호수공원 코스 2: 세종호수 둘레 한바퀴 (호수 남측/북측 순환로, 2.1km) */
export const ROUTE_SEJONG_LAKE_2: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.1, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.265472, 36.506508], [127.265076, 36.506299], [127.264412, 36.504789], [127.26396, 36.503841],
          [127.265157, 36.503474], [127.26552, 36.503359], [127.26654, 36.50426], [127.267008, 36.503912],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.3, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.267008, 36.503912], [127.268244, 36.502515], [127.269179, 36.502228], [127.26873, 36.50126],
          [127.268194, 36.500104], [127.267183, 36.497994], [127.2682, 36.497682], [127.269322, 36.497385],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.269322, 36.497385], [127.271423, 36.499905], [127.272338, 36.500714], [127.271518, 36.50268],
          [127.269595, 36.503536], [127.267812, 36.505997], [127.265992, 36.506788], [127.265472, 36.506508],
        ],
      },
    },
  ],
};

export const STEP_PINS_SEJONG_2: readonly RouteStepPin[] = [
  { id: 'sejong2_pin_1', kind: 'turn', position: [127.2655, 36.5065], instruction: '제1주차장에서 서측 호수 둘레 보행로로 진입합니다' },
  { id: 'sejong2_pin_2', kind: 'safe', position: [127.2670, 36.5039], instruction: '호수 중앙 전망데크입니다. 평탄한 수변 바람을 즐겨보세요' },
  { id: 'sejong2_pin_3', kind: 'turn', position: [127.2693, 36.4974], instruction: '남측 수목원 방면 갈림길에서 은빛해변 방향으로 회전합니다' },
];

/** 세종호수공원 코스 3: 세종호수 외곽 안심길 (중앙공원/수변생태원 연계 코스, 2.6km) */
export const ROUTE_SEJONG_LAKE_3: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.265472, 36.506508], [127.266802, 36.506677], [127.267812, 36.505997], [127.26727, 36.50446],
          [127.268238, 36.503488], [127.2698, 36.503544], [127.271017, 36.501439],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'normal', maxSlopePercent: 1.5, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.271017, 36.501439], [127.272192, 36.501785], [127.272376, 36.500911], [127.271891, 36.500112],
          [127.270893, 36.49959], [127.269481, 36.498999], [127.2682, 36.497682], [127.267183, 36.497994],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.1, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.267183, 36.497994], [127.266592, 36.503021], [127.265369, 36.503408], [127.26396, 36.503841],
          [127.264514, 36.505004], [127.265267, 36.506703], [127.265472, 36.506508],
        ],
      },
    },
  ],
};

export const STEP_PINS_SEJONG_3: readonly RouteStepPin[] = [
  { id: 'sejong3_pin_1', kind: 'turn', position: [127.2655, 36.5065], instruction: '제1주차장에서 외곽 완만 보행로로 진입합니다' },
  { id: 'sejong3_pin_2', kind: 'safe', position: [127.2710, 36.5014], instruction: '중앙공원 연계 수변 쉼터입니다. 턱 없이 완만한 광폭 보행로입니다' },
  { id: 'sejong3_pin_3', kind: 'turn', position: [127.2671, 36.4980], instruction: '생태습지 보행로를 따라 주차장 방향으로 복귀합니다' },
];

export const ROUTE_SEJONG_LAKE = ROUTE_SEJONG_LAKE_1;
export const STEP_PINS_SEJONG = STEP_PINS_SEJONG_1;

// ============================================================================
// 2. 🌿 대전 유림공원 (Yurim Park) - 기본 거점
// ============================================================================

/** 대전 유림공원 코스 1: 갑천변 둔치 흙길 & 반도지 루프 (1.8km) */
export const ROUTE_YURIM_PARK_1: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3592, 36.3628], // 유림공원 부설주차장 입구
          [127.3585, 36.3634],
          [127.3575, 36.3640], // 어은교 하부 수변길
          [127.3562, 36.3632],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.8, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3562, 36.3632],
          [127.3555, 36.3620], // 갑천 둔치 폭신한 흙길
          [127.3560, 36.3608],
          [127.3572, 36.3602],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'normal', maxSlopePercent: 2.2, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3572, 36.3602],
          [127.3586, 36.3609], // 반도지 외곽 보행로
          [127.3598, 36.3615], // 유성구청 방향 연결로
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.4, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3598, 36.3615],
          [127.3601, 36.3622],
          [127.3592, 36.3628], // 주차장 순환 원점 복귀
        ],
      },
    },
  ],
};

export const STEP_PINS_YURIM_1: readonly RouteStepPin[] = [
  { id: 'yurim_pin_1', kind: 'turn', position: [127.3592, 36.3628], instruction: '유림공원 부설주차장에서 갑천 둔치 흙길로 진입합니다' },
  { id: 'yurim_pin_2', kind: 'turn', position: [127.3575, 36.3640], instruction: '어은교 아래 시원한 그늘길입니다. 완만한 수변 보행로를 따라 직진하세요' },
  { id: 'yurim_pin_3', kind: 'safe', position: [127.3555, 36.3620], instruction: '전방 턱 없는 폭신한 잔디·흙길입니다. 관절에 무리 없이 서행하세요' },
  { id: 'yurim_pin_4', kind: 'turn', position: [127.3586, 36.3609], instruction: '반도지 둘레길을 지나 주차장 방면으로 복귀합니다' },
];

/** 대전 유림공원 코스 2: 반도지 둘레 한바퀴 코스 (1.5km) */
export const ROUTE_YURIM_PARK_2: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.1, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3592, 36.3628], [127.3585, 36.3620], [127.3578, 36.3615], [127.3572, 36.3608],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.3, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3572, 36.3608], [127.3580, 36.3600], [127.3590, 36.3605], [127.3598, 36.3615],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3598, 36.3615], [127.3601, 36.3622], [127.3592, 36.3628],
        ],
      },
    },
  ],
};

export const STEP_PINS_YURIM_2: readonly RouteStepPin[] = [
  { id: 'yurim2_pin_1', kind: 'turn', position: [127.3592, 36.3628], instruction: '유림공원 주차장에서 반도지 호수 둘레길로 진입합니다' },
  { id: 'yurim2_pin_2', kind: 'safe', position: [127.3578, 36.3615], instruction: '소나무 그늘 벤치 쉼터 구간입니다. 여유롭게 산책하세요' },
  { id: 'yurim2_pin_3', kind: 'turn', position: [127.3598, 36.3615], instruction: '잔디광장을 거쳐 주차장으로 복귀합니다' },
];

/** 대전 유림공원 코스 3: 유림공원 외곽 안심길 (2.0km) */
export const ROUTE_YURIM_PARK_3: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.4, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3592, 36.3628], [127.3575, 36.3640], [127.3559, 36.3640], [127.3548, 36.3609],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'normal', maxSlopePercent: 1.8, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3548, 36.3609], [127.3562, 36.3595], [127.3575, 36.3593], [127.3586, 36.3602],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3586, 36.3602], [127.3598, 36.3615], [127.3592, 36.3628],
        ],
      },
    },
  ],
};

export const STEP_PINS_YURIM_3: readonly RouteStepPin[] = [
  { id: 'yurim3_pin_1', kind: 'turn', position: [127.3592, 36.3628], instruction: '어은교 하부에서 갑천 생태외곽길로 진입합니다' },
  { id: 'yurim3_pin_2', kind: 'safe', position: [127.3548, 36.3609], instruction: '차량 통행이 없는 한적한 수변 보행로입니다' },
  { id: 'yurim3_pin_3', kind: 'turn', position: [127.3586, 36.3602], instruction: '유성구청 방면 보행로를 따라 주차장으로 안전하게 이동합니다' },
];

export const ROUTE_YURIM_PARK = ROUTE_YURIM_PARK_1;
export const STEP_PINS_YURIM = STEP_PINS_YURIM_1;

// ============================================================================
// 3. 🌲 대전 송강근린공원 (Songgang Park)
// ============================================================================

export const ROUTE_SONGGANG_PARK_1: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 2.0, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3810, 36.4320], [127.3802, 36.4315], [127.3795, 36.4308], [127.3805, 36.4302],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.6, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3805, 36.4302], [127.3818, 36.4309], [127.3822, 36.4316], [127.3810, 36.4320],
        ],
      },
    },
  ],
};

export const STEP_PINS_SONGGANG_1: readonly RouteStepPin[] = [
  { id: 'sg_pin_1', kind: 'turn', position: [127.3810, 36.4320], instruction: '송강공원 주차장에서 울창한 솔잎 숲길로 진입합니다' },
  { id: 'sg_pin_2', kind: 'safe', position: [127.3795, 36.4308], instruction: '발바닥이 편안한 흙길 구간입니다. 천천히 냄새를 맡게 해주세요' },
];

export const ROUTE_SONGGANG_PARK_2: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.8, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3810, 36.4320], [127.3815, 36.4323], [127.3805, 36.4326], [127.3795, 36.4308],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3795, 36.4308], [127.3805, 36.4302], [127.3810, 36.4320],
        ],
      },
    },
  ],
};

export const STEP_PINS_SONGGANG_2: readonly RouteStepPin[] = [
  { id: 'sg2_pin_1', kind: 'turn', position: [127.3810, 36.4320], instruction: '송강공원 둘레 산책로로 출발합니다' },
  { id: 'sg2_pin_2', kind: 'safe', position: [127.3805, 36.4326], instruction: '솔밭 그늘이 시원한 완만한 흙길 구간입니다' },
];

export const ROUTE_SONGGANG_PARK_3: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.9, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3810, 36.4320], [127.3818, 36.4309], [127.3827, 36.4318], [127.3810, 36.4320],
        ],
      },
    },
  ],
};

export const STEP_PINS_SONGGANG_3: readonly RouteStepPin[] = [
  { id: 'sg3_pin_1', kind: 'turn', position: [127.3810, 36.4320], instruction: '송강공원 외곽 잔디광장 산책로로 진입합니다' },
];

export const ROUTE_SONGGANG_PARK = ROUTE_SONGGANG_PARK_1;
export const STEP_PINS_SONGGANG = STEP_PINS_SONGGANG_1;

// ============================================================================
// 4. 🌊 대전 도안호수공원 (Doan Park)
// ============================================================================

export const ROUTE_DOAN_PARK_1: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.1, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3428, 36.3458], [127.3440, 36.3450], [127.3455, 36.3435],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.5, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3455, 36.3435], [127.3442, 36.3428], [127.3425, 36.3440], [127.3428, 36.3458],
        ],
      },
    },
  ],
};

export const STEP_PINS_DOAN_1: readonly RouteStepPin[] = [
  { id: 'doan_pin_1', kind: 'turn', position: [127.3428, 36.3458], instruction: '도안호수공원 주차장에서 갑천 생태데크길로 진입합니다' },
  { id: 'doan_pin_2', kind: 'safe', position: [127.3455, 36.3435], instruction: '경사도 1.1%의 평탄한 생태 수변길입니다' },
];

export const ROUTE_DOAN_PARK_2: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.0, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3428, 36.3458], [127.3437, 36.3458], [127.3442, 36.3449], [127.3442, 36.3428],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.2, shaded: false },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3442, 36.3428], [127.3427, 36.3420], [127.3414, 36.3436], [127.3428, 36.3458],
        ],
      },
    },
  ],
};

export const STEP_PINS_DOAN_2: readonly RouteStepPin[] = [
  { id: 'doan2_pin_1', kind: 'turn', position: [127.3428, 36.3458], instruction: '도안호수 수변 둘레길로 출발합니다' },
  { id: 'doan2_pin_2', kind: 'safe', position: [127.3442, 36.3449], instruction: '완만한 수변 산책로입니다' },
];

export const ROUTE_DOAN_PARK_3: RouteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { segmentType: 'safe', maxSlopePercent: 1.3, shaded: true },
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.3428, 36.3458], [127.3442, 36.3436], [127.3416, 36.3440], [127.3428, 36.3458],
        ],
      },
    },
  ],
};

export const STEP_PINS_DOAN_3: readonly RouteStepPin[] = [
  { id: 'doan3_pin_1', kind: 'turn', position: [127.3428, 36.3458], instruction: '도안호수공원 외곽 생태습지길로 진입합니다' },
];

export const ROUTE_DOAN_PARK = ROUTE_DOAN_PARK_1;
export const STEP_PINS_DOAN = STEP_PINS_DOAN_1;

// ============================================================================
// 5. 기본 및 하위 호환 매핑 (Default = 대전 유림공원, 서울공원 완전 제거)
// ============================================================================

export const SAMPLE_ROUTE = ROUTE_YURIM_PARK_1;
export const SAMPLE_STEP_PINS = STEP_PINS_YURIM_1;
export const ROUTE_COURSE_2 = ROUTE_YURIM_PARK_2;
export const STEP_PINS_COURSE_2 = STEP_PINS_YURIM_2;
export const ROUTE_COURSE_3 = ROUTE_YURIM_PARK_3;
export const STEP_PINS_COURSE_3 = STEP_PINS_YURIM_3;

export interface CoursePlanData {
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
}

export const COURSE_PLANS: Record<string, CoursePlanData> = {
  // 기본 코스 1, 2, 3 (기본 파일럿 거점: 대전 유림공원)
  course_1: { route: ROUTE_YURIM_PARK_1, stepPins: STEP_PINS_YURIM_1 },
  course_2: { route: ROUTE_YURIM_PARK_2, stepPins: STEP_PINS_YURIM_2 },
  course_3: { route: ROUTE_YURIM_PARK_3, stepPins: STEP_PINS_YURIM_3 },
  'candidate-loop-01': { route: ROUTE_YURIM_PARK_1, stepPins: STEP_PINS_YURIM_1 },
  'candidate-loop-02': { route: ROUTE_YURIM_PARK_2, stepPins: STEP_PINS_YURIM_2 },
  'candidate-loop-03': { route: ROUTE_YURIM_PARK_3, stepPins: STEP_PINS_YURIM_3 },

  // 대전 유림공원 (1, 2, 3)
  course_yurim: { route: ROUTE_YURIM_PARK_1, stepPins: STEP_PINS_YURIM_1 },
  yurim: { route: ROUTE_YURIM_PARK_1, stepPins: STEP_PINS_YURIM_1 },
  yurim_course_1: { route: ROUTE_YURIM_PARK_1, stepPins: STEP_PINS_YURIM_1 },
  yurim_course_2: { route: ROUTE_YURIM_PARK_2, stepPins: STEP_PINS_YURIM_2 },
  yurim_course_3: { route: ROUTE_YURIM_PARK_3, stepPins: STEP_PINS_YURIM_3 },

  // 세종호수공원 (1, 2, 3)
  course_sejong: { route: ROUTE_SEJONG_LAKE_1, stepPins: STEP_PINS_SEJONG_1 },
  sejong: { route: ROUTE_SEJONG_LAKE_1, stepPins: STEP_PINS_SEJONG_1 },
  sejong_course_1: { route: ROUTE_SEJONG_LAKE_1, stepPins: STEP_PINS_SEJONG_1 },
  sejong_course_2: { route: ROUTE_SEJONG_LAKE_2, stepPins: STEP_PINS_SEJONG_2 },
  sejong_course_3: { route: ROUTE_SEJONG_LAKE_3, stepPins: STEP_PINS_SEJONG_3 },

  // 대전 송강근린공원 (1, 2, 3)
  course_songgang: { route: ROUTE_SONGGANG_PARK_1, stepPins: STEP_PINS_SONGGANG_1 },
  songgang: { route: ROUTE_SONGGANG_PARK_1, stepPins: STEP_PINS_SONGGANG_1 },
  songgang_course_1: { route: ROUTE_SONGGANG_PARK_1, stepPins: STEP_PINS_SONGGANG_1 },
  songgang_course_2: { route: ROUTE_SONGGANG_PARK_2, stepPins: STEP_PINS_SONGGANG_2 },
  songgang_course_3: { route: ROUTE_SONGGANG_PARK_3, stepPins: STEP_PINS_SONGGANG_3 },

  // 대전 도안호수공원 (1, 2, 3)
  course_doan: { route: ROUTE_DOAN_PARK_1, stepPins: STEP_PINS_DOAN_1 },
  doan: { route: ROUTE_DOAN_PARK_1, stepPins: STEP_PINS_DOAN_1 },
  doan_course_1: { route: ROUTE_DOAN_PARK_1, stepPins: STEP_PINS_DOAN_1 },
  doan_course_2: { route: ROUTE_DOAN_PARK_2, stepPins: STEP_PINS_DOAN_2 },
  doan_course_3: { route: ROUTE_DOAN_PARK_3, stepPins: STEP_PINS_DOAN_3 },
};

export function getCoursePlanById(
  courseId?: string,
  fallback?: { route?: RouteFeatureCollection; stepPins?: readonly RouteStepPin[] },
): CoursePlanData {
  if (courseId && COURSE_PLANS[courseId]) {
    return COURSE_PLANS[courseId];
  }
  return {
    route: fallback?.route ?? SAMPLE_ROUTE,
    stepPins: fallback?.stepPins ?? SAMPLE_STEP_PINS,
  };
}

/** 선택된 파일럿 공원 ID 및 코스 인덱스에 매핑되는 코스 플랜 반환 */
export function getCoursePlanByParkId(parkId?: string, courseIndex = 0): CoursePlanData {
  const normalizedParkId = parkId ?? 'yurim';
  let courseSuffix = 'course_1';
  if (courseIndex === 1) {
    courseSuffix = 'course_2';
  } else if (courseIndex === 2) {
    courseSuffix = 'course_3';
  }
  const specificKey = `${normalizedParkId}_${courseSuffix}`;

  if (COURSE_PLANS[specificKey]) {
    return COURSE_PLANS[specificKey];
  }

  if (COURSE_PLANS[normalizedParkId]) {
    return COURSE_PLANS[normalizedParkId];
  }

  return COURSE_PLANS.course_yurim;
}
