@echo off
chcp 65001 > nul
echo ==============================================
echo [1/2] 최신 main 브랜치 동기화 중...
echo ==============================================
git checkout main
if errorlevel 1 (
    echo [오류] main 브랜치 체크아웃 실패
    pause
    exit /b %errorlevel%
)

git pull origin main
if errorlevel 1 (
    echo [오류] origin main pull 실패
    pause
    exit /b %errorlevel%
)

echo.
echo ==============================================
echo [2/2] feat/member4 브랜치로 main 변경사항 병합 중...
echo ==============================================
git checkout feat/member4
if errorlevel 1 (
    echo [오류] feat/member4 브랜치 체크아웃 실패
    pause
    exit /b %errorlevel%
)

git merge main
if errorlevel 1 (
    echo [경고] merge 중 충돌(conflict)이 발생했을 수 있습니다. 충돌을 해결해 주세요.
    pause
    exit /b %errorlevel%
)

echo.
echo ==============================================
echo [완료] 최신 main 동기화가 성공적으로 완료되었습니다!
echo ==============================================
