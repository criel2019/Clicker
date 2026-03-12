/* ===== 전투 시스템 ===== */

// 플레이어 공격 결과 텍스트 (다이스 수치 비공개 — GDD v2 §4.2)
const ATTACK_TEXTS = {
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

const ENEMY_ATTACK_TEXTS = {
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

// 콤보 유지 시간 (ms) — 마지막 탭 후 이 시간 안에 다음 탭해야 콤보 유지
const COMBO_TIMEOUT_MS = 1200;
const MAX_COMBO = 10;

const COMBAT_PARRY = {
  windupMs: 580,
  perfectWindowMs: 80,
  goodWindowMs: 170,
  goodDamageRatio: 0.32,
  failDamageRatio: 1.15
};

const Combat = {
  active: false,
  enemy: null,
  beastId: null,
  onWin: null,
  onLose: null,
  playerMaxHp: 100,
  playerHp: 100,
  comboCount: 0,
  comboTimer: null,
  momentumGauge: 0,   // 단일 게이지: 공격/패링으로 충전, 스킬 사용 시 소모
  momentumReady: false,
  dotEffect: null,    // { ticks, dmg } — 주작 화염 DOT
  shieldActive: false, // 백호 실드
  _crisisDialogueShown: false,
  enemyStaggerTurns: 0, // 완벽 패링 시 적 1턴 스킵
  enemyPhase: 0,
  enemyTurnTimer: null,
  inputLockedUntil: 0,
  feedbackTimer: null,
  pendingEnemyStrike: null,
  winStreak: 0,
  comboPeak: 0,
  rewardScore: 0,
  parryPerfectCount: 0,
  parryGoodCount: 0,
  parryFailCount: 0,
  fightStartedAt: 0,
  // 디버프 시스템
  activeDebuffs: {},      // { slow: endTime, blind: endTime, taunt: true, poison: {ticks,dmg} }
  _debuffTimers: [],
  // 페이즈 기믹
  weaknessWindow: false,  // 약점 노출 상태
  _weaknessTimer: null,
  _phaseGimmickUsed: {},  // { 1: true, 2: true } — 기믹 중복 방지
  // 전투 통계
  totalDamageDealt: 0,
  totalDamageTaken: 0,
  skillUsedCount: 0,
  // 연계 패턴 시스템
  chainQueue: [],          // 연계 공격 큐
  chainIndex: 0,           // 현재 연계 인덱스
  chainActive: false,      // 연계 진행 중 여부
  chainAllParried: true,   // 모든 연계 패링 성공 여부

  playSfx(type, throttledMs = 0) {
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

  // 전투 시작
  start(beastId, enemy, onWin, onLose) {
    this.active = true;
    this.beastId = beastId;
    this.enemy = { ...enemy, currentHp: enemy.hp };
    this.onWin = onWin;
    this.onLose = onLose;
    this.playerMaxHp = 100;
    this.playerHp = 100;
    this.comboCount = 0;
    this.momentumGauge = 0;
    this.momentumReady = false;
    this.dotEffect = null;
    this.shieldActive = false;
    this._crisisDialogueShown = false;
    this.enemyStaggerTurns = 0;
    this.enemyPhase = 0;
    this.inputLockedUntil = 0;
    this.pendingEnemyStrike = null;
    this.comboPeak = 0;
    this.rewardScore = 0;
    this.parryPerfectCount = 0;
    this.parryGoodCount = 0;
    this.parryFailCount = 0;
    this.fightStartedAt = Date.now();
    this.activeDebuffs = {};
    this._debuffTimers.forEach(t => clearTimeout(t));
    this._debuffTimers = [];
    this.weaknessWindow = false;
    if (this._weaknessTimer) { clearTimeout(this._weaknessTimer); this._weaknessTimer = null; }
    this._phaseGimmickUsed = {};
    this.totalDamageDealt = 0;
    this.totalDamageTaken = 0;
    this.skillUsedCount = 0;
    this.chainQueue = [];
    this.chainIndex = 0;
    this.chainActive = false;
    this.chainAllParried = true;
    this.clearFeedbackTimer();
    this.clearComboTimer();
    if (this.enemyTurnTimer) {
      clearTimeout(this.enemyTurnTimer);
      this.enemyTurnTimer = null;
    }
    if (typeof StoryAudio !== 'undefined' && StoryAudio && typeof StoryAudio.startAmbient === 'function') {
      StoryAudio.startAmbient('battle');
    }

    const ui = document.getElementById('combat-ui');
    const nextBtn = document.getElementById('story-next-btn');
    const enemyName = document.getElementById('enemy-name');
    const log = document.getElementById('combat-log');
    const vfxLayer = document.getElementById('story-hit-vfx');
    const parryBtn = document.getElementById('combat-parry-btn');
    const skillBtn = document.getElementById('combat-skill-btn');
    const feedback = document.getElementById('combat-feedback');
    const dialogue = document.getElementById('combat-beast-dialogue');
    ui.classList.remove('hidden', 'danger');
    nextBtn.classList.add('hidden');
    enemyName.textContent = enemy.name;
    log.innerHTML = '';
    if (vfxLayer) vfxLayer.innerHTML = '';
    if (feedback) feedback.className = '';
    if (dialogue) dialogue.classList.add('hidden');
    if (parryBtn) { parryBtn.classList.remove('ready'); parryBtn.disabled = true; parryBtn.textContent = '패링 대기'; }
    if (skillBtn) { skillBtn.disabled = true; skillBtn.classList.remove('ready'); }
    const banner = document.getElementById('combat-banner');
    if (banner) { banner.textContent = ''; banner.className = 'combat-banner'; }
    const debuffBar = document.getElementById('combat-debuff-bar');
    if (debuffBar) debuffBar.innerHTML = '';
    const eventStrip = document.getElementById('combat-event-strip');
    if (eventStrip) eventStrip.innerHTML = '';

    this.updateEnemyStatus();
    this.updatePlayerStatus();
    this.updateCombatStateUI();
    this.updateContextBar();
    this.showCombatDialogue('start');
    this.queueEnemyIntent();
    this.logLine('전투 시작! 빠르게 공격해 콤보를 쌓고, 적 예고 시 패링하라!', 'log-system');
  },

  // 탭 (공격)
  tap() {
    if (!this.active) return;
    // 적 공격 중에도 리듬 공격 허용 (패링은 별도 버튼)
    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    // 속박 디버프: 탭 속도 50% 감소
    const slowActive = this.activeDebuffs.slow && now < this.activeDebuffs.slow;
    this.inputLockedUntil = now + (slowActive ? 120 : 60);

    // 콤보 타이머 리셋 (마지막 탭 후 COMBO_TIMEOUT_MS 이내면 콤보 유지)
    this.comboCount = Math.min(MAX_COMBO, this.comboCount + 1);
    this.comboPeak = Math.max(this.comboPeak, this.comboCount);
    this.resetComboTimer();

    // 데미지 계산: 기본 + 콤보 배율 + 약점 보너스
    const level = (GameState.beasts[this.beastId] || {}).level || 1;
    const baseDmg = 8 + Math.floor(level / 4);
    const comboMult = this.getComboDamageMultiplier();
    const weaknessMult = this.weaknessWindow ? 2.0 : 1.0;
    const damage = Math.max(1, Math.floor(baseDmg * comboMult * weaknessMult));

    this.enemy.currentHp = Math.max(0, this.enemy.currentHp - damage);

    // 콤보에 따른 연출 티어
    let tierKey = 'normal';
    if (this.comboCount >= MAX_COMBO) tierKey = 'critical';
    else if (this.comboCount >= 5)   tierKey = 'good';

    // 기세 게이지 충전 (콤보 높을수록 더 빠르게)
    const momentumGain = 8 + this.comboCount * 2;
    this.gainMomentum(momentumGain);

    // 콤보 대사 트리거
    if (this.comboCount === 5) this.showCombatDialogue('combo');

    this.totalDamageDealt += damage;
    if (this.weaknessWindow) {
      this.weaknessWindow = false;
      if (this._weaknessTimer) { clearTimeout(this._weaknessTimer); this._weaknessTimer = null; }
      this.showBanner('약점 공격! 데미지 2배!', 'banner-critical');
    }

    const attackText = ATTACK_TEXTS[tierKey][Math.floor(Math.random() * ATTACK_TEXTS[tierKey].length)];
    const comboText = this.comboCount > 1 ? ` [${this.comboCount}콤보]` : '';
    this.logLine(`${attackText} (${damage} 피해)${comboText}`, tierKey === 'critical' ? 'log-critical' : tierKey === 'good' ? 'log-good' : '');

    if (this.comboCount > 1) this.showFeedback(tierKey === 'critical' ? 'comboPeak' : 'combo');

    this.spawnHitEffect('enemy', tierKey === 'critical' ? 'heavy' : 'normal');
    this.spawnDamageNumber('enemy', damage, { critical: tierKey === 'critical' });
    this.playSfx('attackSwing', 38);
    this.playSfx('hitEnemy', 58);
    if (tierKey === 'critical') this.playSfx('hitEnemyHeavy', 130);

    this.addRewardScore(tierKey === 'critical' ? 5 : tierKey === 'good' ? 3 : 1);
    this.applyImpact(tierKey);
    this.updateEnemyStatus();
    this.updateCombatStateUI();
    this.updateContextBar();
    this.updateEnemyPhase();

    // 패시브 스킬 트리거 (콤보 3 이상 시 확률적 발동)
    if (this.comboCount >= 3 && this.enemy.currentHp > 0) {
      this.checkPassiveSkillTrigger();
    }

    if (this.enemy.currentHp <= 0) {
      this.logLine(`${this.enemy.name}이(가) 쓰러졌다!`, 'log-critical');
      setTimeout(() => this.end(true), 750);
      return;
    }

    this.scheduleEnemyAttack(380);
    GameState.addExp(this.beastId, 1);
  },

  // 기세 게이지 스킬 (신수별 고유 효과)
  useSkill() {
    if (!this.active) return;
    if (this.momentumGauge < 100) return;
    if (this.pendingEnemyStrike) {
      this.showFeedback('parryWarning');
      return;
    }
    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    this.inputLockedUntil = now + 150;

    this.momentumGauge = 0;
    this.momentumReady = false;
    this.addRewardScore(10);
    this.skillUsedCount++;
    this.showCombatDialogue('skill');
    this.showSkillCutscene(this.beastId, 'story');
    this.applyBeastSkill();
  },

  applyBeastSkill() {
    const beastId = this.beastId;
    const level = (GameState.beasts[beastId] || {}).level || 1;
    const baseDmg = 20 + Math.floor(level / 6);
    const comboMult = this.getComboDamageMultiplier();

    if (beastId === 'cheongryong') {
      // 용아참: 3연타
      const dmgPer = Math.max(1, Math.floor(baseDmg * 0.95 * comboMult));
      this.logLine('용아참! 파도처럼 몰아치는 3연타!', 'log-critical');
      this.showFeedback('skill');
      this.playSfx('attackSwing', 45);
      let total = 0;
      [0, 220, 440].forEach((delay, i) => {
        setTimeout(() => {
          if (!this.active || !this.enemy || this.enemy.currentHp <= 0) return;
          this.enemy.currentHp = Math.max(0, this.enemy.currentHp - dmgPer);
          total += dmgPer;
          this.spawnHitEffect('enemy', 'heavy');
          this.spawnDamageNumber('enemy', dmgPer, { critical: true });
          this.playSfx('hitEnemyHeavy', 60);
          this.applyImpact('critical');
          if (i === 2) {
            this.logLine(`용아참 완료! 총 ${total} 피해`, 'log-critical');
            this.updateEnemyStatus(); this.updateEnemyPhase(); this.updateCombatStateUI();
            if (this.enemy.currentHp <= 0) { setTimeout(() => this.end(true), 500); return; }
            this.enemyStaggerTurns = 1;
            this.scheduleEnemyAttack(600);
          }
        }, delay);
      });

    } else if (beastId === 'baekho') {
      // 백호폭: 강타 + 실드
      const dmg = Math.max(1, Math.floor(baseDmg * 2.8 * comboMult));
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - dmg);
      this.shieldActive = true;
      this.logLine(`백호폭! 불굴의 일격! (${dmg} 피해) + 실드 발동`, 'log-critical');
      this.showFeedback('skill');
      this.spawnHitEffect('enemy', 'skill');
      this.spawnDamageNumber('enemy', dmg, { critical: true, heavy: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyImpact('critical');
      this.updateEnemyStatus(); this.updateEnemyPhase(); this.updateCombatStateUI();
      if (this.enemy.currentHp <= 0) { setTimeout(() => this.end(true), 500); return; }
      this.scheduleEnemyAttack(500);

    } else if (beastId === 'jujak') {
      // 작화진: 즉발 + 화염 DOT 3회
      const dmg = Math.max(1, Math.floor(baseDmg * 1.3 * comboMult));
      const dotDmg = Math.max(1, Math.floor(baseDmg * 0.65));
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - dmg);
      this.dotEffect = { ticks: 3, dmg: dotDmg };
      this.logLine(`작화진! 불꽃이 적을 태운다! (${dmg} 피해 + 화염 ${dotDmg}×3)`, 'log-critical');
      this.showFeedback('skill');
      this.spawnHitEffect('enemy', 'skill');
      this.spawnDamageNumber('enemy', dmg, { critical: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyImpact('critical');
      this.updateEnemyStatus(); this.updateEnemyPhase(); this.updateCombatStateUI();
      if (this.enemy.currentHp <= 0) { setTimeout(() => this.end(true), 500); return; }
      this.scheduleEnemyAttack(500);

    } else if (beastId === 'hyeonmu') {
      // 현무진: 중타 + 기력 회복
      const dmg = Math.max(1, Math.floor(baseDmg * 1.8 * comboMult));
      const heal = Math.min(30, Math.floor(this.playerMaxHp * 0.25));
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - dmg);
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal);
      this.logLine(`현무진! 방패의 반격! (${dmg} 피해, 기력 +${heal} 회복)`, 'log-critical');
      this.showFeedback('heal');
      this.spawnHitEffect('enemy', 'heavy');
      this.spawnDamageNumber('enemy', dmg, { critical: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyImpact('critical');
      this.updateEnemyStatus(); this.updatePlayerStatus(); this.updateEnemyPhase(); this.updateCombatStateUI();
      if (this.enemy.currentHp <= 0) { setTimeout(() => this.end(true), 500); return; }
      this.scheduleEnemyAttack(500);

    } else {
      // 황룡천강: 초강타
      const dmg = Math.max(1, Math.floor(baseDmg * 4.5 * comboMult));
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - dmg);
      this.logLine(`황룡천강!!! 천지를 뒤흔드는 일격! (${dmg} 피해)`, 'log-critical');
      this.showFeedback('skill');
      this.spawnHitEffect('enemy', 'skill');
      this.spawnDamageNumber('enemy', dmg, { critical: true, heavy: true });
      this.playSfx('hitEnemyHeavy', 70);
      this.applyImpact('critical');
      setTimeout(() => this.applyImpact('critical'), 80); // 여진
      this.updateEnemyStatus(); this.updateEnemyPhase(); this.updateCombatStateUI();
      if (this.enemy.currentHp <= 0) { setTimeout(() => this.end(true), 500); return; }
      this.enemyStaggerTurns = 1;
      this.scheduleEnemyAttack(650);
    }

    this.comboCount = Math.min(MAX_COMBO, this.comboCount + 2);
    this.comboPeak = Math.max(this.comboPeak, this.comboCount);
    this.resetComboTimer();
  },

  scheduleEnemyAttack(delay) {
    if (this.pendingEnemyStrike) return;
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer);
    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
      this.beginEnemyWindup();
    }, delay);
  },

  // 적 공격
  enemyAttack() {
    this.beginEnemyWindup();
  },

  beginEnemyWindup() {
    if (!this.active || !this.enemy || this.enemy.currentHp <= 0) return;
    if (this.pendingEnemyStrike) return;

    if (this.enemyStaggerTurns > 0) {
      this.enemyStaggerTurns--;
      this.logLine('적이 순간 자세를 잃었다!', 'log-good');
      this.queueEnemyIntent();
      return;
    }

    const attackChance = this.getEnemyAttackChance();
    if (Math.random() > attackChance) {
      this.logLine('적이 거리를 벌린다.', 'log-miss');
      this.queueEnemyIntent();
      return;
    }

    const beast = GameState.beasts[this.beastId];
    const pattern = this.pickEnemyPattern();
    const evadeChance = Math.min(0.5, (beast.towerEvdBonus || 0) * 0.03);

    if (Math.random() < evadeChance) {
      const evadeText = ENEMY_ATTACK_TEXTS.evade[Math.floor(Math.random() * ENEMY_ATTACK_TEXTS.evade.length)];
      this.logLine(evadeText, 'log-good');
      this.queueEnemyIntent();
      return;
    }

    const enemyDmg = this.computeEnemyStrikeDamage(pattern, beast);

    // 페이즈에 따라 예고 시간 단축 → 긴장감 상승
    const baseWindup = this.enemyPhase === 2 ? 360 : this.enemyPhase === 1 ? 490 : 630;
    const windup = baseWindup + (pattern.heavy ? 80 : 0);
    const resolveAt = Date.now() + windup;

    this.pendingEnemyStrike = { pattern, damage: enemyDmg, resolveAt, parryGrade: 'none', parryTried: false };

    const urgency = this.enemyPhase >= 2 ? '빠르다! ' : '';

    // 회피 불가 공격
    if (pattern.unparryable) {
      this.pendingEnemyStrike.parryTried = true;
      this.logLine(`${urgency}${pattern.name}! 패링 불가! 피해를 감수하라!`, 'log-enemy');
      this.showBanner(`${pattern.name} — 패링 불가!`, 'banner-danger');
      this.setIntent(`⚠ ${pattern.name}! 패링 불가!`);
      this.showKeyMessage(pattern.name + '!', 'msg-attack');
      this.showEventStrip(`⚠ ${pattern.name}! 패링 불가!`, 'event-enemy', 2);
    } else {
      this.logLine(`${urgency}${pattern.name}! 패링하라!`, 'log-enemy');
      this.showBanner(`${pattern.name}! 패링 준비!`, 'banner-parry');
      this.setIntent(`${pattern.name}! [패링] 준비!`);
      this.showKeyMessage(pattern.name + '!', 'msg-attack');
      this.showEventStrip(`⚔ ${pattern.name}! 패링 준비!`, 'event-enemy', 2);

      // 패링 카운트다운 링
      const ringParent = document.getElementById('story-text-area');
      if (ringParent) {
        const ring = document.createElement('svg');
        ring.className = 'parry-countdown-ring';
        ring.setAttribute('viewBox', '0 0 80 80');
        ring.style.setProperty('--parry-duration', windup + 'ms');
        ring.innerHTML = '<circle class="ring-bg" cx="40" cy="40" r="36"/><circle class="ring-fill" cx="40" cy="40" r="36"/>';
        ringParent.appendChild(ring);
        setTimeout(() => ring.remove(), windup + 100);
      }
    }

    // 암흑 디버프: 패링 버튼 타이밍 숨김
    const now2 = Date.now();
    if (this.activeDebuffs.blind && now2 < this.activeDebuffs.blind) {
      const parryBtnEl = document.getElementById('combat-parry-btn');
      if (parryBtnEl) parryBtnEl.classList.add('blind-debuff');
    }

    this.showFeedback('parryWarning');
    this.updateCombatStateUI();
    this.updateContextBar();

    // 패링 페이즈 시각 효과
    const combatEl = document.getElementById('combat-ui');
    if (combatEl) combatEl.classList.add('parry-phase');
    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
      if (combatEl) combatEl.classList.remove('parry-phase');
      this.resolveEnemyStrike();
    }, windup);
  },

  parry() {
    if (!this.active || !this.enemy || this.enemy.currentHp <= 0) return;
    const now = Date.now();
    if (now < this.inputLockedUntil) return;
    this.inputLockedUntil = now + 60;

    const strike = this.pendingEnemyStrike;
    if (!strike) {
      this.showFeedback('parryFail');
      return;
    }
    if (strike.parryTried) {
      this.showFeedback('parryWarning');
      return;
    }

    strike.parryTried = true;
    const delta = Math.abs(now - strike.resolveAt);
    if (delta <= COMBAT_PARRY.perfectWindowMs) {
      strike.parryGrade = 'perfect';
      this.parryPerfectCount += 1;
      this.addRewardScore(7);
      this.showFeedback('parryPerfect');
      this.showCombatDialogue('parryPerfect');
      this.logLine('완벽한 패링! 타이밍을 잡았다!', 'log-good');
      this.playSfx('parryPerfect', 70);
      this.showKeyMessage('PERFECT!', 'msg-perfect');
    } else if (delta <= COMBAT_PARRY.goodWindowMs) {
      strike.parryGrade = 'good';
      this.parryGoodCount += 1;
      this.addRewardScore(4);
      this.showFeedback('parryGood');
      this.logLine('패링 성공! 피해가 줄어든다.', 'log-good');
      this.playSfx('parryGood', 70);
    } else {
      strike.parryGrade = 'fail';
      this.parryFailCount += 1;
      this.addRewardScore(-3);
      this.showFeedback('parryFail');
      this.logLine('패링 실패! 콤보도 날아간다!', 'log-miss');
      this.playSfx('miss', 120);
    }

    if (now >= strike.resolveAt - 12) {
      if (this.enemyTurnTimer) {
        clearTimeout(this.enemyTurnTimer);
        this.enemyTurnTimer = null;
      }
      this.resolveEnemyStrike();
      return;
    }

    this.updateCombatStateUI();
  },

  resolveEnemyStrike() {
    if (!this.active || !this.enemy) {
      this.pendingEnemyStrike = null;
      return;
    }
    if (this.enemy.currentHp <= 0) {
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
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - counter);
      this.comboCount = Math.min(MAX_COMBO, this.comboCount + 2);
      this.comboPeak = Math.max(this.comboPeak, this.comboCount);
      this.gainMomentum(32);
      this.resetComboTimer();
      this.logLine(`완벽 패링! 반격 적중 (${counter} 피해)`, 'log-critical');
      this.showEventStrip(`✨ 완벽 패링! 반격 ${counter} 피해!`, 'event-parry-perfect', 2);
      this.spawnHitEffect('enemy', 'heavy');
      this.spawnDamageNumber('enemy', counter, { critical: true, heavy: true });
      this.playSfx('hitEnemyHeavy', 130);
      this.applyImpact('critical');
      this.updateEnemyStatus();
      this.updateEnemyPhase();
      this.updateCombatStateUI();
      this.updateContextBar();
      if (this.enemy.currentHp <= 0) {
        this.chainActive = false;
        this.logLine(`${this.enemy.name}이(가) 쓰러졌다!`, 'log-critical');
        setTimeout(() => this.end(true), 750);
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
      enemyDmg = Math.max(1, Math.floor(enemyDmg * COMBAT_PARRY.goodDamageRatio));
      const counter = this.computeParryCounterDamage(pattern, false);
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - counter);
      this.gainMomentum(16);
      this.logLine(`패링 성공! 피해 감소 + 반격 (${counter} 피해)`, 'log-good');
      this.spawnHitEffect('enemy', 'normal');
      this.spawnDamageNumber('enemy', counter);
      this.playSfx('hitEnemy', 70);
      this.updateEnemyStatus();
      this.updateEnemyPhase();
      if (this.enemy.currentHp <= 0) {
        this.chainActive = false;
        this.updateCombatStateUI();
        this.logLine(`${this.enemy.name}이(가) 쓰러졌다!`, 'log-critical');
        setTimeout(() => this.end(true), 750);
        return;
      }
    } else if (parryGrade === 'fail') {
      enemyDmg = Math.max(1, Math.floor(enemyDmg * COMBAT_PARRY.failDamageRatio));
      // 패링 실패 시 콤보 완전 초기화
      this.comboCount = 0;
      this.clearComboTimer();
      if (isChainStrike) this.chainAllParried = false;
    } else {
      // parryGrade === 'none'
      if (isChainStrike) this.chainAllParried = false;
    }

    // 백호 실드 체크 (패링 없이 맞을 때만)
    if (this.shieldActive && parryGrade === 'none') {
      this.shieldActive = false;
      this.logLine('실드가 적의 공격을 막아냈다!', 'log-good');
      this.showFeedback('shield');
      this.updateCombatStateUI();
      this.updateContextBar();
      if (isChainStrike && this.chainActive) {
        this.advanceChainAttack();
      } else {
        this.queueEnemyIntent();
      }
      return;
    }

    this.playerHp = Math.max(0, this.playerHp - enemyDmg);
    this.totalDamageTaken += enemyDmg;

    // 일반 피격 시 콤보 절반으로 감소
    if (parryGrade === 'none') {
      this.comboCount = Math.floor(this.comboCount / 2);
      this.clearComboTimer();
      if (this.comboCount > 0) this.resetComboTimer();
    }

    // 패턴 디버프 적용 (패링 실패 or 패링 안 했을 때만)
    if (pattern.debuff && parryGrade !== 'perfect' && parryGrade !== 'good') {
      this.applyDebuff(pattern.debuff);
    }
    // 독 디버프 적용
    if (pattern.debuff === 'poison' && parryGrade !== 'perfect') {
      const poisonDmg = Math.max(1, Math.floor((this.enemy.attack || 10) * 0.15));
      this.activeDebuffs.poison = { ticks: 3, dmg: poisonDmg };
      this.logLine(`독에 걸렸다! 매 턴 ${poisonDmg} 피해`, 'log-enemy');
    }

    this.addRewardScore(-Math.max(0, Math.floor(enemyDmg / 8)));
    const hitText = ENEMY_ATTACK_TEXTS.hit[Math.floor(Math.random() * ENEMY_ATTACK_TEXTS.hit.length)];
    const suffix = parryGrade === 'good' ? ' [피해 감소]' : (parryGrade === 'fail' ? ' [패링 실패!]' : '');
    this.logLine(`${hitText} ${pattern.hitText} (${enemyDmg} 피해)${suffix}`, 'log-enemy');
    this.spawnHitEffect('player', pattern.heavy ? 'heavy' : 'normal');
    this.spawnDamageNumber('player', enemyDmg, { heavy: pattern.heavy || parryGrade === 'fail' });
    this.playSfx('hitPlayer', 65);
    if (pattern.heavy || parryGrade === 'fail') this.playSfx('break', 320);

    this.applyImpact(pattern.heavy ? 'enemyHeavy' : 'enemy');
    this.updatePlayerStatus();
    this.updateCombatStateUI();
    this.updateContextBar();

    // HP 위기 대사
    if (this.playerHp <= this.playerMaxHp * 0.3 && !this._crisisDialogueShown) {
      this._crisisDialogueShown = true;
      this.showCombatDialogue('crisis');
    }

    if (this.playerHp <= 0) {
      this.chainActive = false;
      this.logLine('더는 버틸 수 없다...', 'log-enemy');
      this.playDefeatCue();
      this.applyImpact('enemyHeavy');
      setTimeout(() => this.end(false), 750);
      return;
    }

    if (isChainStrike && this.chainActive) {
      this.advanceChainAttack();
    } else {
      this.queueEnemyIntent();
    }
  },

  computeEnemyStrikeDamage(pattern, beast) {
    let enemyDmg = Math.max(1, Math.floor((this.enemy.attack || 10) * pattern.multiplier) - (beast.towerDefBonus || 0));
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
    const level = (GameState.beasts[this.beastId] || {}).level || 1;
    const enemyAtk = this.enemy.attack || 10;
    const base = 8 + Math.floor(level / 4) + Math.floor(enemyAtk * (perfect ? 0.75 : 0.32));
    const heavyBonus = pattern.heavy ? (perfect ? 6 : 3) : 0;
    return Math.max(1, base + heavyBonus);
  },

  clearFeedbackTimer() {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  },

  showFeedback(kind) {
    const el = document.getElementById('combat-feedback');
    if (!el) return;

    const map = {
      combo:        { text: 'COMBO!',     cls: 'fb-good' },
      comboPeak:    { text: 'MAX COMBO!', cls: 'fb-perfect' },
      skill:        { text: '스킬 발동!', cls: 'fb-skill' },
      shield:       { text: '실드!',      cls: 'fb-parry-good' },
      heal:         { text: '회복!',      cls: 'fb-parry-good' },
      parryWarning: { text: '패링!',      cls: 'fb-parry' },
      parryGood:    { text: '패링 성공',  cls: 'fb-parry-good' },
      parryPerfect: { text: '완벽 패링!', cls: 'fb-parry-perfect' },
      parryFail:    { text: '패링 실패!', cls: 'fb-parry-fail' },
    };
    const item = map[kind] || { text: kind, cls: 'fb-start' };
    el.textContent = item.text;
    el.className = `show ${item.cls}`;
    this.clearFeedbackTimer();
    this.feedbackTimer = setTimeout(() => {
      el.className = '';
      this.feedbackTimer = null;
    }, 560);
  },

  // 콤보 타이머: 마지막 탭 후 COMBO_TIMEOUT_MS 이내에 다음 탭 없으면 콤보 리셋
  resetComboTimer() {
    this.clearComboTimer();
    this.comboTimer = setTimeout(() => {
      if (!this.active) return;
      if (this.comboCount > 2) this.logLine(`콤보 종료 (최고 ${this.comboCount}콤보)`, 'log-miss');
      this.comboCount = 0;
      this.comboTimer = null;
      this.updateCombatStateUI();
    }, COMBO_TIMEOUT_MS);
  },

  clearComboTimer() {
    if (this.comboTimer) { clearTimeout(this.comboTimer); this.comboTimer = null; }
  },

  // 기세 게이지 충전
  gainMomentum(amount) {
    const prev = this.momentumGauge;
    this.momentumGauge = Math.min(100, this.momentumGauge + amount);
    if (this.momentumGauge >= 100 && prev < 100) {
      this.momentumReady = true;
      this.logLine('기세가 폭발한다! 스킬 사용 가능!', 'log-good');
      this.showCombatDialogue('skillReady');
      this.showEventStrip('⚡ 기세 MAX! 스킬 사용 가능!', 'event-skill-ready', 2);
    }
    this.updateCombatStateUI();
    this.updateContextBar();
  },

  // 신수 전투 대사 표시
  showCombatDialogue(situation) {
    const data = BEAST_DATA[this.beastId];
    if (!data || !data.combatDialogues) return;
    const pool = data.combatDialogues[situation];
    if (!pool || pool.length === 0) return;

    const text = pool[Math.floor(Math.random() * pool.length)];
    const el = document.getElementById('combat-beast-dialogue');
    const textEl = document.getElementById('combat-beast-dialogue-text');
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

  getComboDamageMultiplier() {
    return 1 + Math.max(0, this.comboCount - 1) * 0.08;
  },

  addRewardScore(delta) {
    this.rewardScore = Math.max(-35, Math.min(240, this.rewardScore + delta));
  },

  getCombatRewardPreview(streakOverride) {
    const streak = typeof streakOverride === 'number' ? Math.max(0, streakOverride) : Math.max(0, this.winStreak);
    const enemyHp = Math.max(1, (this.enemy && this.enemy.hp) || 80);
    const enemyAtk = Math.max(1, (this.enemy && this.enemy.attack) || 10);
    const baseGold = Math.max(24, Math.floor(enemyHp * 0.42 + enemyAtk * 2.8));
    const streakRate = Math.min(0.65, streak * 0.08);
    const hpRatio = this.playerMaxHp > 0 ? (this.playerHp / this.playerMaxHp) : 1;
    const hpRate = Math.max(-0.1, Math.min(0.18, (hpRatio - 0.5) * 0.36));
    const momentumRate = Math.max(-0.26, Math.min(0.92, this.rewardScore * 0.015));
    const elapsedSec = Math.max(1, (Date.now() - (this.fightStartedAt || Date.now())) / 1000);
    const speedRate = Math.max(0, Math.min(0.22, (36 - elapsedSec) * 0.006));
    const multiplier = Math.max(0.72, 1 + streakRate + hpRate + momentumRate + speedRate);
    const gold = Math.max(12, Math.floor(baseGold * multiplier));

    const qualityRaw = (
      this.rewardScore +
      this.parryPerfectCount * 6 +
      this.parryGoodCount * 3 +
      this.comboPeak * 2
    ) / 120;
    const quality = Math.max(0, Math.min(1, qualityRaw));
    const randomTicketChance = Math.min(0.35, 0.03 + quality * 0.18 + streak * 0.012);
    const selectTicketChance = Math.min(0.08, 0.004 + quality * 0.04 + Math.max(0, streak - 2) * 0.006);
    const ticketChance = 1 - (1 - randomTicketChance) * (1 - selectTicketChance);

    return {
      gold,
      quality,
      streakRate,
      randomTicketChance,
      selectTicketChance,
      ticketChance
    };
  },

  normalizeTicketState() {
    if (!GameState.gachaTickets) {
      GameState.gachaTickets = { random: 0, select: 0 };
      return;
    }
    if (typeof GameState.gachaTickets === 'number') {
      GameState.gachaTickets = { random: Math.max(0, GameState.gachaTickets), select: 0 };
      return;
    }
    GameState.gachaTickets.random = Math.max(0, Number(GameState.gachaTickets.random) || 0);
    GameState.gachaTickets.select = Math.max(0, Number(GameState.gachaTickets.select) || 0);
  },

  grantVictoryRewards() {
    const preview = this.getCombatRewardPreview(this.winStreak);
    let gold = preview.gold;
    const drops = [];

    if (Math.random() < Math.min(0.35, 0.08 + preview.quality * 0.22)) {
      const jackpot = Math.max(8, Math.floor(gold * (0.25 + Math.random() * 0.32)));
      gold += jackpot;
      drops.push(`잭팟 +${jackpot}G`);
    }

    const cakeChance = Math.min(0.26, 0.06 + preview.quality * 0.14);
    const flowerChance = Math.min(0.56, 0.24 + preview.quality * 0.22);
    const itemRoll = Math.random();
    let affectionItemId = null;
    if (itemRoll < cakeChance) affectionItemId = 'gift_cake';
    else if (itemRoll < cakeChance + flowerChance) affectionItemId = 'gift_flower';

    if (affectionItemId) {
      if (!GameState.inventory) GameState.inventory = { affectionItems: {}, trainingTools: {}, skins: {} };
      if (!GameState.inventory.affectionItems) GameState.inventory.affectionItems = {};
      if (!GameState.inventory.affectionItems[affectionItemId]) GameState.inventory.affectionItems[affectionItemId] = 0;
      GameState.inventory.affectionItems[affectionItemId] += 1;
      const itemData = AFFECTION_ITEMS.find(i => i.id === affectionItemId);
      if (itemData) drops.push(itemData.name);
    }

    this.normalizeTicketState();
    if (Math.random() < preview.selectTicketChance) {
      GameState.gachaTickets.select += 1;
      drops.push('스킨 선택권');
    } else if (Math.random() < preview.randomTicketChance) {
      GameState.gachaTickets.random += 1;
      drops.push('랜덤 스킨 가챠권');
    }

    GameState.gold += gold;
    GameState.save();
    UI.updateGoldDisplay();

    const dropText = drops.length ? ` · ${drops.join(', ')}` : '';
    this.playSfx('reward');
    UI.showToast(`전투 보상 +${gold}G${dropText}`);

    return { gold, drops };
  },


  getEnemyAttackChance() {
    const base = this.enemy.attackRate || 0.5;
    return Math.min(0.9, base + this.enemyPhase * 0.08);
  },

  pickEnemyPattern() {
    // 도발 디버프: 강제로 강공
    if (this.activeDebuffs.taunt) {
      delete this.activeDebuffs.taunt;
      this.updateDebuffUI();
      return { name: '강공', multiplier: 1.35, hits: 1, hitText: '도발에 의한 강력한 일격!', heavy: true };
    }

    // 연계 패턴 확률 체크 (20%)
    if (!this.chainActive && this.enemy && this.enemy.name && typeof CHAIN_ATTACK_DATA !== 'undefined') {
      const baseName = this.enemy.name.replace(/\s*Lv\.\d+$/, '').replace(/^\S+\s/, '').replace(/\s*\[BOSS\]$/, '');
      const chainData = CHAIN_ATTACK_DATA[baseName];
      if (chainData && Math.random() < 0.20 && this.enemyPhase >= 1) {
        this.startChainAttack(chainData);
        // 첫 번째 연계 패턴 반환
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

    // 적 고유 패턴 추가 (ENEMY_PATTERNS 참조)
    if (this.enemy && this.enemy.name && typeof ENEMY_PATTERNS !== 'undefined') {
      const baseName = this.enemy.name.replace(/\s*Lv\.\d+$/, '');
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
    // 적 고유 패턴에서 이름으로 검색
    if (this.enemy && this.enemy.name && typeof ENEMY_PATTERNS !== 'undefined') {
      const baseName = this.enemy.name.replace(/\s*Lv\.\d+$/, '').replace(/^\S+\s/, '').replace(/\s*\[BOSS\]$/, '');
      const enemyData = ENEMY_PATTERNS[baseName];
      if (enemyData && enemyData.unique) {
        const found = enemyData.unique.find(p => p.name === attackName);
        if (found) return found;
      }
    }
    // 기본 패턴 풀에서 이름으로 검색
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
      // 연계 완료
      this.chainActive = false;
      if (this.chainAllParried) {
        // 모든 연계 패링 성공 보상
        this.comboCount = Math.min(MAX_COMBO, this.comboCount + 3);
        this.comboPeak = Math.max(this.comboPeak, this.comboCount);
        this.gainMomentum(50);
        this.logLine('연계 공격 완벽 방어! 콤보 +3, 기세 대폭 상승!', 'log-critical');
        this.showBanner('연계 방어 성공!', 'banner-critical');
        this.showEventStrip('✨ 연계 방어 완벽! 콤보+3 기세+50!', 'event-parry-perfect', 2.5);
        this.addRewardScore(15);
      } else {
        this.logLine('연계 공격이 끝났다.', 'log-miss');
      }
      this.updateCombatStateUI();
      this.updateContextBar();
      return;
    }
    // 다음 연계 공격을 짧은 딜레이 후 발동
    const nextName = this.chainQueue[this.chainIndex];
    this.showEventStrip(`⚔ 연계 ${this.chainIndex + 1}/${this.chainQueue.length} — ${nextName}!`, 'event-chain', 1.5);
    setTimeout(() => {
      if (!this.active || !this.enemy || this.enemy.currentHp <= 0) {
        this.chainActive = false;
        return;
      }
      this.beginChainWindup(this.getChainPattern(nextName));
    }, 400);
  },

  // 연계 패턴의 개별 공격 윈드업
  beginChainWindup(pattern) {
    if (!this.active || !this.enemy || this.enemy.currentHp <= 0) return;
    if (this.pendingEnemyStrike) return;

    const beast = GameState.beasts[this.beastId];
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
    this.showFeedback('parryWarning');
    this.updateCombatStateUI();
    this.updateContextBar();

    this.enemyTurnTimer = setTimeout(() => {
      this.enemyTurnTimer = null;
      this.resolveEnemyStrike();
    }, windup);
  },

  queueEnemyIntent() {
    // 주작 화염 DOT 틱
    if (this.dotEffect && this.dotEffect.ticks > 0) {
      const dotDmg = this.dotEffect.dmg;
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - dotDmg);
      this.dotEffect.ticks--;
      this.totalDamageDealt += dotDmg;
      this.logLine(`화염 지속 피해! (${dotDmg})`, 'log-critical');
      this.spawnDamageNumber('enemy', dotDmg, { critical: false });
      this.updateEnemyStatus();
      this.updateEnemyPhase();
      if (this.dotEffect.ticks <= 0) this.dotEffect = null;
      if (this.enemy.currentHp <= 0) {
        this.logLine(`${this.enemy.name}이(가) 화염에 쓰러졌다!`, 'log-critical');
        setTimeout(() => this.end(true), 500);
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
      this.updatePlayerStatus();
      if (this.activeDebuffs.poison.ticks <= 0) { delete this.activeDebuffs.poison; this.updateDebuffUI(); }
      if (this.playerHp <= 0) {
        this.logLine('독에 의해 쓰러졌다...', 'log-enemy');
        this.playDefeatCue();
        setTimeout(() => this.end(false), 750);
        return;
      }
    }

    // 약점 노출 기믹 (랜덤 발생)
    if (!this.weaknessWindow && Math.random() < 0.12 && this.enemyPhase >= 1) {
      this.triggerWeakness();
    }

    const intents = [
      ['적이 거리를 재고 있다.', '적이 허점을 살피고 있다.'],
      ['적의 기세가 올라간다!', '적이 날카롭게 반격 각을 잡는다.'],
      ['적이 광폭해졌다! 조심하라.', '치명적인 반격이 예고된다!']
    ];
    const pool = intents[this.enemyPhase] || intents[0];
    this.setIntent(pool[Math.floor(Math.random() * pool.length)]);
  },

  setIntent(text) {
    const el = document.getElementById('combat-intent');
    if (el) el.textContent = text || '';
  },

  updateEnemyPhase() {
    if (!this.enemy || !this.enemy.hp) return;
    const ratio = this.enemy.currentHp / this.enemy.hp;
    const next = ratio <= 0.3 ? 2 : ratio <= 0.6 ? 1 : 0;
    if (next > this.enemyPhase) {
      this.enemyPhase = next;
      if (next === 1) {
        this.logLine('적이 분노해 움직임이 빨라졌다!', 'log-enemy');
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
      this.applyImpact('enemyHeavy');
    }
  },

  updateCombatStateUI() {
    const comboText     = document.getElementById('combat-combo-text');
    const momentumText  = document.getElementById('combat-momentum-text');
    const focusFill     = document.getElementById('combat-focus-fill');
    const skillBtn      = document.getElementById('combat-skill-btn');
    const tapBtn        = document.getElementById('combat-tap-btn');
    const parryBtn      = document.getElementById('combat-parry-btn');
    const streakText    = document.getElementById('combat-streak-text');
    const lootText      = document.getElementById('combat-loot-text');

    const comboMult = this.getComboDamageMultiplier();
    const rewardPreview = this.getCombatRewardPreview();
    const streakPct = Math.round(rewardPreview.streakRate * 100);
    const ticketPct = Math.round(rewardPreview.ticketChance * 100);

    if (comboText) {
      comboText.textContent = this.comboCount > 0
        ? `${this.comboCount}콤보 ×${comboMult.toFixed(2)}`
        : '콤보 0';
      comboText.classList.toggle('combo-hot', this.comboCount >= 5);
    }
    if (momentumText) {
      momentumText.textContent = this.momentumReady ? '기세 MAX!' : `기세 ${Math.floor(this.momentumGauge)}%`;
      momentumText.classList.toggle('combo-hot', this.momentumReady);
    }
    if (focusFill) focusFill.style.width = `${Math.max(0, Math.min(100, this.momentumGauge))}%`;

    if (streakText) {
      streakText.textContent = this.winStreak > 0 ? `연승 ${this.winStreak} (+${streakPct}%)` : '연승 0';
      streakText.classList.toggle('hot', this.winStreak >= 3);
    }
    if (lootText) {
      lootText.textContent = `예상 +${rewardPreview.gold}G · 티켓 ${ticketPct}%`;
      lootText.classList.toggle('jackpot', ticketPct >= 15);
    }

    // 스킬 버튼: 신수별 이름 표시
    if (skillBtn) {
      const skillNames = { cheongryong: '용아참', baekho: '백호폭', jujak: '작화진', hyeonmu: '현무진', hwangryong: '황룡천강' };
      const skillName = skillNames[this.beastId] || '각성 일격';
      const ready = this.momentumGauge >= 100;
      skillBtn.disabled = !ready;
      skillBtn.classList.toggle('ready', ready);
      skillBtn.textContent = ready ? `${skillName} READY!` : `${skillName} (${Math.floor(this.momentumGauge)}%)`;
    }

    if (tapBtn) tapBtn.classList.toggle('combo-hot', this.comboCount >= 5);

    if (parryBtn) {
      const ready = !!this.pendingEnemyStrike;
      parryBtn.disabled = !ready;
      parryBtn.classList.toggle('ready', ready);
      const pname = ready ? (this.pendingEnemyStrike.pattern?.name || '') : '';
      parryBtn.textContent = ready ? `패링! [${pname}]` : '패링 대기';
    }
  },

  updateEnemyStatus() {
    if (!this.enemy || !this.enemy.hp) return;

    const ratio = this.enemy.currentHp / this.enemy.hp;
    let statusText = '멀쩡함';
    if (ratio <= 0) statusText = '쓰러짐';
    else if (ratio <= 0.25) statusText = '거의 쓰러질 것 같음';
    else if (ratio <= 0.5) statusText = '많이 지쳐보임';
    else if (ratio <= 0.75) statusText = '약간 지쳐보임';

    const hpText = document.getElementById('enemy-hp-text');
    const hpFill = document.getElementById('enemy-hp-fill');
    if (hpText) hpText.textContent = statusText;
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
  },

  updatePlayerStatus() {
    const ratio = this.playerHp / this.playerMaxHp;
    const hpText = document.getElementById('player-hp-text');
    const hpFill = document.getElementById('player-hp-fill');
    const ui = document.getElementById('combat-ui');
    if (hpText) hpText.textContent = `${this.playerHp}/${this.playerMaxHp}`;
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
    if (ui) ui.classList.toggle('danger', ratio <= 0.3);
    this.updatePlayerExpression();
  },

  // 플레이어 표정 업데이트 (요소가 없을 때도 안전하게 처리)
  updatePlayerExpression() {
    const beastData = BEAST_DATA[this.beastId];
    const expr = document.getElementById('story-char-expression');
    if (!beastData || !expr) return;

    const ratio = this.playerHp / this.playerMaxHp;
    let idx = 0;
    if (ratio <= 0) idx = 4;
    else if (ratio <= 0.25) idx = 3;
    else if (ratio <= 0.5) idx = 2;
    else if (ratio <= 0.75) idx = 1;

    const stateClass = ['normal', 'hurt1', 'hurt2', 'hurt3', 'down'][idx];
    expr.textContent = beastData.expressions[idx] || '';
    expr.className = `expression-${stateClass}`;
  },

  applyImpact(kind) {
    const area = document.getElementById('story-text-area');
    if (!area) return;

    area.classList.remove('combat-impact', 'combat-impact-strong');
    if (kind === 'critical' || kind === 'enemyHeavy') {
      area.classList.add('combat-impact-strong');
      setTimeout(() => area.classList.remove('combat-impact-strong'), 240);
    } else {
      area.classList.add('combat-impact');
      setTimeout(() => area.classList.remove('combat-impact'), 170);
    }
  },

  spawnHitEffect(target, intensity) {
    const layer = document.getElementById('story-hit-vfx');
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
    const layer = document.getElementById('story-hit-vfx');
    if (!layer) return;
    const value = Math.max(0, Math.floor(amount || 0));
    if (!value) return;

    const isPlayerHit = target === 'player';
    // 데미지 크기 스케일링
    let sizeClass = 'dmg-small';
    if (value >= 50) sizeClass = 'dmg-huge';
    else if (value >= 30) sizeClass = 'dmg-large';
    else if (value >= 15) sizeClass = 'dmg-medium';

    const dmg = document.createElement('div');
    dmg.className = `hit-vfx-dmg ${isPlayerHit ? 'enemy' : 'ally'}${options.critical ? ' crit' : ''}${options.heavy ? ' heavy' : ''} ${sizeClass}`;
    dmg.textContent = `-${value}`;
    dmg.style.left = `${(isPlayerHit ? 64 : 36) + (Math.random() * 10 - 5)}%`;
    dmg.style.top = `${46 + (Math.random() * 10 - 5)}%`;
    layer.appendChild(dmg);
    setTimeout(() => dmg.remove(), options.critical ? 760 : 620);
  },

  logLine(text, className) {
    const log = document.getElementById('combat-log');
    if (!log) return;
    const line = document.createElement('div');
    if (className) line.className = className;
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  },

  // 핵심 메시지 오버레이 — 리듬/패링 중에도 보이는 플로팅 텍스트
  showKeyMessage(text, cls) {
    const parentId = 'story-text-area';
    const parent = document.getElementById(parentId);
    if (!parent) return;

    const msg = document.createElement('div');
    msg.className = `combat-key-message ${cls || ''}`;
    msg.textContent = text;
    parent.appendChild(msg);
    setTimeout(() => msg.remove(), 1600);
  },

  // 전투 이벤트 스트립 — 리듬/패링 중에도 항상 보이는 상단 알림 (UX 개선)
  showEventStrip(text, cls, durationSec) {
    const strip = document.getElementById('combat-event-strip');
    if (!strip) return;
    const dur = durationSec || 2.5;
    const item = document.createElement('div');
    item.className = `event-item ${cls || ''}`;
    item.textContent = text;
    item.style.setProperty('--event-duration', dur + 's');
    // 최대 3개 유지
    while (strip.children.length >= 3) strip.removeChild(strip.firstChild);
    strip.appendChild(item);
    setTimeout(() => { if (item.parentNode) item.remove(); }, (dur + 0.5) * 1000);
  },

  // 메시지 배너 (패링 타이밍 중에도 읽을 수 있는 큰 텍스트)
  showBanner(text, cls) {
    const banner = document.getElementById('combat-banner');
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
            const parryBtnEl = document.getElementById('combat-parry-btn');
            if (parryBtnEl) parryBtnEl.classList.remove('blind-debuff');
          }
        }
      }, def.duration + 50);
      this._debuffTimers.push(tid);
    }
    this.updateDebuffUI();
  },

  updateDebuffUI() {
    const bar = document.getElementById('combat-debuff-bar');
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
    if (!this.active || this.weaknessWindow) return;
    this.weaknessWindow = true;
    this.logLine('적이 빈틈을 보인다! 지금 공격하면 2배 피해!', 'log-good');
    this.showBanner('약점 노출! 지금 공격!', 'banner-weakness');
    this.setIntent('⚡ 적의 빈틈! 빠르게 공격하라!');
    this.showKeyMessage('약점 노출!', 'msg-weakness');
    this.showEventStrip('💥 약점 노출! 공격 시 2배 피해!', 'event-weakness', 3);
    this._weaknessTimer = setTimeout(() => {
      this.weaknessWindow = false;
      this._weaknessTimer = null;
      if (this.active) {
        this.logLine('적이 자세를 바로잡았다.', 'log-miss');
        this.setIntent('적이 다시 자세를 잡았다.');
      }
    }, 2500);
  },

  // 보스 페이즈 기믹: 필살기 예고
  triggerBossGimmick() {
    if (!this.active) return;
    const requiredCombo = 5;
    this.logLine(`적이 필살기를 준비한다! ${requiredCombo}콤보 이상으로 캔슬하라!`, 'log-enemy');
    this.showBanner(`필살기 예고! ${requiredCombo}콤보로 캔슬!`, 'banner-danger');
    this.setIntent(`⚠ 필살기 준비 중! ${requiredCombo}콤보 이상 쌓아 캔슬!`);
    this.showKeyMessage('필살기 예고!', 'msg-danger');
    this.showEventStrip(`🔥 필살기 예고! ${requiredCombo}콤보로 캔슬!`, 'event-gimmick', 3.5);

    // 3초 후 판정
    const gimmickTimer = setTimeout(() => {
      if (!this.active) return;
      if (this.comboCount >= requiredCombo) {
        this.logLine('필살기를 캔슬했다! 적이 큰 빈틈을 보인다!', 'log-critical');
        this.showBanner('필살기 캔슬 성공!', 'banner-critical');
        this.addRewardScore(15);
        this.enemyStaggerTurns = 2;
        this.triggerWeakness();
      } else {
        const bigDmg = Math.max(1, Math.floor((this.enemy.attack || 10) * 2.0));
        this.playerHp = Math.max(0, this.playerHp - bigDmg);
        this.totalDamageTaken += bigDmg;
        this.logLine(`필살기 캔슬 실패! 강력한 일격! (${bigDmg} 피해)`, 'log-enemy');
        this.showBanner('필살기 피격!', 'banner-danger');
        this.spawnHitEffect('player', 'heavy');
        this.spawnDamageNumber('player', bigDmg, { heavy: true });
        this.applyImpact('enemyHeavy');
        this.updatePlayerStatus();
        this.updateCombatStateUI();
        if (this.playerHp <= 0) {
          this.logLine('필살기에 쓰러졌다...', 'log-enemy');
          this.playDefeatCue();
          setTimeout(() => this.end(false), 750);
        }
      }
    }, 3000);
    this._debuffTimers.push(gimmickTimer);
  },

  // 스킬 컷씬 연출 (공용 — 스토리 & 탑) — 시네마틱 버전
  showSkillCutscene(beastId, mode) {
    const vfx = BEAST_SKILL_VFX[beastId];
    if (!vfx) return;
    const parentId = mode === 'tower' ? 'tower-battle' : 'story-text-area';
    const parent = document.getElementById(parentId);
    if (!parent) return;

    // 기존 컷씬 제거
    const old = parent.querySelector('.skill-cutscene-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'skill-cutscene-overlay enhanced cinematic';
    overlay.style.setProperty('--skill-color', vfx.color);
    overlay.style.setProperty('--skill-glow', vfx.glow);

    // 시네마틱 레터박스 (상단/하단 블랙바)
    const letterboxTop = document.createElement('div');
    letterboxTop.className = 'skill-letterbox-top';
    overlay.appendChild(letterboxTop);
    const letterboxBottom = document.createElement('div');
    letterboxBottom.className = 'skill-letterbox-bottom';
    overlay.appendChild(letterboxBottom);

    // 스피드 라인 배경
    const speedLines = document.createElement('div');
    speedLines.className = 'skill-speed-lines';
    overlay.appendChild(speedLines);

    // 오라 이펙트
    const aura = document.createElement('div');
    aura.className = 'skill-cutscene-aura';
    overlay.appendChild(aura);

    // 에너지 링
    const ring = document.createElement('div');
    ring.className = 'skill-cutscene-ring';
    overlay.appendChild(ring);

    // 배경 CG 이미지 (드라마틱 줌)
    const cgPath = getCGStandingPath(beastId);
    if (cgPath) {
      const img = document.createElement('img');
      img.className = 'skill-cutscene-cg cinematic-zoom';
      img.src = cgPath;
      img.alt = '';
      img.draggable = false;
      overlay.appendChild(img);
    }

    // 스킬 이름 텍스트 (붓 터치 효과)
    const nameEl = document.createElement('div');
    nameEl.className = 'skill-cutscene-name brush-stroke';
    nameEl.textContent = vfx.name;
    overlay.appendChild(nameEl);

    // 서브 설명 (신수별 스킬 타입)
    const descs = {
      cheongryong: '폭풍을 가르는 연격',
      baekho: '불굴의 일격과 수호',
      jujak: '불꽃이 모든 것을 태운다',
      hyeonmu: '대지의 방패와 반격',
      hwangryong: '천지를 뒤흔드는 힘'
    };
    const subDesc = document.createElement('div');
    subDesc.className = 'skill-cutscene-subdesc';
    subDesc.textContent = descs[beastId] || '';
    overlay.appendChild(subDesc);

    // 슬래시 이펙트 (더 많이, 더 강하게)
    for (let i = 0; i < 8; i++) {
      const slash = document.createElement('div');
      slash.className = 'skill-cutscene-slash';
      slash.style.setProperty('--slash-i', i);
      slash.style.top = `${12 + i * 10}%`;
      slash.style.filter = vfx.slashColor;
      overlay.appendChild(slash);
    }

    // 속성 이모지 이펙트 (신수별)
    const elementEmojis = {
      cheongryong: ['🌊', '💨', '🐉', '⚡'],
      baekho: ['⚡', '🌟', '🐅', '💫'],
      jujak: ['🔥', '🔥', '🔥', '💥'],
      hyeonmu: ['🌿', '🛡️', '🐢', '💎'],
      hwangryong: ['⚡', '✨', '🌟', '💫']
    };
    const emojis = elementEmojis[beastId] || elementEmojis.cheongryong;
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'skill-cutscene-element';
      el.textContent = emojis[i % emojis.length];
      el.style.setProperty('--el-i', i);
      el.style.left = `${15 + Math.random() * 70}%`;
      el.style.top = `${15 + Math.random() * 70}%`;
      el.style.setProperty('--el-dx', `${(Math.random() - 0.5) * 80}px`);
      el.style.setProperty('--el-dy', `${-20 - Math.random() * 60}px`);
      overlay.appendChild(el);
    }

    // 에너지 파티클 스타일 주입 (최초 1회)
    if (!document.getElementById('skill-particle-style')) {
      const style = document.createElement('style');
      style.id = 'skill-particle-style';
      style.textContent = `
        .skill-cutscene-particle {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          left: var(--p-x);
          top: var(--p-y);
          z-index: 4;
          opacity: 0;
          animation: skillParticleFloat 0.8s ease-out calc(var(--p-i) * 0.05s) forwards;
        }
        @keyframes skillParticleFloat {
          0% { opacity: 0; transform: scale(0); }
          30% { opacity: 1; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(0) translateY(-40px); }
        }
      `;
      document.head.appendChild(style);
    }

    // 에너지 파티클 (더 많이)
    for (let i = 0; i < 18; i++) {
      const particle = document.createElement('div');
      particle.className = 'skill-cutscene-particle';
      particle.style.setProperty('--p-i', i);
      particle.style.setProperty('--p-x', `${Math.random() * 100}%`);
      particle.style.setProperty('--p-y', `${Math.random() * 100}%`);
      particle.style.background = vfx.color;
      overlay.appendChild(particle);
    }

    // 화이트 플래시 (스크린 프리즈 효과)
    const flash = document.createElement('div');
    flash.className = 'skill-cutscene-flash freeze-flash';
    overlay.appendChild(flash);

    parent.appendChild(overlay);

    // 프리즈 프레임: 300ms 동안 리듬미터/적 타이머 일시정지 효과 (시각적)
    parent.classList.add('skill-freeze-frame');
    setTimeout(() => parent.classList.remove('skill-freeze-frame'), 300);

    // 이벤트 스트립에도 표시
    const stripId = mode === 'tower' ? 'tower-event-strip' : 'combat-event-strip';
    const stripEl = document.getElementById(stripId);
    if (stripEl) {
      const item = document.createElement('div');
      item.className = 'event-item event-skill';
      item.textContent = `${vfx.icon} ${vfx.name}!!!`;
      item.style.setProperty('--event-duration', '2s');
      while (stripEl.children.length >= 3) stripEl.removeChild(stripEl.firstChild);
      stripEl.appendChild(item);
      setTimeout(() => { if (item.parentNode) item.remove(); }, 2500);
    }

    // 키 메시지 표시
    if (mode === 'tower') {
      Tower.showKeyMessage(vfx.name + '!!!', 'msg-skill');
    } else {
      this.showKeyMessage(vfx.name + '!!!', 'msg-skill');
    }

    // 컷씬 후 화면 흔들림 연출 (더 강하게)
    setTimeout(() => {
      if (mode === 'tower') { Tower.applyBattleImpact('critical'); }
      else { this.applyImpact('critical'); }
    }, 700);
    setTimeout(() => {
      if (mode === 'tower') { Tower.applyBattleImpact('critical'); }
      else { this.applyImpact('critical'); }
    }, 900);

    setTimeout(() => overlay.remove(), 1600);
  },

  // 패시브 스킬 트리거 (콤보 3 이상 시 확률적 발동)
  checkPassiveSkillTrigger() {
    if (!this.active || !this.enemy) return;
    const beast = GameState.beasts[this.beastId];
    if (!beast) return;

    // 기본 8% 확률, 콤보당 +1%
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

    const skill = passiveSkills[this.beastId] || passiveSkills.cheongryong;

    if (skill.heal) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + skill.heal);
      this.logLine(`[${skill.name}] ${skill.text} (+${skill.heal} 회복)`, 'log-good');
      this.updatePlayerStatus();
    } else {
      this.enemy.currentHp = Math.max(0, this.enemy.currentHp - skill.dmg);
      this.totalDamageDealt += skill.dmg;
      this.logLine(`[${skill.name}] ${skill.text} (${skill.dmg} 추가 피해)`, 'log-critical');
      this.spawnDamageNumber('enemy', skill.dmg, { critical: true });
      this.updateEnemyStatus();
      this.updateEnemyPhase();
    }

    this.showKeyMessage(skill.name + '!', 'msg-skill');
    this.playSfx('hitEnemyHeavy', 120);
    this.showPassiveSkillEffect(skill, this.beastId, 'story');
    this.showEventStrip(`${BEAST_SKILL_VFX[this.beastId]?.icon || '⚡'} ${skill.name}!`, 'event-passive', 2);
  },

  // 패시브 스킬 미니 컷씬 (공용) — 초상화 플래시 포함
  showPassiveSkillEffect(skill, beastId, mode) {
    const parentId = mode === 'tower' ? 'tower-battle' : 'story-text-area';
    const parent = document.getElementById(parentId);
    if (!parent) return;

    const vfx = BEAST_SKILL_VFX[beastId];
    const color = (vfx && vfx.color) || skill.color || '#ffd166';
    const glow = (vfx && vfx.glow) || 'rgba(255,209,102,0.4)';

    const flash = document.createElement('div');
    flash.className = 'passive-skill-flash';
    flash.style.setProperty('--passive-color', color);
    flash.style.setProperty('--passive-glow', glow);

    // 신수 초상화 플래시 (200ms 간 포트레이트 표시)
    const portraitPath = getBeastPortraitPath(beastId);
    if (portraitPath) {
      const portrait = document.createElement('img');
      portrait.className = 'passive-skill-portrait';
      portrait.src = portraitPath;
      portrait.alt = '';
      portrait.draggable = false;
      flash.appendChild(portrait);
    }

    // 아이콘
    const iconEl = document.createElement('div');
    iconEl.className = 'passive-skill-icon';
    iconEl.textContent = (vfx && vfx.icon) || '⚡';
    flash.appendChild(iconEl);

    // 이름
    const nameEl = document.createElement('div');
    nameEl.className = 'passive-skill-name';
    nameEl.textContent = skill.name;
    flash.appendChild(nameEl);

    // 에너지 링
    const ring = document.createElement('div');
    ring.className = 'passive-skill-ring';
    ring.style.borderColor = color;
    flash.appendChild(ring);

    parent.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  },

  // 전투 결과 계산
  computeCombatGrade() {
    const totalParries = this.parryPerfectCount + this.parryGoodCount + this.parryFailCount;
    const parryRate = totalParries > 0 ? ((this.parryPerfectCount + this.parryGoodCount) / totalParries) : 0;
    const hpRatio = this.playerHp / this.playerMaxHp;
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
    const container = document.getElementById('combat-result-overlay');
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
        <button class="result-close-btn" onclick="Combat.closeCombatResult()">확인</button>
      </div>
    `;
    container.classList.remove('hidden');
  },

  closeCombatResult() {
    const container = document.getElementById('combat-result-overlay');
    if (container) {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
  },

  // 전투 상황 컨텍스트 바 업데이트 (UX: 리듬/패링 중에도 읽을 수 있는 1줄 요약)
  updateContextBar() {
    const bar = document.getElementById('combat-context-bar');
    if (!bar) return;
    if (!this.active || !this.enemy) {
      bar.textContent = '';
      bar.className = 'combat-context-bar';
      return;
    }

    const hpRatio = this.enemy.currentHp / this.enemy.hp;
    let hpState = '멀쩡함';
    if (hpRatio <= 0) hpState = '쓰러짐';
    else if (hpRatio <= 0.25) hpState = '거의 쓰러질 것 같음';
    else if (hpRatio <= 0.5) hpState = '많이 지쳐보임';
    else if (hpRatio <= 0.75) hpState = '약간 지쳐보임';

    let contextText = '';
    let contextClass = 'combat-context-bar';

    if (this.pendingEnemyStrike) {
      const pname = this.pendingEnemyStrike.pattern?.name || '공격';
      const isChain = this.chainActive ? ` (연계 ${this.chainIndex + 1}/${this.chainQueue.length})` : '';
      if (this.pendingEnemyStrike.pattern?.unparryable) {
        contextText = `⚠ ${pname}! 패링 불가!${isChain}`;
        contextClass += ' ctx-danger';
      } else {
        contextText = `⚔ ${pname}! 패링 준비!${isChain}`;
        contextClass += ' ctx-parry';
      }
    } else if (this.weaknessWindow) {
      contextText = '💥 약점 노출! 지금 공격!';
      contextClass += ' ctx-weakness';
    } else if (this.momentumReady) {
      contextText = `⚡ 기세 MAX! 스킬 사용 가능! · ${this.comboCount}콤보 · 적: ${hpState}`;
      contextClass += ' ctx-skill-ready';
    } else {
      const comboText = this.comboCount > 0 ? `${this.comboCount}콤보` : '콤보 0';
      contextText = `${comboText} · 기세 ${Math.floor(this.momentumGauge)}% · 적: ${hpState}`;
      contextClass += ' ctx-idle';
    }

    bar.textContent = contextText;
    bar.className = contextClass;
  },

  // 전투 종료
  end(won) {
    const prevStreak = this.winStreak;
    if (won) {
      this.grantVictoryRewards();
      this.winStreak = prevStreak + 1;
      if (this.winStreak >= 2) {
        const nextBonus = Math.round(Math.min(65, this.winStreak * 8));
        UI.showToast(`${this.winStreak}연승! 다음 전투 보상 +${nextBonus}%`);
      }
    } else {
      if (prevStreak >= 3) {
        UI.showToast(`${prevStreak}연승 종료... 다시 올려보자.`);
      }
      this.winStreak = 0;
    }

    this.active = false;
    this.pendingEnemyStrike = null;
    this.clearFeedbackTimer();
    this.clearComboTimer();
    if (this.enemyTurnTimer) { clearTimeout(this.enemyTurnTimer); this.enemyTurnTimer = null; }
    if (this._dialogueTimer) { clearTimeout(this._dialogueTimer); this._dialogueTimer = null; }
    if (this._weaknessTimer) { clearTimeout(this._weaknessTimer); this._weaknessTimer = null; }
    if (this._bannerTimer) { clearTimeout(this._bannerTimer); }
    this._debuffTimers.forEach(t => clearTimeout(t));
    this._debuffTimers = [];

    if (won) this.showCombatDialogue('win');

    // 결과 리포트 표시
    this.showCombatResult(won);

    const ui = document.getElementById('combat-ui');
    const nextBtn = document.getElementById('story-next-btn');
    const tapBtn = document.getElementById('combat-tap-btn');
    const parryBtn = document.getElementById('combat-parry-btn');
    const feedback = document.getElementById('combat-feedback');
    const vfxLayer = document.getElementById('story-hit-vfx');
    const dialogue = document.getElementById('combat-beast-dialogue');
    if (ui) { ui.classList.add('hidden'); ui.classList.remove('danger'); }
    if (nextBtn) nextBtn.classList.remove('hidden');
    if (tapBtn) tapBtn.classList.remove('combo-hot');
    if (parryBtn) { parryBtn.classList.remove('ready', 'blind-debuff'); parryBtn.disabled = true; parryBtn.textContent = '패링 대기'; }
    if (feedback) feedback.className = '';
    if (vfxLayer) vfxLayer.innerHTML = '';
    if (dialogue) setTimeout(() => dialogue.classList.add('hidden'), 2600);
    this.setIntent('');
    this.momentumGauge = 0;
    this.momentumReady = false;
    this.dotEffect = null;
    this.shieldActive = false;
    this.activeDebuffs = {};
    this.weaknessWindow = false;
    const banner = document.getElementById('combat-banner');
    if (banner) banner.className = 'combat-banner';
    const debuffBar = document.getElementById('combat-debuff-bar');
    if (debuffBar) debuffBar.innerHTML = '';
    const eventStrip = document.getElementById('combat-event-strip');
    if (eventStrip) eventStrip.innerHTML = '';
    const contextBar = document.getElementById('combat-context-bar');
    if (contextBar) { contextBar.textContent = ''; contextBar.className = 'combat-context-bar'; }
    this.chainActive = false;
    this.chainQueue = [];
    const expr = document.getElementById('story-char-expression');
    if (expr) { expr.className = ''; expr.textContent = ''; }
    if (typeof StoryAudio !== 'undefined' && StoryAudio && typeof StoryAudio.startAmbient === 'function') {
      if (won) {
        StoryAudio.startAmbient(this.beastId);
      } else {
        setTimeout(() => StoryAudio.startAmbient(this.beastId), 780);
      }
    }

    if (won && this.onWin) {
      this.onWin();
    } else if (!won && this.onLose) {
      this.onLose();
    }
  }
};

