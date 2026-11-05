#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Universal Slide Layout Optimizer (범용 슬라이드 레이아웃 최적화기)
================================================================
어떤 주제의 발표 자료(deck.json)가 입력되더라도, 각 슬라이드의 제목, 본문,
데이터 필드(columns, metrics, table, steps 등), 시각 자료(image) 유무,
키워드 의미론(대조, 3대 축, 명언, 지표 등)을 종합 분석하여
가장 어울리는 최적의 레이아웃 포맷을 지능적으로 자동 배정합니다.
"""

import os
import sys
import json
import re
import argparse
import subprocess

# UTF-8 출력 보장
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


class UniversalLayoutOptimizer:
    """슬라이드 콘텐츠의 구조와 의미론을 분석하여 최적의 레이아웃을 추론하는 범용 엔진"""

    # 비교/대조 키워드 (-> columns-2)
    COMPARISON_KEYWORDS = [
        'vs', 'versus', '비교', '대조', '대비', '차이점', '장단점', '장점과 단점',
        'as-is', 'to-be', '전통', '기존', '도입 전', '도입 후', '문제점 vs 해결책',
        'before', 'after', 'pros and cons', '차이'
    ]

    # 3대 요소/축/단계 키워드 (-> columns-3)
    THREE_PILLAR_KEYWORDS = [
        '3대', '3가지', '3선', '3단계', '세 가지', '삼총사', '3-way', 'three',
        'pillars', '3원칙', '3원칙', '3요소', '3대 축', '3대 원칙', '3단계'
    ]

    # 4대 요소/매트릭스 키워드 (-> cards-4)
    FOUR_CARD_KEYWORDS = [
        '4대', '4가지', '4선', '4단계', '4분면', '매트릭스', '사분면', 'four',
        '2x2', '4영역', '4대 축', '4대 안티패턴', '4대 원칙', '4대 가치'
    ]

    # 수치/성과/KPI 키워드 (-> metrics)
    METRIC_KEYWORDS = [
        '성과', '지표', 'kpi', 'roi', '달성률', '성장률', '감소율', '증가율',
        '통계', '데이터 분석', '실적', '측정', '효과', '정량', '진단'
    ]

    # 핵심 명제/철학/경구 키워드 (-> key-message)
    KEY_MESSAGE_KEYWORDS = [
        '철학', '선언', '경구', '명언', '본질', '격언', '황금률', '핵심 명제',
        '원칙', '교훈', '경계', '신조', '매니페스토', 'manifesto', 'motto'
    ]

    # 일정/프로세스/로드맵 키워드 (-> timeline)
    TIMELINE_KEYWORDS = [
        '로드맵', '타임라인', '일정', '단계별', '프로세스', '흐름', '마일스톤',
        '추진 계획', '실행 계획', 'timeline', 'roadmap', 'schedule', 'process'
    ]

    # 섹션 간지/챕터 키워드 (-> section)
    SECTION_KEYWORDS = [
        '파트', '챕터', 'chapter', 'part', '섹션', 'section', '대단원', '모듈'
    ]

    def __init__(self, theme_id=None):
        self.theme_id = theme_id

    def infer_layout(self, slide, index, total_slides, prev_layout=None):
        """단일 슬라이드의 메타데이터와 콘텐츠를 검사하여 최적 레이아웃과 추론 근거를 반환"""
        title = slide.get('title', '').strip()
        subtitle = slide.get('subtitle', '').strip()
        category = slide.get('category', '').strip()
        full_text = f"{title} {subtitle} {category} " + " ".join(slide.get('points', []))
        full_text_lower = full_text.lower()

        # 데이터 구조 필드 추출
        cols = slide.get('columns') or slide.get('cols') or []
        cards = slide.get('cards') or slide.get('items') or []
        metrics = slide.get('metrics') or slide.get('kpis') or []
        steps = slide.get('steps') or slide.get('milestones') or []
        has_table = bool(slide.get('table') or slide.get('headers') or slide.get('rows'))
        has_image = bool(slide.get('image'))
        has_statement = bool(slide.get('statement') or slide.get('quote') or slide.get('message'))
        raw_points = slide.get('points', [])

        current_layout = slide.get('layout')

        # -------------------------------------------------------------
        # 규칙 1. 슬라이드 위치 기반 (표지 / 마무리)
        # -------------------------------------------------------------
        if index == 0:
            if self.theme_id == 'lesson-plan' or current_layout == 'lesson-title':
                return 'lesson-title', "첫 번째 슬라이드 (수업 플랜 표지)"
            return 'cover', "첫 번째 슬라이드 (메인 표지)"

        if index == total_slides - 1:
            if any(k in full_text_lower for k in ['q&a', '질의응답', '감사', 'thank', '마무리', '끝', 'closing']):
                return 'closing', "마지막 슬라이드 (Q&A / 감사 인사)"

        # 교육용 인터랙티브 슬라이드 전용 보존
        if current_layout in ['lesson-warmup', 'lesson-target', 'lesson-exit-ticket']:
            return current_layout, f"교육 전용 인터랙티브 레이아웃 ({current_layout})"

        # -------------------------------------------------------------
        # 규칙 2. 명시적 고유 데이터 구조 우선 (Strong Schema Match)
        # -------------------------------------------------------------
        # 2-1. 표(Table) 구조
        if has_table:
            return 'table', "명시적 표(Table/Headers/Rows) 데이터 구조 감지"

        # 2-2. 수치 지표(Metrics/KPI) 구조
        if metrics and len(metrics) >= 2:
            return 'metrics', f"명시적 정량 지표({len(metrics)}개) 데이터 구조 감지"

        # 2-3. 타임라인/단계 프로세스 구조
        if steps and len(steps) >= 3:
            return 'timeline', f"명시적 단계/마일스톤({len(steps)}단계) 데이터 구조 감지"

        # 2-4. 4분면 카드 구조
        if cards and len(cards) == 4:
            return 'cards-4', "명시적 4분할 카드(cards 4개) 구조 감지"

        # 2-5. 3열 구조
        if cols and len(cols) == 3:
            return 'columns-3', "명시적 3열(columns 3개) 데이터 구조 감지"

        # 2-6. 2열 구조
        if cols and len(cols) == 2:
            return 'columns-2', "명시적 2열(columns 2개) 데이터 구조 감지"

        # -------------------------------------------------------------
        # 규칙 3. 섹션 간지 (Section Divider) 감지
        # -------------------------------------------------------------
        is_section_candidate = (
            current_layout == 'section' or
            any(k in title.lower() for k in self.SECTION_KEYWORDS) or
            (len(title) > 0 and len(raw_points) == 0 and not cols and not cards and not metrics and len(subtitle) < 20)
        )
        if is_section_candidate:
            return 'section', "대단원/챕터 구분용 섹션 간지"

        # -------------------------------------------------------------
        # 규칙 4. 시각 자료(Image) + 내용 결합 분석
        # -------------------------------------------------------------
        if has_image:
            # 다이어그램/차트/아키텍처/결과표가 핵심인 경우 -> content-image
            chart_diagram_tokens = ['chart', 'diagram', 'graph', 'process', 'flow', 'arch', 'board', 'dsm', 'table', 'matrix']
            img_path = str(slide.get('image', '')).lower()
            is_visual_core = any(tok in img_path for tok in chart_diagram_tokens) or any(k in title.lower() for k in ['차트', '그래프', '흐름도', '아키텍처', '보드', '조직도', '구조도'])

            # 핵심 명제(Quote/Statement)가 있는 경우 이미지보다 명언 카드가 더 적합할 수 있음
            if has_statement and any(k in full_text_lower for k in self.KEY_MESSAGE_KEYWORDS):
                return 'key-message', "핵심 철학/명언/격언 강조 (Quote/Statement 우선)"

            if is_visual_core or len(raw_points) <= 5:
                # 2열 또는 3열 데이터가 명확한 경우에는 columns 레이아웃이 더 읽기 편함
                if cols and len(cols) == 2:
                    return 'columns-2', "2열 비교 카드 (이미지보다 텍스트 구조 우선)"
                if cols and len(cols) == 3:
                    return 'columns-3', "3열 축 카드 (이미지보다 텍스트 구조 우선)"
                return 'content-image', "고화질 도해/차트 시각 자료 중심 레이아웃"

        # -------------------------------------------------------------
        # 규칙 5. 제목 및 본문 텍스트 의미론 (Semantic Keywords)
        # -------------------------------------------------------------
        # 5-1. 핵심 명제 / 철학 / 명언
        if has_statement or any(k in title for k in self.KEY_MESSAGE_KEYWORDS):
            return 'key-message', "핵심 명제/철학/경구 강조 레이아웃 (key-message)"

        # 5-2. 비교 및 대조 (vs, AS-IS vs TO-BE)
        if any(k in title.lower() for k in self.COMPARISON_KEYWORDS) or ' vs ' in title.lower():
            return 'columns-2', "비교 및 대조 (vs / AS-IS vs TO-BE) 의미론 감지"

        # 5-3. 3대 요소 / 3단계
        if any(k in title for k in self.THREE_PILLAR_KEYWORDS):
            return 'columns-3', "3대 요소 / 3대 원칙 / 3단계 프로세스 의미론 감지"

        # 5-4. 4대 요소 / 4분면
        if any(k in title for k in self.FOUR_CARD_KEYWORDS):
            return 'cards-4', "4대 요소 / 4분면 매트릭스 의미론 감지"

        # 5-5. 타임라인 / 로드맵
        if any(k in title for k in self.TIMELINE_KEYWORDS):
            return 'timeline', "일정 / 로드맵 / 타임라인 의미론 감지"

        # 5-6. 정량 지표 / 통계
        if any(k in title for k in self.METRIC_KEYWORDS) or ('%' in full_text and any(c.isdigit() for c in full_text)):
            if metrics:
                return 'metrics', "정량 성과/KPI 수치 지표 감지"

        # -------------------------------------------------------------
        # 규칙 6. 불릿 포인트 수에 따른 스마트 폴백 (Heuristic Fallback)
        # -------------------------------------------------------------
        point_count = len(raw_points)

        if point_count == 2:
            return 'columns-2', "2개 포인트 기반 2열 카드 구성"
        elif point_count == 3:
            return 'columns-3', "3개 포인트 기반 3열 카드 구성"
        elif point_count == 4:
            return 'cards-4', "4개 포인트 기반 4분할 카드 구성"
        elif point_count >= 5:
            # 포인트가 많으면 2열로 분할하여 읽기 쉽게 구성
            return 'columns-2', "다수 포인트(5개 이상) 가독성을 위한 2열 분할"

        # 최종 기본값
        return current_layout or 'columns-2', "기본 최적 레이아웃 유지"

    def optimize_deck(self, deck_data):
        """전체 덱을 순회하며 슬라이드별 최적 레이아웃 배정 및 리포트 생성"""
        slides = deck_data.get('slides', [])
        total_slides = len(slides)
        self.theme_id = deck_data.get('theme', 'modern-business')

        report = []
        updated_count = 0
        layout_stats = {}

        prev_layout = None
        for idx, slide in enumerate(slides):
            old_layout = slide.get('layout')
            new_layout, reason = self.infer_layout(slide, idx, total_slides, prev_layout)

            # 리듬감 제어: 동일 레이아웃이 3회 연속 반복되는 경우 다양성 부여
            if idx >= 2 and new_layout == prev_layout and new_layout in ['content-image', 'columns-2', 'columns-3']:
                # 불릿 포인트나 텍스트가 풍부한 경우 대체 레이아웃 시도
                if new_layout == 'content-image' and (slide.get('columns') or len(slide.get('points', [])) >= 4):
                    alt_layout = 'columns-2' if len(slide.get('columns', [])) != 3 else 'columns-3'
                    reason += f" (반복 완화 다양성 보정: {new_layout} -> {alt_layout})"
                    new_layout = alt_layout

            changed = (old_layout != new_layout)
            if changed:
                updated_count += 1
                slide['layout'] = new_layout

            # key-message 레이아웃으로 변경 시 statement 필드 보강
            if new_layout == 'key-message' and not slide.get('statement'):
                # points의 첫 문장이나 제목을 statement로 승격
                pts = slide.get('points', [])
                if pts and isinstance(pts[0], str):
                    slide['statement'] = pts[0]
                else:
                    slide['statement'] = f"“{slide.get('title', '')}”"

            layout_stats[new_layout] = layout_stats.get(new_layout, 0) + 1
            prev_layout = new_layout

            report.append({
                'slide_no': idx + 1,
                'title': slide.get('title', 'Untitled'),
                'old_layout': old_layout,
                'new_layout': new_layout,
                'changed': changed,
                'reason': reason
            })

        return {
            'total_slides': total_slides,
            'updated_count': updated_count,
            'layout_stats': layout_stats,
            'report': report
        }


def print_optimization_summary(results):
    """사용자가 한눈에 볼 수 있도록 최적화 분석 표와 통계를 출력"""
    print("\n" + "=" * 80)
    print(" 🚀 Universal Slide Layout Optimizer (범용 레이아웃 최적화 결과)")
    print("=" * 80)
    print(f"• 총 슬라이드 수: {results['total_slides']}장")
    print(f"• 레이아웃 변경/조정: {results['updated_count']}장")
    print("\n[📊 레이아웃 다양성 분포 (Layout Distribution)]")
    for l_name, cnt in sorted(results['layout_stats'].items(), key=lambda x: -x[1]):
        pct = (cnt / results['total_slides']) * 100
        bar = "■" * int(pct / 5)
        print(f"  {l_name:<18} : {cnt:>2}장 ({pct:>5.1f}%) {bar}")

    print("\n[📋 슬라이드별 최적 포맷 배정 내역]")
    print(f"{'No':<4} {'최종 레이아웃':<16} {'상태':<6} {'슬라이드 제목':<32} {'배정 근거'}")
    print("-" * 80)
    for r in results['report']:
        status = "변경" if r['changed'] else "유지"
        t_display = (r['title'][:28] + '..') if len(r['title']) > 30 else r['title']
        print(f"[{r['slide_no']:02d}] {r['new_layout']:<16} {status:<6} {t_display:<32} {r['reason']}")
    print("=" * 80 + "\n")


def main():
    parser = argparse.ArgumentParser(description="범용 슬라이드 레이아웃 최적화기 (Universal Layout Optimizer)")
    parser.add_argument('--deck', '-d', required=False, default='input/agile_scrum_expert/deck.json',
                        help="분석 및 최적화할 슬라이드 명세 JSON 파일 경로")
    parser.add_argument('--out', '-o', required=False, default=None,
                        help="결과를 저장할 파일 경로 (생략 시 원본 파일에 업데이트)")
    parser.add_argument('--dry-run', action='store_true',
                        help="파일을 수정하지 않고 최적화 추천 결과만 미리보기")
    parser.add_argument('--build', action='store_true',
                        help="최적화 완료 후 즉시 PPTX 프리젠테이션 생성 실행")

    args = parser.parse_args()

    deck_path = os.path.abspath(args.deck)
    if not os.path.exists(deck_path):
        print(f"❌ 오류: 입력 파일을 찾을 수 없습니다: {deck_path}", file=sys.stderr)
        sys.exit(1)

    with open(deck_path, 'r', encoding='utf-8') as f:
        deck_data = json.load(f)

    optimizer = UniversalLayoutOptimizer()
    results = optimizer.optimize_deck(deck_data)
    print_optimization_summary(results)

    if not args.dry_run:
        save_path = os.path.abspath(args.out) if args.out else deck_path
        with open(save_path, 'w', encoding='utf-8') as f:
            json.dump(deck_data, f, ensure_ascii=False, indent=2)
        print(f"💾 최적화된 슬라이드 명세가 저장되었습니다: {save_path}")

        # 원클릭 빌드 연계
        if args.build:
            print("\n🔨 PPTX 자동 생성을 시작합니다...")
            cli_path = os.path.abspath('engine/cli.js')
            subprocess.run(['node', cli_path, '--deck', save_path], check=True)
    else:
        print("🔍 [Dry-Run] 변경사항을 파일에 쓰지 않고 분석만 수행했습니다.")


if __name__ == '__main__':
    main()
