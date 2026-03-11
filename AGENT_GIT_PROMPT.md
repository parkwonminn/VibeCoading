# Git & GitHub 자동 커밋 프롬프트 (검증 완료)

## 환경 정보 (이 PC 기준)

| 항목 | 값 |
|------|-----|
| OS | Windows 10 (PowerShell) |
| Git 경로 | 시스템 PATH 등록됨 (`git version 2.44.0.windows.1`) |
| GitHub CLI 경로 | `C:\gh-cli\bin\gh.exe` |
| Git 사용자 이름 | `parkwonminn` |
| Git 이메일 | `dds05197@naver.com` |
| GitHub 레포지토리 | `https://github.com/parkwonminn/VibeCoading.git` |
| 브랜치 | `master` |

---

## Agent에게 전달할 프롬프트 (복사해서 사용)

```
작업이 완료되면 아래 절차대로 Git 커밋 및 GitHub push까지 자동으로 진행해줘.

[환경 정보]
- OS: Windows 10 / PowerShell
- Git: 설치됨 (git version 2.44.0.windows.1)
- GitHub CLI: C:\gh-cli\bin\gh.exe
- Git 사용자: parkwonminn / dds05197@naver.com
- 원격 저장소: https://github.com/parkwonminn/VibeCoading.git
- 브랜치: master
- 작업 폴더: C:\Users\Administrator\Desktop\바이브코딩\커서

[커밋 절차]
PowerShell 명령어를 사용할 때는 반드시 아래처럼 PATH를 먼저 갱신하고 실행해:
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

1단계 - 변경된 파일 스테이징:
  cd "C:\Users\Administrator\Desktop\바이브코딩\커서"
  git add .

2단계 - 커밋 (메시지는 작업 내용을 반영해서 작성):
  git commit -m "작업 내용을 설명하는 커밋 메시지"

3단계 - GitHub push:
  git push origin master

[주의사항]
- git 명령어가 인식 안 될 경우: PATH 갱신 후 재시도
- GitHub CLI가 필요한 경우: & "C:\gh-cli\bin\gh.exe" 명령어로 실행
- push 인증 오류 시: remote URL에 토큰이 포함되어 있는지 확인
  (현재 remote에 토큰 포함된 URL이 이미 등록되어 있음)
- "Author identity unknown" 오류 시:
  git config --global user.name "parkwonminn"
  git config --global user.email "dds05197@naver.com"

[검증 완료된 전체 명령어 예시]
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
cd "C:\Users\Administrator\Desktop\바이브코딩\커서"
git add .
git commit -m "feat: 작업 내용"
git push origin master
```

---

## 문제 상황별 해결 명령어

### Git이 인식 안 될 때
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
git --version
```

### Git 사용자 정보가 없을 때
```powershell
git config --global user.name "parkwonminn"
git config --global user.email "dds05197@naver.com"
```

### Remote 등록이 안 되어 있을 때
```powershell
git remote add origin https://parkwonminn:YOUR_GITHUB_TOKEN@github.com/parkwonminn/VibeCoading.git
```

### GitHub CLI 인증 확인
```powershell
$env:GH_TOKEN = "YOUR_GITHUB_TOKEN"
& "C:\gh-cli\bin\gh.exe" auth status
```
