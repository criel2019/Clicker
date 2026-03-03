/**
 * convert_stories.js - 수정본 txt 파일을 게임 JS 노드 형식으로 변환
 *
 * 각 신수별 최신 버전 txt 파일을 읽어서 story_*.js 파일을 생성합니다.
 * 기존 JS 파일의 전투/날씨/장소 노드는 적절한 위치에 자동 삽입합니다.
 *
 * Usage: node convert_stories.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 설정
// ============================================================

const MODIFIED_DIR = path.join(__dirname, 'stories', '최종본', '수정본');
const ORIGINAL_DIR = path.join(__dirname, 'stories', '최종본');
const JS_DIR = path.join(__dirname, 'js');

// 신수 정보
const BEASTS = [
  {
    key: 'cheongryong', name: '청룡', speaker: '청룡',
    upper: { prefix: '청룡_상', chapters: ['1장', '2장', '3장', '4장', '5장'] },
    lower: { prefix: '청룡_하', chapters: ['6장', '7장', '8장', '9장', '10장'] }
  },
  {
    key: 'baekho', name: '백호', speaker: '백호',
    upper: { prefix: '백호_상', chapters: ['1장', '2장', '3장', '4장', '5장'] },
    lower: { prefix: '백호_하', chapters: ['6장', '7장', '8장', '9장', '10장'] }
  },
  {
    key: 'jujak', name: '주작', speaker: '주작',
    upper: { prefix: '주작_상', chapters: ['서막', '1장', '2장', '3장', '4장', '5장'] },
    lower: { prefix: '주작_하', chapters: ['6장', '7장', '8장', '9장', '10장'] }
  },
  {
    key: 'hyeonmu', name: '현무', speaker: '현무',
    upper: { prefix: '현무_상', chapters: ['1장', '2장', '3장', '4장', '5장'] },
    lower: { prefix: '현무_하', chapters: ['6장', '7장', '8장', '9장', '10장'] }
  },
  {
    key: 'hwangryong', name: '황룡', speaker: '황룡',
    upper: { prefix: '황룡_상', chapters: ['1장', '2장', '3장', '4장', '5장'] },
    lower: { prefix: '황룡_하', chapters: ['6장', '7장', '8장', '9장', '10장'] }
  },
];

// 계절별 날씨 매핑
const SEASON_WEATHER = {
  '봄': 'clear',
  '여름': 'clear',
  '가을': 'cloudy',
  '겨울': 'snow',
};

// 신수별 전투 배치 (챕터 인덱스 0-based, 적 데이터)
const COMBAT_DATA = {
  cheongryong: [
    { chapter: 2, enemy: { name: '산적 두목', hp: 80, attack: 10 } },
    { chapter: 4, enemy: { name: '해적 간부', hp: 120, attack: 14 } },
    { chapter: 6, enemy: { name: '탑의 파수꾼', hp: 150, attack: 18 } },
    { chapter: 8, enemy: { name: '폭풍의 시련', hp: 250, attack: 25 } },
  ],
  baekho: [
    { chapter: 2, enemy: { name: '산적', hp: 70, attack: 9 } },
    { chapter: 4, enemy: { name: '저택 호위무사', hp: 100, attack: 13 } },
    { chapter: 6, enemy: { name: '무술대회 결승', hp: 140, attack: 17 } },
    { chapter: 8, enemy: { name: '탑 최상층 수호자', hp: 220, attack: 24 } },
  ],
  jujak: [
    { chapter: 3, enemy: { name: '폐허의 짐승', hp: 90, attack: 11 } },
    { chapter: 5, enemy: { name: '바람의 시련', hp: 130, attack: 15 } },
    { chapter: 7, enemy: { name: '탑의 수호자', hp: 170, attack: 19 } },
    { chapter: 9, enemy: { name: '각성의 불꽃', hp: 260, attack: 26 } },
  ],
  hyeonmu: [
    { chapter: 2, enemy: { name: '독뱀 떼', hp: 60, attack: 8 } },
    { chapter: 4, enemy: { name: '수호 뱀', hp: 110, attack: 12 } },
    { chapter: 7, enemy: { name: '탑의 안개', hp: 160, attack: 18 } },
    { chapter: 9, enemy: { name: '독왕', hp: 240, attack: 23 } },
  ],
  hwangryong: [
    { chapter: 2, enemy: { name: '도적단', hp: 75, attack: 9 } },
    { chapter: 4, enemy: { name: '용맥의 수호자', hp: 120, attack: 14 } },
    { chapter: 6, enemy: { name: '탑의 시련', hp: 155, attack: 17 } },
    { chapter: 8, enemy: { name: '천둥의 시련', hp: 230, attack: 24 } },
  ],
};

// ============================================================
// 파일 탐색
// ============================================================

/**
 * 주어진 prefix와 chapter에 대해 최신 버전 파일을 찾음
 */
function findLatestFile(prefix, chapter) {
  const files = fs.readdirSync(MODIFIED_DIR);
  const pattern = new RegExp(`^${escapeRegex(prefix)}_${escapeRegex(chapter)}_v(\\d+)\\.txt$`);

  let maxVer = 0;
  let bestFile = null;

  for (const f of files) {
    const m = f.match(pattern);
    if (m) {
      const ver = parseInt(m[1]);
      if (ver > maxVer) {
        maxVer = ver;
        bestFile = f;
      }
    }
  }

  return bestFile ? path.join(MODIFIED_DIR, bestFile) : null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 원본 txt에서 해당 장 내용을 추출 (수정본이 없는 경우 폴백)
 */
function extractChapterFromOriginal(originalFile, chapterName) {
  if (!fs.existsSync(originalFile)) return null;

  const content = fs.readFileSync(originalFile, 'utf8');
  const lines = content.split('\n');

  // 장 시작 찾기
  const chapterPattern = new RegExp(`^={3,}\\s*$|^${escapeRegex(chapterName)}[.．]|^${escapeRegex(chapterName)}\\s`);
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(chapterName)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  // 다음 장 시작 찾기
  const nextChapterNum = parseInt(chapterName.replace(/\D/g, '')) + 1;
  const nextPattern = `${nextChapterNum}장`;

  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].includes(nextPattern) && (lines[i].includes('===') || lines[i-1]?.includes('===') || lines[i+1]?.includes('==='))) {
      endIdx = i - 1;
      break;
    }
    // 또는 === 줄 후 다음 장 제목
    if (i > startIdx + 5 && /^={10,}/.test(lines[i]) && i + 1 < lines.length && lines[i+1].match(/^\d+장/)) {
      endIdx = i - 1;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join('\n');
}

// ============================================================
// 텍스트 파싱 → 노드 변환
// ============================================================

/**
 * 텍스트 내용을 게임 노드 배열로 변환
 */
function parseTextToNodes(text, beastSpeaker) {
  const nodes = [];
  const lines = text.split('\n');

  // 전략: 파일 전체에서 실제 장 제목 줄을 찾고, 그 다음부터 파싱
  // 장 제목 패턴: "1장. 봄 — 해적단의 막내" 또는 "6장 : 가을 — 봄부터"
  let contentStart = 0;

  // 1단계: 모든 장 제목 후보 찾기
  const chapterTitleCandidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // "N장." 또는 "N장 :" 또는 "N장 —" 패턴 (줄 시작)
    if (/^\d+장[\s.．:：—\-─]/.test(line)) {
      chapterTitleCandidates.push(i);
    }
    // "서막" 으로 시작하는 줄
    if (/^서막[\s.．:：—\-─]/.test(line) || line === '서막') {
      chapterTitleCandidates.push(i);
    }
  }

  if (chapterTitleCandidates.length > 0) {
    // 마지막 후보를 사용 (수정 요약 속의 참조가 아닌 실제 제목)
    // 단, 파일의 앞쪽 30% 이내에 있는 후보 중 마지막 것
    const cutoff = Math.max(Math.floor(lines.length * 0.3), 50);
    let bestIdx = chapterTitleCandidates[0];
    for (const idx of chapterTitleCandidates) {
      if (idx <= cutoff) bestIdx = idx;
    }
    contentStart = bestIdx + 1;
    // 바로 다음 줄이 구분선이면 스킵
    while (contentStart < lines.length && /^[=━─]{3,}$/.test(lines[contentStart].trim())) {
      contentStart++;
    }
  } else {
    // 장 제목을 못 찾으면: 수정 요약/메타데이터를 건너뛰고 첫 본문 찾기
    const skipPatterns = [
      /^[=━]{5,}/,              // 구분선
      /^\[v\d/,                  // [v6 수정 요약]
      /^-\s*수정/,              // - 수정1:
      /^총 변경/,               // 총 변경:
      /^※/,                     // 주석
      /^\d+\.\s/,               // 번호 매기기 (수정 목록)
      /수정/,                   // 수정 관련
      /기대\s*효과/,            // 기대 효과
      /타겟\s*평가/,            // 타겟 평가자
      /최종본/,
      /수정본/,
      /상권|하권/,
      /^청룡|^백호|^주작|^현무|^황룡/,  // 신수 이름으로 시작하는 제목 줄
      /靑龍|白虎|朱雀|玄武|黃龍/,       // 한자 제목
      /겨\s*울|봄|여\s*름|가\s*을/,     // 글자 사이 띄어쓴 계절 (대제목)
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      if (line === '---') continue;

      let isHeader = false;
      for (const pat of skipPatterns) {
        if (pat.test(line)) { isHeader = true; break; }
      }
      if (isHeader) continue;

      // 실제 본문 시작: 서술이나 대사
      if (line.length > 0) {
        contentStart = i;
        break;
      }
    }
  }

  // 내용 파싱
  let currentParagraph = '';

  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i].trim();

    // 구분선 (===, ━━━, ---) → 장면 전환
    if (/^[=━─-]{3,}$/.test(line)) {
      if (currentParagraph) {
        addTextNode(nodes, currentParagraph, beastSpeaker);
        currentParagraph = '';
      }
      continue;
    }

    // 다음 장 헤더 감지 → 중단
    if (/^\d+장[.．\s]/.test(line) && i > contentStart + 10) {
      break;
    }

    // 빈 줄 → 단락 구분
    if (line === '') {
      if (currentParagraph) {
        addTextNode(nodes, currentParagraph, beastSpeaker);
        currentParagraph = '';
      }
      continue;
    }

    // 시스템 창 【 】
    if (line.includes('【') && line.includes('】')) {
      if (currentParagraph) {
        addTextNode(nodes, currentParagraph, beastSpeaker);
        currentParagraph = '';
      }
      nodes.push({ type: 'effect', effect: 'system', text: line });
      continue;
    }

    // 일반 텍스트
    if (currentParagraph) {
      currentParagraph += ' ' + line;
    } else {
      currentParagraph = line;
    }
  }

  // 마지막 단락
  if (currentParagraph) {
    addTextNode(nodes, currentParagraph, beastSpeaker);
  }

  return nodes;
}

/**
 * 텍스트를 적절한 노드로 변환하여 추가
 */
function addTextNode(nodes, text, beastSpeaker) {
  text = text.trim();
  if (!text) return;

  // 대사 감지: "..."로 시작하는 경우
  const isDialogue = text.startsWith('"') || text.startsWith('\u201C');

  // 독백 감지: '...'로 감싸진 경우
  const isMonologue = text.startsWith("'") && text.endsWith("'") && text.length > 2;

  // speaker 판별: 대사 직전 줄에 화자 힌트가 있으면 (이전 노드 기반)
  let speaker = '';

  if (isDialogue) {
    // 이전 노드를 확인하여 화자 추정
    const prev = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    if (prev && prev.type === 'text' && prev.speaker === '') {
      const prevText = prev.text;
      // 신수 이름이 이전 서술에 나오면 speaker 설정
      if (prevText.includes('청이') || prevText.includes('청룡이') || prevText.includes('청이 ')) {
        if (beastSpeaker === '청룡') speaker = '청룡';
      }
      if (prevText.includes('호가') || prevText.includes('호의') || prevText.includes('호가 ')) {
        if (beastSpeaker === '백호') speaker = '백호';
      }
      if (prevText.includes('현무가') || prevText.includes('현무의') || prevText.includes('현무가 ')) {
        if (beastSpeaker === '현무') speaker = '현무';
      }
      if (prevText.includes('주작이') || prevText.includes('새가')) {
        if (beastSpeaker === '주작') speaker = '주작';
      }
      if (prevText.includes('용이') || prevText.includes('황룡이')) {
        if (beastSpeaker === '황룡') speaker = '황룡';
      }
    }
  }

  nodes.push({ type: 'text', speaker: speaker, text: text });
}

// ============================================================
// 장 제목 추출
// ============================================================

function extractChapterTitle(text, chapterName) {
  const lines = text.split('\n');
  // 장 제목 형식: "6장. 가을 — 마음이 열리다" 또는 "6장 : 가을 — 봄부터"
  const chNum = chapterName.replace(/\D/g, '');
  const titlePattern = chNum
    ? new RegExp(`^${chNum}장[\\s.．:：—\\-─]`)
    : /^서막[\s.．:：—\-─]/;

  // 뒤에서부터 찾기 (수정 요약의 참조가 아닌 실제 제목)
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (titlePattern.test(trimmed)) {
      const cleaned = trimmed.replace(/^[=━]+\s*/, '').replace(/\s*[=━]+$/, '').trim();
      if (cleaned.length > 2 && cleaned.length < 100) {
        candidates.push(cleaned);
      }
    }
  }

  // 마지막 후보가 실제 제목일 가능성이 높음
  if (candidates.length > 0) {
    // 가장 긴 후보 선택 (부제가 포함된 것이 실제 제목)
    return candidates.reduce((a, b) => a.length >= b.length ? a : b);
  }

  return `${chapterName}`;
}

/**
 * 장 제목에서 계절 추출
 */
function extractSeason(title) {
  for (const season of ['봄', '여름', '가을', '겨울']) {
    if (title.includes(season)) return season;
  }
  return null;
}

// ============================================================
// 전투 노드 삽입
// ============================================================

function insertCombatNodes(nodes, chapterIdx, beastKey) {
  const combats = COMBAT_DATA[beastKey] || [];
  const combat = combats.find(c => c.chapter === chapterIdx);

  if (!combat) return nodes;

  // 전투 관련 키워드 검색하여 적절한 위치에 삽입
  const combatKeywords = ['전투', '싸움', '싸웠다', '공격', '적', '검을', '주먹', '부딪', '돌진', '격파', '쓰러', '맞서'];
  let insertIdx = Math.floor(nodes.length * 0.6); // 기본: 60% 지점

  for (let i = Math.floor(nodes.length * 0.3); i < Math.floor(nodes.length * 0.8); i++) {
    if (nodes[i].type === 'text') {
      const hasKeyword = combatKeywords.some(kw => nodes[i].text.includes(kw));
      if (hasKeyword) {
        insertIdx = i;
        break;
      }
    }
  }

  // shake 효과 + 전투 노드 삽입
  nodes.splice(insertIdx, 0,
    { type: 'effect', effect: 'shake' },
    { type: 'combat', enemy: combat.enemy }
  );

  return nodes;
}

// ============================================================
// JS 파일 생성
// ============================================================

function escapeJsString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/\t/g, '\\t');
}

function generateStoryJS(beastKey, beastName, chapters) {
  const lines = [];
  const totalNodes = chapters.reduce((sum, ch) => sum + ch.nodes.length, 0);

  lines.push(`// ${beastName} 스토리 데이터 (메타데이터 자동 삽입)`);
  lines.push(`// 총 ${chapters.length}장, ${totalNodes}개 노드`);
  lines.push('');
  lines.push(`Story.chapters.${beastKey} = [`);

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    lines.push('  {');
    lines.push(`    title: '${escapeJsString(ch.title)}',`);
    lines.push('    nodes: [');

    for (const node of ch.nodes) {
      if (node.type === 'text') {
        lines.push(`      { type: 'text', speaker: '${escapeJsString(node.speaker || '')}', text: '${escapeJsString(node.text)}' },`);
      } else if (node.type === 'location') {
        lines.push(`      { type: 'location', name: '${escapeJsString(node.name)}' },`);
      } else if (node.type === 'weather') {
        lines.push(`      { type: 'weather', weather: '${escapeJsString(node.weather)}' },`);
      } else if (node.type === 'effect') {
        if (node.text) {
          lines.push(`      { type: 'effect', effect: '${escapeJsString(node.effect)}', text: '${escapeJsString(node.text)}' },`);
        } else {
          lines.push(`      { type: 'effect', effect: '${escapeJsString(node.effect)}' },`);
        }
      } else if (node.type === 'combat') {
        lines.push(`      { type: 'combat', enemy: ${JSON.stringify(node.enemy)} },`);
      } else if (node.type === 'cutscene') {
        lines.push(`      { type: 'cutscene', id: '${escapeJsString(node.id || '')}' },`);
      } else {
        lines.push(`      ${JSON.stringify(node)},`);
      }
    }

    lines.push('    ]');
    lines.push(`  },`);
  }

  lines.push('];');
  return lines.join('\n') + '\n';
}

// ============================================================
// 메인 처리
// ============================================================

function processBeast(beast) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`처리 중: ${beast.name} (${beast.key})`);
  console.log('='.repeat(60));

  const allChapters = [];

  // 상권
  for (let i = 0; i < beast.upper.chapters.length; i++) {
    const chapterName = beast.upper.chapters[i];
    const filePath = findLatestFile(beast.upper.prefix, chapterName);

    if (filePath) {
      console.log(`  ${chapterName}: ${path.basename(filePath)}`);
      const content = fs.readFileSync(filePath, 'utf8');
      const title = extractChapterTitle(content, chapterName);
      let nodes = parseTextToNodes(content, beast.speaker);

      // 날씨 추가
      const season = extractSeason(title);
      if (season && SEASON_WEATHER[season]) {
        nodes.unshift({ type: 'weather', weather: SEASON_WEATHER[season] });
      }

      // 전투 삽입
      const chapterIdx = chapterName === '서막' ? 0 : parseInt(chapterName);
      nodes = insertCombatNodes(nodes, chapterIdx - 1, beast.key);

      allChapters.push({ title, nodes });
    } else {
      // 원본에서 추출 시도
      const originalFile = path.join(ORIGINAL_DIR, `${beast.upper.prefix.replace('_상', '_상')}.txt`);
      console.log(`  ${chapterName}: 수정본 없음, 원본에서 추출 시도...`);
      const content = extractChapterFromOriginal(originalFile, chapterName);
      if (content) {
        const title = extractChapterTitle(content, chapterName);
        let nodes = parseTextToNodes(content, beast.speaker);
        const season = extractSeason(title);
        if (season && SEASON_WEATHER[season]) {
          nodes.unshift({ type: 'weather', weather: SEASON_WEATHER[season] });
        }
        allChapters.push({ title, nodes });
      } else {
        console.log(`    WARNING: ${chapterName} 내용을 찾을 수 없음!`);
        allChapters.push({ title: chapterName, nodes: [{ type: 'text', speaker: '', text: '(내용 준비 중)' }] });
      }
    }
  }

  // 하권
  for (let i = 0; i < beast.lower.chapters.length; i++) {
    const chapterName = beast.lower.chapters[i];
    const filePath = findLatestFile(beast.lower.prefix, chapterName);

    if (filePath) {
      console.log(`  ${chapterName}: ${path.basename(filePath)}`);
      const content = fs.readFileSync(filePath, 'utf8');
      const title = extractChapterTitle(content, chapterName);
      let nodes = parseTextToNodes(content, beast.speaker);

      const season = extractSeason(title);
      if (season && SEASON_WEATHER[season]) {
        nodes.unshift({ type: 'weather', weather: SEASON_WEATHER[season] });
      }

      const chapterIdx = parseInt(chapterName);
      nodes = insertCombatNodes(nodes, chapterIdx - 1, beast.key);

      allChapters.push({ title, nodes });
    } else {
      const originalFile = path.join(ORIGINAL_DIR, `${beast.lower.prefix.replace('_하', '_하')}.txt`);
      console.log(`  ${chapterName}: 수정본 없음, 원본에서 추출 시도...`);
      const content = extractChapterFromOriginal(originalFile, chapterName);
      if (content) {
        const title = extractChapterTitle(content, chapterName);
        let nodes = parseTextToNodes(content, beast.speaker);
        const season = extractSeason(title);
        if (season && SEASON_WEATHER[season]) {
          nodes.unshift({ type: 'weather', weather: SEASON_WEATHER[season] });
        }
        allChapters.push({ title, nodes });
      } else {
        console.log(`    WARNING: ${chapterName} 내용을 찾을 수 없음!`);
        allChapters.push({ title: chapterName, nodes: [{ type: 'text', speaker: '', text: '(내용 준비 중)' }] });
      }
    }
  }

  // JS 파일 생성
  const jsContent = generateStoryJS(beast.key, beast.name, allChapters);
  const outputPath = path.join(JS_DIR, `story_${beast.key}.js`);

  // 백업
  if (fs.existsSync(outputPath)) {
    const backupPath = outputPath + '.bak';
    fs.copyFileSync(outputPath, backupPath);
    console.log(`  백업: ${path.basename(backupPath)}`);
  }

  fs.writeFileSync(outputPath, jsContent, 'utf8');

  const totalNodes = allChapters.reduce((sum, ch) => sum + ch.nodes.length, 0);
  console.log(`  저장: story_${beast.key}.js (${allChapters.length}장, ${totalNodes}개 노드)`);

  return { key: beast.key, chapters: allChapters.length, nodes: totalNodes };
}

// ============================================================
// 실행
// ============================================================

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║     수정본 → 게임 스토리 변환기 v1.0                   ║');
console.log('║     최신 txt 파일을 story_*.js로 변환합니다            ║');
console.log('╚══════════════════════════════════════════════════════════╝');

const results = [];
for (const beast of BEASTS) {
  try {
    const result = processBeast(beast);
    results.push(result);
  } catch (e) {
    console.error(`오류 (${beast.name}):`, e.message);
    results.push({ key: beast.key, chapters: 0, nodes: 0, error: e.message });
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('변환 완료 요약');
console.log('='.repeat(60));
for (const r of results) {
  if (r.error) {
    console.log(`  ${r.key}: 오류 - ${r.error}`);
  } else {
    console.log(`  ${r.key}: ${r.chapters}장, ${r.nodes}개 노드`);
  }
}
const totalNodes = results.reduce((s, r) => s + (r.nodes || 0), 0);
console.log(`  전체: ${totalNodes}개 노드`);
