/**
 * merge_nodes.js - 스토리 텍스트 품질 개선 스크립트
 *
 * Phase 1: 스마트 노드 병합 (공격적 연속 서술 병합)
 * Phase 2: 약한 문장 강화 (고립된 짧은 노드 처리)
 *
 * Usage: node merge_nodes.js [--dry-run] [--file <filename>] [--chapter <num>] [--sample]
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 설정
// ============================================================
const CONFIG = {
  MERGE_CAP: 120,            // 병합 결과 최대 글자 수
  MIN_CHAPTER_EDGE: 40,      // 챕터 첫/마지막 노드 최소 길이
  WEAK_THRESHOLD: 15,        // 이 길이 이하 고립 서술 → Phase 2에서 인접 병합
  BOUNDARY_TYPES: new Set(['location', 'weather', 'effect', 'combat', 'cutscene']),
};

// 파일 목록
const STORY_FILES = [
  { file: 'js/story_cheongryong.js', key: 'cheongryong' },
  { file: 'js/story_baekho.js',      key: 'baekho' },
  { file: 'js/story_jujak.js',       key: 'jujak' },
  { file: 'js/story_hyeonmu.js',     key: 'hyeonmu' },
  { file: 'js/story_hwangryong.js',  key: 'hwangryong' },
];

// ============================================================
// 텍스트 분류 헬퍼
// ============================================================

/** 내면 독백인지 (홀따옴표로 감싸진 텍스트) */
function isInnerMonologue(text) {
  const t = text.trim();
  return t.length >= 2 && t.startsWith("'") && t.endsWith("'");
}

/** 대사(큰따옴표)인지 */
function isDialogue(text) {
  const t = text.trim();
  return t.startsWith('"') || t.startsWith('\u201C') || t.startsWith('\u300C');
}

/** 순수 서술 노드인지 (speaker 없고, 대사/독백 아닌) */
function isNarration(node) {
  if (node.type !== 'text') return false;
  if (node.speaker && node.speaker !== '') return false;
  const t = node.text.trim();
  if (isDialogue(t)) return false;
  if (isInnerMonologue(t)) return false;
  return true;
}

/** speaker 없는 대사 노드 */
function isSpeakerlessDialogue(node) {
  if (node.type !== 'text') return false;
  if (node.speaker && node.speaker !== '') return false;
  return isDialogue(node.text);
}

/** speaker 있는 대사 노드 */
function isSpeakerDialogue(node) {
  if (node.type !== 'text') return false;
  return node.speaker && node.speaker !== '';
}

/** 경계 노드인지 */
function isBoundary(node) {
  return CONFIG.BOUNDARY_TYPES.has(node.type);
}

// ============================================================
// Phase 1: 공격적 서술 노드 병합
// ============================================================

/**
 * 핵심 전략: 연속된 서술 노드를 120자 한도 내에서 탐욕적으로 병합
 * - 대사, 내면독백, 경계 노드에서 병합 중단
 * - 이미 120자 이상인 긴 서술은 독립 유지
 * - 같은 speaker 연속 짧은 대사도 병합
 */
function mergeNodes(nodes) {
  const result = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];

    // 경계 노드 → 그대로
    if (isBoundary(node)) {
      result.push({ ...node });
      i++;
      continue;
    }

    // 서술 노드 → 연속 서술 그룹 병합
    if (isNarration(node)) {
      const merged = greedyMergeNarration(nodes, i);
      for (const m of merged.outputNodes) {
        result.push(m);
      }
      i = merged.nextIndex;
      continue;
    }

    // 내면 독백 → 그대로 (서술과 분리)
    if (node.type === 'text' && !node.speaker && isInnerMonologue(node.text)) {
      result.push({ ...node });
      i++;
      continue;
    }

    // 같은 speaker 연속 대사 병합
    if (isSpeakerDialogue(node)) {
      const merged = mergeSameSpeakerDialogue(nodes, i);
      result.push(merged.node);
      i = merged.nextIndex;
      continue;
    }

    // speaker 없는 대사 → 그대로 (화자 불분명)
    result.push({ ...node });
    i++;
  }

  return result;
}

/**
 * 연속 서술 노드를 탐욕적으로 병합
 * 120자 한도 내에서 최대한 합치고, 넘으면 새 그룹 시작
 */
function greedyMergeNarration(nodes, startIdx) {
  const outputNodes = [];
  let current = nodes[startIdx].text;
  let i = startIdx + 1;

  while (i < nodes.length) {
    const next = nodes[i];

    // 서술이 아니면 현재 그룹 종료
    if (!isNarration(next)) break;

    // 합칠 수 있는지 체크
    const candidate = current + ' ' + next.text;
    if (candidate.length <= CONFIG.MERGE_CAP) {
      // 합칠 수 있음
      current = candidate;
      i++;
    } else {
      // 현재 그룹 마감, 새 그룹 시작
      outputNodes.push({ type: 'text', speaker: '', text: current });
      current = next.text;
      i++;
    }
  }

  // 마지막 그룹 출력
  outputNodes.push({ type: 'text', speaker: '', text: current });

  return { outputNodes, nextIndex: i };
}

/** 같은 speaker 연속 대사 병합 + 사이 짧은 서술 흡수 */
function mergeSameSpeakerDialogue(nodes, startIdx) {
  const speaker = nodes[startIdx].speaker;
  let combined = nodes[startIdx].text;
  let i = startIdx + 1;

  while (i < nodes.length) {
    const next = nodes[i];

    // 같은 speaker 대사 계속 병합
    if (isSpeakerDialogue(next) && next.speaker === speaker) {
      if (combined.length + 1 + next.text.length > CONFIG.MERGE_CAP) break;
      combined = combined + ' ' + next.text;
      i++;
      continue;
    }

    // 사이에 짧은 서술(15자 이하)이 있고 그 다음이 같은 speaker면 서술을 건너뛰고 대사 병합
    if (isNarration(next) && next.text.length <= CONFIG.WEAK_THRESHOLD && i + 1 < nodes.length) {
      const after = nodes[i + 1];
      if (isSpeakerDialogue(after) && after.speaker === speaker) {
        if (combined.length + 1 + after.text.length > CONFIG.MERGE_CAP) break;
        // 짧은 서술은 별도로 출력하지 않고 건너뜀 (대사 사이 '고개를 끄덕였다' 등)
        // 실제로는 서술을 결과에 넣지 않음 - 이건 너무 공격적이므로 그냥 중단
        break;
      }
    }

    break;
  }

  return {
    node: { type: 'text', speaker, text: combined },
    nextIndex: i,
  };
}

// ============================================================
// Phase 2: 고립된 짧은 노드 인접 병합
// ============================================================

/**
 * Phase 1 후에도 남는 15자 이하 고립 서술 → 앞뒤 서술과 추가 병합
 */
function strengthenWeakSentences(nodes) {
  const result = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.type !== 'text') {
      result.push(node);
      continue;
    }

    // 15자 이하 서술 노드 → 앞 서술과 합치기
    if (isNarration(node) && node.text.length <= CONFIG.WEAK_THRESHOLD) {
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (isNarration(prev) && (prev.text.length + 1 + node.text.length) <= CONFIG.MERGE_CAP) {
          prev.text = prev.text + ' ' + node.text;
          continue;
        }
      }
      // 앞에 못 합치면 뒤 노드와 합치기 시도 (뒤 노드를 수정)
      if (i + 1 < nodes.length) {
        const next = nodes[i + 1];
        if (isNarration(next) && (node.text.length + 1 + next.text.length) <= CONFIG.MERGE_CAP) {
          nodes[i + 1] = { ...next, text: node.text + ' ' + next.text };
          continue;
        }
      }
    }

    // 15자 이하 내면 독백 → 앞 내면 독백과 합치기
    if (node.type === 'text' && !node.speaker && isInnerMonologue(node.text) && node.text.length <= CONFIG.WEAK_THRESHOLD) {
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (prev.type === 'text' && !prev.speaker && isInnerMonologue(prev.text)) {
          if ((prev.text.length + 1 + node.text.length) <= CONFIG.MERGE_CAP) {
            prev.text = prev.text + ' ' + node.text;
            continue;
          }
        }
      }
    }

    // speaker 없는 짧은 대사 → 앞 speaker 없는 대사와 합치기
    if (isSpeakerlessDialogue(node) && node.text.length <= CONFIG.WEAK_THRESHOLD) {
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (isSpeakerlessDialogue(prev) && (prev.text.length + 1 + node.text.length) <= CONFIG.MERGE_CAP) {
          prev.text = prev.text + ' ' + node.text;
          continue;
        }
      }
    }

    // 대사 사이 고립된 짧은 서술 → 앞 서술과 합치기 (있으면)
    if (isNarration(node) && node.text.length <= CONFIG.WEAK_THRESHOLD) {
      // 앞이 대사이고 뒤도 대사인 경우: 앞 대사의 지문으로 흡수
      if (result.length > 0 && i + 1 < nodes.length) {
        const prev = result[result.length - 1];
        const next = nodes[i + 1];
        if ((isSpeakerDialogue(prev) || isSpeakerlessDialogue(prev)) &&
            (isSpeakerDialogue(next) || isSpeakerlessDialogue(next))) {
          // 앞 대사에 지문으로 붙이기
          if ((prev.text.length + 1 + node.text.length) <= CONFIG.MERGE_CAP) {
            prev.text = prev.text + ' ' + node.text;
            continue;
          }
        }
      }
    }

    result.push(node);
  }

  return result;
}

/** 챕터 첫/마지막 텍스트 노드 최소 길이 확보 */
function ensureChapterEdgeLength(nodes) {
  if (nodes.length === 0) return nodes;

  // 첫 텍스트 노드
  let firstIdx = nodes.findIndex(n => n.type === 'text');
  if (firstIdx >= 0 && nodes[firstIdx].text.length < CONFIG.MIN_CHAPTER_EDGE && isNarration(nodes[firstIdx])) {
    for (let j = firstIdx + 1; j < nodes.length && j <= firstIdx + 3; j++) {
      if (!isNarration(nodes[j])) break;
      if (nodes[firstIdx].text.length + 1 + nodes[j].text.length <= CONFIG.MERGE_CAP) {
        nodes[firstIdx].text += ' ' + nodes[j].text;
        nodes.splice(j, 1);
        j--;
        if (nodes[firstIdx].text.length >= CONFIG.MIN_CHAPTER_EDGE) break;
      } else break;
    }
  }

  // 마지막 텍스트 노드
  let lastIdx = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].type === 'text') { lastIdx = i; break; }
  }
  if (lastIdx >= 0 && nodes[lastIdx].text.length < CONFIG.MIN_CHAPTER_EDGE && isNarration(nodes[lastIdx])) {
    for (let j = lastIdx - 1; j >= 0 && j >= lastIdx - 3; j--) {
      if (!isNarration(nodes[j])) break;
      if (nodes[j].text.length + 1 + nodes[lastIdx].text.length <= CONFIG.MERGE_CAP) {
        nodes[lastIdx].text = nodes[j].text + ' ' + nodes[lastIdx].text;
        nodes.splice(j, 1);
        lastIdx--;
        if (nodes[lastIdx] && nodes[lastIdx].text.length >= CONFIG.MIN_CHAPTER_EDGE) break;
      } else break;
    }
  }

  return nodes;
}

// ============================================================
// 파싱 / 직렬화
// ============================================================

function parseStoryFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const Story = { chapters: {} };
  try {
    eval(content);
  } catch (e) {
    console.error(`파싱 오류 (${filePath}):`, e.message);
    process.exit(1);
  }
  const keys = Object.keys(Story.chapters);
  if (keys.length === 0) {
    console.error(`챕터 데이터를 찾을 수 없음: ${filePath}`);
    process.exit(1);
  }
  return { key: keys[0], chapters: Story.chapters[keys[0]] };
}

function escapeJsString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function chaptersToSource(key, chapters) {
  const lines = [];
  const totalNodes = chapters.reduce((sum, ch) => sum + ch.nodes.length, 0);
  lines.push(`// ${getCharacterName(key)} 스토리 데이터 (메타데이터 자동 삽입)`);
  lines.push(`// 총 ${chapters.length}장, ${totalNodes}개 노드`);
  lines.push('');
  lines.push(`Story.chapters.${key} = [`);

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    lines.push('  {');
    lines.push(`    title: '${escapeJsString(ch.title)}',`);
    lines.push('    nodes: [');

    for (let ni = 0; ni < ch.nodes.length; ni++) {
      const node = ch.nodes[ni];
      if (node.type === 'text') {
        lines.push(`      { type: 'text', speaker: '${escapeJsString(node.speaker || '')}', text: '${escapeJsString(node.text)}' },`);
      } else if (node.type === 'location') {
        lines.push(`      { type: 'location', name: '${escapeJsString(node.name)}' },`);
      } else if (node.type === 'weather') {
        lines.push(`      { type: 'weather', weather: '${escapeJsString(node.weather)}' },`);
      } else if (node.type === 'effect') {
        const props = Object.entries(node)
          .filter(([k]) => k !== 'type')
          .map(([k, v]) => `${k}: '${escapeJsString(String(v))}'`)
          .join(', ');
        lines.push(`      { type: 'effect', ${props} },`);
      } else if (node.type === 'combat') {
        const props = Object.entries(node)
          .filter(([k]) => k !== 'type')
          .map(([k, v]) => {
            if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
            if (typeof v === 'number') return `${k}: ${v}`;
            return `${k}: '${escapeJsString(String(v))}'`;
          })
          .join(', ');
        lines.push(`      { type: 'combat', ${props} },`);
      } else if (node.type === 'cutscene') {
        const props = Object.entries(node)
          .filter(([k]) => k !== 'type')
          .map(([k, v]) => `${k}: '${escapeJsString(String(v))}'`)
          .join(', ');
        lines.push(`      { type: 'cutscene', ${props} },`);
      } else {
        lines.push(`      ${JSON.stringify(node)},`);
      }
    }

    lines.push('    ]');
    lines.push(`  }${ci < chapters.length - 1 ? ',' : ','}`);
  }

  lines.push('];');
  return lines.join('\n') + '\n';
}

function getCharacterName(key) {
  const names = { cheongryong: '청룡', baekho: '백호', jujak: '주작', hyeonmu: '현무', hwangryong: '황룡' };
  return names[key] || key;
}

// ============================================================
// 통계
// ============================================================

function computeStats(chapters) {
  let totalText = 0, shortCount = 0, totalNodes = 0;
  for (const ch of chapters) {
    totalNodes += ch.nodes.length;
    for (const node of ch.nodes) {
      if (node.type === 'text') {
        totalText++;
        if (node.text.length <= 15) shortCount++;
      }
    }
  }
  return { totalNodes, totalText, shortCount, shortRatio: totalText > 0 ? (shortCount / totalText * 100) : 0 };
}

function printStats(label, stats) {
  console.log(`  [${label}] 전체 노드: ${stats.totalNodes} | 텍스트: ${stats.totalText} | 15자이하: ${stats.shortCount} (${stats.shortRatio.toFixed(1)}%)`);
}

// ============================================================
// 메인
// ============================================================

function processFile(storyEntry, options = {}) {
  const filePath = path.join(process.cwd(), storyEntry.file);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`처리 중: ${storyEntry.file}`);
  console.log('='.repeat(60));

  const { key, chapters } = parseStoryFile(filePath);
  const beforeStats = computeStats(chapters);
  printStats('병합 전', beforeStats);

  const targetChapters = options.chapter !== undefined
    ? [options.chapter - 1]
    : chapters.map((_, i) => i);

  for (const ci of targetChapters) {
    if (ci < 0 || ci >= chapters.length) continue;

    // Phase 1: 공격적 서술 병합
    chapters[ci].nodes = mergeNodes(chapters[ci].nodes);

    // Phase 2: 고립된 짧은 노드 추가 병합
    chapters[ci].nodes = strengthenWeakSentences(chapters[ci].nodes);

    // 챕터 엣지 보강
    chapters[ci].nodes = ensureChapterEdgeLength(chapters[ci].nodes);
  }

  const afterStats = computeStats(chapters);
  printStats('병합 후', afterStats);

  const reduction = beforeStats.totalNodes - afterStats.totalNodes;
  const reductionPct = (reduction / beforeStats.totalNodes * 100).toFixed(1);
  console.log(`  감소: ${reduction}개 노드 (${reductionPct}%)`);

  if (!options.dryRun) {
    const source = chaptersToSource(key, chapters);
    fs.writeFileSync(filePath, source, 'utf8');
    console.log(`  저장 완료: ${storyEntry.file}`);
  } else {
    console.log('  [DRY RUN] 파일 저장 건너뜀');

    // dry-run에서도 샘플 출력
    if (options.sample) {
      const chIdx = (options.chapter || 1) - 1;
      if (chIdx >= 0 && chIdx < chapters.length) {
        console.log(`\n--- 샘플: ${storyEntry.file} ${chapters[chIdx].title} 앞 30노드 ---`);
        chapters[chIdx].nodes.slice(0, 30).forEach((n, idx) => {
          if (n.type === 'text') {
            const prefix = n.speaker ? `[${n.speaker}]` : (isInnerMonologue(n.text) ? '[독백]' : (isDialogue(n.text) ? '[대사]' : '[서술]'));
            console.log(`  ${String(idx+1).padStart(2)}. ${prefix} (${n.text.length}자) ${n.text.substring(0, 100)}${n.text.length > 100 ? '...' : ''}`);
          } else {
            console.log(`  ${String(idx+1).padStart(2)}. <${n.type}>`);
          }
        });
      }
    }
  }

  return { before: beforeStats, after: afterStats, key, chapters };
}

function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    file: null,
    chapter: undefined,
    sample: args.includes('--sample'),
  };

  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && args[fileIdx + 1]) options.file = args[fileIdx + 1];

  const chIdx = args.indexOf('--chapter');
  if (chIdx >= 0 && args[chIdx + 1]) options.chapter = parseInt(args[chIdx + 1]);

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      스토리 텍스트 품질 개선 스크립트 v2.0             ║');
  console.log('║  Phase 1: 공격적 서술 병합 | Phase 2: 약한 문장 강화  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (options.dryRun) console.log('\n[DRY RUN 모드 - 파일 수정 없음]');

  const targets = options.file
    ? STORY_FILES.filter(s => s.file.includes(options.file) || s.key === options.file)
    : STORY_FILES;

  if (targets.length === 0) {
    console.error('대상 파일을 찾을 수 없습니다:', options.file);
    process.exit(1);
  }

  const allResults = [];
  for (const target of targets) {
    const result = processFile(target, options);
    allResults.push({ file: target.file, ...result });
  }

  // 전체 통계
  console.log(`\n${'='.repeat(60)}`);
  console.log('전체 통계 요약');
  console.log('='.repeat(60));

  let tb = { totalNodes: 0, totalText: 0, shortCount: 0 };
  let ta = { totalNodes: 0, totalText: 0, shortCount: 0 };
  for (const r of allResults) {
    tb.totalNodes += r.before.totalNodes; tb.totalText += r.before.totalText; tb.shortCount += r.before.shortCount;
    ta.totalNodes += r.after.totalNodes; ta.totalText += r.after.totalText; ta.shortCount += r.after.shortCount;
  }

  console.log(`  병합 전: ${tb.totalNodes}개 노드 (텍스트 ${tb.totalText}, 15자이하 ${tb.shortCount} = ${(tb.shortCount/tb.totalText*100).toFixed(1)}%)`);
  console.log(`  병합 후: ${ta.totalNodes}개 노드 (텍스트 ${ta.totalText}, 15자이하 ${ta.shortCount} = ${(ta.shortCount/ta.totalText*100).toFixed(1)}%)`);
  console.log(`  총 감소: ${tb.totalNodes - ta.totalNodes}개 노드 (${((tb.totalNodes - ta.totalNodes)/tb.totalNodes*100).toFixed(1)}%)`);
}

main();
