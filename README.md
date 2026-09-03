# bokji-alert

조건에 맞는 **대한민국 복지 공고**를 찾아 HTML 리포트로 정리하고, **카카오톡 나챗방**으로 고정 포맷 알림을 보내는 Claude Code 플러그인.

카카오 [PlayMCP](https://playmcp.kakao.com)의 **복지니**(복지로 데이터)와 **카카오톡 나챗방** 도구를 사용한다.

```
/bokji 30세 서울 관악구 청년 주거
```

```
- 요청 사항
서울 관악구 30세 청년 주거 지원

- 요청 답변
3건 추천 → https://claude.ai/code/artifact/c19a4f11-...
```

## 설치

```
/plugin marketplace add murbachovski/bokji-alert
/plugin install bokji-alert@bokji-alert
```

설치 후 `/mcp` → `playmcp` 를 선택해 카카오 계정으로 OAuth 인증한다.

## 전제조건

1. **PlayMCP 도구함에 `복지니` 와 `카카오톡 나챗방` 이 담겨 있어야 한다.**
   게이트웨이는 도구함에 담긴 도구만 노출한다. → https://playmcp.kakao.com/toolbox
2. 카카오 계정 로그인.
3. 리포트 링크(Artifact)를 열려면 claude.ai 로그인이 필요하다. 나챗방은 본인에게 보내는 것이라 그대로 열리지만, 링크를 타인에게 전달하려면 Artifact 공유 설정을 따로 해야 한다.

## 동작

```
/bokji <조건>
   │
   ├─ 1. 프로필 로드      ~/.claude/bokji-profile.json (없으면 1회 수집 후 저장)
   ├─ 2. 복지 검색        bokjini-get_welfare_list  (키워드 1개 + 필터, 재시도 최대 2회)
   ├─ 3. 후보 ≤8건 선별   bokjini-rank_candidates
   ├─ 4. 상위 3건 상세    bokjini-get_welfare_detailed (병렬)
   ├─ 5. HTML 리포트      Artifact 발행 → URL
   └─ 6. 카카오톡 전송    KakaotalkChat-MemoChat (고정 포맷 + URL)
              ↑ PreToolUse 훅이 포맷·길이 검증. 어긋나면 차단하고 교정 후 재전송.
```

`KakaotalkChat-MemoChat` 은 `message` 문자열 하나만 받고 **200자** 제한이 있다(문자 기준 — 실측 확인). 첨부 파라미터가 없어 공고 상세를 본문에 담을 수 없다. 그래서 상세는 HTML 리포트로 빼고 카카오톡에는 링크만 보낸다.

## 메시지 포맷 보장

카카오톡 메시지는 아래 구조를 벗어나지 않는다.

```
- 요청 사항
{검색 조건 요약}

- 요청 답변
{N건 추천} → {리포트 URL}
```

프롬프트 지시만으로는 보장되지 않으므로, `hooks/validate-kakao-format.js` 가 `PreToolUse` 훅으로 모든 전송을 가로채 검사한다.

- 헤더 문자열 정확 일치 (`- 요청 사항`, `- 요청 답변`)
- 두 블록 사이 빈 줄 정확히 하나, 두 블록 모두 비어 있지 않음
- `- 요청 ` 으로 시작하는 줄은 헤더 2개뿐 (블록 추가 금지)
- 마크다운(`**`, `__`, `#`, 백틱)·이모지 금지
- 200자 이내 (`BOKJI_MSG_LIMIT_CHARS` 로 조정 가능)

위반 시 전송을 차단하고 사유와 정확한 템플릿을 돌려주어 교정 후 재전송하게 한다.

> **참고:** 훅은 `mcp__.*__KakaotalkChat-MemoChat` 패턴으로 도구를 잡는다. 이 플러그인의 `.mcp.json` 경유(`mcp__playmcp__...`)와 claude.ai 커스텀 커넥터 경유(`mcp__claude_ai_PlayMCP__...`) 모두 대상이다.

## 프로필

첫 실행 때 나이·시도·시군구·가구상황·관심주제를 한 번 묻고 `~/.claude/bokji-profile.json` 에 저장한다. 이후 실행부터는 묻지 않는다. 플러그인 디렉터리가 아니라 `~/.claude/` 에 두므로 플러그인을 업데이트해도 유지된다.

직접 수정해도 된다:

```json
{
  "age": 30,
  "province": "서울특별시",
  "district": "관악구",
  "household_type": "저소득",
  "interest_theme": "주거"
}
```

## 이미 PlayMCP를 커넥터로 쓰고 있다면

claude.ai 커스텀 커넥터로 PlayMCP를 붙여둔 상태에서 이 플러그인을 설치하면 같은 도구가 두 벌 보인다. 동작에는 지장이 없다. 중복이 싫으면 둘 중 하나만 남긴다.

## 제약

- Artifact 발행은 기본 권한 모드에서 승인 프롬프트가 뜬다. `/bokji` 는 완전 무인 실행이 아니다.
- 카카오톡 전송 대상은 **나에게 보내기(나챗방)** 뿐이다. 타인에게는 보낼 수 없다.
- 리포트(Artifact)는 기본이 비공개다. 휴대폰 카카오톡의 인앱 브라우저에는 claude.ai 세션이 없어 링크가 열리지 않을 수 있다. 그럴 때는 Artifact 공유 메뉴에서 링크 공유를 켠다.
- 복지 데이터는 복지로(bokjiro.go.kr) 기준이며, 실제 신청 자격은 반드시 소관 기관에서 확인해야 한다.

## 라이선스

MIT
