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
    const name = namePool[Math.min(floor - 1, namePool.length - 1) % namePool.length];
    const suffix = floor > 5 ? ` Lv.${floor}` : '';

    return {
      name: `${name}${suffix}`,
      hp: 30 + floor * 20,
      attack: 5 + floor * 3,
      attackRate: Math.min(0.7, 0.3 + floor * 0.04)
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
      btn.innerHTML = `
        <span class="tower-char-icon" style="color:${data.color}">${data.symbol}</span>
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

    document.getElementById('tower-floor-display').textContent = `${towerData.currentFloor}층`;
    document.getElementById('tower-best-record').textContent = `최고 기록: ${towerData.bestFloor}층`;
    document.getElementById('tower-start-btn').disabled = towerData.currentFloor > TOWER_MAX_FLOOR;
  },

  // 전투 시작
  startBattle() {
    if (!this.selectedBeast) return;

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
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();

    document.getElementById('tower-info').classList.add('hidden');
    document.getElementById('tower-battle').classList.remove('hidden');
    document.getElementById('tower-battle').classList.remove('danger');
    document.getElementById('tower-enemy-info').textContent = `${towerData.currentFloor}층 — ${this.currentEnemy.name}`;
    document.getElementById('tower-combat-log').innerHTML = '';
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (vfxLayer) vfxLayer.innerHTML = '';

    const skillBtn = document.getElementById('tower-skill-btn');
    const parryBtn = document.getElementById('tower-parry-btn');
    const guide = document.getElementById('tower-rhythm-guide');
    const feedback = document.getElementById('tower-feedback');

    if (skillBtn) {
      skillBtn.disabled = true;
      skillBtn.classList.remove('ready');
      skillBtn.textContent = '각성 일격 (0%)';
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
  },

  // 탭 공격
  tap() {
    if (!this.inBattle || !this.currentEnemy) return;
    if (this.pendingEnemyStrike) {
      this.showRhythmFeedback('parry');
      return;
    }

    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    this.inputLockedUntil = now + 70;

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
    const damage = Math.max(1, Math.floor(baseDmg * result.dmgMult * comboMult * rhythmMult));
    this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - damage);

    const attackText = TOWER_ATTACK_TEXTS[tierKey][Math.floor(Math.random() * TOWER_ATTACK_TEXTS[tierKey].length)];
    const rhythmText = rhythm.label ? ` ${rhythm.label}` : '';
    this.logLine(`${attackText} (${damage} 피해)${rhythmText}`, result.class);
    this.spawnHitEffect('enemy', tierKey === 'critical' ? 'heavy' : 'normal');

    const focusByTier = { fail: 8, normal: 12, good: 18, critical: 26 };
    this.gainFocus((focusByTier[tierKey] || 10) + rhythm.focusBonus);

    this.applyBattleImpact(tierKey);
    this.updateEnemyPhase();
    this.updateBattleUI();

    // 경험치
    GameState.addExp(beastId, 1);

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

    const beastId = this.selectedBeast;
    const level = (GameState.beasts[beastId] || {}).level || 1;
    const floor = (GameState.tower[beastId] || {}).currentFloor || 1;
    const comboMult = this.getComboDamageMultiplier();
    const skillBase = 24 + Math.floor(level / 8) + Math.floor(floor * 0.6);
    const skillDmg = Math.max(1, Math.floor(skillBase * 2.1 * comboMult));

    this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - skillDmg);
    this.focusGauge = 0;
    this.enemyStaggerTurns = 1;
    this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);

    this.logLine(`각성 일격! 폭발적인 일격이 꽂혔다! (${skillDmg} 피해)`, 'log-critical');
    this.showRhythmFeedback('skill');
    this.spawnHitEffect('enemy', 'skill');
    this.setIntent('적이 중심을 잃었다. 다음 반격이 지연된다!');
    this.applyBattleImpact('critical');
    this.updateEnemyPhase();
    this.updateBattleUI();

    if (this.currentEnemy.currentHp <= 0) {
      this.winFloor();
      return;
    }

    this.scheduleEnemyAttack(460);
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
    this.logLine(`적이 ${pattern.name} 준비 중! 타격 직전에 패링!`, 'log-enemy');
    this.setIntent(`⚠ ${pattern.name} 예고! 지금 패링 타이밍을 잡아라.`);
    this.showRhythmFeedback('parry');
    this.updateBattleUI();
    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
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
      this.showRhythmFeedback('parryPerfect');
      this.logLine('완벽 패링 타이밍을 잡았다!', 'log-good');
    } else if (delta <= TOWER_PARRY.goodWindowMs) {
      strike.parryGrade = 'good';
      this.showRhythmFeedback('parryGood');
      this.logLine('패링 성공! 피해를 크게 줄인다.', 'log-good');
    } else {
      strike.parryGrade = 'fail';
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

    if (parryGrade === 'perfect') {
      const counter = this.computeParryCounterDamage(pattern, true);
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - counter);
      this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);
      this.gainFocus(18);
      this.logLine(`완벽 패링! 반격 성공 (${counter} 피해)`, 'log-critical');
      this.spawnHitEffect('enemy', 'heavy');
      this.applyBattleImpact('critical');
      this.updateEnemyPhase();
      this.updateBattleUI();
      if (this.currentEnemy.currentHp <= 0) {
        this.winFloor();
        return;
      }
      this.queueEnemyIntent();
      return;
    }

    if (parryGrade === 'good') {
      enemyDmg = Math.max(1, Math.floor(enemyDmg * TOWER_PARRY.goodDamageRatio));
      const counter = this.computeParryCounterDamage(pattern, false);
      this.currentEnemy.currentHp = Math.max(0, this.currentEnemy.currentHp - counter);
      this.gainFocus(10);
      this.logLine(`패링 성공! 피해 경감 + 반격 (${counter} 피해)`, 'log-good');
      this.spawnHitEffect('enemy', 'normal');
      this.updateEnemyPhase();
      if (this.currentEnemy.currentHp <= 0) {
        this.updateBattleUI();
        this.winFloor();
        return;
      }
    } else if (parryGrade === 'fail') {
      enemyDmg = Math.max(1, Math.floor(enemyDmg * TOWER_PARRY.failDamageRatio));
      this.logLine('패링 실패로 반격을 정통으로 맞았다!', 'log-enemy');
    }

    this.playerHp = Math.max(0, this.playerHp - enemyDmg);
    const hitText = TOWER_ENEMY_ATTACK_TEXTS.hit[Math.floor(Math.random() * TOWER_ENEMY_ATTACK_TEXTS.hit.length)];
    const suffix = parryGrade === 'good' ? ' [경감]' : (parryGrade === 'fail' ? ' [실패]' : '');
    this.logLine(`${hitText} ${pattern.hitText} (${enemyDmg} 피해)${suffix}`, 'log-enemy');
    this.spawnHitEffect('player', pattern.heavy ? 'heavy' : 'normal');

    this.applyBattleImpact(pattern.heavy ? 'enemyHeavy' : 'enemy');
    this.updateBattleUI();

    if (this.playerHp <= 0) {
      this.loseFloor();
      return;
    }

    this.queueEnemyIntent();
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
    } else if (cursorMs >= TOWER_RHYTHM.goodMin && cursorMs <= TOWER_RHYTHM.goodMax) {
      this.comboCount = Math.min(TOWER_RHYTHM.maxCombo, this.comboCount + 1);
      rollBonus = 1;
      focusBonus = 3;
      label = ' [리듬 유지]';
      grade = 'good';
    } else {
      this.comboCount = 1;
      label = ' [호흡 붕괴]';
      grade = 'break';
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

    return pool[Math.floor(Math.random() * pool.length)];
  },

  updateEnemyPhase() {
    if (!this.currentEnemy || !this.currentEnemy.hp) return;
    const ratio = this.currentEnemy.currentHp / this.currentEnemy.hp;
    const next = ratio <= 0.3 ? 2 : ratio <= 0.6 ? 1 : 0;

    if (next > this.enemyPhase) {
      this.enemyPhase = next;
      if (next === 1) {
        this.logLine('적의 기세가 상승했다! 반격 주의!', 'log-enemy');
      } else if (next === 2) {
        this.logLine('적이 광폭 상태에 돌입했다!', 'log-enemy');
      }
      this.applyBattleImpact('enemyHeavy');
      this.queueEnemyIntent();
    }
  },

  queueEnemyIntent() {
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
      const ready = this.focusGauge >= 100;
      skillBtn.disabled = !ready;
      skillBtn.classList.toggle('ready', ready);
      skillBtn.textContent = ready ? '각성 일격 READY' : `각성 일격 (${Math.floor(this.focusGauge)}%)`;
    }

    if (battle) battle.classList.toggle('danger', playerRatio <= 0.3);
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

  logLine(text, className) {
    const log = document.getElementById('tower-combat-log');
    if (!log) return;

    const line = document.createElement('div');
    if (className) line.className = className;
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
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
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();
    this.inBattle = false;
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (vfxLayer) vfxLayer.innerHTML = '';

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
    }, 1500);
  },

  // 패배
  loseFloor() {
    this.stopRhythmMeter();
    this.clearFeedbackTimer();
    this.clearBattleTimers();
    this.inBattle = false;
    const vfxLayer = document.getElementById('tower-hit-vfx');
    if (vfxLayer) vfxLayer.innerHTML = '';

    const beastId = this.selectedBeast;
    const towerData = GameState.tower[beastId];

    this.logLine(`더 이상 버틸 수 없다... ${towerData.currentFloor}층에서 쓰러졌다.`, 'log-enemy');

    // 층수 리셋하지 않음 (재도전 가능)
    setTimeout(() => {
      this.selectBeast(beastId);
    }, 1500);
  }
};
