/* ===== 탑 시스템 ===== */

// 탑 전투 텍스트 (다이스 수치 비공개 — GDD v2 §4.2)
const TOWER_ATTACK_TEXTS = {
  fail: [
    '공격이 허공을 갈랐다!',
    '발을 헛디뎠다...!',
    '적이 가볍게 피했다.',
    '힘이 제대로 실리지 않았다...'
  ],
  normal: [
    '적에게 일격을 가했다!',
    '무난한 공격이 적중했다.',
    '적이 약간 흔들렸다.',
    '가벼운 타격을 먹였다.'
  ],
  good: [
    '강력한 일격이 적중했다!',
    '적이 크게 비틀거린다!',
    '날카로운 공격이 꽂혔다!',
    '적의 방어를 뚫었다!'
  ],
  critical: [
    '회심의 일격!! 적이 크게 날아갔다!',
    '번개같은 공격! 치명타!!',
    '완벽한 타이밍! 적이 무릎을 꿇는다!',
    '전신의 힘을 담은 일격! 대지가 흔들린다!'
  ]
};

const TOWER_ENEMY_ATTACK_TEXTS = {
  hit: [
    '적의 공격에 맞았다!',
    '피하지 못했다...!',
    '적의 일격이 스쳤다!'
  ],
  evade: [
    '재빠르게 피했다!',
    '간발의 차로 피했다!',
    '적의 공격이 빗나갔다!'
  ]
};

const TOWER_RHYTHM = (typeof COMBAT_RHYTHM !== 'undefined')
  ? COMBAT_RHYTHM
  : { perfectMin: 180, perfectMax: 420, goodMin: 130, goodMax: 560, timeout: 900, maxCombo: 8 };

const TOWER_PARRY = {
  windupMs: 580,
  perfectWindowMs: 80,
  goodWindowMs: 170,
  goodDamageRatio: 0.32,
  failDamageRatio: 1.15
};

const Tower = {
  selectedBeast: null,
  inBattle: false,
  currentEnemy: null,
  playerHp: 100,
  maxHp: 100,

  comboCount: 0,
  lastTapAt: 0,
  focusGauge: 0,
  enemyStaggerTurns: 0,
  enemyPhase: 0,
  enemyTurnTimer: null,
  inputLockedUntil: 0,
  feedbackTimer: null,
  rhythmFrame: null,
  rhythmFlashTimer: null,
  rhythmCycleStart: 0,
  lastResolvedBeat: -1,
  pendingEnemyStrike: null,
  activeDebuffs: {},
  _debuffTimers: [],
  weaknessWindow: false,
  _weaknessTimer: null,
  _phaseGimmickUsed: {},
  dotEffect: null,
  shieldActive: false,
  totalDamageDealt: 0,
  totalDamageTaken: 0,
  skillUsedCount: 0,
  parryPerfectCount: 0,
  parryGoodCount: 0,
  parryFailCount: 0,
  comboPeak: 0,
  fightStartedAt: 0,
  _crisisDialogueShown: false,
  perfectStreak: 0,         // 연속 PERFECT 카운트
  absoluteRhythm: false,    // 절대 리듬 모드
  _absoluteRhythmTimer: null,
  // 연계 패턴 시스템
  chainQueue: [],
  chainIndex: 0,
  chainActive: false,
  chainAllParried: true,

  playSfx(type = 'page', throttledMs = 0) {
    if (typeof StoryAudio === 'undefined' || !StoryAudio) return;
    if (typeof StoryAudio.playCombatSfx === 'function') {
      StoryAudio.playCombatSfx(type, throttledMs);
      return;
    }
    if (throttledMs > 0 && typeof StoryAudio.playSfxThrottled === 'function') {
      StoryAudio.playSfxThrottled(type, throttledMs);
      return;
    }
    if (typeof StoryAudio.playSfx === 'function') {
      StoryAudio.playSfx(type);
    }
  },

  playDefeatCue() {
    this.playSfx('defeat');
    setTimeout(() => this.playSfx('defeatTail'), 120);
  },

  // 탑 적 생성 (층수 기반)
  generateEnemy(beastId, floor) {
    const themes = {
      cheongryong: ['답답한 병사', '소심한 기사', '우유부단한 마법사', '겁쟁이 장군', '비겁한 암살자'],
      baekho: ['잘난 척 귀족', '자칭 천재', '거만한 마법사', '허세 기사', '나르시스트 왕자'],
      jujak: ['약자 괴롭히는 깡패', '비열한 도적', '잔인한 사냥꾼', '무자비한 용병', '냉혈한 암흑마법사'],
      hyeonmu: ['교활한 사기꾼', '퍼즐 마스터', '트릭스터', '미궁의 지배자', '환술사'],
      hwangryong: ['신념의 기사', '철의 수도승', '불굴의 전사', '맹세의 성기사', '진실의 수호자']
    };

    const namePool = themes[beastId] || themes.cheongryong;
    const isBoss = floor % 5 === 0;
    const isElite = !isBoss && floor > 3 && Math.random() < 0.25;

    // 보스층: 해당 신수 테마의 마지막 적 (가장 강한 적)
    let baseName;
    if (isBoss) {
      baseName = namePool[Math.min(Math.floor(floor / 5) - 1, namePool.length - 1) % namePool.length];
    } else {
      baseName = namePool[Math.min(floor - 1, namePool.length - 1) % namePool.length];
    }

    let hp = 30 + floor * 20;
    let attack = 5 + floor * 3;
    let attackRate = Math.min(0.7, 0.3 + floor * 0.04);
    let prefix = '';
    let prefixData = null;

    // 5n층 보스: 체력/공격력 대폭 증가
    if (isBoss) {
      hp = Math.floor(hp * 1.8);
      attack = Math.floor(attack * 1.4);
      attackRate = Math.min(0.85, attackRate + 0.1);
    }

    // 엘리트: 접두사 적용
    if (isElite && typeof ENEMY_PREFIXES !== 'undefined') {
      const prefixKeys = Object.keys(ENEMY_PREFIXES);
      const pk = prefixKeys[Math.floor(Math.random() * prefixKeys.length)];
      prefixData = ENEMY_PREFIXES[pk];
      prefix = pk + ' ';
      hp = Math.floor(hp * (prefixData.hpMult || 1));
      attack = Math.floor(attack * (prefixData.atkMult || 1));
      attackRate = Math.min(0.85, attackRate * (prefixData.attackRateMult || 1));
    }

    const suffix = floor > 5 ? ` Lv.${floor}` : '';
    const bossTag = isBoss ? ' [BOSS]' : '';

    // 속성 부여 (랜덤)
    const element = (typeof ENEMY_ELEMENT_POOL !== 'undefined')
      ? ENEMY_ELEMENT_POOL[Math.floor(Math.random() * ENEMY_ELEMENT_POOL.length)]
      : null;

    // 아이콘 부여
    const icon = (typeof ENEMY_ICONS !== 'undefined') ? (ENEMY_ICONS[baseName] || '⚔️') : '⚔️';

    return {
      name: `${prefix}${baseName}${suffix}${bossTag}`,
      baseName,
      hp,
      attack,
      attackRate,
      isBoss,
      isElite,
      prefixData,
      element,
      icon
    };
  },

  // 캐릭터 선택 UI 렌더
  renderCharSelect() {
    const container = document.getElementById('tower-char-select');
    container.innerHTML = '';

    Object.keys(BEAST_DATA).forEach(id => {
      const data = BEAST_DATA[id];
      const beast = GameState.beasts[id];
      const locked = !beast || !beast.unlocked;

      const btn = document.createElement('button');
      btn.className = `tower-char-btn${locked ? ' locked' : ''}${this.selectedBeast === id ? ' active' : ''}`;
      const portraitPath = getBeastPortraitPath(id);
      const iconHtml = (!locked && portraitPath)
        ? `<img class="tower-char-icon" src="${portraitPath}" alt="${data.name}" loading="lazy">`
        : `<span class="tower-char-icon-symbol" style="color:${data.color}">${data.symbol}</span>`;
      btn.innerHTML = `
        ${iconHtml}
        <span class="tower-char-name">${data.name}</span>
      `;

      if (!locked) {
        btn.onclick = () => this.selectBeast(id);
      }

      container.appendChild(btn);
    });
  },

  // 캐릭터 선택
  selectBeast(beastId) {
    this.playSfx('page', 120);
    this.selectedBeast = beastId;
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();
    this.pendingEnemyStrike = null;
    this.inBattle = false;
    this.renderCharSelect();

    const towerData = GameState.tower[beastId];
    const infoDiv = document.getElementById('tower-info');
    const battleDiv = document.getElementById('tower-battle');

    infoDiv.classList.remove('hidden');
    battleDiv.classList.add('hidden');
    battleDiv.classList.remove('danger', 'impact', 'impact-strong');
    const tapBtn = document.getElementById('tower-tap-btn');
    const parryBtn = document.getElementById('tower-parry-btn');
    const feedback = document.getElementById('tower-feedback');
    const skillBtn = document.getElementById('tower-skill-btn');
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (tapBtn) tapBtn.classList.remove('combo-hot');
    if (parryBtn) {
      parryBtn.classList.remove('ready');
      parryBtn.disabled = true;
      parryBtn.textContent = '패링 대기';
    }
    if (feedback) feedback.className = '';
    if (vfxLayer) vfxLayer.innerHTML = '';
    if (skillBtn) {
      skillBtn.classList.remove('ready');
      skillBtn.disabled = true;
      skillBtn.textContent = '각성 일격 (0%)';
    }
    const banner = document.getElementById('tower-banner');
    if (banner) { banner.textContent = ''; banner.className = 'combat-banner'; }
    const debuffBar = document.getElementById('tower-debuff-bar');
    if (debuffBar) debuffBar.innerHTML = '';
    const dialogue = document.getElementById('tower-combat-dialogue');
    if (dialogue) dialogue.classList.add('hidden');
    const resultOverlay = document.getElementById('tower-result-overlay');
    if (resultOverlay) { resultOverlay.classList.add('hidden'); resultOverlay.innerHTML = ''; }

    document.getElementById('tower-floor-display').textContent = `${towerData.currentFloor}층`;
    document.getElementById('tower-best-record').textContent = `최고 기록: ${towerData.bestFloor}층`;
    document.getElementById('tower-start-btn').disabled = towerData.currentFloor > TOWER_MAX_FLOOR;
  },

  // 전투 시작
  startBattle() {
    if (!this.selectedBeast) return;
    this.playSfx('combat');
    if (typeof StoryAudio !== 'undefined' && StoryAudio && typeof StoryAudio.startAmbient === 'function') {
      StoryAudio.startAmbient('battle');
    }

    const beastId = this.selectedBeast;
    const towerData = GameState.tower[beastId];

    this.currentEnemy = this.generateEnemy(beastId, towerData.currentFloor);
    this.currentEnemy.currentHp = this.currentEnemy.hp;
    this.playerHp = 100;
    this.maxHp = 100;
    this.inBattle = true;

    this.comboCount = 0;
    this.lastTapAt = 0;
    this.focusGauge = 0;
    this.enemyStaggerTurns = 0;
    this.enemyPhase = 0;
    this.inputLockedUntil = 0;
    this.rhythmCycleStart = Date.now();
    this.lastResolvedBeat = -1;
    this.pendingEnemyStrike = null;
    this.activeDebuffs = {};
    this._debuffTimers.forEach(t => clearTimeout(t));
    this._debuffTimers = [];
    this.weaknessWindow = false;
    if (this._weaknessTimer) { clearTimeout(this._weaknessTimer); this._weaknessTimer = null; }
    this._phaseGimmickUsed = {};
    this.dotEffect = null;
    this.shieldActive = false;
    this.totalDamageDealt = 0;
    this.totalDamageTaken = 0;
    this.skillUsedCount = 0;
    this.parryPerfectCount = 0;
    this.parryGoodCount = 0;
    this.parryFailCount = 0;
    this.comboPeak = 0;
    this.fightStartedAt = Date.now();
    this._crisisDialogueShown = false;
    this.perfectStreak = 0;
    this.absoluteRhythm = false;
    if (this._absoluteRhythmTimer) { clearTimeout(this._absoluteRhythmTimer); this._absoluteRhythmTimer = null; }
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();

    document.getElementById('tower-info').classList.add('hidden');
    document.getElementById('tower-battle').classList.remove('hidden');
    document.getElementById('tower-battle').classList.remove('danger');
    document.getElementById('tower-enemy-info').textContent = `${towerData.currentFloor}층 — ${this.currentEnemy.name}`;
    // 보스/엘리트 표시
    const battleArea = document.getElementById('tower-battle');
    if (battleArea) {
      battleArea.classList.remove('tower-enemy-elite', 'tower-enemy-boss');
      if (this.currentEnemy.isBoss) battleArea.classList.add('tower-enemy-boss');
      else if (this.currentEnemy.isElite) battleArea.classList.add('tower-enemy-elite');
    }
    document.getElementById('tower-combat-log').innerHTML = '';
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (vfxLayer) vfxLayer.innerHTML = '';
    const banner = document.getElementById('tower-banner');
    if (banner) { banner.textContent = ''; banner.className = 'combat-banner'; }
    const debuffBar = document.getElementById('tower-debuff-bar');
    if (debuffBar) debuffBar.innerHTML = '';
    const dialogue = document.getElementById('tower-combat-dialogue');
    if (dialogue) dialogue.classList.add('hidden');
    const resultOverlay = document.getElementById('tower-result-overlay');
    if (resultOverlay) { resultOverlay.classList.add('hidden'); resultOverlay.innerHTML = ''; }
    const eventStrip = document.getElementById('tower-event-strip');
    if (eventStrip) eventStrip.innerHTML = '';
    const battleDiv2 = document.getElementById('tower-battle');
    if (battleDiv2) battleDiv2.classList.remove('absolute-rhythm-active');

    const skillBtn = document.getElementById('tower-skill-btn');
    const parryBtn = document.getElementById('tower-parry-btn');
    const guide = document.getElementById('tower-rhythm-guide');
    const feedback = document.getElementById('tower-feedback');

    if (skillBtn) {
      skillBtn.disabled = true;
      skillBtn.classList.remove('ready');
      const skill = TOWER_BEAST_SKILLS[beastId] || TOWER_BEAST_SKILLS.cheongryong;
      skillBtn.textContent = `${skill.name} (0%)`;
    }
    if (parryBtn) {
      parryBtn.classList.remove('ready');
      parryBtn.disabled = true;
      parryBtn.textContent = '패링 대기';
    }
    if (guide) guide.textContent = '한 박자당 1회 판정. 파란 구간 PERFECT / 초록 구간 GOOD. 적 예고 시 패링!';
    if (feedback) feedback.className = '';

    this.updateBattleUI();
    this.setupRhythmMeter();
    this.setIntent('적이 움직임을 읽고 있다. 리듬을 먼저 잡아라.');
    this.logLine('전투 시작! 리듬 타이밍을 맞춰 콤보를 쌓아라.', 'log-system');
    this.showCombatDialogue('start');
    if (this.currentEnemy.isBoss) {
      this.showEventStrip(`👑 ${towerData.currentFloor}층 BOSS — ${this.currentEnemy.name}`, 'event-boss', 3);
    } else if (this.currentEnemy.isElite) {
      this.showEventStrip(`⚔ 강화된 적 — ${this.currentEnemy.name}`, 'event-elite', 2.5);
    }
  },

  // 탭 공격 (적 공격 중에도 리듬 유지)
  tap() {
    if (!this.inBattle || !this.currentEnemy) return;
    // 적 공격 중이어도 리듬 공격 허용 (패링은 별도 버튼으로)

    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    const slowActive = this.activeDebuffs.slow && now < this.activeDebuffs.slow;
    this.inputLockedUntil = now + (slowActive ? 140 : 70);

    const beatIndex = this.getRhythmBeatIndex(now);
    if (beatIndex === this.lastResolvedBeat) {
      this.showRhythmFeedback('wait');
      return;
    }
    this.lastResolvedBeat = beatIndex;

    const beastId = this.selectedBeast;
    const rhythm = this.updateRhythm(now);
    if (rhythm.grade === 'break') {
      this.focusGauge = Math.max(0, this.focusGauge - 12);
      this.updateBattleUI();
      this.logLine('타이밍이 빗나가 공격이 허공을 갈랐다.', 'log-miss');
      this.playSfx('miss', 120);
      this.scheduleEnemyAttack(320);
      return;
    }

    // 2d6 내부 롤 (유저에게 수치 비공개)
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const rawRoll = d1 + d2;
    const bonus = GameState.getCombatBonus(beastId);
    const totalRoll = rawRoll + bonus + rhythm.rollBonus;

    let result;
    let tierKey;
    if (totalRoll <= 4) {
      result = DICE_RESULTS.fail;
      tierKey = 'fail';
    } else if (totalRoll <= 7) {
      result = DICE_RESULTS.normal;
      tierKey = 'normal';
    } else if (totalRoll <= 10) {
      result = DICE_RESULTS.good;
      tierKey = 'good';
    } else {
      result = DICE_RESULTS.critical;
      tierKey = 'critical';
    }

    const level = (GameState.beasts[beastId] || {}).level || 1;
    const baseDmg = 10 + Math.floor(level / 5);
    const comboMult = this.getComboDamageMultiplier();
    const rhythmMult = rhythm.grade === 'perfect' ? 1.35 : rhythm.grade === 'good' ? 1.12 : 0.9;
    const weaknessMult = this.weaknessWindow ? 2.0 : 1.0;
    const absoluteMult = this.absoluteRhythm ? 2.0 : 1.0;
    const damage = Math.max(1, Math.floor(baseDmg * result.dmgMult * comboMult * rhythmMult * weaknessMult * absoluteMult));
    this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - damage);
    this.totalDamageDealt += damage;
    if (this.weaknessWindow) {
      this.weaknessWindow = false;
      if (this._weaknessTimer) { clearTimeout(this._weaknessTimer); this._weaknessTimer = null; }
      this.showBanner('약점 공격! 데미지 2배!', 'banner-critical');
    }

    const attackText = TOWER_ATTACK_TEXTS[tierKey][Math.floor(Math.random() * TOWER_ATTACK_TEXTS[tierKey].length)];
    const rhythmText = rhythm.label ? ` ${rhythm.label}` : '';
    this.logLine(`${attackText} (${damage} 피해)${rhythmText}`, result.class);
    this.spawnHitEffect('enemy', tierKey === 'critical' ? 'heavy' : 'normal');
    this.spawnDamageNumber('enemy', damage, { critical: tierKey === 'critical' });
    this.playSfx('attackSwing', 40);
    this.playSfx('hitEnemy', 60);
    if (tierKey === 'critical') this.playSfx('hitEnemyHeavy', 130);

    const focusByTier = { fail: 8, normal: 12, good: 18, critical: 26 };
    this.gainFocus((focusByTier[tierKey] || 10) + rhythm.focusBonus);

    this.comboPeak = Math.max(this.comboPeak || 0, this.comboCount);
    if (this.comboCount === 5) this.showCombatDialogue('combo');

    this.applyBattleImpact(tierKey);
    this.updateEnemyPhase();
    this.updateBattleUI();

    // 경험치
    GameState.addExp(beastId, 1);

    // 패시브 스킬 확률 트리거
    if (this.comboCount >= 3 && this.currentEnemy.currentHp > 0) {
      this.checkPassiveSkillTrigger();
    }

    if (this.currentEnemy.currentHp <= 0) {
      this.winFloor();
      return;
    }

    this.scheduleEnemyAttack(420);
  },

  useSkill() {
    if (!this.inBattle || !this.currentEnemy) return;
    if (this.focusGauge < 100) return;
    if (this.pendingEnemyStrike) {
      this.showRhythmFeedback('parry');
      return;
    }

    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    this.inputLockedUntil = now + 90;
    this.playSfx('attackSwing', 45);

    const beastId = this.selectedBeast;
    const level = (GameState.beasts[beastId] || {}).level || 1;
    const floor = (GameState.tower[beastId] || {}).currentFloor || 1;
    const comboMult = this.getComboDamageMultiplier();
    const skillBase = 24 + Math.floor(level / 8) + Math.floor(floor * 0.6);
    const skill = TOWER_BEAST_SKILLS[beastId] || TOWER_BEAST_SKILLS.cheongryong;

    this.focusGauge = 0;
    this.skillUsedCount++;
    this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);
    this.showCombatDialogue('skill');

    // 스킬 컷씬 연출
    if (typeof Combat !== 'undefined' && Combat.showSkillCutscene) {
      Combat.showSkillCutscene(beastId, 'tower');
    }

    if (skill.type === 'multi') {
      // 청룡: 관통 3연격
      const dmgPer = Math.max(1, Math.floor(skillBase * skill.baseMult * comboMult));
      this.logLine(`${skill.name}! 관통하는 3연격!`, 'log-critical');
      this.showRhythmFeedback('skill');
      let total = 0;
      [0, 200, 400].forEach((delay, i) => {
        setTimeout(() => {
          if (!this.inBattle || !this.currentEnemy || this.currentEnemy.currentHp <= 0) return;
          this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - dmgPer);
          total += dmgPer;
          this.totalDamageDealt += dmgPer;
          this.spawnHitEffect('enemy', 'heavy');
          this.spawnDamageNumber('enemy', dmgPer, { critical: true });
          this.playSfx('hitEnemyHeavy', 60);
          this.applyBattleImpact('critical');
          if (i === 2) {
            this.logLine(`${skill.name} 완료! 총 ${total} 피해`, 'log-critical');
            this.enemyStaggerTurns = skill.stagger;
            this.updateEnemyPhase(); this.updateBattleUI();
            if (this.currentEnemy.currentHp <= 0) { this.winFloor(); return; }
            this.scheduleEnemyAttack(500);
          }
        }, delay);
      });
    } else if (skill.type === 'shield') {
      // 백호: 강타 + 실드
      const dmg = Math.max(1, Math.floor(skillBase * skill.baseMult * comboMult));
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - dmg);
      this.totalDamageDealt += dmg;
      this.shieldActive = true;
      this.logLine(`${skill.name}! 강타 + 실드! (${dmg} 피해)`, 'log-critical');
      this.showRhythmFeedback('skill');
      this.spawnHitEffect('enemy', 'skill');
      this.spawnDamageNumber('enemy', dmg, { critical: true, heavy: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyBattleImpact('critical');
      this.updateEnemyPhase(); this.updateBattleUI();
      if (this.currentEnemy.currentHp <= 0) { this.winFloor(); return; }
      this.scheduleEnemyAttack(460);
    } else if (skill.type === 'dot') {
      // 주작: 즉발 + DOT
      const dmg = Math.max(1, Math.floor(skillBase * skill.baseMult * comboMult));
      const dotDmg = Math.max(1, Math.floor(skillBase * skill.dotMult));
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - dmg);
      this.totalDamageDealt += dmg;
      this.dotEffect = { ticks: skill.dotTicks, dmg: dotDmg };
      this.logLine(`${skill.name}! 불꽃이 타오른다! (${dmg} + ${dotDmg}×${skill.dotTicks})`, 'log-critical');
      this.showRhythmFeedback('skill');
      this.spawnHitEffect('enemy', 'skill');
      this.spawnDamageNumber('enemy', dmg, { critical: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyBattleImpact('critical');
      this.updateEnemyPhase(); this.updateBattleUI();
      if (this.currentEnemy.currentHp <= 0) { this.winFloor(); return; }
      this.scheduleEnemyAttack(460);
    } else if (skill.type === 'heal') {
      // 현무: 중타 + 회복
      const dmg = Math.max(1, Math.floor(skillBase * skill.baseMult * comboMult));
      const heal = Math.min(30, Math.floor(this.maxHp * skill.healPct));
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - dmg);
      this.totalDamageDealt += dmg;
      this.playerHp = Math.min(this.maxHp, this.playerHp + heal);
      this.logLine(`${skill.name}! 반격 + 회복! (${dmg} 피해, +${heal} 회복)`, 'log-critical');
      this.showRhythmFeedback('skill');
      this.spawnHitEffect('enemy', 'heavy');
      this.spawnDamageNumber('enemy', dmg, { critical: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyBattleImpact('critical');
      this.updateEnemyPhase(); this.updateBattleUI();
      if (this.currentEnemy.currentHp <= 0) { this.winFloor(); return; }
      this.scheduleEnemyAttack(460);
    } else {
      // 황룡: 초강타
      const dmg = Math.max(1, Math.floor(skillBase * skill.baseMult * comboMult));
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - dmg);
      this.totalDamageDealt += dmg;
      this.enemyStaggerTurns = skill.stagger;
      this.logLine(`${skill.name}!!! 천지를 뒤흔드는 일격! (${dmg} 피해)`, 'log-critical');
      this.showRhythmFeedback('skill');
      this.spawnHitEffect('enemy', 'skill');
      this.spawnDamageNumber('enemy', dmg, { critical: true, heavy: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyBattleImpact('critical');
      setTimeout(() => this.applyBattleImpact('critical'), 80);
      this.updateEnemyPhase(); this.updateBattleUI();
      if (this.currentEnemy.currentHp <= 0) { this.winFloor(); return; }
      this.scheduleEnemyAttack(550);
    }

    this.setIntent('적이 중심을 잃었다. 공격 기회!');
  },

  scheduleEnemyAttack(delay) {
    if (this.pendingEnemyStrike) return;
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer);
    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
      this.beginEnemyWindup();
    }, delay);
  },

  beginEnemyWindup() {
    if (!this.inBattle || !this.currentEnemy) return;
    if (this.currentEnemy.currentHp <= 0) return;
    if (this.pendingEnemyStrike) return;

    if (this.enemyStaggerTurns > 0) {
      this.enemyStaggerTurns--;
      this.logLine('적이 휘청이며 반격 타이밍을 놓쳤다!', 'log-good');
      this.setIntent('적이 자세를 회복하는 중이다. 공격 기회!');
      return;
    }

    const attackChance = this.getEnemyAttackChance();
    if (Math.random() > attackChance) {
      this.logLine('적이 간을 보며 거리를 벌렸다.', 'log-miss');
      this.queueEnemyIntent();
      return;
    }

    const beast = GameState.beasts[this.selectedBeast];
    const pattern = this.pickEnemyPattern();

    const evadeChance = Math.min(0.5, (beast.towerEvdBonus || 0) * 0.03);
    if (Math.random() < evadeChance) {
      const evadeText = TOWER_ENEMY_ATTACK_TEXTS.evade[Math.floor(Math.random() * TOWER_ENEMY_ATTACK_TEXTS.evade.length)];
      this.logLine(`${evadeText} (${pattern.name} 회피)`, 'log-good');
      this.queueEnemyIntent();
      return;
    }

    const enemyDmg = this.computeEnemyStrikeDamage(pattern, beast);
    const windup = TOWER_PARRY.windupMs + (pattern.heavy ? 80 : 0);
    const resolveAt = Date.now() + windup;
    this.pendingEnemyStrike = {
      pattern,
      damage: enemyDmg,
      resolveAt,
      parryGrade: 'none',
      parryTried: false
    };
    if (pattern.unparryable) {
      this.pendingEnemyStrike.parryTried = true;
      this.logLine(`적이 ${pattern.name} 준비 중! 패링 불가!`, 'log-enemy');
      this.showBanner(`${pattern.name} — 패링 불가!`, 'banner-danger');
      this.setIntent(`⚠ ${pattern.name}! 패링 불가!`);
      this.showEventStrip(`⚠ ${pattern.name}! 패링 불가!`, 'event-enemy', 2);
    } else {
      this.logLine(`적이 ${pattern.name} 준비 중! 타격 직전에 패링!`, 'log-enemy');
      this.showBanner(`${pattern.name}! 패링 준비!`, 'banner-parry');
      this.setIntent(`⚠ ${pattern.name} 예고! 지금 패링 타이밍을 잡아라.`);
      this.showEventStrip(`⚔ ${pattern.name}! 패링 준비!`, 'event-enemy', 2);
    }
    this.showKeyMessage(pattern.name + '!', pattern.unparryable ? 'msg-danger' : 'msg-attack');

    // 패링 카운트다운 링
    const parent = document.getElementById('tower-battle');
    if (parent && !pattern.unparryable) {
      const ring = document.createElement('svg');
      ring.className = 'parry-countdown-ring';
      ring.setAttribute('viewBox', '0 0 80 80');
      ring.style.setProperty('--parry-duration', windup + 'ms');
      ring.innerHTML = '<circle class="ring-bg" cx="40" cy="40" r="36"/><circle class="ring-fill" cx="40" cy="40" r="36"/>';
      parent.appendChild(ring);
      setTimeout(() => ring.remove(), windup + 100);
    }

    const now2 = Date.now();
    if (this.activeDebuffs.blind && now2 < this.activeDebuffs.blind) {
      const parryBtnEl = document.getElementById('tower-parry-btn');
      if (parryBtnEl) parryBtnEl.classList.add('blind-debuff');
    }
    this.showRhythmFeedback('parry');
    this.updateBattleUI();
    // 패링 페이즈 시각 효과
    const battleEl = document.getElementById('tower-battle');
    if (battleEl) battleEl.classList.add('parry-phase');
    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
      if (battleEl) battleEl.classList.remove('parry-phase');
      this.resolveEnemyStrike();
    }, windup);
  },

  parry() {
    if (!this.inBattle || !this.currentEnemy) return;
    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    this.inputLockedUntil = now + 60;

    const strike = this.pendingEnemyStrike;
    if (!strike) {
      this.showRhythmFeedback('parryFail');
      return;
    }
    if (strike.parryTried) {
      this.showRhythmFeedback('wait');
      return;
    }

    strike.parryTried = true;
    const delta = Math.abs(now - strike.resolveAt);
    if (delta <= TOWER_PARRY.perfectWindowMs) {
      strike.parryGrade = 'perfect';
      this.parryPerfectCount = (this.parryPerfectCount || 0) + 1;
      this.playSfx('parryPerfect', 70);
      this.showRhythmFeedback('parryPerfect');
      this.showKeyMessage('PERFECT!', 'msg-perfect');
      this.logLine('완벽 패링 타이밍을 잡았다!', 'log-good');
    } else if (delta <= TOWER_PARRY.goodWindowMs) {
      strike.parryGrade = 'good';
      this.parryGoodCount = (this.parryGoodCount || 0) + 1;
      this.playSfx('parryGood', 70);
      this.showRhythmFeedback('parryGood');
      this.logLine('패링 성공! 피해를 크게 줄인다.', 'log-good');
    } else {
      strike.parryGrade = 'fail';
      this.parryFailCount = (this.parryFailCount || 0) + 1;
      this.playSfx('miss', 120);
      this.showRhythmFeedback('parryFail');
      this.logLine('패링 타이밍 실패...', 'log-miss');
    }

    if (now >= strike.resolveAt - 12) {
      if (this.enemyTurnTimer) {
        clearTimeout(this.enemyTurnTimer);
        this.enemyTurnTimer = null;
      }
      this.resolveEnemyStrike();
      return;
    }

    this.updateBattleUI();
  },

  resolveEnemyStrike() {
    if (!this.inBattle || !this.currentEnemy) {
      this.pendingEnemyStrike = null;
      return;
    }
    if (this.currentEnemy.currentHp <= 0) {
      this.pendingEnemyStrike = null;
      return;
    }

    const strike = this.pendingEnemyStrike;
    if (!strike) return;
    this.pendingEnemyStrike = null;

    const { pattern } = strike;
    let enemyDmg = strike.damage;
    const parryGrade = strike.parryGrade || 'none';
    const isChainStrike = strike.isChain || false;

    if (parryGrade === 'perfect') {
      const counter = this.computeParryCounterDamage(pattern, true);
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - counter);
      this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);
      this.gainFocus(18);
      this.logLine(`완벽 패링! 반격 성공 (${counter} 피해)`, 'log-critical');
      this.showEventStrip(`✨ 완벽 패링! 반격 ${counter} 피해!`, 'event-parry-perfect', 2);
      this.spawnHitEffect('enemy', 'heavy');
      this.spawnDamageNumber('enemy', counter, { critical: true, heavy: true });
      this.playSfx('hitEnemyHeavy', 130);
      this.applyBattleImpact('critical');
      this.updateEnemyPhase();
      this.updateBattleUI();
      if (this.currentEnemy.currentHp <= 0) {
        this.chainActive = false;
        this.winFloor();
        return;
      }
      if (isChainStrike && this.chainActive) {
        this.advanceChainAttack();
      } else {
        this.queueEnemyIntent();
      }
      return;
    }

    if (parryGrade === 'good') {
      enemyDmg = Math.max(1, Math.floor(enemyDmg * TOWER_PARRY.goodDamageRatio));
      const counter = this.computeParryCounterDamage(pattern, false);
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - counter);
      this.gainFocus(10);
      this.logLine(`패링 성공! 피해 경감 + 반격 (${counter} 피해)`, 'log-good');
      this.spawnHitEffect('enemy', 'normal');
      this.spawnDamageNumber('enemy', counter);
      this.playSfx('hitEnemy', 70);
      this.updateEnemyPhase();
      if (this.currentEnemy.currentHp <= 0) {
        this.chainActive = false;
        this.updateBattleUI();
        this.winFloor();
        return;
      }
    } else if (parryGrade === 'fail') {
      enemyDmg = Math.max(1, Math.floor(enemyDmg * TOWER_PARRY.failDamageRatio));
      this.logLine('패링 실패로 반격을 정통으로 맞았다!', 'log-enemy');
      if (isChainStrike) this.chainAllParried = false;
    } else {
      // parryGrade === 'none'
      if (isChainStrike) this.chainAllParried = false;
    }

    // 백호 실드 체크 (패링 없이 맞을 때만)
    if (this.shieldActive && parryGrade === 'none') {
      this.shieldActive = false;
      this.logLine('실드가 적의 공격을 막아냈다!', 'log-good');
      this.showRhythmFeedback('parryGood');
      this.updateBattleUI();
      if (isChainStrike && this.chainActive) {
        this.advanceChainAttack();
      } else {
        this.queueEnemyIntent();
      }
      return;
    }

    this.playerHp = Math.max(0, this.playerHp - enemyDmg);
    this.totalDamageTaken += enemyDmg;

    // 패턴 디버프 적용 (패링 실패 or 패링 안 했을 때만)
    if (pattern.debuff && parryGrade !== 'perfect' && parryGrade !== 'good') {
      this.applyDebuff(pattern.debuff);
    }
    // 독 디버프 적용
    if (pattern.debuff === 'poison' && parryGrade !== 'perfect') {
      const poisonDmg = Math.max(1, Math.floor((this.currentEnemy.attack || 10) * 0.15));
      this.activeDebuffs.poison = { ticks: 3, dmg: poisonDmg };
      this.logLine(`독에 걸렸다! 매 턴 ${poisonDmg} 피해`, 'log-enemy');
    }

    const hitText = TOWER_ENEMY_ATTACK_TEXTS.hit[Math.floor(Math.random() * TOWER_ENEMY_ATTACK_TEXTS.hit.length)];
    const suffix = parryGrade === 'good' ? ' [경감]' : (parryGrade === 'fail' ? ' [실패]' : '');
    this.logLine(`${hitText} ${pattern.hitText} (${enemyDmg} 피해)${suffix}`, 'log-enemy');
    this.spawnHitEffect('player', pattern.heavy ? 'heavy' : 'normal');
    this.spawnDamageNumber('player', enemyDmg, { heavy: pattern.heavy || parryGrade === 'fail' });
    this.playSfx('hitPlayer', 65);
    if (pattern.heavy || parryGrade === 'fail') {
      this.playSfx('break', 320);
    }

    this.applyBattleImpact(pattern.heavy ? 'enemyHeavy' : 'enemy');
    this.updateBattleUI();

    // HP 위기 대사
    if (this.playerHp <= this.maxHp * 0.3 && !this._crisisDialogueShown) {
      this._crisisDialogueShown = true;
      this.showCombatDialogue('crisis');
    }

    if (this.playerHp <= 0) {
      this.chainActive = false;
      this.loseFloor();
      return;
    }

    if (isChainStrike && this.chainActive) {
      this.advanceChainAttack();
    } else {
      this.queueEnemyIntent();
    }
  },

  computeEnemyStrikeDamage(pattern, beast) {
    let enemyDmg = Math.max(1, Math.floor((this.currentEnemy.attack || 10) * pattern.multiplier) - (beast.towerDefBonus || 0));
    if (pattern.hits > 1) {
      let total = 0;
      for (let i = 0; i < pattern.hits; i++) {
        total += Math.max(1, Math.floor(enemyDmg * (0.72 + Math.random() * 0.22)));
      }
      enemyDmg = total;
    }
    return enemyDmg;
  },

  computeParryCounterDamage(pattern, perfect) {
    const beastId = this.selectedBeast;
    const level = (GameState.beasts[beastId] || {}).level || 1;
    const enemyAtk = this.currentEnemy.attack || 10;
    const base = 8 + Math.floor(level / 4) + Math.floor(enemyAtk * (perfect ? 0.75 : 0.32));
    const heavyBonus = pattern.heavy ? (perfect ? 6 : 3) : 0;
    return Math.max(1, base + heavyBonus);
  },

  updateRhythm(now) {
    let rollBonus = 0;
    let focusBonus = 0;
    let label = '';
    let grade = 'start';
    const firstTap = !this.lastTapAt;
    const idle = this.lastTapAt && (now - this.lastTapAt > TOWER_RHYTHM.timeout * 2);
    const cursorRatio = this.getRhythmCursorRatio(now);
    const cursorMs = Math.round(cursorRatio * TOWER_RHYTHM.timeout);

    if (firstTap || idle) {
      this.comboCount = 1;
      label = ' [리듬 시작]';
      grade = 'start';
    } else if (cursorMs >= TOWER_RHYTHM.perfectMin && cursorMs <= TOWER_RHYTHM.perfectMax) {
      this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);
      rollBonus = 2;
      focusBonus = 6;
      label = ' [리듬 완벽]';
      grade = 'perfect';
      this.perfectStreak++;
      // 5연속 PERFECT → "절대 리듬" (3초간 데미지 2배)
      if (this.perfectStreak >= 5 && !this.absoluteRhythm) {
        this.activateAbsoluteRhythm();
      }
    } else if (cursorMs >= TOWER_RHYTHM.goodMin && cursorMs <= TOWER_RHYTHM.goodMax) {
      this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);
      rollBonus = 1;
      focusBonus = 3;
      label = ' [리듬 유지]';
      grade = 'good';
      this.perfectStreak = 0;
    } else {
      this.comboCount = Math.max(1, Math.floor(this.comboCount / 2));
      label = ' [호흡 붕괴]';
      grade = 'break';
      this.perfectStreak = 0;
    }

    this.lastTapAt = now;
    this.showRhythmFeedback(grade);
    this.flashRhythmMeter(grade);
    return { rollBonus, focusBonus, label, grade };
  },

  getRhythmBeatIndex(now) {
    const start = this.rhythmCycleStart || now;
    const elapsed = Math.max(0, now - start);
    return Math.floor(elapsed / TOWER_RHYTHM.timeout);
  },

  getRhythmCursorRatio(now) {
    const start = this.rhythmCycleStart || now;
    const cycle = TOWER_RHYTHM.timeout * 2;
    const elapsed = ((now - start) % cycle + cycle) % cycle;
    return elapsed <= TOWER_RHYTHM.timeout
      ? elapsed / TOWER_RHYTHM.timeout
      : (cycle - elapsed) / TOWER_RHYTHM.timeout;
  },

  setupRhythmMeter() {
    const meter = document.getElementById('tower-rhythm-meter');
    if (!meter) return;

    const pct = (v) => `${Math.max(0, Math.min(100, (v / TOWER_RHYTHM.timeout) * 100)).toFixed(2)}%`;
    meter.style.setProperty('--good-start', pct(TOWER_RHYTHM.goodMin));
    meter.style.setProperty('--good-end', pct(TOWER_RHYTHM.goodMax));
    meter.style.setProperty('--perfect-start', pct(TOWER_RHYTHM.perfectMin));
    meter.style.setProperty('--perfect-end', pct(TOWER_RHYTHM.perfectMax));
    meter.classList.remove('late', 'hit-good', 'hit-perfect', 'hit-break');

    const cursor = document.getElementById('tower-rhythm-cursor');
    if (cursor) cursor.style.left = '0%';
    if (!this.rhythmCycleStart) this.rhythmCycleStart = Date.now();

    this.stopRhythmMeter();
    const tick = () => {
      if (!this.inBattle) {
        this.rhythmFrame = null;
        return;
      }
      const now = Date.now();
      const start = this.rhythmCycleStart || now;
      const cycle = TOWER_RHYTHM.timeout * 2;
      const elapsed = ((now - start) % cycle + cycle) % cycle;
      const forward = elapsed <= TOWER_RHYTHM.timeout;
      const ratio = this.getRhythmCursorRatio(now);
      if (cursor) cursor.style.left = `${(ratio * 100).toFixed(2)}%`;
      meter.classList.toggle('reverse', !forward);
      this.rhythmFrame = requestAnimationFrame(tick);
    };
    this.rhythmFrame = requestAnimationFrame(tick);
  },

  stopRhythmMeter() {
    if (this.rhythmFrame) {
      cancelAnimationFrame(this.rhythmFrame);
      this.rhythmFrame = null;
    }
    if (this.rhythmFlashTimer) {
      clearTimeout(this.rhythmFlashTimer);
      this.rhythmFlashTimer = null;
    }
    const meter = document.getElementById('tower-rhythm-meter');
    if (meter) meter.classList.remove('late', 'hit-good', 'hit-perfect', 'hit-break', 'reverse');
  },

  flashRhythmMeter(grade) {
    const meter = document.getElementById('tower-rhythm-meter');
    if (!meter) return;
    meter.classList.remove('hit-good', 'hit-perfect', 'hit-break');

    let cls = '';
    if (grade === 'perfect') cls = 'hit-perfect';
    else if (grade === 'good') cls = 'hit-good';
    else if (grade === 'break') cls = 'hit-break';
    if (!cls) return;

    meter.classList.add(cls);
    if (this.rhythmFlashTimer) clearTimeout(this.rhythmFlashTimer);
    this.rhythmFlashTimer = setTimeout(() => {
      meter.classList.remove(cls);
      this.rhythmFlashTimer = null;
    }, 170);
  },

  clearFeedbackTimer() {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  },

  showRhythmFeedback(kind) {
    const el = document.getElementById('tower-feedback');
    if (!el) return;

    const map = {
      start: { text: '리듬 시작', cls: 'fb-start' },
      good: { text: 'GOOD', cls: 'fb-good' },
      perfect: { text: 'PERFECT', cls: 'fb-perfect' },
      break: { text: '리듬 끊김', cls: 'fb-break' },
      wait: { text: '다음 박자 대기', cls: 'fb-start' },
      skill: { text: '각성 일격!', cls: 'fb-skill' },
      parry: { text: '패링 준비', cls: 'fb-parry' },
      parryGood: { text: '패링 GOOD', cls: 'fb-parry-good' },
      parryPerfect: { text: '패링 PERFECT', cls: 'fb-parry-perfect' },
      parryFail: { text: '패링 실패', cls: 'fb-parry-fail' }
    };
    const item = map[kind] || map.start;

    el.textContent = item.text;
    el.className = `show ${item.cls}`;
    this.clearFeedbackTimer();
    this.feedbackTimer = setTimeout(() => {
      el.className = '';
      this.feedbackTimer = null;
    }, 560);
  },

  getComboDamageMultiplier() {
    return 1 + Math.max(0, this.comboCount - 1) * 0.08;
  },

  // 절대 리듬 모드 활성화 (5연속 PERFECT)
  activateAbsoluteRhythm() {
    this.absoluteRhythm = true;
    this.logLine('절대 리듬! 3초간 데미지 2배!', 'log-critical');
    this.showBanner('절대 리듬 발동!', 'banner-critical');
    this.showKeyMessage('절대 리듬!!!', 'msg-skill');
    this.showEventStrip('🎵 절대 리듬! 3초간 데미지 2배!', 'event-absolute-rhythm', 3.5);
    const battle = document.getElementById('tower-battle');
    if (battle) battle.classList.add('absolute-rhythm-active');
    this.playSfx('reward');

    if (this._absoluteRhythmTimer) clearTimeout(this._absoluteRhythmTimer);
    this._absoluteRhythmTimer = setTimeout(() => {
      this.absoluteRhythm = false;
      this.perfectStreak = 0;
      this._absoluteRhythmTimer = null;
      const b = document.getElementById('tower-battle');
      if (b) b.classList.remove('absolute-rhythm-active');
      if (this.inBattle) this.logLine('절대 리듬이 끝났다.', 'log-miss');
    }, 3000);
  },

  gainFocus(amount) {
    const prev = this.focusGauge;
    this.focusGauge = Math.min(100, this.focusGauge + amount);
    if (this.focusGauge >= 100 && prev < 100) {
      this.logLine('집중이 가득 찼다! [각성 일격] 사용 가능', 'log-good');
    }
  },

  getEnemyAttackChance() {
    const base = this.currentEnemy.attackRate || 0.5;
    return Math.min(0.9, base + this.enemyPhase * 0.08);
  },

  pickEnemyPattern() {
    // 도발 디버프: 강제 강공
    if (this.activeDebuffs.taunt) {
      delete this.activeDebuffs.taunt;
      this.updateDebuffUI();
      return { name: '강공', multiplier: 1.35, hits: 1, hitText: '도발에 의한 강력한 일격!', heavy: true };
    }

    // 연계 패턴 확률 체크 (20%)
    if (!this.chainActive && this.currentEnemy && this.currentEnemy.name && typeof CHAIN_ATTACK_DATA !== 'undefined') {
      const baseName = this.currentEnemy.name.replace(/\s*Lv\.\d+$/, '').replace(/^\S+\s/, '').replace(/\s*\[BOSS\]$/, '');
      const chainData = CHAIN_ATTACK_DATA[baseName];
      if (chainData && Math.random() < 0.20 && this.enemyPhase >= 1) {
        this.startChainAttack(chainData);
        return this.getChainPattern(chainData.chain[0]);
      }
    }

    const pool = [
      { name: '견제', multiplier: 0.85, hits: 1, hitText: '상대를 흔들며 틈을 만들었다.', heavy: false },
      { name: '정타', multiplier: 1.0, hits: 1, hitText: '정면에서 강하게 밀어붙였다.', heavy: false }
    ];

    if (this.enemyPhase >= 1) {
      pool.push({ name: '강공', multiplier: 1.35, hits: 1, hitText: '무거운 일격을 꽂아 넣었다!', heavy: true });
    }
    if (this.enemyPhase >= 2) {
      pool.push({ name: '난타', multiplier: 0.78, hits: 2, hitText: '연속타를 퍼부었다!', heavy: true });
    }

    // 적 고유 패턴
    if (this.currentEnemy && this.currentEnemy.name && typeof ENEMY_PATTERNS !== 'undefined') {
      const baseName = this.currentEnemy.name.replace(/\s*Lv\.\d+$/, '');
      const enemyData = ENEMY_PATTERNS[baseName];
      if (enemyData && enemyData.unique) {
        enemyData.unique.forEach(p => {
          if (!p.heavy || this.enemyPhase >= 1) pool.push(p);
        });
      }
    }

    return pool[Math.floor(Math.random() * pool.length)];
  },

  // 연계 패턴 시작
  startChainAttack(chainData) {
    this.chainActive = true;
    this.chainQueue = chainData.chain.slice();
    this.chainIndex = 0;
    this.chainAllParried = true;
    this.logLine(`${chainData.chainText}`, 'log-enemy');
    this.showBanner(chainData.chainText, 'banner-danger');
    this.showEventStrip(`⚔ ${chainData.chainText} (${chainData.chain.length}연속!)`, 'event-chain', 3);
  },

  // 연계 패턴에서 이름으로 패턴 찾기
  getChainPattern(attackName) {
    if (this.currentEnemy && this.currentEnemy.name && typeof ENEMY_PATTERNS !== 'undefined') {
      const baseName = this.currentEnemy.name.replace(/\s*Lv\.\d+$/, '').replace(/^\S+\s/, '').replace(/\s*\[BOSS\]$/, '');
      const enemyData = ENEMY_PATTERNS[baseName];
      if (enemyData && enemyData.unique) {
        const found = enemyData.unique.find(p => p.name === attackName);
        if (found) return found;
      }
    }
    const basicPatterns = {
      '견제': { name: '견제', multiplier: 0.85, hits: 1, hitText: '상대를 흔들며 틈을 만들었다.', heavy: false },
      '강공': { name: '강공', multiplier: 1.35, hits: 1, hitText: '무거운 일격을 꽂아 넣었다!', heavy: true }
    };
    return basicPatterns[attackName] || { name: attackName, multiplier: 1.0, hits: 1, hitText: `${attackName}!`, heavy: false };
  },

  // 연계 패턴 다음 단계 진행
  advanceChainAttack() {
    this.chainIndex++;
    if (this.chainIndex >= this.chainQueue.length) {
      this.chainActive = false;
      if (this.chainAllParried) {
        this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 3);
        this.comboPeak = Math.max(this.comboPeak, this.comboCount);
        this.gainFocus(50);
        this.logLine('연계 공격 완벽 방어! 콤보 +3, 집중 대폭 상승!', 'log-critical');
        this.showBanner('연계 방어 성공!', 'banner-critical');
        this.showEventStrip('✨ 연계 방어 완벽! 콤보+3 집중+50!', 'event-parry-perfect', 2.5);
      } else {
        this.logLine('연계 공격이 끝났다.', 'log-miss');
      }
      this.updateBattleUI();
      return;
    }
    const nextName = this.chainQueue[this.chainIndex];
    this.showEventStrip(`⚔ 연계 ${this.chainIndex + 1}/${this.chainQueue.length} — ${nextName}!`, 'event-chain', 1.5);
    setTimeout(() => {
      if (!this.inBattle || !this.currentEnemy || this.currentEnemy.currentHp <= 0) {
        this.chainActive = false;
        return;
      }
      this.beginChainWindup(this.getChainPattern(nextName));
    }, 400);
  },

  // 연계 패턴의 개별 공격 윈드업
  beginChainWindup(pattern) {
    if (!this.inBattle || !this.currentEnemy || this.currentEnemy.currentHp <= 0) return;
    if (this.pendingEnemyStrike) return;

    const beast = GameState.beasts[this.selectedBeast];
    const enemyDmg = this.computeEnemyStrikeDamage(pattern, beast);
    const windup = 450 + (pattern.heavy ? 80 : 0);
    const resolveAt = Date.now() + windup;

    this.pendingEnemyStrike = { pattern, damage: enemyDmg, resolveAt, parryGrade: 'none', parryTried: false, isChain: true };

    if (pattern.unparryable) {
      this.pendingEnemyStrike.parryTried = true;
      this.logLine(`연계: ${pattern.name}! 패링 불가!`, 'log-enemy');
      this.showBanner(`연계: ${pattern.name} — 패링 불가!`, 'banner-danger');
    } else {
      this.logLine(`연계: ${pattern.name}! 패링하라!`, 'log-enemy');
      this.showBanner(`연계: ${pattern.name}! 패링!`, 'banner-parry');
    }
    this.setIntent(`⚔ 연계 ${this.chainIndex + 1}/${this.chainQueue.length} — ${pattern.name}!`);
    this.showKeyMessage(`연계: ${pattern.name}!`, 'msg-attack');
    this.showRhythmFeedback('parryWarning');
    this.updateBattleUI();

    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
      this.resolveEnemyStrike();
    }, windup);
  },

  updateEnemyPhase() {
    if (!this.currentEnemy || !this.currentEnemy.hp) return;
    const ratio = this.currentEnemy.currentHp / this.currentEnemy.hp;
    const next = ratio <= 0.3 ? 2 : ratio <= 0.6 ? 1 : 0;

    if (next > this.enemyPhase) {
      this.enemyPhase = next;
      if (next === 1) {
        this.logLine('적의 기세가 상승했다! 반격 주의!', 'log-enemy');
        this.showBanner('페이즈 2 — 적이 강해진다!', 'banner-danger');
        this.showEventStrip('⚠ 페이즈 2 — 적이 분노했다!', 'event-phase', 3.5);
        // 페이즈 1 기믹: 약점 노출
        if (!this._phaseGimmickUsed[1]) {
          this._phaseGimmickUsed[1] = true;
          setTimeout(() => this.triggerWeakness(), 800);
        }
      } else if (next === 2) {
        this.logLine('적이 광폭 상태에 돌입했다!', 'log-enemy');
        this.showBanner('페이즈 3 — 광폭!', 'banner-danger');
        this.showEventStrip('🔥 페이즈 3 — 광폭 상태!', 'event-phase', 3.5);
        // 페이즈 2 기믹: 필살기 예고
        if (!this._phaseGimmickUsed[2]) {
          this._phaseGimmickUsed[2] = true;
          this.triggerBossGimmick();
        }
      }
      this.playSfx('break', 280);
      this.applyBattleImpact('enemyHeavy');
      this.queueEnemyIntent();
    }
  },

  queueEnemyIntent() {
    // 주작 화염 DOT 틱 (적에게)
    if (this.dotEffect && this.dotEffect.ticks > 0) {
      const dotDmg = this.dotEffect.dmg;
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - dotDmg);
      this.dotEffect.ticks--;
      this.totalDamageDealt += dotDmg;
      this.logLine(`화염 지속 피해! (${dotDmg})`, 'log-critical');
      this.spawnDamageNumber('enemy', dotDmg, { critical: false });
      this.updateEnemyPhase();
      if (this.dotEffect.ticks <= 0) this.dotEffect = null;
      if (this.currentEnemy.currentHp <= 0) {
        this.logLine(`${this.currentEnemy.name}이(가) 화염에 쓰러졌다!`, 'log-critical');
        this.winFloor();
        return;
      }
    }
    // 플레이어 독 DOT 틱
    if (this.activeDebuffs.poison && this.activeDebuffs.poison.ticks > 0) {
      const pdmg = this.activeDebuffs.poison.dmg;
      this.playerHp = Math.max(0, this.playerHp - pdmg);
      this.activeDebuffs.poison.ticks--;
      this.totalDamageTaken += pdmg;
      this.logLine(`독 지속 피해! (${pdmg})`, 'log-enemy');
      this.spawnDamageNumber('player', pdmg, {});
      this.updateBattleUI();
      if (this.activeDebuffs.poison.ticks <= 0) { delete this.activeDebuffs.poison; this.updateDebuffUI(); }
      if (this.playerHp <= 0) {
        this.logLine('독에 의해 쓰러졌다...', 'log-enemy');
        this.playDefeatCue();
        this.loseFloor();
        return;
      }
    }

    // 약점 노출 기믹 (랜덤 발생)
    if (!this.weaknessWindow && Math.random() < 0.12 && this.enemyPhase >= 1) {
      this.triggerWeakness();
    }

    const intents = [
      ['적이 거리를 재고 있다.', '적이 허점을 살피고 있다.'],
      ['적의 기세가 올라간다. 강공 주의!', '적이 날카롭게 반격 각을 잡는다.'],
      ['적이 광폭해졌다! 타이밍을 놓치지 마라.', '치명적인 반격이 예고된다!']
    ];
    const pool = intents[this.enemyPhase] || intents[0];
    this.setIntent(pool[Math.floor(Math.random() * pool.length)]);
  },

  setIntent(text) {
    const el = document.getElementById('tower-intent');
    if (el) el.textContent = text || '';
  },

  updateBattleUI() {
    if (!this.currentEnemy) return;

    const enemyRatio = this.currentEnemy.currentHp / this.currentEnemy.hp;
    const playerRatio = this.playerHp / this.maxHp;
    const comboMult = this.getComboDamageMultiplier();

    const enemyFill = document.getElementById('tower-enemy-hp-fill');
    const playerFill = document.getElementById('tower-player-hp-fill');
    const playerText = document.getElementById('tower-player-hp-text');
    const rhythmText = document.getElementById('tower-rhythm-text');
    const focusText = document.getElementById('tower-focus-text');
    const focusFill = document.getElementById('tower-focus-fill');
    const tapBtn = document.getElementById('tower-tap-btn');
    const parryBtn = document.getElementById('tower-parry-btn');
    const skillBtn = document.getElementById('tower-skill-btn');
    const battle = document.getElementById('tower-battle');

    if (enemyFill) enemyFill.style.width = `${Math.max(0, Math.min(100, enemyRatio * 100))}%`;
    if (playerFill) playerFill.style.width = `${Math.max(0, Math.min(100, playerRatio * 100))}%`;
    if (playerText) playerText.textContent = `${this.playerHp}/${this.maxHp}`;
    if (rhythmText) rhythmText.textContent = `리듬 x${comboMult.toFixed(2)} (${this.comboCount}연격)`;
    if (focusText) focusText.textContent = `집중 ${Math.floor(this.focusGauge)}%`;
    if (focusFill) focusFill.style.width = `${Math.max(0, Math.min(100, this.focusGauge))}%`;
    if (tapBtn) tapBtn.classList.toggle('combo-hot', this.comboCount >= 4);
    if (parryBtn) {
      const ready = !!this.pendingEnemyStrike;
      parryBtn.disabled = !ready;
      parryBtn.classList.toggle('ready', ready);
      parryBtn.textContent = ready ? '패링!' : '패링 대기';
    }

    if (skillBtn) {
      const skill = TOWER_BEAST_SKILLS[this.selectedBeast] || TOWER_BEAST_SKILLS.cheongryong;
      const skillName = skill.name || '각성 일격';
      const ready = this.focusGauge >= 100;
      skillBtn.disabled = !ready;
      skillBtn.classList.toggle('ready', ready);
      skillBtn.textContent = ready ? `${skillName} READY!` : `${skillName} (${Math.floor(this.focusGauge)}%)`;
    }

    if (battle) {
      battle.classList.toggle('danger', playerRatio <= 0.3);
      // 적 초상화 페이즈 클래스
      const portrait = document.getElementById('tower-enemy-portrait');
      if (portrait) {
        portrait.classList.toggle('phase1', this.enemyPhase >= 1);
        portrait.classList.toggle('phase2', this.enemyPhase >= 2);
      }
    }
  },

  applyBattleImpact(kind) {
    const battle = document.getElementById('tower-battle');
    if (!battle) return;

    battle.classList.remove('impact', 'impact-strong');
    if (kind === 'critical' || kind === 'enemyHeavy') {
      battle.classList.add('impact-strong');
      setTimeout(() => battle.classList.remove('impact-strong'), 240);
    } else {
      battle.classList.add('impact');
      setTimeout(() => battle.classList.remove('impact'), 170);
    }
  },

  spawnHitEffect(target, intensity) {
    const layer = document.getElementById('tower-hit-vfx');
    if (!layer) return;

    const isPlayerHit = target === 'player';
    const heavy = intensity === 'heavy' || intensity === 'skill';
    const count = heavy ? 3 : 2;
    const files = [
      'assets/vfx/hits/slash_jab_small.png',
      'assets/vfx/hits/slash_jab_medium.png',
      'assets/vfx/hits/slash_leap_small.png'
    ];
    const rect = layer.getBoundingClientRect();
    const layerW = Math.max(360, rect.width || (typeof window !== 'undefined' ? window.innerWidth : 800));
    const layerH = Math.max(320, rect.height || (typeof window !== 'undefined' ? window.innerHeight : 600));
    const spriteAspect = 0.55;
    const minW = heavy
      ? Math.max(140, Math.min(layerW * 0.16, 220))
      : Math.max(110, Math.min(layerW * 0.12, 170));
    const maxW = heavy
      ? Math.max(minW + 20, Math.min(layerW * 0.30, 360))
      : Math.max(minW + 18, Math.min(layerW * 0.24, 280));
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    for (let i = 0; i < count; i++) {
      const slash = document.createElement('img');
      const width = minW + Math.random() * (maxW - minW);
      const halfWPct = ((width * 0.5) / layerW) * 100 + 0.8;
      const halfHPct = (((width * spriteAspect) * 0.5) / layerH) * 100 + 0.8;
      const rawLeft = (isPlayerHit ? 62 : 38) + (Math.random() * 20 - 10);
      const rawTop = 50 + (Math.random() * 20 - 10);
      const left = clamp(rawLeft, halfWPct, 100 - halfWPct);
      const top = clamp(rawTop, halfHPct, 100 - halfHPct);
      const rot = (isPlayerHit ? -18 : 18) + (Math.random() * 22 - 11);
      const shiftBase = Math.min(20, width * 0.07);

      slash.className = `hit-vfx-sprite ${isPlayerHit ? 'enemy' : 'ally'}${heavy ? ' heavy' : ''}`;
      slash.src = files[Math.floor(Math.random() * files.length)];
      slash.alt = '';
      slash.style.left = `${left}%`;
      slash.style.top = `${top}%`;
      slash.style.width = `${Math.round(width)}px`;
      slash.style.setProperty('--slash-rot', `${rot}deg`);
      slash.style.setProperty('--slash-shift-x', `${isPlayerHit ? -shiftBase : shiftBase}px`);
      slash.style.setProperty('--slash-shift-y', `${(Math.random() * 16) - 8}px`);

      layer.appendChild(slash);
      setTimeout(() => slash.remove(), 420);
    }

    const flash = document.createElement('div');
    flash.className = `hit-vfx-flash ${isPlayerHit ? 'enemy' : 'ally'}${heavy ? ' heavy' : ''}`;
    layer.appendChild(flash);
    setTimeout(() => flash.remove(), 200);
  },

  spawnDamageNumber(target, amount, options = {}) {
    const layer = document.getElementById('tower-hit-vfx');
    if (!layer) return;
    const value = Math.max(0, Math.floor(amount || 0));
    if (!value) return;

    const isPlayerHit = target === 'player';
    const dmg = document.createElement('div');
    dmg.className = `hit-vfx-dmg ${isPlayerHit ? 'enemy' : 'ally'}${options.critical ? ' crit' : ''}${options.heavy ? ' heavy' : ''}`;
    dmg.textContent = `-${value}`;
    dmg.style.left = `${(isPlayerHit ? 64 : 36) + (Math.random() * 10 - 5)}%`;
    dmg.style.top = `${46 + (Math.random() * 10 - 5)}%`;
    layer.appendChild(dmg);
    setTimeout(() => dmg.remove(), options.critical ? 760 : 620);
  },

  logLine(text, className) {
    const log = document.getElementById('tower-combat-log');
    if (!log) return;

    const line = document.createElement('div');
    if (className) line.className = className;
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  },

  // 메시지 배너 (패링 타이밍 중에도 읽을 수 있는 큰 텍스트)
  showBanner(text, cls) {
    const banner = document.getElementById('tower-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.className = `combat-banner show ${cls || ''}`;
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      banner.className = 'combat-banner';
    }, 1800);
  },

  // 디버프 적용
  applyDebuff(type) {
    const now = Date.now();
    const def = DEBUFF_TYPES[type];
    if (!def) return;
    if (type === 'taunt') {
      this.activeDebuffs.taunt = true;
      this.logLine(`${def.icon} ${def.name}! ${def.desc}`, 'log-enemy');
    } else if (type === 'poison') {
      // poison은 resolveEnemyStrike에서 처리
      return;
    } else {
      this.activeDebuffs[type] = now + def.duration;
      this.logLine(`${def.icon} ${def.name}! ${def.desc} (${(def.duration/1000).toFixed(1)}초)`, 'log-enemy');
      this.showBanner(`${def.icon} ${def.name} 발동!`, 'banner-debuff');
      this.showEventStrip(`${def.icon} ${def.name} — ${def.desc}`, 'event-debuff', 2.5);
      const tid = setTimeout(() => {
        if (this.activeDebuffs[type] && Date.now() >= this.activeDebuffs[type]) {
          delete this.activeDebuffs[type];
          this.updateDebuffUI();
          if (type === 'blind') {
            const parryBtnEl = document.getElementById('tower-parry-btn');
            if (parryBtnEl) parryBtnEl.classList.remove('blind-debuff');
          }
        }
      }, def.duration + 50);
      this._debuffTimers.push(tid);
    }
    this.updateDebuffUI();
  },

  updateDebuffUI() {
    const bar = document.getElementById('tower-debuff-bar');
    if (!bar) return;
    bar.innerHTML = '';
    const now = Date.now();
    Object.keys(this.activeDebuffs).forEach(type => {
      const def = DEBUFF_TYPES[type];
      if (!def) return;
      if (type !== 'taunt' && type !== 'poison' && this.activeDebuffs[type] < now) return;
      const badge = document.createElement('span');
      badge.className = 'debuff-badge';
      badge.style.color = def.color;
      badge.style.borderColor = def.color;
      badge.textContent = `${def.icon} ${def.name}`;
      bar.appendChild(badge);
    });
  },

  // 약점 노출 기믹
  triggerWeakness() {
    if (!this.inBattle || this.weaknessWindow) return;
    this.weaknessWindow = true;
    this.logLine('적이 빈틈을 보인다! 지금 공격하면 2배 피해!', 'log-good');
    this.showBanner('약점 노출! 지금 공격!', 'banner-weakness');
    this.setIntent('⚡ 적의 빈틈! 빠르게 공격하라!');
    this.showEventStrip('💥 약점 노출! 공격 시 2배 피해!', 'event-weakness', 3);
    this._weaknessTimer = setTimeout(() => {
      this.weaknessWindow = false;
      this._weaknessTimer = null;
      if (this.inBattle) {
        this.logLine('적이 자세를 바로잡았다.', 'log-miss');
        this.setIntent('적이 다시 자세를 잡았다.');
      }
    }, 2500);
  },

  // 보스 페이즈 기믹: 필살기 예고
  triggerBossGimmick() {
    if (!this.inBattle) return;
    const requiredCombo = 5;
    this.logLine(`적이 필살기를 준비한다! ${requiredCombo}콤보 이상으로 캔슬하라!`, 'log-enemy');
    this.showBanner(`필살기 예고! ${requiredCombo}콤보로 캔슬!`, 'banner-danger');
    this.setIntent(`⚠ 필살기 준비 중! ${requiredCombo}콤보 이상 쌓아 캔슬!`);
    this.showEventStrip(`🔥 필살기 예고! ${requiredCombo}콤보로 캔슬!`, 'event-gimmick', 3.5);

    // 3초 후 판정
    const gimmickTimer = setTimeout(() => {
      if (!this.inBattle) return;
      if (this.comboCount >= requiredCombo) {
        this.logLine('필살기를 캔슬했다! 적이 큰 빈틈을 보인다!', 'log-critical');
        this.showBanner('필살기 캔슬 성공!', 'banner-critical');
        this.enemyStaggerTurns = 2;
        this.triggerWeakness();
      } else {
        const bigDmg = Math.max(1, Math.floor((this.currentEnemy.attack || 10) * 2.0));
        this.playerHp = Math.max(0, this.playerHp - bigDmg);
        this.totalDamageTaken += bigDmg;
        this.logLine(`필살기 캔슬 실패! 강력한 일격! (${bigDmg} 피해)`, 'log-enemy');
        this.showBanner('필살기 피격!', 'banner-danger');
        this.spawnHitEffect('player', 'heavy');
        this.spawnDamageNumber('player', bigDmg, { heavy: true });
        this.applyBattleImpact('enemyHeavy');
        this.updateBattleUI();
        if (this.playerHp <= 0) {
          this.logLine('필살기에 쓰러졌다...', 'log-enemy');
          this.loseFloor();
        }
      }
    }, 3000);
    this._debuffTimers.push(gimmickTimer);
  },

  // 신수 전투 대사 표시
  showCombatDialogue(situation) {
    const beastId = this.selectedBeast;
    const data = BEAST_DATA[beastId];
    if (!data || !data.combatDialogues) return;
    const pool = data.combatDialogues[situation];
    if (!pool || pool.length === 0) return;

    const text = pool[Math.floor(Math.random() * pool.length)];
    const el = document.getElementById('tower-combat-dialogue');
    const textEl = document.getElementById('tower-combat-dialogue-text');
    if (!el || !textEl) return;

    textEl.textContent = text;
    el.classList.remove('hidden', 'dialogue-fade-out');
    el.classList.add('dialogue-show');
    clearTimeout(this._dialogueTimer);
    this._dialogueTimer = setTimeout(() => {
      el.classList.add('dialogue-fade-out');
      setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('dialogue-show', 'dialogue-fade-out');
      }, 400);
    }, 2500);
  },

  // 전투 결과 계산
  computeCombatGrade() {
    const totalParries = this.parryPerfectCount + this.parryGoodCount + this.parryFailCount;
    const parryRate = totalParries > 0 ? ((this.parryPerfectCount + this.parryGoodCount) / totalParries) : 0;
    const hpRatio = this.playerHp / this.maxHp;
    const elapsedSec = Math.max(1, (Date.now() - this.fightStartedAt) / 1000);

    let score = 0;
    score += Math.min(25, this.comboPeak * 2.5);         // 최대 콤보 (25점)
    score += Math.min(25, parryRate * 25);                // 패링 성공률 (25점)
    score += Math.min(20, hpRatio * 20);                  // 남은 체력 (20점)
    score += Math.min(15, Math.max(0, (30 - elapsedSec) * 0.5)); // 속도 보너스 (15점)
    score += Math.min(15, this.skillUsedCount * 5);       // 스킬 사용 (15점)

    score = Math.max(0, Math.min(100, Math.round(score)));

    const gradeData = COMBAT_GRADES.find(g => score >= g.min) || COMBAT_GRADES[COMBAT_GRADES.length - 1];
    return { score, ...gradeData, parryRate, elapsedSec };
  },

  // 전투 결과 리포트 표시
  showCombatResult(won) {
    const container = document.getElementById('tower-result-overlay');
    if (!container) return;

    const grade = this.computeCombatGrade();
    const totalParries = this.parryPerfectCount + this.parryGoodCount + this.parryFailCount;

    container.innerHTML = `
      <div class="combat-result-card ${won ? 'win' : 'lose'}">
        <div class="result-title">${won ? '전투 승리!' : '전투 패배...'}</div>
        <div class="result-grade" style="color:${grade.color}">${grade.grade}</div>
        <div class="result-desc">${grade.desc}</div>
        <div class="result-stats">
          <div class="result-stat"><span>최고 콤보</span><span>${this.comboPeak}</span></div>
          <div class="result-stat"><span>패링 성공</span><span>${this.parryPerfectCount + this.parryGoodCount}/${totalParries}</span></div>
          <div class="result-stat"><span>완벽 패링</span><span>${this.parryPerfectCount}</span></div>
          <div class="result-stat"><span>총 피해량</span><span>${this.totalDamageDealt}</span></div>
          <div class="result-stat"><span>받은 피해</span><span>${this.totalDamageTaken}</span></div>
          <div class="result-stat"><span>전투 시간</span><span>${Math.round(grade.elapsedSec)}초</span></div>
        </div>
        <button class="result-close-btn" onclick="Tower.closeCombatResult()">확인</button>
      </div>
    `;
    container.classList.remove('hidden');
  },

  closeCombatResult() {
    const container = document.getElementById('tower-result-overlay');
    if (container) {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
  },

  // UX: 핵심 메시지 오버레이 (리듬/패링 중에도 읽을 수 있는 큰 텍스트)
  showKeyMessage(text, cls) {
    const parent = document.getElementById('tower-battle');
    if (!parent) return;
    const msg = document.createElement('div');
    msg.className = `combat-key-message ${cls || ''}`;
    msg.textContent = text;
    parent.appendChild(msg);
    setTimeout(() => msg.remove(), 1600);
  },

  // 전투 이벤트 스트립 — 리듬/패링 중에도 항상 보이는 상단 알림 (UX 개선)
  showEventStrip(text, cls, durationSec) {
    const strip = document.getElementById('tower-event-strip');
    if (!strip) return;
    const dur = durationSec || 2.5;
    const item = document.createElement('div');
    item.className = `event-item ${cls || ''}`;
    item.textContent = text;
    item.style.setProperty('--event-duration', dur + 's');
    while (strip.children.length >= 3) strip.removeChild(strip.firstChild);
    strip.appendChild(item);
    setTimeout(() => { if (item.parentNode) item.remove(); }, (dur + 0.5) * 1000);
  },

  // 패시브 스킬 미니 컷씬 (Combat의 메서드 위임)
  showPassiveSkillEffect(skill, beastId) {
    if (typeof Combat !== 'undefined' && Combat.showPassiveSkillEffect) {
      Combat.showPassiveSkillEffect(skill, beastId, 'tower');
    }
  },

  // 확률 기반 패시브 스킬 트리거 (탭 공격 시 확률 발동)
  checkPassiveSkillTrigger() {
    if (!this.inBattle || !this.currentEnemy) return;
    const beastId = this.selectedBeast;
    const beast = GameState.beasts[beastId];
    if (!beast) return;

    const chance = 0.08 + this.comboCount * 0.01;
    if (Math.random() > chance) return;

    const level = beast.level || 1;
    const baseDmg = 5 + Math.floor(level / 8);

    const passiveSkills = {
      cheongryong: { name: '질풍', text: '바람이 적을 스쳤다!', dmg: baseDmg, color: '#4fc3f7' },
      baekho: { name: '섬광', text: '번개같은 추가타!', dmg: Math.floor(baseDmg * 1.3), color: '#fff59d' },
      jujak: { name: '잔화', text: '불꽃이 튀었다!', dmg: baseDmg, color: '#ef5350' },
      hyeonmu: { name: '대지의 힘', text: '대지가 울렸다!', heal: Math.floor(baseDmg * 0.8), color: '#66bb6a' },
      hwangryong: { name: '천광', text: '빛이 내리쳤다!', dmg: Math.floor(baseDmg * 1.5), color: '#ffd54f' }
    };

    const skill = passiveSkills[beastId] || passiveSkills.cheongryong;

    if (skill.heal) {
      this.playerHp = Math.min(this.maxHp, this.playerHp + skill.heal);
      this.logLine(`[${skill.name}] ${skill.text} (+${skill.heal} 회복)`, 'log-good');
      this.updateBattleUI();
    } else {
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - skill.dmg);
      this.totalDamageDealt += skill.dmg;
      this.logLine(`[${skill.name}] ${skill.text} (${skill.dmg} 추가 피해)`, 'log-critical');
      this.spawnDamageNumber('enemy', skill.dmg, { critical: true });
      this.updateEnemyPhase();
      this.updateBattleUI();
    }

    this.showKeyMessage(skill.name + '!', 'msg-skill');
    this.playSfx('hitEnemyHeavy', 120);
    this.showPassiveSkillEffect(skill, beastId);
    this.showEventStrip(`${BEAST_SKILL_VFX[beastId]?.icon || '⚡'} ${skill.name}!`, 'event-passive', 2);
  },

  clearBattleTimers() {
    if (this.enemyTurnTimer) {
      clearTimeout(this.enemyTurnTimer);
      this.enemyTurnTimer = null;
    }
    this.pendingEnemyStrike = null;
    this.clearFeedbackTimer();
  },

  // 층 클리어
  winFloor() {
    this.playSfx('reward');
    if (typeof StoryAudio !== 'undefined' && StoryAudio && typeof StoryAudio.stopAmbient === 'function') {
      StoryAudio.stopAmbient();
    }
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();
    this.absoluteRhythm = false;
    this.chainActive = false;
    this.chainQueue = [];
    this.chainIndex = 0;
    if (this._absoluteRhythmTimer) { clearTimeout(this._absoluteRhythmTimer); this._absoluteRhythmTimer = null; }
    const bArea = document.getElementById('tower-battle');
    if (bArea) bArea.classList.remove('absolute-rhythm-active', 'tower-enemy-elite', 'tower-enemy-boss');
    const evtStrip = document.getElementById('tower-event-strip');
    if (evtStrip) evtStrip.innerHTML = '';
    this.inBattle = false;
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (vfxLayer) vfxLayer.innerHTML = '';

    this.showCombatDialogue('win');
    this.showCombatResult(true);

    const beastId = this.selectedBeast;
    const towerData = GameState.tower[beastId];
    const beast = GameState.beasts[beastId];

    // 보상
    const rewards = [];
    const roll = Math.random();
    if (roll < 0.4) {
      beast.towerAtkBonus += 1;
      rewards.push('공격+1');
    } else if (roll < 0.7) {
      beast.towerEvdBonus += 1;
      rewards.push('회피+1');
    } else {
      beast.towerDefBonus += 1;
      rewards.push('방어+1');
    }

    // 기록 갱신
    if (towerData.currentFloor > towerData.bestFloor) {
      towerData.bestFloor = towerData.currentFloor;
    }
    towerData.currentFloor++;
    if (towerData.currentFloor > TOWER_MAX_FLOOR) {
      towerData.currentFloor = TOWER_MAX_FLOOR;
      UI.showToast('최고 층에 도달했습니다! 업데이트를 기다려주세요.');
    }
    GameState.save();

    this.logLine(`${towerData.currentFloor - 1}층을 돌파했다! 보상: ${rewards.join(', ')}`, 'log-critical');

    setTimeout(() => {
      this.selectBeast(beastId);
    }, 2500);
  },

  // 패배
  loseFloor() {
    this.playDefeatCue();
    this.applyBattleImpact('enemyHeavy');
    if (typeof StoryAudio !== 'undefined' && StoryAudio && typeof StoryAudio.stopAmbient === 'function') {
      setTimeout(() => StoryAudio.stopAmbient(), 700);
    }
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();
    this.absoluteRhythm = false;
    this.chainActive = false;
    this.chainQueue = [];
    this.chainIndex = 0;
    if (this._absoluteRhythmTimer) { clearTimeout(this._absoluteRhythmTimer); this._absoluteRhythmTimer = null; }
    const bArea2 = document.getElementById('tower-battle');
    if (bArea2) bArea2.classList.remove('absolute-rhythm-active', 'tower-enemy-elite', 'tower-enemy-boss');
    const evtStrip2 = document.getElementById('tower-event-strip');
    if (evtStrip2) evtStrip2.innerHTML = '';
    this.inBattle = false;
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (vfxLayer) vfxLayer.innerHTML = '';

    this.showCombatDialogue('crisis');
    this.showCombatResult(false);

    const beastId = this.selectedBeast;
    const towerData = GameState.tower[beastId];

    this.logLine(`더 이상 버틸 수 없다... ${towerData.currentFloor}층에서 쓰러졌다.`, 'log-enemy');

    // 층수 리셋하지 않음 (재도전 가능)
    setTimeout(() => {
      this.selectBeast(beastId);
    }, 2500);
  }
};
