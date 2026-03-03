/* ===== 상점 시스템 ===== */

const Shop = {
  currentTab: 'affection',

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

  switchTab(tab) {
    this.playSfx('page', 120);
    this.currentTab = tab;
    const order = ['affection', 'skin', 'training'];
    document.querySelectorAll('.shop-tab').forEach((btn, idx) => {
      btn.classList.toggle('active', order[idx] === tab);
    });
    this.render();
  },

  render() {
    const container = document.getElementById('shop-items');
    if (!container) return;
    container.innerHTML = '';

    if (this.currentTab === 'affection') {
      this.renderAffectionItems(container);
    } else if (this.currentTab === 'skin') {
      this.renderSkinItems(container);
    } else if (this.currentTab === 'training') {
      this.renderTrainingItems(container);
    }
  },

  getGoldPriceHTML(cost) {
    return `<span class="price-with-icon"><span class="ui-icon icon-coins-bag" aria-hidden="true"></span>${cost}</span>`;
  },

  renderAffectionItems(container) {
    AFFECTION_ITEMS.forEach(item => {
      const canBuy = GameState.gold >= item.cost;
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <span class="shop-item-icon ui-icon ${item.iconClass || 'icon-gift'}" aria-hidden="true"></span>
        <div class="shop-item-info">
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-desc">${item.desc}</div>
        </div>
        <button class="shop-buy-btn" ${!canBuy ? 'disabled' : ''} onclick="Shop.buyAffectionItem('${item.id}')">
          ${this.getGoldPriceHTML(item.cost)}
        </button>
      `;
      container.appendChild(div);
    });
  },

  renderSkinItems(container) {
    const beastId = GameState.currentBeast;
    const skins = SKIN_DATA[beastId] || [];

    skins.forEach(skin => {
      const owned = skin.owned || GameState.inventory.skins[skin.id];
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <span class="shop-item-icon ui-icon icon-shopping-bag" aria-hidden="true"></span>
        <div class="shop-item-info">
          <div class="shop-item-name">${skin.name}</div>
          <div class="shop-item-desc">${BEAST_DATA[beastId].name} 스킨</div>
        </div>
        <button class="shop-buy-btn" ${owned ? 'disabled' : ''}>
          ${owned ? '보유중' : '유료'}
        </button>
      `;
      container.appendChild(div);
    });
  },

  renderTrainingItems(container) {
    TRAINING_TOOLS.forEach(tool => {
      const owned = GameState.inventory.trainingTools[tool.id];
      const canBuy = tool.costType === 'gold' ? GameState.gold >= tool.cost : false;
      const costLabel = tool.costType === 'gold' ? this.getGoldPriceHTML(tool.cost) : '유료';

      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <span class="shop-item-icon ui-icon ${tool.iconClass || 'icon-tools'}" aria-hidden="true"></span>
        <div class="shop-item-info">
          <div class="shop-item-name">${tool.name}</div>
          <div class="shop-item-desc">${tool.desc}</div>
          ${owned ? '<div class="training-tool-owned">보유중</div>' : ''}
        </div>
        <button class="shop-buy-btn" ${owned || (!canBuy && tool.costType === 'gold') ? 'disabled' : ''}
          onclick="Shop.buyTrainingTool('${tool.id}')">
          ${owned ? '보유중' : costLabel}
        </button>
      `;
      container.appendChild(div);
    });
  },

  buyAffectionItem(itemId) {
    const item = AFFECTION_ITEMS.find(i => i.id === itemId);
    if (!item || GameState.gold < item.cost) {
      this.playSfx('transition', 120);
      UI.showToast('골드가 부족합니다.');
      return;
    }

    GameState.gold -= item.cost;
    if (!GameState.inventory.affectionItems[itemId]) {
      GameState.inventory.affectionItems[itemId] = 0;
    }
    GameState.inventory.affectionItems[itemId] += 1;
    GameState.save();
    this.playSfx('reward');

    UI.showToast(`${item.name} 구매 완료`);
    UI.updateGoldDisplay();
    this.render();
  },

  buyTrainingTool(toolId) {
    const tool = TRAINING_TOOLS.find(t => t.id === toolId);
    if (!tool || GameState.inventory.trainingTools[toolId]) return;

    if (tool.costType === 'gold') {
      if (GameState.gold < tool.cost) {
        this.playSfx('transition', 120);
        UI.showToast('골드가 부족합니다.');
        return;
      }
      GameState.gold -= tool.cost;
    } else {
      this.playSfx('transition', 120);
      UI.showToast('유료 아이템은 현재 구매할 수 없습니다.');
      return;
    }

    GameState.inventory.trainingTools[toolId] = true;
    GameState.save();
    this.playSfx('reward');

    UI.showToast(`${tool.name} 구매 완료, 방치 수익 증가`);
    UI.updateGoldDisplay();
    this.render();
  }
};
