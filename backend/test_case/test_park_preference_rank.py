"""[US-B1, US-B3] 공원 모드 순환로 순위에 환경 조건이 반영되는지 검증 (agent/park_preference_rank)."""

import math

import networkx as nx

import agent.park_preference_rank as rank
from services.walk_preferences import WalkPreferences

TARGET = 1000.0


def _graph():
    """두 순환로: A(흙길) 와 B(계단 포함 포장길). 노드는 [경도, 위도] 튜플."""
    g = nx.Graph()
    a = [(0.0, 0.0), (0.001, 0.0), (0.001, 0.001), (0.0, 0.001)]
    b = [(0.002, 0.0), (0.003, 0.0), (0.003, 0.001), (0.002, 0.001)]
    for nodes, way_id in ((a, "soft"), (b, "paved")):
        for u, v in zip(nodes, nodes[1:] + nodes[:1]):
            g.add_edge(u, v, weight=100.0, way_id=way_id)
    g[b[0]][b[1]]["way_id"] = "steps"
    return g, a, b


def _patch_tags(monkeypatch):
    tags = {
        "soft": {"highway": "path", "surface": "dirt"},
        "paved": {"highway": "footway", "surface": "asphalt"},
        "steps": {"highway": "steps"},
    }
    monkeypatch.setattr(rank, "_tags_by_way", lambda _park: tags)


def test_ratio_is_neutral_without_preferences(monkeypatch):
    _patch_tags(monkeypatch)
    g, a, _b = _graph()
    assert rank.cycle_preference_ratio(g, "p", a, None) == 1.0
    assert rank.cycle_preference_ratio(g, "p", a, WalkPreferences()) == 1.0


def test_soft_preference_favours_dirt_loop(monkeypatch):
    _patch_tags(monkeypatch)
    g, a, b = _graph()
    prefs = WalkPreferences(prefer_soft=True)
    assert rank.cycle_preference_ratio(g, "p", a, prefs) < rank.cycle_preference_ratio(g, "p", b, prefs)


def test_avoid_stairs_pushes_stairs_loop_last(monkeypatch):
    _patch_tags(monkeypatch)
    g, _a, b = _graph()
    ratio = rank.cycle_preference_ratio(g, "p", b, WalkPreferences(avoid_stairs=True))
    assert math.isinf(ratio)
    stairs_key = rank.ranking_key(10.0, TARGET, ratio)
    far_key = rank.ranking_key(400.0, TARGET, 1.0)
    assert far_key < stairs_key  # 목표에서 먼 순환로라도 계단 순환로보다 앞선다


def test_ranking_key_keeps_distance_order_without_preferences():
    diffs = [5.0, 140.0, 160.0, 300.0, 60.0]
    by_key = sorted(diffs, key=lambda d: rank.ranking_key(d, TARGET, 1.0))
    assert by_key == sorted(diffs)


def test_preference_breaks_ties_only_within_tolerance():
    near_but_paved = rank.ranking_key(20.0, TARGET, 1.8)
    slightly_off_soft = rank.ranking_key(120.0, TARGET, 0.5)
    far_soft = rank.ranking_key(400.0, TARGET, 0.3)
    assert slightly_off_soft < near_but_paved < far_soft


def test_signature_changes_cache_key():
    assert rank.preferences_signature(None) == ()
    assert rank.preferences_signature(WalkPreferences(avoid_traffic=True)) != rank.preferences_signature(WalkPreferences())
