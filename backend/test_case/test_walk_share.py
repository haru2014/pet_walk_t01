"""[이슈 #116] 산책 기록 공개(후기 공유) — 서버가 마스킹한 좌표만 공개하는 API 테스트.

- 공유는 서버(POST /api/v1/walks/{id}/share)만 할 수 있고, 로그인 토큰·소유자를 확인한다.
- 공개용 좌표(public_route_coords)는 apply_spatial_masking_to_course 로 출발·도착 200m 를 뺀 것이다.
- 원본 route_coords 는 공개 칸으로 복사되지 않는다.
- 마스킹 후 남는 좌표가 없으면(너무 짧은 경로) 공개하지 않는다.
"""

import copy
import uuid

import pytest
from fastapi.testclient import TestClient

import main
from services.walk_share import WalkShareError, share_walk, unshare_walk, verify_user

client = TestClient(main.app)

USER_A = str(uuid.uuid4())
USER_B = str(uuid.uuid4())
WALK_ID = str(uuid.uuid4())
# 약 1.2km 직선 경로 [경도, 위도] — 출발·도착 200m 를 빼도 좌표가 남는다.
LONG_ROUTE = [[127.38 + i * 0.0001, 36.435 + i * 0.00005] for i in range(120)]
SHORT_ROUTE = LONG_ROUTE[:6]


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table):
        self._t = table
        self._filters = []
        self._patch = None

    def select(self, *_a, **_k):
        return self

    def update(self, patch):
        self._patch = patch
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        rows = [r for r in self._t.rows if all(r.get(c) == v for c, v in self._filters)]
        if self._patch is not None:
            for r in rows:
                r.update(self._patch)
            self._t.updates.append((list(self._filters), copy.deepcopy(self._patch)))
        return _Resp(copy.deepcopy(rows))


class _Table:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def query(self):
        return _Query(self)


class _User:
    def __init__(self, uid):
        self.id = uid


class _UserResp:
    def __init__(self, uid):
        self.user = _User(uid)


class _Auth:
    def __init__(self, tokens):
        self._tokens = tokens

    def get_user(self, token):
        if token not in self._tokens:
            raise RuntimeError("invalid JWT")
        return _UserResp(self._tokens[token])


class FakeSupabase:
    def __init__(self, rows):
        self.walk_records = _Table(rows)
        self.auth = _Auth({"token-a": USER_A, "token-b": USER_B})

    def table(self, name):
        assert name == "walk_records"
        return self.walk_records.query()


def _row(**over):
    base = {
        "id": WALK_ID,
        "user_id": USER_A,
        "route_coords": copy.deepcopy(LONG_ROUTE),
        "is_public": False,
        "public_route_coords": None,
    }
    base.update(over)
    return base


@pytest.fixture
def fake(monkeypatch):
    fk = FakeSupabase([_row()])
    monkeypatch.setattr(main, "_supabase_client", lambda: fk)
    return fk


# ---- 서비스 함수 ----

def test_verify_user_returns_user_id_for_valid_token():
    assert verify_user(FakeSupabase([]), "token-a") == USER_A


@pytest.mark.parametrize("token", ["", None, "bad-token"])
def test_verify_user_rejects_missing_or_bad_token(token):
    with pytest.raises(WalkShareError) as e:
        verify_user(FakeSupabase([]), token)
    assert e.value.status == 401


def test_share_walk_writes_masked_coords_not_raw():
    fk = FakeSupabase([_row()])
    result = share_walk(fk, USER_A, WALK_ID)
    stored = fk.walk_records.rows[0]
    assert stored["is_public"] is True
    assert stored["public_route_coords"] and len(stored["public_route_coords"]) < len(LONG_ROUTE)
    # 공개 좌표에 출발점·도착점 원본이 없어야 한다.
    assert LONG_ROUTE[0] not in stored["public_route_coords"]
    assert LONG_ROUTE[-1] not in stored["public_route_coords"]
    # 원본은 그대로 비공개 칸에 남는다.
    assert stored["route_coords"] == LONG_ROUTE
    assert result["is_public"] is True and result["masked_point_count"] == len(stored["public_route_coords"])


def test_share_walk_refuses_other_users_record():
    fk = FakeSupabase([_row()])
    with pytest.raises(WalkShareError) as e:
        share_walk(fk, USER_B, WALK_ID)
    assert e.value.status == 404  # 남의 기록 존재 여부를 알려 주지 않는다
    assert fk.walk_records.updates == []


def test_share_walk_unknown_id_is_404():
    with pytest.raises(WalkShareError) as e:
        share_walk(FakeSupabase([_row()]), USER_A, str(uuid.uuid4()))
    assert e.value.status == 404


def test_share_walk_refuses_when_masking_leaves_nothing():
    fk = FakeSupabase([_row(route_coords=copy.deepcopy(SHORT_ROUTE))])
    with pytest.raises(WalkShareError) as e:
        share_walk(fk, USER_A, WALK_ID)
    assert e.value.status == 422 and e.value.code == "ROUTE_TOO_SHORT_TO_MASK"
    assert fk.walk_records.updates == []
    assert fk.walk_records.rows[0]["is_public"] is False


@pytest.mark.parametrize(
    "bad",
    [None, [], "x", [[127.0]], [[127.0, 36.0], [200.0, 91.0], [127.1, 36.1], [127.2, 36.2]], [["a", "b"]] * 5],
)
def test_share_walk_rejects_malformed_route(bad):
    fk = FakeSupabase([_row(route_coords=bad)])
    with pytest.raises(WalkShareError) as e:
        share_walk(fk, USER_A, WALK_ID)
    assert e.value.status == 422 and e.value.code == "INVALID_ROUTE"
    assert fk.walk_records.updates == []


def test_unshare_clears_public_fields():
    fk = FakeSupabase([_row(is_public=True, public_route_coords=[[1.0, 2.0], [3.0, 4.0]])])
    result = unshare_walk(fk, USER_A, WALK_ID)
    stored = fk.walk_records.rows[0]
    assert stored["is_public"] is False and stored["public_route_coords"] is None
    assert result["is_public"] is False


def test_unshare_refuses_other_users_record():
    fk = FakeSupabase([_row(is_public=True, public_route_coords=[[1.0, 2.0], [3.0, 4.0]])])
    with pytest.raises(WalkShareError) as e:
        unshare_walk(fk, USER_B, WALK_ID)
    assert e.value.status == 404
    assert fk.walk_records.rows[0]["is_public"] is True


# ---- API ----

def test_api_share_requires_bearer_token(fake):
    res = client.post(f"/api/v1/walks/{WALK_ID}/share")
    assert res.status_code == 401


def test_api_share_success_and_unshare(fake):
    h = {"Authorization": "Bearer token-a"}
    res = client.post(f"/api/v1/walks/{WALK_ID}/share", headers=h)
    assert res.status_code == 200
    body = res.json()
    assert body["is_public"] is True and "route_coords" not in body and "public_route_coords" not in body
    res = client.post(f"/api/v1/walks/{WALK_ID}/unshare", headers=h)
    assert res.status_code == 200 and res.json()["is_public"] is False


def test_api_share_other_user_gets_404(fake):
    res = client.post(f"/api/v1/walks/{WALK_ID}/share", headers={"Authorization": "Bearer token-b"})
    assert res.status_code == 404


def test_api_share_invalid_walk_id_is_422(fake):
    res = client.post("/api/v1/walks/not-a-uuid/share", headers={"Authorization": "Bearer token-a"})
    assert res.status_code == 422


def test_api_share_returns_503_when_database_not_connected(monkeypatch):
    monkeypatch.setattr(main, "_supabase_client", lambda: None)
    res = client.post(f"/api/v1/walks/{WALK_ID}/share", headers={"Authorization": "Bearer token-a"})
    assert res.status_code == 503
