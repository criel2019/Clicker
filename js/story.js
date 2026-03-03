/* ===== ?ㅽ넗由??쒖뒪??===== */

const Story = {
  currentBeast: null,
  currentChapter: 0,
  currentNode: 0,
  nodes: [],
  inCombat: false,
  typeTimer: null,
  autoMode: false,
  autoTimer: null,
  skipMode: false,
  skipTimer: null,
  log: [],
  selectBeast: null,
  displayedText: '',
  fastForwardHeld: false,
  textInteractionsBound: false,

  // ?쎌? ?몃뱶 異붿쟻: { 'beastId_chapterIdx': maxNodeReached }
  readProgress: {},
  // 以묎컙 ???遺곷쭏?? { beastId: { chapter, node, timestamp } }
  bookmarks: {},
  // ?꾨즺??梨뺥꽣 ?명듃 (以묐났 蹂댁긽 諛⑹?): { 'beastId_chapterIdx': true }
  completedChapters: {},

  // ?ㅼ젙
  settings: {
    textSpeed: 25,
    autoDelay: 1500,
    soundEnabled: true,
    volume: 0.3,
  },

  // 梨뺥꽣 ?꾨즺 蹂댁긽 ?뺤쓽
  chapterRewards: {
    gold: [30, 50, 80, 100, 150, 200, 250, 300, 400, 500],
    affection: [5, 8, 12, 15, 20, 25, 30, 40, 50, 80],
  },

  unlockedCGs: {},
  chapters: {},

  atmospheres: {
    cheongryong: 'linear-gradient(180deg, #040d1a 0%, #0a2540 30%, #0d3158 60%, #040d1a 100%)',
    baekho: 'linear-gradient(180deg, #0d0a12 0%, #1a1525 30%, #251d33 60%, #0d0a12 100%)',
    jujak: 'linear-gradient(180deg, #1a0808 0%, #2d1010 30%, #3d1818 60%, #1a0808 100%)',
    hyeonmu: 'linear-gradient(180deg, #060d06 0%, #0d1f0d 30%, #142a14 60%, #060d06 100%)',
    hwangryong: 'linear-gradient(180deg, #141008 0%, #251d0d 30%, #332a14 60%, #141008 100%)',
  },

  // ?좎닔蹂??뚮쭏 ?됱긽
  beastThemes: {
    cheongryong: { color: '#4fc3f7', glow: 'rgba(79, 195, 247, 0.15)', particle: '#4fc3f7' },
    baekho:      { color: '#ce93d8', glow: 'rgba(206, 147, 216, 0.15)', particle: '#ce93d8' },
    jujak:       { color: '#ef5350', glow: 'rgba(239, 83, 80, 0.15)',   particle: '#ef5350' },
    hyeonmu:     { color: '#66bb6a', glow: 'rgba(102, 187, 106, 0.15)', particle: '#66bb6a' },
    hwangryong:  { color: '#ffd54f', glow: 'rgba(255, 213, 79, 0.15)',  particle: '#ffd54f' },
  },

  // ??? 梨뺥꽣 ?좏깮 ?붾㈃ ???

  renderChapterSelect() {
    const selectEl = document.getElementById('chapter-select');
    const textArea = document.getElementById('story-text-area');
    const combatUI = document.getElementById('combat-ui');
    const controls = document.getElementById('story-controls');
    const resultEl = document.getElementById('chapter-result');

    selectEl.classList.remove('hidden');
    textArea.classList.add('hidden');
    combatUI.classList.add('hidden');
    controls.style.display = 'none';
    if (resultEl) resultEl.classList.add('hidden');

    this.stopAuto();
    this.stopSkip();
    this.fastForwardHeld = false;
    const textBox = document.getElementById('story-text-box');
    if (textBox) textBox.classList.remove('hold-fast', 'awaiting-next');
    StoryAudio.stopAmbient();

    // ?좎닔 ??(?щ낵 + 而щ윭)
    const beastTabs = document.getElementById('chapter-beast-tabs');
    beastTabs.innerHTML = '';
    const beastId = this.selectBeast || GameState.currentBeast;
    this.selectBeast = beastId;

    const beastData = BEAST_DATA[beastId];
    const beastColor = beastData ? beastData.color : '#4fc3f7';

    // 梨뺥꽣 ?좏깮 諛곌꼍???좎닔 ?됱긽 諛섏쁺
    const selectEl2 = document.getElementById('chapter-select');
    selectEl2.style.setProperty('--card-accent', beastColor);
    selectEl2.style.setProperty('--card-glow', beastColor + '20');

    Object.keys(BEAST_DATA).forEach(id => {
      const data = BEAST_DATA[id];
      const beast = GameState.beasts[id];
      const locked = !beast || !beast.unlocked;
      const isActive = id === beastId;
      const tab = document.createElement('button');
      tab.className = 'chapter-beast-tab' + (isActive ? ' active' : '') + (locked ? ' locked' : '');

      if (isActive && !locked) {
        tab.style.borderColor = data.color + '60';
        tab.style.background = data.color + '18';
        tab.style.setProperty('--tab-glow', data.color + '25');
      }

      if (!locked) {
        const portraitPath = getBeastPortraitPath(id);
        if (portraitPath) {
          const portrait = document.createElement('img');
          portrait.className = 'tab-portrait';
          portrait.src = portraitPath;
          portrait.alt = data.name;
          portrait.loading = 'lazy';
          portrait.onerror = () => {
            portrait.remove();
            const sym = document.createElement('span');
            sym.className = 'tab-symbol';
            sym.textContent = data.symbol;
            if (isActive) sym.style.color = data.color;
            tab.prepend(sym);
          };
          tab.appendChild(portrait);
        } else {
          const sym = document.createElement('span');
          sym.className = 'tab-symbol';
          sym.textContent = data.symbol;
          if (isActive) sym.style.color = data.color;
          tab.appendChild(sym);
        }

        const name = document.createTextNode(data.name);
        tab.appendChild(name);
        tab.onclick = () => { this.selectBeast = id; this.renderChapterSelect(); };
      } else {
        tab.textContent = '???';
      }
      beastTabs.appendChild(tab);
    });

    const chapters = this.chapters[beastId];
    const progress = GameState.storyProgress[beastId] || 0;
    const total = chapters ? chapters.length : 0;
    const pct = total > 0 ? (progress / total * 100) : 0;

    const progressFill = document.getElementById('chapter-progress-fill');
    progressFill.style.width = pct + '%';
    progressFill.style.background = beastColor;

    const progressText = document.getElementById('chapter-progress-text');
    progressText.textContent = total > 0 ? `${progress}/${total} ?꾨즺` : '';

    // 梨뺥꽣 紐⑸줉
    const listEl = document.getElementById('chapter-list');
    listEl.innerHTML = '';

    if (!chapters || chapters.length === 0) {
      listEl.innerHTML = '<p style="color:rgba(255,255,255,0.2);text-align:center;padding:50px 0;font-size:13px;">以鍮꾨맂 ?ㅽ넗由ш? ?놁뒿?덈떎.</p>';
      return;
    }

    // 遺곷쭏???뺤씤
    const bookmark = this.bookmarks[beastId];

    chapters.forEach((ch, i) => {
      const isCompleted = i < progress;
      const isCurrent = i === progress;
      const isLocked = i > progress;
      const hasBookmark = bookmark && bookmark.chapter === i;

      const card = document.createElement('div');
      card.className = 'chapter-card' + (isCompleted ? ' completed' : '') + (isCurrent ? ' current' : '') + (isLocked ? ' locked' : '');
      card.style.animationDelay = (i * 40) + 'ms';
      card.style.setProperty('--card-accent', beastColor);
      card.style.setProperty('--card-glow', beastColor + '20');

      const numEl = document.createElement('div');
      numEl.className = 'chapter-num';
      numEl.textContent = isCompleted ? '✓' : (i + 1);

      const infoEl = document.createElement('div');
      infoEl.className = 'chapter-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'chapter-title-text';
      titleEl.textContent = isLocked ? `${i + 1}???????` : ch.title;

      const statusEl = document.createElement('div');
      statusEl.className = 'chapter-status';
      const dot = document.createElement('span');
      dot.className = 'status-dot';
      statusEl.appendChild(dot);

      if (hasBookmark) {
        statusEl.appendChild(document.createTextNode('이어하기'));
      } else {
        statusEl.appendChild(document.createTextNode(
          isCompleted ? '완료' : isCurrent ? '진행 가능' : '잠금'
        ));
      }

      infoEl.appendChild(titleEl);
      infoEl.appendChild(statusEl);

      const arrow = document.createElement('div');
      arrow.className = 'chapter-arrow';
      if (isLocked) {
        arrow.textContent = '';
      } else if (hasBookmark) {
        arrow.textContent = '↺';
        arrow.classList.add('bookmark-resume');
      } else {
        arrow.textContent = '▶';
      }

      card.appendChild(numEl);
      card.appendChild(infoEl);
      card.appendChild(arrow);

      if (!isLocked) {
        card.onclick = () => {
          if (hasBookmark) {
            this.resumeBookmark(beastId);
          } else {
            this.startChapter(beastId, i);
          }
        };
      }

      listEl.appendChild(card);
    });
  },

  startChapter(beastId, chapterIdx) {
    const beastChapters = this.chapters[beastId];
    if (!beastChapters || chapterIdx >= beastChapters.length) return;

    // 梨뺥꽣 ?좏깮 ?④린怨??ㅽ넗由??쒖떆
    document.getElementById('chapter-select').classList.add('hidden');
    document.getElementById('story-text-area').classList.remove('hidden');
    document.getElementById('story-controls').style.display = '';

    this.currentBeast = beastId;
    this.currentChapter = chapterIdx;
    this.currentNode = 0;
    this.nodes = beastChapters[chapterIdx].nodes;
    this.inCombat = false;
    this.log = [];
    this.stopAuto();
    this.stopSkip();
    if (this.typeTimer) { clearTimeout(this.typeTimer); this.typeTimer = null; }
    this.fastForwardHeld = false;

    document.getElementById('combat-ui').classList.add('hidden');
    document.getElementById('story-next-btn').classList.remove('hidden');
    document.getElementById('story-next-btn').textContent = '다음 ▶';
    document.getElementById('story-next-btn').onclick = () => Story.next();
    document.getElementById('story-next-btn').disabled = false;
    document.getElementById('story-log-panel').classList.add('hidden');
    document.getElementById('story-settings-panel').classList.add('hidden');
    const textBox = document.getElementById('story-text-box');
    textBox.classList.remove('awaiting-next', 'hold-fast', 'mood-impact', 'mood-soft', 'mood-whisper');
    this.bindTextBoxInteractions();

    // 遺꾩쐞湲?諛곌꼍 + ?뚮쭏 ?됱긽
    const screen = document.getElementById('story-screen');
    screen.style.background = this.atmospheres[beastId] || this.atmospheres.cheongryong;

    const theme = this.beastThemes[beastId] || this.beastThemes.cheongryong;
    screen.style.setProperty('--beast-color', theme.color);
    screen.style.setProperty('--beast-glow', theme.glow);
    screen.style.setProperty('--beast-particle', theme.particle);

    this.setupCharacter(beastId);
    this.clearCutscene();
    this.clearWeather();
    const sceneBg = document.getElementById('story-scene-bg');
    if (sceneBg) {
      sceneBg.className = '';
      sceneBg.style.backgroundImage = '';
      sceneBg.classList.remove('has-image');
    }
    this.createParticles(theme.particle);
    this.preloadCutscenes();
    this.updateProgress();

    // ?ъ슫???쒖옉
    StoryAudio.startAmbient(beastId);

    // 梨뺥꽣 ??댄? 移대뱶
    const chapterData = beastChapters[chapterIdx];
    this.showChapterTitle(chapterData.title);
  },

  backToSelect() {
    if (this.currentBeast && this.currentNode > 0 && this.currentNode < this.nodes.length) {
      this.saveBookmark();
      this.saveReadProgress();
    }
    this.stopAuto();
    this.stopSkip();
    StoryAudio.stopAmbient();
    document.getElementById('story-particles').innerHTML = '';
    this.clearWeather();
    this.clearCutscene();
    this.renderChapterSelect();
  },

  // ??? ?쒖옉/珥덇린??(?덇굅???명솚) ???

  start(beastId) {
    this.currentBeast = beastId;
    const progress = GameState.storyProgress[beastId] || 0;
    const beastChapters = this.chapters[beastId];

    if (!beastChapters || progress >= beastChapters.length) {
      UI.showToast('?꾩옱 以鍮꾨맂 ?ㅽ넗由ш? ?놁뒿?덈떎.');
      return;
    }

    this.startChapter(beastId, progress);
  },

  bindTextBoxInteractions() {
    if (this.textInteractionsBound) return;
    const textBox = document.getElementById('story-text-box');
    if (!textBox) return;

    this.textInteractionsBound = true;
    const releaseHold = () => {
      this.fastForwardHeld = false;
      textBox.classList.remove('hold-fast');
    };

    textBox.addEventListener('pointerdown', () => {
      if (this.inCombat || this.skipMode) return;
      this.fastForwardHeld = true;
      textBox.classList.add('hold-fast');
    });
    textBox.addEventListener('pointerup', releaseHold);
    textBox.addEventListener('pointercancel', releaseHold);
    textBox.addEventListener('pointerleave', releaseHold);
  },

  // ??? 罹먮┃???ㅻ（?????

  setupCharacter(beastId) {
    const beastData = BEAST_DATA[beastId];
    const symbolEl = document.getElementById('story-char-symbol');
    const portraitEl = document.getElementById('story-char-portrait');
    const charEl = document.getElementById('story-character');
    const exprEl = document.getElementById('story-char-expression');
    if (beastData) {
      const portraitPath = getBeastPortraitPath(beastId);
      symbolEl.textContent = beastData.symbol;
      if (portraitEl && portraitPath) {
        portraitEl.alt = beastData.name;
        portraitEl.style.display = 'block';
        portraitEl.onerror = () => {
          portraitEl.style.display = 'none';
          symbolEl.textContent = beastData.symbol;
        };
        portraitEl.onload = () => {
          portraitEl.style.display = 'block';
          symbolEl.textContent = '';
        };
        portraitEl.src = portraitPath;
      } else if (portraitEl) {
        portraitEl.removeAttribute('src');
        portraitEl.style.display = 'none';
      }
    } else if (portraitEl) {
      portraitEl.removeAttribute('src');
      portraitEl.style.display = 'none';
    }
    charEl.classList.remove('speaking', 'cutscene-hidden');
    if (exprEl) {
      exprEl.textContent = '';
      exprEl.className = '';
    }
  },

  updateCharacter(speaker) {
    const charEl = document.getElementById('story-character');
    const beastData = BEAST_DATA[this.currentBeast];
    charEl.classList.remove('cutscene-hidden');
    if (beastData && speaker === beastData.name) {
      charEl.classList.add('speaking');
    } else {
      charEl.classList.remove('speaking');
    }
  },

  // ??? ?뚰떚?????

  createParticles(color) {
    const container = document.getElementById('story-particles');
    container.innerHTML = '';
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'story-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.bottom = -(Math.random() * 20) + '%';
      const size = (1.5 + Math.random() * 3) + 'px';
      p.style.width = size;
      p.style.height = size;
      p.style.animationDuration = (8 + Math.random() * 12) + 's';
      p.style.animationDelay = (Math.random() * 10) + 's';
      p.style.background = color;
      p.style.boxShadow = `0 0 ${4 + Math.random() * 6}px ${color}`;
      container.appendChild(p);
    }
  },

  // ??? 梨뺥꽣 ??댄? ???

  showChapterTitle(title) {
    const el = document.getElementById('story-chapter-title');
    const parts = title.match(/^(\d+)\s*[.:\-]?\s*(.+)$/);
    if (parts) {
      el.querySelector('.chapter-number').textContent = parts[1];
      el.querySelector('.chapter-name').textContent = parts[2];
    } else {
      el.querySelector('.chapter-number').textContent = '';
      el.querySelector('.chapter-name').textContent = title;
    }
    el.classList.add('visible');
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => {
        // 遺곷쭏?ъ뿉???댁뼱?섍린??寃쎌슦 ??λ맂 ?몃뱶濡??먰봽
        if (this._pendingBookmarkNode) {
          this.currentNode = this._pendingBookmarkNode;
          this._pendingBookmarkNode = null;
        }
        this.renderNode();
      }, 800);
    }, 2500);
  },

  preloadCutscenes() {
    const images = new Set();
    for (const node of this.nodes) {
      if (node.type === 'cutscene' && node.image) images.add(node.image);
    }
    images.forEach(src => { const img = new Image(); img.src = src; });
  },

  // ??? 吏꾪뻾瑜????

  updateProgress() {
    const pct = this.nodes.length > 0 ? (this.currentNode / this.nodes.length * 100) : 0;
    const fill = document.getElementById('story-progress-fill');
    if (fill) fill.style.width = pct + '%';
  },

  // ??? ?몃뱶 ?뚮뜑留????

  renderNode() {
    if (this.currentNode >= this.nodes.length) {
      this.endChapter();
      return;
    }

    // ?쎄린 吏꾪뻾??異붿쟻
    this.trackRead();

    if (this.currentNode > 0 && this.currentNode % 10 === 0) {
      this.saveBookmark();
    }

    this.updateProgress();

    const node = this.nodes[this.currentNode];
    const speakerEl = document.getElementById('story-speaker');
    const textEl = document.getElementById('story-text');
    const textBox = document.getElementById('story-text-box');

    // ?곗텧 ?④낵
    if (node.type === 'effect') {
      this.playEffect(node.effect, () => {
        this.currentNode++;
        this.renderNode();
      });
      return;
    }

    // ?μ냼 ?꾪솚
    if (node.type === 'location') {
      this.showLocation(node.name, () => {
        this.currentNode++;
        this.renderNode();
      });
      return;
    }

    if (node.type === 'weather') {
      this.setWeather(node.weather);
      this.currentNode++;
      this.renderNode();
      return;
    }

    // 而룹뵮
    if (node.type === 'cutscene') {
      this.showCutscene(node);
      return;
    }

    this.clearCutscene();
    this.updateCharacter(node.speaker);

    if (node.type === 'text') {
      this.addLog(node.speaker, node.text);
      textBox.classList.add('node-transition');
      textBox.classList.remove('awaiting-next');

      setTimeout(() => {
        speakerEl.textContent = node.speaker || '';
        this.styleSpeaker(speakerEl, node.speaker);
        textBox.classList.remove('dialogue', 'system-msg', 'cutscene-text');

        if (node.speaker && node.speaker !== '시스템') textBox.classList.add('dialogue');
        if (node.speaker === '시스템') textBox.classList.add('system-msg');

        textBox.classList.remove('node-transition');
        this.applyTextMood(node.text, node.speaker);
        this.typeText(node.text, textEl);
      }, 150);

    } else if (node.type === 'combat') {
      this.inCombat = true;
      this.stopAuto();
      speakerEl.textContent = '';
      textEl.textContent = `${node.enemy.name}이(가) 나타났다!`;
      textBox.classList.remove('dialogue', 'system-msg', 'cutscene-text');
      textBox.classList.remove('awaiting-next', 'mood-impact', 'mood-soft', 'mood-whisper');
      StoryAudio.playSfx('combat');

      Combat.start(
        this.currentBeast, node.enemy,
        () => { this.inCombat = false; this.currentNode++; this.renderNode(); },
        () => { this.inCombat = false; UI.showToast('패배했다... 다시 도전해보자.'); this.renderNode(); }
      );
      return;
    }
  },

  // ?μ냼 ??諛곌꼍 ??留ㅽ븨
  sceneMap: {
    고아원: 'orphanage',
    시장: 'market',
    숲: 'forest',
    바다: 'ocean',
    산: 'mountain',
    집: 'home',
    전장: 'battlefield',
    사원: 'temple',
    골목: 'alley',
    하늘: 'sky',
  },

  // ??? ?μ냼 ?꾪솚 ???

  showLocation(name, callback) {
    const el = document.getElementById('story-location-label');
    const overlay = document.getElementById('story-effect-overlay');
    StoryAudio.playSfx('transition');

    // 1) ?섏씠????釉붾옓
    overlay.className = 'location-fade';

    setTimeout(() => {
      // 2) 諛곌꼍 ??蹂寃?(?대몢???숈븞)
      const sceneBg = document.getElementById('story-scene-bg');
      const sceneClass = this.sceneMap[name];
      sceneBg.className = sceneClass ? 'scene-' + sceneClass : '';
      const sceneImgPath = sceneClass ? getStorySceneBackgroundPath(sceneClass) : null;
      const sceneToken = `${sceneClass || 'none'}-${Date.now()}`;
      sceneBg.dataset.sceneToken = sceneToken;
      sceneBg.classList.remove('has-image');
      sceneBg.style.backgroundImage = '';
      if (sceneImgPath) {
        const probe = new Image();
        probe.onload = () => {
          if (sceneBg.dataset.sceneToken !== sceneToken) return;
          sceneBg.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.26), rgba(0,0,0,0.46)), url("${sceneImgPath}")`;
          sceneBg.classList.add('has-image');
        };
        probe.onerror = () => {
          if (sceneBg.dataset.sceneToken !== sceneToken) return;
          sceneBg.style.backgroundImage = '';
          sceneBg.classList.remove('has-image');
        };
        probe.src = sceneImgPath;
      }

      // 3) ?μ냼 ?대쫫 ?쒖떆
      el.textContent = name;
      el.classList.add('visible');

      // 4) ?섏씠????      overlay.classList.add('reveal');

      setTimeout(() => {
        el.classList.remove('visible');
        setTimeout(() => {
          overlay.className = '';
          callback();
        }, 400);
      }, 1400);
    }, 500);
  },

  // ??? ?좎뵪/遺꾩쐞湲????

  setWeather(weather) {
    const container = document.getElementById('story-weather');
    container.className = '';

    if (weather === 'clear') {
      container.className = '';
      return;
    }
    container.classList.add('weather-' + weather);

    // 鍮????뚰떚???앹꽦
    if (weather === 'rain' || weather === 'snow') {
      container.innerHTML = '';
      const count = weather === 'rain' ? 40 : 25;
      for (let i = 0; i < count; i++) {
        const drop = document.createElement('div');
        drop.className = 'weather-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.animationDuration = (weather === 'rain' ? 0.4 + Math.random() * 0.3 : 3 + Math.random() * 4) + 's';
        drop.style.animationDelay = Math.random() * 3 + 's';
        if (weather === 'snow') {
          drop.style.width = (2 + Math.random() * 4) + 'px';
          drop.style.height = drop.style.width;
        }
        container.appendChild(drop);
      }
    } else {
      container.innerHTML = '';
    }
  },

  clearWeather() {
    const container = document.getElementById('story-weather');
    if (container) {
      container.className = '';
      container.innerHTML = '';
    }
  },

  // ??? 而룹뵮 ???

  showCutscene(node) {
    const container = document.getElementById('story-cutscene');
    const img = document.getElementById('story-cutscene-img');
    const speakerEl = document.getElementById('story-speaker');
    const textEl = document.getElementById('story-text');
    const textBox = document.getElementById('story-text-box');

    document.getElementById('story-character').classList.add('cutscene-hidden');
    textBox.classList.remove('dialogue', 'system-msg', 'mood-impact', 'mood-soft', 'mood-whisper');
    textBox.classList.add('cutscene-text');

    if (node.image) {
      this.unlockCG(node.image);
      if (img.src !== new URL(node.image, location.href).href) {
        img.classList.add('transitioning');
        setTimeout(() => { img.src = node.image; img.classList.remove('transitioning'); }, 200);
      }
      container.classList.remove('hidden');
    }

    speakerEl.textContent = '';
    if (node.text) {
      this.addLog('', node.text);
      this.typeText(node.text, textEl, 40);
    } else {
      textEl.textContent = '';
    }
  },

  clearCutscene() {
    const container = document.getElementById('story-cutscene');
    if (!container.classList.contains('hidden')) {
      container.classList.add('fading-out');
      setTimeout(() => {
        container.classList.add('hidden');
        container.classList.remove('fading-out');
        document.getElementById('story-cutscene-img').src = '';
      }, 500);
    }
    document.getElementById('story-text-box').classList.remove('cutscene-text');
  },

  // ??? ?붾㈃ ?곗텧 ?④낵 ???

  playEffect(effect, callback) {
    const overlay = document.getElementById('story-effect-overlay');
    const area = document.getElementById('story-text-area');

    switch (effect) {
      case 'shake':
        area.classList.add('shake');
        StoryAudio.playSfx('shake');
        setTimeout(() => { area.classList.remove('shake'); callback(); }, 400);
        break;
      case 'flash':
        overlay.className = 'flash';
        StoryAudio.playSfx('flash');
        setTimeout(() => { overlay.className = ''; callback(); }, 400);
        break;
      case 'fade-black':
        overlay.className = 'fade-black';
        StoryAudio.playSfx('transition');
        setTimeout(() => {
          overlay.classList.add('out');
          setTimeout(() => { overlay.className = ''; callback(); }, 800);
        }, 600);
        break;
      default:
        callback();
    }
  },

  // ??? ??댄븨 ???

  typeText(text, element, speed) {
    if (this.typeTimer) { clearTimeout(this.typeTimer); this.typeTimer = null; }
    text = text || '';
    speed = speed || this.settings.textSpeed;
    element.textContent = '';
    this.displayedText = '';
    const textBox = document.getElementById('story-text-box');
    if (textBox) textBox.classList.remove('awaiting-next');

    let i = 0;
    const step = () => {
      if (i >= text.length) {
        this.typeTimer = null;
        this.displayedText = text;
        if (textBox) textBox.classList.add('awaiting-next');
        if (this.autoMode) this.scheduleAutoNext();
        return;
      }

      let chunk = this.fastForwardHeld ? 4 : 1;
      let added = '';
      while (chunk > 0 && i < text.length) {
        added += text[i];
        i++;
        chunk--;
      }
      element.textContent += added;
      this.displayedText = element.textContent;

      if (!this.fastForwardHeld && i % 5 === 0) {
        StoryAudio.playTypeTick();
      }

      const lastChar = text[i - 1] || '';
      this.typeTimer = setTimeout(() => step(), this.getCharDelay(lastChar, speed));
    };

    step();
  },

  getCharDelay(lastChar, baseSpeed) {
    if (this.fastForwardHeld) return 4;
    if (/[.!?！？]/.test(lastChar)) return Math.round(baseSpeed * 4.2);
    if (/[,:;…]/.test(lastChar)) return Math.round(baseSpeed * 2.4);
    if (/\s/.test(lastChar)) return Math.round(baseSpeed * 1.35);
    return baseSpeed;
  },

  applyTextMood(text, speaker) {
    const textBox = document.getElementById('story-text-box');
    if (!textBox) return;

    textBox.classList.remove('mood-impact', 'mood-soft', 'mood-whisper');
    const source = text || '';
    const impact = /[!?！？]/.test(source) || speaker === '시스템';
    const whisper = /…|\.{3}|속삭|조용|침묵|숨을/.test(source);

    if (impact) {
      textBox.classList.add('mood-impact');
      return;
    }
    if (whisper) {
      textBox.classList.add('mood-whisper');
      return;
    }
    if (source.length > 120) {
      textBox.classList.add('mood-soft');
    }
  },

  completeText() {
    if (this.typeTimer) {
      clearTimeout(this.typeTimer);
      this.typeTimer = null;
      const node = this.nodes[this.currentNode];
      if (node) {
        const text = node.text || '';
        this.displayedText = text;
        document.getElementById('story-text').textContent = text;
      }
      const textBox = document.getElementById('story-text-box');
      if (textBox) textBox.classList.add('awaiting-next');
      if (this.autoMode) this.scheduleAutoNext();
    }
  },

  // ??? ?붿옄 ?ㅽ??쇰쭅 ???

  styleSpeaker(el, speaker) {
    el.removeAttribute('style');
    if (!speaker) return;
    if (speaker === '시스템') { el.style.color = '#4fc3f7'; return; }
    const beastData = BEAST_DATA[this.currentBeast];
    if (beastData && speaker === beastData.name) {
      el.style.color = beastData.color;
      el.style.textShadow = `0 0 12px ${beastData.color}40`;
      return;
    }
    el.style.color = 'var(--accent)';
  },

  // ??? ?ㅼ쓬 ?몃뱶 ???

  next() {
    if (this.inCombat) return;
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
    if (this.typeTimer) { this.completeText(); return; }
    const textBox = document.getElementById('story-text-box');
    if (textBox) textBox.classList.remove('awaiting-next');
    StoryAudio.playSfx('page');
    this.currentNode++;
    // 遺곷쭏???먮룞 ???(20?몃뱶留덈떎)
    if (this.currentNode > 0 && this.currentNode % 20 === 0) {
      this.saveBookmark();
    }
    this.renderNode();
  },

  // ??? ?먮룞 ?ъ깮 ???

  toggleAuto() {
    this.autoMode = !this.autoMode;
    const btn = document.getElementById('story-auto-btn');
    if (this.autoMode) {
      btn.classList.add('active');
      btn.textContent = '자동 ON';
      if (!this.typeTimer && !this.inCombat) this.scheduleAutoNext();
    } else {
      this.stopAuto();
    }
  },

  scheduleAutoNext() {
    if (!this.autoMode) return;
    if (this.autoTimer) clearTimeout(this.autoTimer);

    let delay = this.settings.autoDelay;
    const node = this.nodes[this.currentNode];
    if (node && node.text) {
      const textDelay = node.text.length * 50;
      delay = Math.min(5000, Math.max(delay, textDelay));
    }

    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (this.autoMode && !this.inCombat && !this.typeTimer) {
        this.currentNode++;
        this.renderNode();
      }
    }, delay);
  },

  stopAuto() {
    this.autoMode = false;
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
    const btn = document.getElementById('story-auto-btn');
    if (btn) { btn.classList.remove('active'); btn.textContent = '자동'; }
  },

  // ??? ?띿뒪??濡쒓렇 ???

  addLog(speaker, text) {
    this.log.push({ speaker: speaker || '', text });
    if (this.log.length > 100) this.log.shift();
  },

  toggleLog() {
    const panel = document.getElementById('story-log-panel');
    if (panel.classList.contains('hidden')) {
      this.renderLog();
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  },

  renderLog() {
    const container = document.getElementById('story-log-content');
    container.innerHTML = '';
    for (const entry of this.log) {
      const div = document.createElement('div');
      div.className = 'log-entry' + (entry.speaker ? '' : ' log-narration');
      if (entry.speaker) {
        const sp = document.createElement('div');
        sp.className = 'log-speaker';
        sp.textContent = entry.speaker;
        div.appendChild(sp);
      }
      const txt = document.createElement('div');
      txt.className = 'log-text';
      txt.textContent = entry.text;
      div.appendChild(txt);
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  },

  // ??? ?ㅼ젙 ?⑤꼸 ???

  toggleSettings() {
    const panel = document.getElementById('story-settings-panel');
    panel.classList.toggle('hidden');
  },

  setTextSpeed(val) {
    // val: 1(鍮좊쫫) ~ 5(?먮┝), 湲곕낯3
    const speeds = [10, 18, 25, 35, 50];
    this.settings.textSpeed = speeds[val - 1] || 25;
  },

  setAutoSpeed(val) {
    // val: 1(鍮좊쫫) ~ 5(?먮┝), 湲곕낯3
    const delays = [800, 1200, 1500, 2200, 3000];
    this.settings.autoDelay = delays[val - 1] || 1500;
  },

  toggleSound() {
    this.settings.soundEnabled = !this.settings.soundEnabled;
    const btn = document.getElementById('story-sound-btn');
    if (btn) btn.innerHTML = '<span class="ctrl-icon ui-icon ' + (this.settings.soundEnabled ? 'icon-sound' : 'icon-sound-off') + '" aria-hidden="true"></span>';
    if (!this.settings.soundEnabled) {
      StoryAudio.stopAmbient();
    } else if (this.currentBeast) {
      StoryAudio.startAmbient(this.currentBeast);
    }
  },

  // ??? ?ㅽ궢 紐⑤뱶 ???

  toggleSkip() {
    this.skipMode = !this.skipMode;
    const btn = document.getElementById('story-skip-btn');
    const indicator = document.getElementById('skip-indicator');
    if (this.skipMode) {
      this.stopAuto();
      btn.classList.add('active');
      btn.textContent = '스킵 ON';
      if (indicator) indicator.classList.add('active');
      this.runSkip();
    } else {
      this.stopSkip();
    }
  },

  runSkip() {
    if (!this.skipMode || this.inCombat) return;
    if (this.currentNode >= this.nodes.length) {
      this.stopSkip();
      this.endChapter();
      return;
    }

    const node = this.nodes[this.currentNode];
    const textBox = document.getElementById('story-text-box');
    if (textBox) textBox.classList.remove('awaiting-next');

    // ?꾪닾 ?몃뱶?먯꽌 ?ㅽ궢 硫덉땄
    if (node.type === 'combat') {
      this.stopSkip();
      this.renderNode();
      return;
    }

    // 硫뷀??곗씠???몃뱶??利됱떆 泥섎━
    if (node.type === 'effect' || node.type === 'location' || node.type === 'weather') {
      if (node.type === 'location') {
        const sceneBg = document.getElementById('story-scene-bg');
        const sceneClass = this.sceneMap[node.name];
        sceneBg.className = sceneClass ? 'scene-' + sceneClass : '';
        const sceneImgPath = sceneClass ? getStorySceneBackgroundPath(sceneClass) : null;
        if (sceneImgPath) {
          sceneBg.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.26), rgba(0,0,0,0.46)), url("${sceneImgPath}")`;
          sceneBg.classList.add('has-image');
        } else {
          sceneBg.style.backgroundImage = '';
          sceneBg.classList.remove('has-image');
        }
      }
      if (node.type === 'weather') this.setWeather(node.weather);
      this.currentNode++;
      this.runSkip();
      return;
    }

    // ?띿뒪??而룹뵮 ?몃뱶 - 鍮좊Ⅴ寃??쒖떆
    if (node.type === 'text') {
      this.addLog(node.speaker, node.text);
      document.getElementById('story-speaker').textContent = node.speaker || '';
      document.getElementById('story-text').textContent = node.text;
      this.applyTextMood(node.text, node.speaker);
      this.updateProgress();
    }
    if (node.type === 'cutscene') {
      this.unlockCG(node.image);
    }

    this.currentNode++;
    // ?쎌? ?띿뒪?? 50ms (怨좎냽), ???쎌? ?띿뒪?? 200ms (???
    const skipDelay = this.isNodeRead(this.currentNode) ? 50 : 200;
    this.skipTimer = setTimeout(() => this.runSkip(), skipDelay);
  },

  stopSkip() {
    this.skipMode = false;
    if (this.skipTimer) { clearTimeout(this.skipTimer); this.skipTimer = null; }
    this.fastForwardHeld = false;
    const textBox = document.getElementById('story-text-box');
    if (textBox) textBox.classList.remove('hold-fast');
    const btn = document.getElementById('story-skip-btn');
    if (btn) { btn.classList.remove('active'); btn.textContent = '스킵'; }
    const indicator = document.getElementById('skip-indicator');
    if (indicator) indicator.classList.remove('active');
  },

  // ??? CG 媛ㅻ윭由????

  unlockCG(image) {
    if (!image) return;
    if (!this.unlockedCGs[this.currentBeast]) this.unlockedCGs[this.currentBeast] = [];
    if (!this.unlockedCGs[this.currentBeast].includes(image)) {
      this.unlockedCGs[this.currentBeast].push(image);
      this.saveCGs();
    }
  },

  saveCGs() {
    try { localStorage.setItem('shinsu_cg', JSON.stringify(this.unlockedCGs)); } catch(e) {}
  },

  loadCGs() {
    try {
      const saved = localStorage.getItem('shinsu_cg');
      if (saved) this.unlockedCGs = JSON.parse(saved);
    } catch(e) {}
  },

  openGallery() {
    document.getElementById('overlay-gallery').classList.remove('hidden');
    this.renderGallery(this.selectBeast || GameState.currentBeast);
  },

  renderGallery(beastId) {
    // ?좎닔 ??(?щ낵+而щ윭)
    const tabs = document.getElementById('gallery-beast-tabs');
    tabs.innerHTML = '';
    Object.keys(BEAST_DATA).forEach(id => {
      const data = BEAST_DATA[id];
      const beast = GameState.beasts[id];
      const locked = !beast || !beast.unlocked;
      const isActive = id === beastId;
      const tab = document.createElement('button');
      tab.className = 'chapter-beast-tab' + (isActive ? ' active' : '') + (locked ? ' locked' : '');

      if (isActive && !locked) {
        tab.style.borderColor = data.color + '60';
        tab.style.background = data.color + '18';
      }

      if (!locked) {
        const portraitPath = getBeastPortraitPath(id);
        if (portraitPath) {
          const portrait = document.createElement('img');
          portrait.className = 'tab-portrait';
          portrait.src = portraitPath;
          portrait.alt = data.name;
          portrait.loading = 'lazy';
          portrait.onerror = () => {
            portrait.remove();
            const sym = document.createElement('span');
            sym.className = 'tab-symbol';
            sym.textContent = data.symbol;
            if (isActive) sym.style.color = data.color;
            tab.prepend(sym);
          };
          tab.appendChild(portrait);
        } else {
          const sym = document.createElement('span');
          sym.className = 'tab-symbol';
          sym.textContent = data.symbol;
          if (isActive) sym.style.color = data.color;
          tab.appendChild(sym);
        }
        tab.appendChild(document.createTextNode(data.name));
        tab.onclick = () => this.renderGallery(id);
      } else {
        tab.textContent = '???';
      }
      tabs.appendChild(tab);
    });

    // CG 洹몃━??- 紐⑤뱺 梨뺥꽣?먯꽌 cutscene ?몃뱶 ?섏쭛
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    const chapters = this.chapters[beastId];
    if (!chapters) return;

    const allCGs = [];
    chapters.forEach((ch, i) => {
      ch.nodes.forEach(n => {
        if (n.type === 'cutscene' && n.image) {
          allCGs.push({ image: n.image, text: n.text || '', chapter: i });
        }
      });
    });

    const unlocked = this.unlockedCGs[beastId] || [];
    const countEl = document.getElementById('gallery-count');

    if (allCGs.length === 0) {
      grid.innerHTML = '<p style="color:rgba(255,255,255,0.2);text-align:center;padding:50px 0;grid-column:1/-1;font-size:13px;">CG媛 ?놁뒿?덈떎.</p>';
      countEl.textContent = '';
      return;
    }

    const unlockedCount = allCGs.filter(cg => unlocked.includes(cg.image)).length;
    countEl.textContent = `${unlockedCount} / ${allCGs.length} ?닿툑`;

    allCGs.forEach(cg => {
      const isUnlocked = unlocked.includes(cg.image);
      const item = document.createElement('div');
      item.className = 'gallery-item' + (isUnlocked ? '' : ' locked');
      if (isUnlocked) {
        const img = document.createElement('img');
        img.src = cg.image;
        img.alt = cg.text;
        item.appendChild(img);
        item.onclick = () => this.openCGViewer(cg.image, cg.text);
      }
      grid.appendChild(item);
    });
  },

  openCGViewer(image, caption) {
    const viewer = document.getElementById('cg-viewer');
    document.getElementById('cg-viewer-img').src = image;
    document.getElementById('cg-viewer-caption').textContent = caption;
    viewer.classList.remove('hidden');
  },

  closeCGViewer() {
    document.getElementById('cg-viewer').classList.add('hidden');
  },

  // ??? 梨뺥꽣 醫낅즺 ???

  endChapter() {
    const beastId = this.currentBeast;
    const chapterIdx = this.currentChapter;
    const beastChapters = this.chapters[beastId];
    const completionKey = `${beastId}_${chapterIdx}`;

    // 吏꾪뻾???낅뜲?댄듃
    GameState.storyProgress[beastId] = Math.max(GameState.storyProgress[beastId] || 0, chapterIdx + 1);

    // 蹂댁긽 怨꾩궛 (以묐났 蹂댁긽 諛⑹?)
    let goldReward = 0;
    let affReward = 0;
    let awakeningItem = false;
    const isFirstClear = !this.completedChapters[completionKey];

    if (isFirstClear) {
      goldReward = this.chapterRewards.gold[chapterIdx] || 50;
      affReward = this.chapterRewards.affection[chapterIdx] || 5;
      GameState.gold += goldReward;
      GameState.addAffection(beastId, affReward);
      this.completedChapters[completionKey] = true;
      this.saveCompletedChapters();

      if (chapterIdx === beastChapters.length - 1) {
        const beast = GameState.beasts[beastId];
        if (beast && !beast.hasAwakeningItem) {
          beast.hasAwakeningItem = true;
          awakeningItem = true;
        }
      }
    }

    GameState.save();

    // 遺곷쭏????젣 (?꾨즺?덉쑝誘濡?
    this.clearBookmark(beastId);

    this.saveReadProgress();

    // ?뺣━
    this.clearCutscene();
    this.clearWeather();
    this.stopAuto();
    this.stopSkip();
    this.updateProgress();
    StoryAudio.stopAmbient();
    document.getElementById('story-particles').innerHTML = '';

    // 寃곌낵 ?붾㈃
    this.showChapterResult(chapterIdx, goldReward, affReward, awakeningItem, isFirstClear);
  },

  // ??? 梨뺥꽣 寃곌낵 ?붾㈃ ???

  showChapterResult(chapterIdx, gold, affection, awakeningItem, isFirstClear) {
    const beastId = this.currentBeast;
    const beastData = BEAST_DATA[beastId];
    const chapter = this.chapters[beastId][chapterIdx];
    const chapterTitle = chapter ? chapter.title : `${chapterIdx + 1}장`;

    document.getElementById('story-text-area').classList.add('hidden');
    document.getElementById('story-controls').style.display = 'none';

    const resultEl = document.getElementById('chapter-result');
    resultEl.classList.remove('hidden');
    resultEl.style.setProperty('--beast-color', beastData.color);
    resultEl.style.setProperty('--beast-glow', beastData.color + '30');

    let rewardsHTML = '';
    if (isFirstClear) {
      rewardsHTML = `
        <div class="result-rewards">
          <div class="result-reward-item" style="animation-delay:0.4s">
            <span class="reward-icon gold-icon ui-icon icon-coins-bag" aria-hidden="true"></span>
            <span class="reward-value">+${gold}</span>
            <span class="reward-name">골드</span>
          </div>
          <div class="result-reward-item" style="animation-delay:0.6s">
            <span class="reward-icon heart-icon ui-icon icon-heart" aria-hidden="true"></span>
            <span class="reward-value">+${affection}</span>
            <span class="reward-name">호감도</span>
          </div>
          ${awakeningItem ? `
          <div class="result-reward-item special" style="animation-delay:0.8s">
            <span class="reward-icon awakening-icon ui-icon icon-star" aria-hidden="true"></span>
            <span class="reward-value">각성 아이템</span>
            <span class="reward-name">${beastData.name} 각성용</span>
          </div>` : ''}
        </div>`;
    } else {
      rewardsHTML = '<div class="result-replay-notice">재플레이 보상은 첫 클리어에서만 지급됩니다.</div>';
    }

    resultEl.innerHTML = `
      <div class="result-card">
        <div class="result-clear-badge">CLEAR</div>
        <div class="result-chapter-title">${chapterTitle}</div>
        <div class="result-divider"></div>
        ${rewardsHTML}
        <button class="result-continue-btn" onclick="Story.closeResult()">
          ${(GameState.storyProgress[beastId] || 0) < this.chapters[beastId].length ? '다음 챕터로' : '목록으로 돌아가기'}
        </button>
      </div>
    `;

    // 怨⑤뱶 ?쒖떆 ?낅뜲?댄듃
    UI.updateGoldDisplay();
    // ?ㅽ넗由???諭껋? ?낅뜲?댄듃
    this.updateStoryBadge();
  },

  closeResult() {
    document.getElementById('chapter-result').classList.add('hidden');
    this.backToSelect();
  },

  // ??? 遺곷쭏???쒖뒪?????

  saveBookmark() {
    if (!this.currentBeast || this.currentNode <= 0) return;
    this.bookmarks[this.currentBeast] = {
      chapter: this.currentChapter,
      node: this.currentNode,
      timestamp: Date.now()
    };
    this.saveBookmarksToStorage();
  },

  clearBookmark(beastId) {
    delete this.bookmarks[beastId];
    this.saveBookmarksToStorage();
  },

  saveBookmarksToStorage() {
    try { localStorage.setItem('shinsu_bookmarks', JSON.stringify(this.bookmarks)); } catch(e) {}
  },

  loadBookmarks() {
    try {
      const saved = localStorage.getItem('shinsu_bookmarks');
      if (saved) this.bookmarks = JSON.parse(saved);
    } catch(e) {}
  },

  resumeBookmark(beastId) {
    const bm = this.bookmarks[beastId];
    if (!bm) return;
    this.startChapter(beastId, bm.chapter);
    // startChapter sets currentNode=0, so after it finishes, jump to saved node
    // We need to skip ahead after the chapter title animation
    this._pendingBookmarkNode = bm.node;
  },

  // ??? ?쎄린 吏꾪뻾?????

  trackRead() {
    if (!this.currentBeast) return;
    const key = `${this.currentBeast}_${this.currentChapter}`;
    const maxRead = this.readProgress[key] || 0;
    if (this.currentNode > maxRead) {
      this.readProgress[key] = this.currentNode;
    }
  },

  isNodeRead(nodeIdx) {
    const key = `${this.currentBeast}_${this.currentChapter}`;
    return nodeIdx <= (this.readProgress[key] || 0);
  },

  saveReadProgress() {
    try { localStorage.setItem('shinsu_readprogress', JSON.stringify(this.readProgress)); } catch(e) {}
  },

  loadReadProgress() {
    try {
      const saved = localStorage.getItem('shinsu_readprogress');
      if (saved) this.readProgress = JSON.parse(saved);
    } catch(e) {}
  },

  // ??? ?꾨즺 梨뺥꽣 異붿쟻 ???

  saveCompletedChapters() {
    try { localStorage.setItem('shinsu_completed', JSON.stringify(this.completedChapters)); } catch(e) {}
  },

  loadCompletedChapters() {
    try {
      const saved = localStorage.getItem('shinsu_completed');
      if (saved) this.completedChapters = JSON.parse(saved);
    } catch(e) {}
  },

  // ??? ?ㅽ넗由????뚮┝ 諭껋? ???

  updateStoryBadge() {
    const tabBtn = document.querySelector('.tab-btn[data-tab="story"]');
    if (!tabBtn) return;

    let hasNew = false;
    Object.keys(this.chapters).forEach(beastId => {
      const beast = GameState.beasts[beastId];
      if (!beast || !beast.unlocked) return;
      const progress = GameState.storyProgress[beastId] || 0;
      const total = this.chapters[beastId] ? this.chapters[beastId].length : 0;
      if (progress < total) hasNew = true;
    });

    let badge = tabBtn.querySelector('.tab-badge');
    if (hasNew) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-badge';
        tabBtn.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }
};

/* ===== ?ъ슫???쒖뒪??(Web Audio API) ===== */

const StoryAudio = {
  ctx: null,
  ambientOsc: null,
  ambientGain: null,
  ambientLfo: null,

  // ?좎닔蹂??곕퉬?명듃 ??(二쇳뙆?? ?뚰삎)
  ambientTones: {
    cheongryong: { freq: 110, type: 'sine', lfo: 0.15, detune: -5 },    // 源딆? 諛붾떎
    baekho:      { freq: 82, type: 'triangle', lfo: 0.1, detune: 0 },
    jujak:       { freq: 130, type: 'sine', lfo: 0.2, detune: 7 },
    hyeonmu:     { freq: 73, type: 'sine', lfo: 0.08, detune: -3 },
    hwangryong:  { freq: 98, type: 'triangle', lfo: 0.12, detune: 3 },
  },

  getCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  startAmbient(beastId) {
    if (!Story.settings.soundEnabled) return;
    this.stopAmbient();

    const ctx = this.getCtx();
    const tone = this.ambientTones[beastId] || this.ambientTones.cheongryong;

    this.ambientOsc = ctx.createOscillator();
    this.ambientOsc.type = tone.type;
    this.ambientOsc.frequency.value = tone.freq;
    this.ambientOsc.detune.value = tone.detune;

    this.ambientLfo = ctx.createOscillator();
    this.ambientLfo.frequency.value = tone.lfo;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 3;
    this.ambientLfo.connect(lfoGain);
    lfoGain.connect(this.ambientOsc.frequency);

    // 蹂쇰ⅷ
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.gain.linearRampToValueAtTime(Story.settings.volume * 0.15, ctx.currentTime + 2);

    this.ambientOsc.connect(this.ambientGain);
    this.ambientGain.connect(ctx.destination);

    this.ambientOsc.start();
    this.ambientLfo.start();
  },

  stopAmbient() {
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    }
    setTimeout(() => {
      if (this.ambientOsc) { try { this.ambientOsc.stop(); } catch(e) {} this.ambientOsc = null; }
      if (this.ambientLfo) { try { this.ambientLfo.stop(); } catch(e) {} this.ambientLfo = null; }
      this.ambientGain = null;
    }, 600);
  },

  playSfx(type) {
    if (!Story.settings.soundEnabled) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const vol = Story.settings.volume;

    switch (type) {
      case 'page':
        osc.type = 'sine';
        osc.frequency.value = 800;
        gain.gain.value = vol * 0.08;
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.08);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        break;
      case 'transition':
        osc.type = 'sine';
        osc.frequency.value = 300;
        gain.gain.value = vol * 0.1;
        osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.5);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
        break;
      case 'shake':
        osc.type = 'sawtooth';
        osc.frequency.value = 60;
        gain.gain.value = vol * 0.12;
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        break;
      case 'flash':
        osc.type = 'square';
        osc.frequency.value = 1200;
        gain.gain.value = vol * 0.08;
        osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.15);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
        break;
      case 'combat':
        osc.type = 'sawtooth';
        osc.frequency.value = 150;
        gain.gain.value = vol * 0.15;
        osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.4);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        break;
      default:
        gain.gain.value = 0;
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  },

  playTypeTick() {
    if (!Story.settings.soundEnabled) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 600 + Math.random() * 200;
    gain.gain.value = Story.settings.volume * 0.02;
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  },
};

