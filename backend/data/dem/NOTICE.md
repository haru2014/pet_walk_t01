# DEM 데이터 출처 및 이용 고지

## copernicus_glo30_daejeon_sejong.tif

| 항목 | 내용 |
|---|---|
| 원본 | Copernicus DEM GLO-30 (COP-DEM-GLO-30-F, Global 30m Full, Free & Open) |
| 받은 곳 | AWS Open Data `copernicus-dem-30m` 버킷, 타일 `Copernicus_DSM_COG_10_N36_00_E127_00_DEM` |
| 받은 날짜 | 2026-10-15 |
| 가공 | 대전·세종 파일럿 지역(경도 127.170~127.470, 위도 36.220~36.590)만 잘라내고 deflate 압축 |
| 좌표계·해상도 | EPSG:4326, 1 arc-second (약 25m × 31m) |
| 성격 | 지표면 모델(DSM): 건물·나무 높이가 포함되어 있다. 지면 고도가 아니다. |

출처 표기(AWS Registry 권장 형식): Copernicus Digital Elevation Model (DEM) was accessed on 2026-10-15 from https://registry.opendata.aws/copernicus-dem

### 라이선스 의무 고지 (Licence for the use of the Copernicus WorldDEM-30, 6조)

6조 (a) 출처:

> © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

6조 (b) 가공한 자료 (이 파일은 원본을 잘라 가공한 것이다):

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

6조 (c) 면책:

> The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.
>
> (번역) 법률 또는 위임에 따라 Copernicus 프로그램을 담당하는 기관은 Copernicus WorldDEM-30의 어떠한 사용에 대해서도 책임을 지지 않는다.

6조 (d): 이 프로젝트(편안하개)는 Copernicus 프로그램, 제공자 또는 라이선스 부여자로부터 공식 보증·승인을 받은 것이 아니다.

6조 (e): 이 파일을 다시 배포하거나 공개하는 사람도 위 (a)~(d) 의무를 따라야 한다.

## 저장소에 포함하지 않는 자료

- 국토지리정보원 공개DEM (90m, EPSG:5179): 이용 조건을 확인하지 못해 포함하지 않는다 (#76 합의). 필요하면 각자 받아 `DEM_DIR` 폴더에 넣는다.
