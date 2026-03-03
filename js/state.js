/* ===== 게임 상태 관리 ===== */

const GameState = {
  // 기본 상태
  gold: 0,
  gachaTickets: 0,
  currentBeast: 'cheongryong',
  lastSaveTime: Date.now(),
  lastIdleCollect: Date.now(),
  storyProgress: {},   // { beastId: chapterIndex }
  gameStarted: false,
  mainBackground: null,

  // 신수별 상태
  beasts: {},

  // 탑 상태
  tower: {},

  // 인벤토리
  inventory: {
    affectionItems: {},  // { itemId: count }
    trainingTools: {},   // { toolId: true }
    skins: {}            // { skinId: true }
  },

  // 초기화
  init() {
    const saved = localStorage.getItem('shinsu_save');
    if (saved) {
      const data = JSON.parse(saved);
      Object.assign(this, data);
      if (!this.mainBackground) {
        this.mainBackground = getMainBackgroundDefaultPath();
      }
      this.calculateIdleReward();
    } else {
      this.createNewGame();
    }
  },

  createNewGame() {
    this.gold = 50;
    this.gachaTickets = 0;
    this.currentBeast = 'cheongryong';
    this.gameStarted = true;
    this.mainBackground = getMainBackgroundDefaultPath();
    this.lastSaveTime = Date.now();
    this.lastIdleCollect = Date.now();
    this.expMultiplier = 1;
    this.expMultiplierEnd = null;

    // 4신수 초기화 (황룡은 잠금)
    const beastIds = ['cheongryong', 'baekho', 'jujak', 'hyeonmu', 'hwangryong'];
    this.beasts = {};
    beastIds.forEach(id => {
      this.beasts[id] = {
        unlocked: id !== 'hwangryong',
        level: 1,
        exp: 0,
        starGrade: 1,
        awakened: false,
        hasAwakeningItem: false,
        affection: 0,
        affectionLevel: 1,
        abandoned: false,     // 순간이동으로 버려짐
        reunited: false,      // 재회함
        equippedSkin: `skin_${id.substring(0,2)}_default`,
        // 탑 보정
        towerAtkBonus: 0,
        towerEvdBonus: 0,
        towerDefBonus: 0
      };
    });

    // 스토리 진행도
    this.storyProgress = {
      cheongryong: 0,
      baekho: 0,
      jujak: 0,
      hyeonmu: 0,
      hwangryong: 0,
      main: 0
    };

    // 탑 기록
    this.tower = {
      cheongryong: { currentFloor: 1, bestFloor: 0 },
      baekho: { currentFloor: 1, bestFloor: 0 },
      jujak: { currentFloor: 1, bestFloor: 0 },
      hyeonmu: { currentFloor: 1, bestFloor: 0 },
      hwangryong: { currentFloor: 1, bestFloor: 0 }
    };

    this.inventory = {
      affectionItems: {},
      trainingTools: {},
      skins: {}
    };

    this.save();
  },

  // 저장
  save() {
    this.lastSaveTime = Date.now();
    const data = {
      gold: this.gold,
      gachaTickets: this.gachaTickets,
      currentBeast: this.currentBeast,
      lastSaveTime: this.lastSaveTime,
      lastIdleCollect: this.lastIdleCollect,
      gameStarted: this.gameStarted,
      mainBackground: this.mainBackground,
      beasts: this.beasts,
      storyProgress: this.storyProgress,
      tower: this.tower,
      inventory: this.inventory,
      expMultiplier: this.expMultiplier,
      expMultiplierEnd: this.expMultiplierEnd
    };
    localStorage.setItem('shinsu_save', JSON.stringify(data));
  },

  // 방치 보상 계산
  calculateIdleReward() {
    const now = Date.now();
    const elapsed = (now - this.lastIdleCollect) / 1000; // 초
    const rate = this.getIdleRate();
    return Math.floor(elapsed * rate);
  },

  // 방치 수익률 (초당 EXP)
  getIdleRate() {
    let rate = BASE_IDLE_RATE; // 0.5 - 탭보다 느림
    // 훈련도구 보너스
    TRAINING_TOOLS.forEach(tool => {
      if (this.inventory.trainingTools[tool.id]) {
        rate += tool.bonus;
      }
    });
    return rate;
  },

  // 경험치 추가
  addExp(beastId, amount) {
    const beast = this.beasts[beastId];
    if (!beast || !beast.unlocked) return;

    // Check if multiplier is active
    if (this.expMultiplierEnd && Date.now() < this.expMultiplierEnd) {
      amount = Math.floor(amount * this.expMultiplier);
    } else {
      this.expMultiplier = 1;
      this.expMultiplierEnd = null;
    }

    beast.exp += amount;

    // 레벨업 체크
    while (beast.level < 250) {
      const needed = getExpForLevel(beast.level);
      if (beast.exp >= needed) {
        beast.exp -= needed;
        beast.level++;
        this.updateStarGrade(beastId);
        UI.showToast(`${BEAST_DATA[beastId].name} Lv.${beast.level} 달성!`);

        // 레벨업 보상 체크
        const reward = LEVELUP_REWARDS.find(r => r.level === beast.level);
        if (reward) {
          if (reward.type === 'gold') {
            this.gold += reward.value;
            UI.showToast(`레벨 ${beast.level} 보상: ${reward.name} (+${reward.value} 골드)`);
          } else if (reward.type === 'exp_multiplier') {
            this.expMultiplier = reward.value;
            this.expMultiplierEnd = Date.now() + reward.duration * 1000;
            UI.showToast(`레벨 ${beast.level} 보상: ${reward.name} (x${reward.value}, ${reward.duration}초)`);
          }
        }
      } else {
        break;
      }
    }
    this.save();
  },

  // 성급 업데이트
  updateStarGrade(beastId) {
    const beast = this.beasts[beastId];
    for (let i = STAR_GRADES.length - 1; i >= 0; i--) {
      if (beast.level >= STAR_GRADES[i].minLevel) {
        if (beast.starGrade < STAR_GRADES[i].star) {
          beast.starGrade = STAR_GRADES[i].star;
          UI.showToast(`${BEAST_DATA[beastId].name} ${STAR_GRADES[i].label} 달성!`);
        }
        break;
      }
    }
  },

  // 전투 보정 합계
  getCombatBonus(beastId) {
    const beast = this.beasts[beastId];
    if (!beast) return 0;

    // 성급 보정
    let bonus = 0;
    if (beast.awakened) {
      bonus = AWAKENED_BONUS;
    } else {
      const grade = STAR_GRADES.find(g => g.star === beast.starGrade);
      bonus = grade ? grade.bonus : 0;
    }

    // 호감도 보정
    const affLevel = AFFECTION_LEVELS.find(a => a.level === beast.affectionLevel);
    if (affLevel) bonus += affLevel.atkBonus;

    // 탑 보정
    bonus += beast.towerAtkBonus;

    return bonus;
  },

  // 호감도 추가
  addAffection(beastId, amount) {
    const beast = this.beasts[beastId];
    if (!beast) return;

    beast.affection += amount;

    // 호감도 레벨 체크
    for (let i = AFFECTION_LEVELS.length - 1; i >= 0; i--) {
      if (beast.affection >= AFFECTION_LEVELS[i].required) {
        if (beast.affectionLevel < AFFECTION_LEVELS[i].level) {
          beast.affectionLevel = AFFECTION_LEVELS[i].level;
          UI.showToast(`${BEAST_DATA[beastId].name} 호감도 ${beast.affectionLevel}단계!`);
          if (AFFECTION_LEVELS[i].storyUnlock) {
            UI.showToast(`호감도 스토리 ${AFFECTION_LEVELS[i].storyUnlock} 해금!`);
          }
        }
        break;
      }
    }
    this.save();
  },

  // 각성 체크
  canAwaken(beastId) {
    const beast = this.beasts[beastId];
    return beast && beast.starGrade === 5 && beast.hasAwakeningItem && !beast.awakened;
  },

  // 모든 4신수 각성 확인
  allFourAwakened() {
    const four = ['cheongryong', 'baekho', 'jujak', 'hyeonmu'];
    return four.every(id => this.beasts[id] && this.beasts[id].awakened);
  }
};
