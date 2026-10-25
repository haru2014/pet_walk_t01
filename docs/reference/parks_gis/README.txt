4개 공원 GIS 자료 - 2026-10-15

1) park_locations.geojson: 현재 확인된 대표 위치만 포함. 경계 Polygon이 아님.
  - 세종호수공원, 송강공원, 유림공원: 지도/공공데이터 기반 POINT.
  - 갑천생태호수공원: 대표 좌표가 확인되지 않아 null geometry, 위치를 임의 지정하지 않음.
2) extract_park_boundaries.py: 인터넷에 연결된 컴퓨터에서 실행하면 OSM 폴리곤을 가져와
   *_boundary.geojson, *_vertices.csv, four_park_boundaries.geojson 등을 생성.
3) park_source_status.csv: 지도 객체 ID, 출처, 추출 상태.
4) park_source_status.xlsx: 동일 정보의 확인용 스프레드시트.

설치·실행:
  pip install requests shapely
  python extract_park_boundaries.py

주의:
- 현재 환경에서는 OSM API가 접근 제한되므로 경계 꼭짓점 데이터는 확인 후 생성되지 않았음.
- OSM에 신규 공원이 등록되지 않았거나 이름이 다르면 자동 추출 실패 가능.
- 여러 후보 경계가 나오면 *_candidates.json을 보고 사람이 확인한 후 선택해야 함.
- 산책로(LineString) 데이터 및 공식 지정 공원 경계는 별도 검증이 필요.
- GeoJSON WGS84 / EPSG:4326, coordinates [경도, 위도].
- OSM 데이터 이용 시 ODbL 1.0 저작자 표시 및 라이선스 조건 준수.

출처:
한국철도공사 공공데이터(세종호수공원 위치): https://qbh.purpleo.kr/article/138992
OSM 송강공원: https://www.openstreetmap.org/way/564388430
OSM 유림공원: https://www.openstreetmap.org/way/49323607
대전시 갑천생태호수공원: https://www.daejeon.go.kr/glPark/index.do
