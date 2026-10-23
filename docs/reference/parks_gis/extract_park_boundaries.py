#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공원 4곳 OSM 경계 폴리곤 추출 (실행 PC에 인터넷 필요).
  pip install requests shapely
  python extract_park_boundaries.py
검증 가능한 OSM 경계만 GeoJSON으로 내보냅니다. 지도 경계와 법적 공원 경계가 같다는 보장은 없습니다.
"""
from __future__ import annotations
import csv, json, math, time
from datetime import datetime, timezone
from pathlib import Path
import requests
from shapely.geometry import Polygon, MultiPolygon, LineString, mapping
from shapely.ops import polygonize, unary_union

OUT = Path(__file__).resolve().parent
APIS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
]
UA = {'User-Agent': 'PetWalkMVP-ParkGIS/0.1 (one-time manual extraction)'}
PARKS = [
    dict(id='sejong_lake', name='세종호수공원', known=None,
         bbox=(36.48,127.25,36.52,127.30),
         pattern='^(세종호수공원|호수공원|Sejong Lake Park)$',
         fallback_names=['세종호수공원', 'Sejong Lake Park']),
    dict(id='doan_gapcheon_lake', name='갑천생태호수공원(도안호수공원)', known=None,
         bbox=(36.30,127.30,36.38,127.39),
         pattern='^(갑천생태호수공원|갑천 생태호수공원|갑천호수공원|도안호수공원|Gapcheon Ecological Lake Park)$',
         fallback_names=['갑천생태호수공원','도안호수공원']),
    dict(id='songgang', name='송강공원(송강동 근린공원)', known=564388430,
         bbox=(36.42,127.37,36.45,127.40),pattern='',fallback_names=[]),
    dict(id='yurim', name='대전 유림공원', known=49323607,
         bbox=(36.35,127.34,36.38,127.38),pattern='',fallback_names=[]),
]

def ask_overpass(query):
    failures = []
    for endpoint in APIS:
        try:
            res = requests.post(endpoint, data={'data':query}, timeout=95, headers=UA)
            res.raise_for_status()
            val = res.json()
            if 'elements' not in val: raise ValueError('elements 없음')
            return val['elements'], endpoint
        except (requests.RequestException, ValueError) as exc:
            failures.append(f'{endpoint}: {str(exc)[:100]}')
    raise RuntimeError('API 모두 실패: ' + ' | '.join(failures))

def query_for(p):
    if p['known']:
        return '[out:json][timeout:60];way('+str(p['known'])+');out geom;'
    s,w,n,e = p['bbox']
    bbox = f'({s},{w},{n},{e})'
    # 이름으로 검색하므로 한글/영문 명칭이 없으면 검색되지 않습니다.
    return (f'[out:json][timeout:60];('
            f'way["name"~"{p["pattern"]}"]{bbox};'
            f'relation["name"~"{p["pattern"]}"]{bbox};'
            f');out geom;')

def rings_from_geometry(geom):
    coords = [(point['lon'],point['lat']) for point in geom]
    return coords

def extract_shape(el):
    """정확히 닫힌 경계 또는 multipolygon relation의 outer/inner를 추출."""
    if el['type'] == 'way':
        pts = rings_from_geometry(el.get('geometry', []))
        if len(pts)<4 or pts[0]!=pts[-1]: return None
        g = Polygon(pts)
        return g if g.is_valid and g.area > 0 else None
    if el['type'] != 'relation': return None
    members = el.get('members', [])
    outers, inners = [], []
    for m in members:
        pts = rings_from_geometry(m.get('geometry', []))
        if len(pts)<2: continue
        seg=LineString(pts)
        if m.get('role')=='inner': inners.append(seg)
        else: outers.append(seg)
    if not outers: return None
    # polygonize는 여러 외곽선 조각을 이어 닫힌 링만 채택합니다.
    outerpoly = list(polygonize(unary_union(outers)))
    if not outerpoly: return None
    g=unary_union(outerpoly)
    if inners:
        ip=list(polygonize(unary_union(inners)))
        if ip: g=g.difference(unary_union(ip))
    return g if g.is_valid and not g.is_empty and g.area>0 else None

def area_m2(g):
    # 주의: 간단한 평면 근사 면적. 공식 지적 면적과 대체 불가.
    c=g.centroid
    return round(g.area * (111320**2) * math.cos(math.radians(c.y)))

def get_park(p):
    els, endpoint=ask_overpass(query_for(p))
    polygons = []
    for el in els:
        g=extract_shape(el)
        if not g: continue
        if not p['known'] and not any(word in el.get('tags',{}).get('name','') for word in p['fallback_names']):
            continue
        polygons.append((el, g))
    if not polygons: return None, '경계 폴리곤 없음 (이름 미등록 또는 데이터 누락)', endpoint
    if len(polygons)>1:
        # 이름이 같은 별개 공원/호수 객체들이 발견된 경우 자동 선택하지 않음.
        candidates=[{'type':el['type'],'osm_id':el['id'],'name':el.get('tags',{}).get('name'), 'area_est_m2':area_m2(g)} for el,g in polygons]
        (OUT/f'{p["id"]}_candidates.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2),encoding='utf-8')
        return None, '복수 폴리곤 발견: *_candidates.json 검토 필요', endpoint
    el,g=polygons[0]
    f={'type':'Feature','properties':{
        'park_id':p['id'],'name':p['name'], 'source':'OpenStreetMap',
        'osm_type':el['type'], 'osm_id':el['id'], 'osm_url':f'https://www.openstreetmap.org/{el["type"]}/{el["id"]}',
        'license':'ODbL 1.0','status':'OSM 비공식 공원 경계 (법적 경계 미검증)',
        'area_approx_m2':area_m2(g), 'extracted_utc':datetime.now(timezone.utc).isoformat()
    },'geometry':mapping(g)}
    return f, '추출 성공', endpoint

def main():
    fc={'type':'FeatureCollection','name':'4개 공원 OSM 경계(확인된 객체만)', 'features':[]}
    rows=[]
    for p in PARKS:
        try:
            f,status,endpoint=get_park(p)
            if f:
                fc['features'].append(f)
                (OUT/f'{p["id"]}_boundary.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[f]},ensure_ascii=False,indent=2),encoding='utf-8')
                coords=[]
                geometry=f['geometry']
                if geometry['type']=='Polygon': polys=[geometry['coordinates']]
                elif geometry['type']=='MultiPolygon': polys=geometry['coordinates']
                else: polys=[]
                for polygon_i,polygon in enumerate(polys):
                    for ring_i,ring in enumerate(polygon):
                        for vertex_i, (lon,lat) in enumerate(ring):
                            coords.append((p['name'],p['id'],polygon_i,ring_i,vertex_i,lat,lon))
                with (OUT/f'{p["id"]}_vertices.csv').open('w',newline='',encoding='utf-8-sig') as fp:
                    writer=csv.writer(fp);writer.writerow(['공원','park_id','polygon_no','ring_no','vertex_no','latitude','longitude']);writer.writerows(coords)
            rows.append([p['name'],status,endpoint,f['properties']['osm_url'] if f else ''])
            print(f'{p["name"]}: {status}')
        except Exception as e:
            rows.append([p['name'],'API 호출 실패: '+str(e), '', ''])
            print(f'{p["name"]}: 호출 오류: {e}')
        time.sleep(2)
    (OUT/'four_park_boundaries.geojson').write_text(json.dumps(fc,ensure_ascii=False,indent=2),encoding='utf-8')
    with (OUT/'extraction_result.csv').open('w',newline='',encoding='utf-8-sig') as fp:
        writer=csv.writer(fp);writer.writerow(['공원','추출결과','API','OSM URL']);writer.writerows(rows)
    print(f'완료: {len(fc["features"])}개 공원 확인된 경계 추출')

if __name__=='__main__':main()
