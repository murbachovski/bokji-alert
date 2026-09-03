#!/usr/bin/env node
/**
 * PreToolUse hook: enforce the fixed KakaoTalk message contract.
 *
 * The user-defined message format is non-negotiable:
 *
 *   - 요청 사항
 *   {검색 조건 요약}
 *
 *   - 요청 답변
 *   {N건 추천 → URL}
 *
 * A prompt instruction alone cannot guarantee this, so the hook inspects every
 * KakaotalkChat-MemoChat call and denies any message that does not match.
 *
 * Length limit: the MCP tool documents "최대 200자". Measured against the live API
 * (87 chars / 233 bytes of Korean sent successfully), so the unit is characters,
 * not bytes. Overridable via BOKJI_MSG_LIMIT_CHARS.
 *
 * The answer block must carry the report link. The 200-char cap means the message
 * cannot hold the listings themselves, so a message without a link is a message
 * with nothing behind it -- which is exactly what happens when the artifact step
 * gets skipped. Requiring the URL here makes that skip impossible: the send is
 * blocked until the report exists. The only exception is the documented
 * zero-result path, which has no report to link to.
 */

const HEADER_REQ = '- 요청 사항';
const HEADER_ANS = '- 요청 답변';

// Deliberately permissive: match the artifact path, not a uuid shape, so a
// future id format does not silently start blocking every send.
const ARTIFACT_URL = /https:\/\/claude\.ai\/code\/artifact\/\S+/;
const NO_RESULT = '조건에 맞는 공고 없음';

// Exact headers, both blocks non-empty, exactly one blank line between them.
const FORMAT = /^- 요청 사항\n(?!\n)[\s\S]*?\n\n- 요청 답변\n(?!\n)[\s\S]*$/;

const TEMPLATE = `${HEADER_REQ}\n{검색 조건 요약}\n\n${HEADER_ANS}\n{N건 추천} → https://claude.ai/code/artifact/{id}`;

const limitChars = Number(process.env.BOKJI_MSG_LIMIT_CHARS) || 200;

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${reason}\n\n반드시 아래 구조 그대로 다시 만들어 재전송하세요. 헤더 문자열 변형·블록 추가·마크다운 장식·이모지 금지.\n\n${TEMPLATE}`,
      },
    }),
  );
  process.exit(0);
}

function validate(message) {
  if (typeof message !== 'string' || message.length === 0) {
    deny('message가 비어 있습니다.');
  }

  if (!FORMAT.test(message)) {
    const problems = [];
    if (!message.startsWith(`${HEADER_REQ}\n`)) {
      problems.push(`첫 줄이 정확히 "${HEADER_REQ}" 여야 합니다.`);
    }
    if (!message.includes(`\n\n${HEADER_ANS}\n`)) {
      problems.push(`빈 줄 하나 뒤에 "${HEADER_ANS}" 줄이 와야 합니다.`);
    }
    deny(
      `카카오톡 메시지 구조가 어긋났습니다.${problems.length ? ' ' + problems.join(' ') : ''}`,
    );
  }

  // Decoration would still satisfy the structural regex, so reject it explicitly:
  // the contract is plain text, and KakaoTalk renders no markdown anyway.
  if (/\*\*|__|^#{1,6} |`/m.test(message)) {
    deny('마크다운 장식(**, __, #, `)은 쓸 수 없습니다. 평문만 허용됩니다.');
  }
  if (/\p{Extended_Pictographic}/u.test(message)) {
    deny('이모지는 쓸 수 없습니다.');
  }
  const headerLines = message.split('\n').filter((line) => /^- 요청 /.test(line));
  if (headerLines.length !== 2) {
    deny(`"- 요청 " 로 시작하는 줄은 헤더 2개뿐이어야 하는데 ${headerLines.length}개입니다. 블록을 추가하지 마세요.`);
  }

  const answer = message.split(`\n\n${HEADER_ANS}\n`)[1] ?? '';
  if (!ARTIFACT_URL.test(answer) && answer.trim() !== NO_RESULT) {
    deny(
      `"요청 답변" 블록에 리포트 링크(https://claude.ai/code/artifact/...)가 없습니다. 카카오톡 200자에는 공고 상세가 들어가지 않으므로 링크가 본문입니다. Artifact 리포트를 먼저 발행하고 그 URL을 넣어 재전송하세요. 검색 결과가 0건일 때만 링크 없이 "${NO_RESULT}" 로 보냅니다.`,
    );
  }

  const chars = [...message].length;
  if (chars > limitChars) {
    deny(
      `메시지가 ${chars}자로 상한 ${limitChars}자를 넘었습니다. 구조와 URL은 그대로 두고 "요청 사항" 요약을 먼저 줄이세요.`,
    );
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Unparseable payload is not the model's fault; let the call through
    // rather than blocking on our own bug.
    process.exit(0);
  }
  validate(payload?.tool_input?.message);
  process.exit(0);
});
