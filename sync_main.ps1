# UTF-8 출력 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "[1/2] 최신 main 브랜치 동기화 중..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Error "[오류] main 브랜치 체크아웃 실패"
    exit $LASTEXITCODE
}

git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "[오류] origin main pull 실패"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "[2/2] feat/member4 브랜치로 main 변경사항 병합 중..." -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

git checkout feat/member4
if ($LASTEXITCODE -ne 0) {
    Write-Error "[오류] feat/member4 브랜치 체크아웃 실패"
    exit $LASTEXITCODE
}

git merge main
if ($LASTEXITCODE -ne 0) {
    Write-Warning "[경고] merge 중 충돌(conflict)이 발생했을 수 있습니다. 확인해 주세요."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "[완료] 최신 main 동기화가 성공적으로 완료되었습니다!" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
