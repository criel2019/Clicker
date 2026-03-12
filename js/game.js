/* ===== 메인 게임 로직 ===== */

const Game = {
  goblinTimer: null,
  goblinActive: false,
  goblinTimeout: null,
  idleInterval: null,
  saveInterval: null,

  playSfx(type = 'page', throttledMs = 0) {
    if (typeof StoryAudio === 'undefined' || !StoryAudio) return;
    if (throttledMs > 0 && typeof StoryAudio.playSfxThrottled === 'function') {
      StoryAudio.playSfxThrottled(type, throttledMs);
      return;
    }
    if (typeof StoryAudio.playSfx === 'function') {
      StoryAudio.playSfx(type);
    }
  },

  // 게임 초기화
  init() {
    GameState.init();
    Story.loadCGs();
    Story.loadBookmarks();
    Story.loadReadProgress();
    Story.loadCompletedChapters();
    UI.renderMainScreen();
    UI.initInteractions();

    // 스토리 탭 알림 뱃지
    setTimeout(() => Story.updateStoryBadge(), 100);
    UI.updateGoldDisplay();

    // 방치 보상 자동 갱신
    this.idleInterval = setInterval(() => {
      if (document.getElementById('overlay-training').classList.contains('hidden')) return;
      UI.updateTrainingDisplay();
    }, 1000);

    // 자동 저장
    this.saveInterval = setInterval(() => {
      GameState.save();
    }, 30000);

    // 황금 고블린 타이머 시작
    this.scheduleGoblin();

    // 황룡 해금 체크
    this.checkHwangryongUnlock();

    // 오프라인 보상 체크
    this.checkOfflineReward();

    // 탭 전환/닫기 시 저장 (오프라인 시간 정확도 향상)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') GameState.save();
    });
    window.addEventListener('beforeunload', () => {
      GameState.save();
    });
  },

  // 캐릭터 탭 (메인 화면)
  tapCharacter() {
    this.playSfx('page', 120);
    const beastId = GameState.currentBeast;
    const beast = GameState.beasts[beastId];
    const data = BEAST_DATA[beastId];
    if (!beast || !data) return;

    // 경험치 +1
    GameState.addExp(beastId, 1);

    // Select dialogue pool based on star grade AND affection
    const isHighAffection = beast.affectionLevel >= 7;
    const isAbandoned = beast.abandoned;
    let pool;
    if (isAbandoned) {
      pool = data.abandoned_dialogues || data.dialogues.normal;
    } else if (isHighAffection) {
      pool = data.dialogues.affection_high;
    } else if (beast.starGrade >= 5) {
      pool = data.dialogues.star_high;
    } else if (beast.starGrade >= 3) {
      pool = data.dialogues.star_mid;
    } else {
      pool = data.dialogues.normal;
    }
    const dialogue = pool[Math.floor(Math.random() * pool.length)];

    const bubble = document.getElementById('dialogue-bubble');
    const text = document.getElementById('dialogue-text');
    bubble.classList.remove('hidden');
    text.textContent = dialogue;

    // 3초 후 숨김
    clearTimeout(this._dialogueTimer);
    this._dialogueTimer = setTimeout(() => {
      bubble.classList.add('hidden');
    }, 3000);

    // 탭 피드백 - 캐릭터 살짝 흔들림
    const charEl = document.getElementById('main-character');
    charEl.style.transform = 'scale(0.95)';
    setTimeout(() => charEl.style.transform = '', 100);

    // 감정 애니메이션 재생
    const emotion = getRandomEmotion(beastId);
    if (emotion) {
      const video = document.getElementById('main-char-emotion');
      const charCgImg = document.getElementById('main-char-cg');
      const charFallback = document.getElementById('main-char-fallback');
      const emotionPath = getCGEmotionPath(beastId, emotion);
      if (video && emotionPath && !video._playing) {
        const hideStandingForEmotion = () => {
          if (charCgImg) charCgImg.classList.add('emotion-hidden');
          if (charFallback) charFallback.classList.add('emotion-hidden');
        };
        const restoreStandingAfterEmotion = () => {
          if (charCgImg) charCgImg.classList.remove('emotion-hidden');
          if (charFallback) charFallback.classList.remove('emotion-hidden');
        };
        const finalizeEmotionVideo = () => {
          video.onended = null;
          video.classList.add('hidden');
          video.classList.remove('fading-out');
          video.removeAttribute('src');
          video.style.opacity = '';
          video._playing = false;
        };

        video._playing = true;
        video.src = emotionPath;
        video.classList.remove('hidden', 'fading-out');
        video.style.opacity = '0';
        hideStandingForEmotion();
        video.currentTime = 0;
        requestAnimationFrame(() => { video.style.opacity = '1'; });
        video.play().catch(() => {
          restoreStandingAfterEmotion();
          finalizeEmotionVideo();
        });
        video.onended = () => {
          restoreStandingAfterEmotion();
          video.classList.add('fading-out');
          setTimeout(finalizeEmotionVideo, 140);
        };
      }
    }

    // UI 업데이트
    UI.renderMainScreen();
  },

  // 훈련 화면 탭
  trainTap(event) {
    this.playSfx('page', 90);
    const beastId = GameState.currentBeast;
    const beast = GameState.beasts[beastId];
    if (!beast || !beast.unlocked) return;

    // 경험치 +1
    GameState.addExp(beastId, 1);

    // 탭 피드백 파티클
    const container = document.getElementById('training-particles');
    if (container) {
      const particle = document.createElement('div');
      particle.className = 'train-particle';
      particle.textContent = '+1 EXP';
      const rect = container.getBoundingClientRect();
      const x = (event.clientX || rect.width / 2) - rect.left;
      const y = (event.clientY || rect.height / 2) - rect.top;
      particle.style.left = `${x - 20}px`;
      particle.style.top = `${y}px`;
      container.appendChild(particle);
      setTimeout(() => particle.remove(), 600);
    }

    // 훈련 UI 업데이트
    UI.updateTrainingDisplay();

    // SD 캐릭터 반응 텍스트
    const actions = this.getTrainingActions(beastId, beast.level);
    const actionText = document.getElementById('training-action-text');
    if (actionText) {
      actionText.textContent = actions[Math.floor(Math.random() * actions.length)];
      setTimeout(() => { if (actionText) actionText.textContent = ''; }, 1000);
    }
  },

  // 레벨 구간별 훈련 모습 텍스트
  getTrainingActions(beastId, level) {
    const data = BEAST_DATA[beastId];
    const trainingTexts = data.trainingActions || TRAINING_ACTIONS_DEFAULT;

    if (level <= 50) return trainingTexts.beginner;
    if (level <= 100) return trainingTexts.intermediate;
    if (level <= 200) return trainingTexts.advanced;
    return trainingTexts.master;
  },

  // 골드 채굴
  mineGold(event) {
    this.playSfx('reward', 130);
    const amount = 1 + Math.floor(Math.random() * 3);
    GameState.gold += amount;
    GameState.save();
    UI.updateGoldDisplay();

    // Particle on main screen
    const container = document.getElementById('gold-particles-main');
    if (container) {
      const particle = document.createElement('div');
      particle.className = 'gold-particle';
      particle.innerHTML = `<span class="ui-icon icon-coins-bag" aria-hidden="true"></span><span>+${amount}</span>`;
      particle.style.left = `${Math.random() * 60}px`;
      particle.style.top = `${80 + Math.random() * 40}px`;
      container.appendChild(particle);
      setTimeout(() => particle.remove(), 800);
    }
  },

  // 방치 경험치 수령
  collectIdleExp() {
    const amount = GameState.calculateIdleReward();
    if (amount <= 0) {
      this.playSfx('transition', 180);
      UI.showToast('아직 쌓인 경험치가 없습니다.');
      return;
    }

    GameState.addExp(GameState.currentBeast, amount);
    GameState.lastIdleCollect = Date.now();
    GameState.save();
    this.playSfx('reward');

    UI.showToast(`${amount.toLocaleString()} EXP 수령!`);
    UI.updateTrainingDisplay();
    UI.renderMainScreen();
  },

  // 선물하기 (호감도 아이템)
  giveGift() {
    const beastId = GameState.currentBeast;
    // 가장 높은 등급 아이템부터 사용
    const items = [...AFFECTION_ITEMS].reverse();
    let used = false;

    for (const item of items) {
      if (GameState.inventory.affectionItems[item.id] > 0) {
        GameState.inventory.affectionItems[item.id]--;
        GameState.addAffection(beastId, item.value);
        UI.showToast(`${BEAST_DATA[beastId].name}에게 ${item.name}을(를) 선물했다! 호감도 +${item.value}`);
        used = true;
        break;
      }
    }

    if (!used) {
      UI.showToast('선물할 아이템이 없습니다. 상점에서 구매하세요!');
    }

    UI.openBeastDetail(beastId);
  },

  // 황금 고블린 스케줄
  scheduleGoblin() {
    // 12분~60분 사이 랜덤 (시간당 1~5회)
    const delay = (12 + Math.random() * 48) * 60 * 1000;
    // 테스트용: 30초~90초
    const testDelay = (30 + Math.random() * 60) * 1000;

    this.goblinTimer = setTimeout(() => {
      this.spawnGoblin();
    }, testDelay);
  },

  // 황금 고블린 등장
  spawnGoblin() {
    if (this.goblinActive) return;
    this.goblinActive = true;

    const goblin = document.getElementById('golden-goblin');
    goblin.classList.remove('hidden');

    // 랜덤 위치로 이동
    const moveGoblin = () => {
      if (!this.goblinActive) return;
      const zone = document.getElementById('golden-goblin-zone');
      if (!zone) return;
      const maxX = Math.max(zone.clientWidth - 60, 100);
      const maxY = Math.max(zone.clientHeight - 60, 100);
      goblin.style.left = `${Math.random() * maxX}px`;
      goblin.style.top = `${Math.random() * maxY}px`;
    };

    moveGoblin();
    const moveInterval = setInterval(moveGoblin, 2000);

    // 1분 후 사라짐
    this.goblinTimeout = setTimeout(() => {
      this.goblinActive = false;
      goblin.classList.add('hidden');
      clearInterval(moveInterval);
      this.scheduleGoblin();
    }, 60000);

    // 황금 고블린 출현 토스트
    UI.showToast('황금 고블린 출현!');
    this.playSfx('combat');

    // moveInterval 저장해서 나중에 정리
    this._goblinMoveInterval = moveInterval;
  },

  // 황금 고블린 잡기
  catchGoblin() {
    if (!this.goblinActive) return;
    this.goblinActive = false;

    const goblin = document.getElementById('golden-goblin');
    goblin.classList.add('hidden');
    clearTimeout(this.goblinTimeout);
    if (this._goblinMoveInterval) clearInterval(this._goblinMoveInterval);

    // 드랍 결정
    const totalWeight = GOBLIN_DROPS.reduce((sum, d) => sum + d.weight, 0);
    let roll = Math.random() * totalWeight;
    let drop = GOBLIN_DROPS[0];

    for (const d of GOBLIN_DROPS) {
      roll -= d.weight;
      if (roll <= 0) {
        drop = d;
        break;
      }
    }

    // 보상 지급
    if (drop.type === 'affection_item') {
      if (!GameState.inventory.affectionItems[drop.item]) {
        GameState.inventory.affectionItems[drop.item] = 0;
      }
      GameState.inventory.affectionItems[drop.item]++;
      UI.showToast(`황금 고블린 처치! ${drop.label} 획득!`);
    } else if (drop.type === 'gold') {
      GameState.gold += drop.amount;
      UI.showToast(`황금 고블린 처치! ${drop.label} 획득!`);
    } else if (drop.type === 'gacha_random') {
      if (!GameState.gachaTickets) GameState.gachaTickets = { random: 0, select: 0 };
      if (typeof GameState.gachaTickets === 'number') {
        // migrate old format
        GameState.gachaTickets = { random: GameState.gachaTickets, select: 0 };
      }
      GameState.gachaTickets.random++;
      UI.showToast(`황금 고블린 처치! ${drop.label} 획득!`);
    } else if (drop.type === 'gacha_select') {
      if (!GameState.gachaTickets) GameState.gachaTickets = { random: 0, select: 0 };
      if (typeof GameState.gachaTickets === 'number') {
        GameState.gachaTickets = { random: GameState.gachaTickets, select: 0 };
      }
      GameState.gachaTickets.select++;
      UI.showToast(`황금 고블린 처치! ${drop.label} 획득! (대박!)`);
    }

    GameState.save();
    UI.updateGoldDisplay();
    this.playSfx('reward');
    this.scheduleGoblin();
  },

  // 황룡 해금 체크
  checkHwangryongUnlock() {
    if (GameState.allFourAwakened() && !GameState.beasts.hwangryong.unlocked) {
      GameState.beasts.hwangryong.unlocked = true;
      GameState.save();
      this.playSfx('flash');
      UI.showToast('황룡이 실체화되었다!');
    }
  },

  // 오프라인 보상 체크
  checkOfflineReward() {
    const now = Date.now();
    const lastSave = GameState.lastSaveTime;
    const offlineMs = now - lastSave;
    const minOfflineMs = 5 * 60 * 1000; // 최소 5분

    if (offlineMs < minOfflineMs) return;

    const maxOfflineSec = 8 * 60 * 60; // 최대 8시간 캡
    const offlineSec = Math.min(offlineMs / 1000, maxOfflineSec);
    const expReward = Math.floor(offlineSec * GameState.getIdleRate());

    if (expReward <= 0) return;

    const beastId = GameState.currentBeast;
    const beastName = BEAST_DATA[beastId]?.name || '신수';
    const hours = Math.floor(offlineSec / 3600);
    const minutes = Math.floor((offlineSec % 3600) / 60);
    const timeStr = hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;

    GameState.addExp(beastId, expReward);
    GameState.lastIdleCollect = now;
    GameState.save();

    this.showOfflineRewardPopup(timeStr, expReward, beastName);
  },

  // 오프라인 보상 팝업
  showOfflineRewardPopup(timeStr, expReward, beastName) {
    const popup = document.createElement('div');
    popup.style.cssText = [
      'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
      'background:rgba(15,15,30,0.97)', 'border:1px solid rgba(255,255,255,0.15)',
      'border-radius:16px', 'padding:28px 32px', 'z-index:9999',
      'text-align:center', 'color:#fff', 'min-width:260px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.7)'
    ].join(';');
    popup.innerHTML = `
      <div style="font-size:2rem;margin-bottom:8px">&#x1F319;</div>
      <div style="font-size:1rem;color:#aaa;margin-bottom:6px">부재중 수익</div>
      <div style="font-size:0.85rem;color:#888;margin-bottom:14px">${timeStr} 동안 자리를 비웠어요</div>
      <div style="font-size:1.5rem;font-weight:bold;color:#ffe082;margin-bottom:10px">+${expReward.toLocaleString()} EXP</div>
      <div style="font-size:0.85rem;color:#aaa;margin-bottom:20px">${beastName}에게 지급되었습니다</div>
      <button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px 28px;border-radius:8px;cursor:pointer;font-size:0.95rem;">확인</button>
    `;
    document.body.appendChild(popup);
  },

  // 각성 시도
  tryAwaken(beastId) {
    if (!GameState.canAwaken(beastId)) return;
    this.playSfx('flash');

    const beast = GameState.beasts[beastId];
    beast.awakened = true;
    beast.hasAwakeningItem = false;

    UI.showToast(`${BEAST_DATA[beastId].name} 각성!`);

    // 순간이동: 5성 + 각성 완료 = 순간이동 트리거
    // 4신수만 (황룡은 순간이동 없음)
    if (beastId !== 'hwangryong') {
      setTimeout(() => {
        beast.abandoned = true;
        UI.showToast('...갑자기 시야가 흐려진다.');
        setTimeout(() => {
          UI.showToast('눈을 떠보니 다른 곳이다. 작별 인사도 못 했다...');
          // 다음 해금 안 된 신수로 전환, 없으면 그대로
          const nextBeast = Object.keys(BEAST_DATA).find(id =>
            id !== beastId && id !== 'hwangryong' &&
            GameState.beasts[id] && GameState.beasts[id].unlocked && !GameState.beasts[id].abandoned
          );
          if (nextBeast) {
            GameState.currentBeast = nextBeast;
          }
          GameState.save();
          UI.renderMainScreen();
        }, 2000);
      }, 1500);
    }

    this.checkHwangryongUnlock();
    GameState.save();
    UI.renderMainScreen();
  }
};

// 게임 시작
window.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
