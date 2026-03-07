/* ===== UI 관리 ===== */

const UI = {
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

  initInteractions() {
    this.bindOverlayInteractions();
  },

  bindOverlayInteractions() {
    if (this._overlayInteractionsBound) return;
    this._overlayInteractionsBound = true;

    document.querySelectorAll('.overlay').forEach((overlay) => {
      overlay.addEventListener('click', (event) => {
        if (event.target !== overlay) return;
        if (!overlay.id || !overlay.id.startsWith('overlay-')) return;
        const type = overlay.id.replace('overlay-', '');
        this.closeOverlay(type);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const openOverlays = Array.from(document.querySelectorAll('.overlay:not(.hidden)'));
      if (!openOverlays.length) return;
      const topOverlay = openOverlays[openOverlays.length - 1];
      if (!topOverlay.id || !topOverlay.id.startsWith('overlay-')) return;
      const type = topOverlay.id.replace('overlay-', '');
      this.closeOverlay(type);
    });
  },

  stopMainEmotionVideo(fadeMs = 120) {
    const video = document.getElementById('main-char-emotion');
    const charCg = document.getElementById('main-char-cg');
    const charFallback = document.getElementById('main-char-fallback');
    if (!video) return;

    const finalize = () => {
      try { video.pause(); } catch (_) {}
      video.onended = null;
      video._playing = false;
      video.currentTime = 0;
      video.removeAttribute('src');
      video.classList.remove('fading-out');
      video.classList.add('hidden');
      video.style.opacity = '';
      if (charCg) charCg.classList.remove('emotion-hidden');
      if (charFallback) charFallback.classList.remove('emotion-hidden');
    };

    if (video.classList.contains('hidden') || fadeMs <= 0) {
      finalize();
      return;
    }

    if (charCg) charCg.classList.remove('emotion-hidden');
    if (charFallback) charFallback.classList.remove('emotion-hidden');
    video.classList.add('fading-out');
    setTimeout(finalize, fadeMs);
  },

  createMainCharGhost() {
    const sprite = document.getElementById('char-sprite');
    if (!sprite) return null;

    const ghost = sprite.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.classList.add('char-swap-ghost');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    ghost.querySelectorAll('video').forEach((video) => {
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
    });
    return ghost;
  },

  transitionMainCharacterSwap(applyFn) {
    const sprite = document.getElementById('char-sprite');
    const host = document.getElementById('main-character');
    if (!sprite || !host) {
      applyFn();
      return;
    }

    const ghost = this.createMainCharGhost();
    if (ghost) {
      host.appendChild(ghost);
      requestAnimationFrame(() => ghost.classList.add('fade-out'));
      setTimeout(() => ghost.remove(), 320);
    }

    sprite.classList.add('char-swap-enter');
    applyFn();
    requestAnimationFrame(() => sprite.classList.remove('char-swap-enter'));
  },

  // 탭 전환
  switchTab(tabName) {
    this.playSfx('page', 120);
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');

    if (tabName === 'main') this.renderMainScreen();
    if (tabName === 'beasts') this.renderBeastCards();
    if (tabName === 'tower') Tower.renderCharSelect();
    if (tabName === 'story') { this.renderStoryTab(); Story.updateStoryBadge(); }
  },

  // 메인 화면 렌더
  renderMainScreen() {
    const beastId = GameState.currentBeast;
    const data = BEAST_DATA[beastId];
    const beast = GameState.beasts[beastId];
    if (!data || !beast) return;
    const beastChanged = !!this._lastMainBeastId && this._lastMainBeastId !== beastId;
    if (beastChanged) this.stopMainEmotionVideo(120);

    const tinyGodImg = document.getElementById('tiny-god-img');
    if (tinyGodImg) {
      const godPath = getTinyGodSpritePath();
      if (godPath && tinyGodImg.dataset.src !== godPath) {
        tinyGodImg.dataset.src = godPath;
        tinyGodImg.onerror = () => { tinyGodImg.style.display = 'none'; };
        tinyGodImg.onload = () => { tinyGodImg.style.display = 'block'; };
        tinyGodImg.src = godPath;
      }
    }

    const scene = document.getElementById('main-scene');
    const selectedBg = GameState.mainBackground || getMainBackgroundDefaultPath();
    if (scene && scene.dataset.bgPath !== selectedBg) {
      scene.dataset.bgPath = selectedBg;
      this.updateMainSceneBackground(selectedBg);
    }
    const applyCharacterVisuals = () => {
      const charCg = document.getElementById('main-char-cg');
      const charFallback = document.getElementById('main-char-fallback');
      const emotionVideo = document.getElementById('main-char-emotion');
      const emotionPlaying = !!(emotionVideo && emotionVideo._playing && !emotionVideo.classList.contains('hidden'));
      const portraitPath = getBeastPortraitPath(beastId);
      if (charCg) {
        if (emotionPlaying) charCg.classList.add('emotion-hidden');
        else charCg.classList.remove('emotion-hidden');
      }
      if (charFallback) {
        if (emotionPlaying) charFallback.classList.add('emotion-hidden');
        else charFallback.classList.remove('emotion-hidden');
      }
      charFallback.style.background = data.gradient;
      if (portraitPath) {
        charFallback.textContent = '';
        charFallback.style.backgroundImage = `url("${portraitPath}")`;
        charFallback.style.backgroundSize = 'cover';
        charFallback.style.backgroundPosition = 'center';
        charFallback.style.backgroundRepeat = 'no-repeat';
      } else {
        charFallback.textContent = data.symbol;
        charFallback.style.backgroundImage = '';
      }

      const cgPath = getCGStandingPath(beastId);
      if (cgPath) {
        if (charCg.dataset.cgPath !== cgPath) {
          charCg.dataset.cgPath = cgPath;
          charCg.onload = () => {
            charCg.classList.remove('hidden');
            charFallback.classList.add('hidden');
          };
          charCg.onerror = () => {
            charCg.classList.add('hidden');
            charFallback.classList.remove('hidden');
          };
          charCg.src = cgPath;
        } else {
          charCg.classList.remove('hidden');
          charFallback.classList.add('hidden');
        }
      } else {
        charCg.classList.add('hidden');
        charCg.dataset.cgPath = '';
        charFallback.classList.remove('hidden');
      }
    };

    if (beastChanged) {
      this.transitionMainCharacterSwap(applyCharacterVisuals);
    } else {
      applyCharacterVisuals();
    }

    // 성급
    const grade = STAR_GRADES.find(g => g.star === beast.starGrade);
    document.getElementById('main-char-stars').textContent = grade ? grade.label : '★';

    // 각성 이펙트
    const charSprite = document.getElementById('char-sprite');
    charSprite.classList.toggle('awakened', beast.awakened);

    // 상단 바 업데이트
    document.getElementById('current-beast-name').textContent = data.name;
    document.getElementById('player-level').textContent = `Lv.${beast.level}`;
    this.updateGoldDisplay();

    // Show exp multiplier if active
    if (GameState.expMultiplierEnd && Date.now() < GameState.expMultiplierEnd) {
      document.getElementById('player-level').textContent = `Lv.${beast.level} x${GameState.expMultiplier}`;
    }

    // 캐릭터 선택 바
    this.renderBeastSelector();
    this._lastMainBeastId = beastId;
  },

  // 메인 배경 반영
  updateMainSceneBackground(selectedPath) {
    const bgLayer = document.getElementById('main-scene-bg');
    if (!bgLayer) return;

    const candidates = [];
    if (selectedPath) candidates.push(selectedPath);
    const defaultPath = getMainBackgroundDefaultPath();
    if (defaultPath && defaultPath !== selectedPath) candidates.push(defaultPath);

    const applyPath = (path) => {
      if (path) {
        bgLayer.style.backgroundImage = `url("${path}")`;
        bgLayer.classList.add('has-image');
      } else {
        bgLayer.style.backgroundImage = '';
        bgLayer.classList.remove('has-image');
      }
    };

    const requestToken = `${candidates.join('|')}-${Date.now()}`;
    bgLayer.dataset.bgRequestToken = requestToken;

    const tryLoad = (index) => {
      if (index >= candidates.length) {
        if (bgLayer.dataset.bgRequestToken === requestToken) applyPath(null);
        return;
      }

      const path = candidates[index];
      const probe = new Image();
      probe.onload = () => {
        if (bgLayer.dataset.bgRequestToken === requestToken) applyPath(path);
      };
      probe.onerror = () => tryLoad(index + 1);
      probe.src = path;
    };

    tryLoad(0);
  },
  renderBeastSelector() {
    const list = document.getElementById('beast-select-list');
    list.innerHTML = '';

    Object.keys(BEAST_DATA).forEach(id => {
      const data = BEAST_DATA[id];
      const beast = GameState.beasts[id];
      const locked = !beast || !beast.unlocked;

      const item = document.createElement('div');
      item.className = `beast-select-item${GameState.currentBeast === id ? ' active' : ''}${locked ? ' locked' : ''}`;
      item.style.background = locked ? 'rgba(255,255,255,0.05)' : data.gradient;

      if (locked) {
        const sym = document.createElement('span');
        sym.className = 'beast-select-item-symbol';
        sym.textContent = '?';
        item.appendChild(sym);
      } else {
        const portraitPath = getBeastPortraitPath(id);
        if (portraitPath) {
          const img = document.createElement('img');
          img.className = 'beast-select-item-img';
          img.alt = data.name;
          img.loading = 'lazy';
          img.src = portraitPath;
          img.onerror = () => {
            img.remove();
            const sym = document.createElement('span');
            sym.className = 'beast-select-item-symbol';
            sym.textContent = data.symbol;
            item.appendChild(sym);
          };
          item.appendChild(img);
        } else {
          const sym = document.createElement('span');
          sym.className = 'beast-select-item-symbol';
          sym.textContent = data.symbol;
          item.appendChild(sym);
        }
      }

      if (!locked) {
        item.onclick = () => {
          if (GameState.currentBeast === id) return;
          this.stopMainEmotionVideo(120);
          GameState.currentBeast = id;
          GameState.save();
          this.renderMainScreen();
        };
      }

      list.appendChild(item);
    });
  },

  // 골드 표시 업데이트
  updateGoldDisplay() {
    const goldDisplay = document.getElementById('gold-display');
    if (!goldDisplay) return;
    goldDisplay.innerHTML = `<span class="ui-icon icon-coins-bag" aria-hidden="true"></span><span class="gold-value">${GameState.gold.toLocaleString()}</span>`;
  },

  // 스토리 탭 렌더 → 챕터 선택 화면
  renderStoryTab() {
    Story.renderChapterSelect();
  },

  // 신수 카드 목록 렌더
  renderBeastCards() {
    const container = document.getElementById('beast-card-list');
    const detail = document.getElementById('beast-detail');
    const cards = document.getElementById('beast-cards-container');

    detail.classList.add('hidden');
    cards.classList.remove('hidden');
    container.innerHTML = '';

    Object.keys(BEAST_DATA).forEach(id => {
      const data = BEAST_DATA[id];
      const beast = GameState.beasts[id];
      const locked = !beast || !beast.unlocked;

      const card = document.createElement('div');
      card.className = `beast-card${locked ? ' locked' : ''}`;
      const portraitPath = getBeastPortraitPath(id);
      const iconHtml = locked
        ? '<span class="beast-card-icon-symbol">?</span>'
        : portraitPath
          ? `<img class="beast-card-icon-img" src="${portraitPath}" alt="${data.name}" loading="lazy">`
          : `<span class="beast-card-icon-symbol">${data.symbol}</span>`;
      card.innerHTML = `
        <div class="beast-card-icon" style="background:${locked ? 'rgba(255,255,255,0.1)' : data.gradient}">
          ${iconHtml}
        </div>
        <div class="beast-card-info">
          <div class="beast-card-name">${locked ? '???' : data.name}</div>
          <div class="beast-card-meta">
            ${locked ? '<span>미해금</span>' : `
              <span class="beast-card-stars">${STAR_GRADES.find(g => g.star === beast.starGrade)?.label || '★'}</span>
              <span>Lv.${beast.level}</span>
              <span class="beast-card-affection"><span class="ui-icon icon-heart" aria-hidden="true"></span>${beast.affectionLevel}</span>
            `}
          </div>
        </div>
      `;

      if (!locked) {
        card.onclick = () => this.openBeastDetail(id);
      }

      container.appendChild(card);
    });
  },

  // 신수 상세 열기
  openBeastDetail(beastId) {
    this.playSfx('page', 120);
    const data = BEAST_DATA[beastId];
    const beast = GameState.beasts[beastId];
    if (!data || !beast) return;
    document.getElementById('beast-cards-container').classList.add('hidden');
    document.getElementById('beast-detail').classList.remove('hidden');

    // 일러스트 (CG 또는 폴백)
    const illust = document.getElementById('detail-illustration');
    const detailPortraitPath = getBeastPortraitPath(beastId);
    const fallbackHTML = detailPortraitPath
      ? `<img class="detail-char-cg" src="${detailPortraitPath}" alt="${data.name}">`
      : `<div class="char-img" style="background:${data.gradient};width:120px;height:120px;font-size:50px;
      border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;
      color:white;margin:0 auto;box-shadow:0 0 30px ${data.color}44;">${data.symbol}</div>`;
    const detailCgPath = getCGStandingPath(beastId);
    if (detailCgPath) {
      const testImg = new Image();
      testImg.onload = () => {
        illust.innerHTML = `<img class="detail-char-cg" src="${detailCgPath}" alt="${data.name}">`;
      };
      testImg.onerror = () => { illust.innerHTML = fallbackHTML; };
      testImg.src = detailCgPath;
      illust.innerHTML = fallbackHTML;
    } else {
      illust.innerHTML = fallbackHTML;
    }

    document.getElementById('detail-name').textContent = data.name;
    document.getElementById('detail-stars').textContent =
      STAR_GRADES.find(g => g.star === beast.starGrade)?.label || '⭐';
    document.getElementById('detail-level').textContent =
      `Lv.${beast.level} | EXP: ${beast.exp}/${getExpForLevel(beast.level)}`;
    document.getElementById('detail-description').textContent = data.description;

    // TMI
    const tmiList = document.getElementById('detail-tmi-list');
    tmiList.innerHTML = '';
    data.tmi.forEach(tmi => {
      const unlocked = beast.starGrade >= tmi.star;
      const div = document.createElement('div');
      div.className = `tmi-item${unlocked ? '' : ' locked'}`;
      div.textContent = unlocked ? tmi.text : `[${tmi.star}성 달성 시 해금]`;
      tmiList.appendChild(div);
    });

    // 호감도
    const affLevel = AFFECTION_LEVELS.find(a => a.level === beast.affectionLevel);
    const nextLevel = AFFECTION_LEVELS.find(a => a.level === beast.affectionLevel + 1);
    const currentReq = affLevel ? affLevel.required : 0;
    const nextReq = nextLevel ? nextLevel.required : currentReq + 1000;
    const progress = ((beast.affection - currentReq) / (nextReq - currentReq)) * 100;

    document.getElementById('affection-bar').style.width = `${Math.min(100, progress)}%`;
    document.getElementById('affection-level-text').textContent =
      `${beast.affectionLevel}단계 (${beast.affection}/${nextReq})`;

    // 호감도 아이템 갯수 표시
    const hasItems = Object.values(GameState.inventory.affectionItems).some(v => v > 0);
    const giftBtn = document.getElementById('gift-btn');
    if (giftBtn) {
      const label = hasItems ? '선물하기' : '아이템 없음 (상점에서 구매)';
      giftBtn.innerHTML = `<span class="btn-icon ui-icon icon-gift" aria-hidden="true"></span><span class="gift-label">${label}</span>`;
    }

    // 개인 스토리
    const storyDiv = document.getElementById('detail-stories');
    if (beast.affectionLevel >= 10) {
      storyDiv.classList.remove('hidden');
      // 프레임워크만
      storyDiv.innerHTML = '<h4>개인 스토리</h4><p style="color:var(--text-secondary);font-size:13px;">준비 중입니다...</p>';
    } else {
      storyDiv.classList.add('hidden');
    }
  },

  closeBeastDetail() {
    this.playSfx('page', 120);
    this.renderBeastCards();
  },

  // 오버레이 열기/닫기
  openShop() {
    this.playSfx('page', 120);
    document.getElementById('overlay-shop').classList.remove('hidden');
    Shop.render();
  },

  openBackgrounds() {
    this.playSfx('page', 120);
    document.getElementById('overlay-background').classList.remove('hidden');
    this.renderBackgroundOptions();
  },

  async discoverBackgroundPathsFromDirectory() {
    // Native/file WebView environments block directory fetches due to CORS.
    // In those environments, rely on the static background list only.
    const protocol = window.location && window.location.protocol ? window.location.protocol : '';
    if (protocol !== 'http:' && protocol !== 'https:') return [];

    try {
      const response = await fetch('assets/cg/bg/', { cache: 'no-store' });
      if (!response.ok) return [];

      const html = await response.text();
      const regex = /href=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
      const paths = [];
      let match;

      while ((match = regex.exec(html)) !== null) {
        const raw = match[1];
        if (!raw || raw.startsWith('http') || raw.startsWith('../')) continue;
        const fileName = decodeURIComponent(raw.split('?')[0]);
        const normalized = fileName.startsWith('/') ? fileName.slice(1) : fileName;
        if (normalized.startsWith('assets/cg/bg/')) {
          paths.push(normalized);
        } else {
          paths.push(`assets/cg/bg/${normalized}`);
        }
      }

      return [...new Set(paths)];
    } catch (_) {
      return [];
    }
  },

  async loadBackgroundOptions(force = false) {
    if (!force && this._bgOptionsCache) return this._bgOptionsCache;

    const baseOptions = getMainBackgroundOptions();
    const discoveredPaths = await this.discoverBackgroundPathsFromDirectory();
    const knownPaths = new Set(baseOptions.map(bg => bg.path));
    const merged = [...baseOptions];
    let autoIndex = 1;

    discoveredPaths.forEach(path => {
      if (knownPaths.has(path)) return;
      knownPaths.add(path);
      merged.push({
        id: `bg_auto_${autoIndex}`,
        name: `추가 배경 ${autoIndex}`,
        path
      });
      autoIndex += 1;
    });

    this._bgOptionsCache = merged;
    return merged;
  },

  async refreshBackgroundOptions() {
    this._bgOptionsCache = null;
    await this.renderBackgroundOptions();
    this.showToast('배경 목록을 새로고침했습니다.');
  },

  async renderBackgroundOptions() {
    const grid = document.getElementById('bg-picker-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="bg-picker-loading">배경 목록 불러오는 중...</div>';
    const options = await this.loadBackgroundOptions();
    const selected = GameState.mainBackground || getMainBackgroundDefaultPath();
    grid.innerHTML = '';

    if (!options.length) {
      grid.innerHTML = '<div class="bg-picker-loading">사용 가능한 배경이 없습니다.</div>';
      return;
    }

    options.forEach((bg, index) => {
      const item = document.createElement('button');
      item.className = `bg-picker-item${selected === bg.path ? ' active' : ''}`;
      item.type = 'button';
      item.onclick = () => this.selectMainBackground(bg.path);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'bg-picker-thumb-wrap';
      const thumb = document.createElement('img');
      thumb.className = 'bg-picker-thumb';
      thumb.src = bg.path;
      thumb.alt = bg.name;
      thumb.loading = 'lazy';
      thumb.onerror = () => {
        thumbWrap.classList.add('is-missing');
      };
      thumbWrap.appendChild(thumb);

      const name = document.createElement('div');
      name.className = 'bg-picker-name';
      name.textContent = bg.name || `배경 ${index + 1}`;

      const path = document.createElement('div');
      path.className = 'bg-picker-path';
      path.textContent = bg.path.replace('assets/cg/bg/', '');

      item.appendChild(thumbWrap);
      item.appendChild(name);
      item.appendChild(path);
      grid.appendChild(item);
    });
  },

  selectMainBackground(path) {
    GameState.mainBackground = path || getMainBackgroundDefaultPath();
    GameState.save();
    this.playSfx('reward', 120);

    const scene = document.getElementById('main-scene');
    if (scene) scene.dataset.bgPath = GameState.mainBackground;
    this.updateMainSceneBackground(GameState.mainBackground);
    this.renderBackgroundOptions();
    this.showToast('배경이 변경되었습니다.');
  },

  openTraining() {
    this.playSfx('page', 120);
    document.getElementById('overlay-training').classList.remove('hidden');
    this.updateTrainingDisplay();
    // Hide tools panel on open
    const panel = document.getElementById('training-tools-panel');
    if (panel) panel.classList.add('hidden');
  },

  closeOverlay(type) {
    const overlay = document.getElementById(`overlay-${type}`);
    if (!overlay || overlay.classList.contains('hidden')) return;
    this.playSfx('page', 120);
    overlay.classList.add('hidden');
    if (type === 'training') {
      const panel = document.getElementById('training-tools-panel');
      if (panel) panel.classList.add('hidden');
    }
  },

  // 훈련 화면 업데이트
  updateTrainingDisplay() {
    const beastId = GameState.currentBeast;
    const beast = GameState.beasts[beastId];
    const data = BEAST_DATA[beastId];
    if (!beast || !data) return;

    // Beast name
    const nameEl = document.getElementById('training-beast-name');
    if (nameEl) nameEl.textContent = `${data.name} 훈련`;

    // Character sprite (CG 또는 폴백)
    const sprite = document.getElementById('training-char-sprite');
    if (sprite) {
      const trainCgPath = getCGStandingPath(beastId);
      if (trainCgPath && sprite.dataset.cgSrc !== trainCgPath) {
        const testImg = new Image();
        testImg.onload = () => {
          sprite.innerHTML = '';
          sprite.style.background = 'transparent';
          sprite.style.borderRadius = '0';
          sprite.style.boxShadow = 'none';
          const imgEl = document.createElement('img');
          imgEl.src = trainCgPath;
          imgEl.className = 'training-char-cg';
          sprite.appendChild(imgEl);
          sprite.dataset.cgSrc = trainCgPath;
        };
        testImg.onerror = () => {
          sprite.innerHTML = '';
          const portraitPath = getBeastPortraitPath(beastId);
          if (portraitPath) {
            sprite.style.background = 'transparent';
            sprite.style.borderRadius = '0';
            const imgEl = document.createElement('img');
            imgEl.src = portraitPath;
            imgEl.className = 'training-char-cg';
            sprite.appendChild(imgEl);
          } else {
            sprite.style.background = data.gradient;
            sprite.style.borderRadius = '50%';
            sprite.textContent = data.symbol;
          }
          sprite.dataset.cgSrc = '';
        };
        testImg.src = trainCgPath;
      } else if (!trainCgPath) {
        sprite.innerHTML = '';
        const portraitPath = getBeastPortraitPath(beastId);
        if (portraitPath) {
          sprite.style.background = 'transparent';
          sprite.style.borderRadius = '0';
          const imgEl = document.createElement('img');
          imgEl.src = portraitPath;
          imgEl.className = 'training-char-cg';
          sprite.appendChild(imgEl);
        } else {
          sprite.style.background = data.gradient;
          sprite.style.borderRadius = '50%';
          sprite.textContent = data.symbol;
        }
      }
    }

    // Exp bar
    const needed = getExpForLevel(beast.level);
    const percent = Math.min(100, (beast.exp / needed) * 100);
    const fill = document.getElementById('training-exp-bar-fill');
    if (fill) fill.style.width = `${percent}%`;
    const expText = document.getElementById('training-exp-text');
    if (expText) expText.textContent = `Lv.${beast.level} | ${beast.exp}/${needed} EXP`;

    // Idle info
    const rate = GameState.getIdleRate();
    const rateEl = document.getElementById('training-idle-rate');
    if (rateEl) rateEl.textContent = `방치: ${rate} EXP/초`;
    const accumulated = GameState.calculateIdleReward();
    const accEl = document.getElementById('training-idle-accumulated');
    if (accEl) accEl.textContent = `누적: ${accumulated.toLocaleString()} EXP`;
  },

  // Toggle training tools panel
  toggleTrainingTools() {
    this.playSfx('page', 120);
    const panel = document.getElementById('training-tools-panel');
    if (panel) {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        this.renderTrainingToolsPanel();
      }
    }
  },

  renderTrainingToolsPanel() {
    const list = document.getElementById('training-tools-list');
    if (!list) return;
    list.innerHTML = '';

    TRAINING_TOOLS.forEach(tool => {
      const owned = GameState.inventory.trainingTools[tool.id];
      const canBuy = tool.costType === 'gold' && GameState.gold >= tool.cost && !owned;

      const div = document.createElement('div');
      div.className = 'training-tool-item';
      const costLabel = tool.costType === 'gold'
        ? `<span class="price-with-icon"><span class="ui-icon icon-coins-bag" aria-hidden="true"></span>${tool.cost}</span>`
        : '유료';
      div.innerHTML = `
        <span class="training-tool-icon ui-icon ${tool.iconClass || 'icon-tools'}" aria-hidden="true"></span>
        <div class="training-tool-info">
          <div class="training-tool-name">${tool.name}</div>
          <div class="training-tool-desc">${tool.desc}</div>
          ${owned ? '<div class="training-tool-owned">✓ 보유중</div>' : ''}
        </div>
        <button class="shop-buy-btn" ${!canBuy ? 'disabled' : ''}
          onclick="Shop.buyTrainingTool('${tool.id}')">
          ${owned ? '보유' : costLabel}
        </button>
      `;
      list.appendChild(div);
    });
  },

  // 토스트 메시지
  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }
};
