// ============================================================
// フロントカウンター — app.js
// ============================================================

(function () {
  'use strict';

  // ---------- Color Palette ----------
  const COLOR_PALETTE = [
    '#4CAF50', '#2196F3', '#FF9800', '#E91E63',
    '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
    '#795548', '#3F51B5',
  ];

  // ---------- Default Categories ----------
  const DEFAULT_CATEGORIES = [
    { name: '問い合わせ', color: '#4CAF50' },
    { name: '予約',       color: '#2196F3' },
    { name: 'クレーム',   color: '#FF9800' },
    { name: 'その他',     color: '#607D8B' },
  ];

  // ============================================================
  // Store — localStorage CRUD
  // ============================================================
  const Store = {
    _get(key) {
      try { return JSON.parse(localStorage.getItem(key)) || []; }
      catch { return []; }
    },
    _set(key, data) {
      localStorage.setItem(key, JSON.stringify(data));
    },

    // -- Categories --
    getCategories() { return this._get('fc_categories'); },
    saveCategories(cats) { this._set('fc_categories', cats); },

    addCategory(name, color) {
      const cats = this.getCategories();
      const cat = { id: 'cat_' + Date.now(), name, color, order: cats.length };
      cats.push(cat);
      this.saveCategories(cats);
      return cat;
    },

    updateCategory(id, name, color) {
      const cats = this.getCategories();
      const cat = cats.find(c => c.id === id);
      if (cat) {
        cat.name = name;
        cat.color = color;
        this.saveCategories(cats);
      }
    },

    deleteCategory(id) {
      const cats = this.getCategories().filter(c => c.id !== id);
      this.saveCategories(cats);
    },

    getCategoryMap() {
      const map = {};
      for (const c of this.getCategories()) map[c.id] = c;
      return map;
    },

    // -- Entries --
    getEntries() { return this._get('fc_entries'); },
    saveEntries(entries) { this._set('fc_entries', entries); },

    addEntry(categoryId) {
      const entries = this.getEntries();
      const entry = { id: 'ent_' + Date.now(), categoryId, timestamp: Date.now() };
      entries.push(entry);
      this.saveEntries(entries);
      return entry;
    },

    deleteEntry(id) {
      const entries = this.getEntries().filter(e => e.id !== id);
      this.saveEntries(entries);
    },

    getEntriesForDate(date) {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);
      const s = start.getTime(), e = end.getTime();
      return this.getEntries().filter(ent => ent.timestamp >= s && ent.timestamp <= e);
    },

    // -- Seed --
    seedIfEmpty() {
      if (this.getCategories().length === 0) {
        const cats = DEFAULT_CATEGORIES.map((c, i) => ({
          id: 'cat_' + (Date.now() + i),
          name: c.name,
          color: c.color,
          order: i,
        }));
        this.saveCategories(cats);
      }
    },

    clearAll() {
      localStorage.removeItem('fc_categories');
      localStorage.removeItem('fc_entries');
    },
  };

  // ============================================================
  // Helpers
  // ============================================================
  function todayStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${y}/${m}/${d} (${days[date.getDay()]})`;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function isToday(date) {
    const t = todayStart();
    return date.getFullYear() === t.getFullYear() &&
           date.getMonth() === t.getMonth() &&
           date.getDate() === t.getDate();
  }

  // ============================================================
  // DOM References
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    headerSubtitle: $('#header-subtitle'),
    counterGrid: $('#counter-grid'),
    btnUndo: $('#btn-undo'),
    timelineNav: {
      prev: $('#btn-prev-day'),
      next: $('#btn-next-day'),
      date: $('#timeline-date'),
    },
    timelineList: $('#timeline-list'),
    summaryList: $('#summary-list'),
    categoryList: $('#category-list'),
    btnAddCategory: $('#btn-add-category'),
    modal: $('#category-modal'),
    modalTitle: $('#modal-title'),
    inputCatName: $('#input-cat-name'),
    colorPalette: $('#color-palette'),
    btnModalCancel: $('#btn-modal-cancel'),
    btnModalSave: $('#btn-modal-save'),
    btnExportCsv: $('#btn-export-csv'),
    btnClearData: $('#btn-clear-data'),
    tabs: $$('.tab'),
    views: $$('.view'),
  };

  // ============================================================
  // State
  // ============================================================
  let currentView = 'counter';
  let timelineDate = todayStart();
  let editingCategoryId = null;
  let selectedColor = COLOR_PALETTE[0];
  let lastEntryTimestamp = 0;
  let undoTimer = null;

  // ============================================================
  // View Navigation
  // ============================================================
  function showView(name) {
    currentView = name;
    dom.views.forEach(v => v.classList.remove('active'));
    dom.tabs.forEach(t => t.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');
    $(`.tab[data-view="${name}"]`).classList.add('active');

    if (name === 'counter') renderCounter();
    if (name === 'timeline') renderTimeline();
    if (name === 'settings') renderSettings();
  }

  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });

  // ============================================================
  // Counter View
  // ============================================================
  function renderCounter() {
    const cats = Store.getCategories();
    const todayEntries = Store.getEntriesForDate(new Date());
    const countMap = {};
    todayEntries.forEach(e => { countMap[e.categoryId] = (countMap[e.categoryId] || 0) + 1; });
    const total = todayEntries.length;

    dom.headerSubtitle.textContent = `${formatDate(new Date())} ｜ 合計 ${total}件`;

    dom.counterGrid.innerHTML = '';
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'counter-btn';
      btn.style.backgroundColor = cat.color;
      btn.innerHTML = `
        <span class="counter-btn-name">${esc(cat.name)}</span>
        <span class="counter-btn-count">${countMap[cat.id] || 0}</span>
      `;
      btn.addEventListener('click', () => onCounterTap(cat.id, btn));
      dom.counterGrid.appendChild(btn);
    });

    updateUndoButton();
  }

  function onCounterTap(categoryId, btn) {
    const entry = Store.addEntry(categoryId);
    lastEntryTimestamp = entry.timestamp;

    // Visual feedback
    btn.classList.remove('tapped');
    void btn.offsetWidth; // force reflow
    btn.classList.add('tapped');

    renderCounter();
    startUndoTimer();
  }

  function startUndoTimer() {
    clearTimeout(undoTimer);
    dom.btnUndo.disabled = false;
    undoTimer = setTimeout(() => {
      dom.btnUndo.disabled = true;
      lastEntryTimestamp = 0;
    }, 30000);
  }

  function updateUndoButton() {
    if (lastEntryTimestamp && (Date.now() - lastEntryTimestamp < 30000)) {
      dom.btnUndo.disabled = false;
    } else {
      dom.btnUndo.disabled = true;
    }
  }

  dom.btnUndo.addEventListener('click', () => {
    if (!lastEntryTimestamp) return;
    if (Date.now() - lastEntryTimestamp > 30000) {
      dom.btnUndo.disabled = true;
      return;
    }
    // Delete the last entry for this timestamp
    const entries = Store.getEntries();
    const lastEntry = entries.filter(e => e.timestamp === lastEntryTimestamp).pop();
    if (lastEntry) {
      Store.deleteEntry(lastEntry.id);
    }
    lastEntryTimestamp = 0;
    clearTimeout(undoTimer);
    dom.btnUndo.disabled = true;
    renderCounter();
  });

  // ============================================================
  // Timeline View
  // ============================================================
  function renderTimeline() {
    dom.timelineNav.date.textContent = formatDate(timelineDate);
    dom.timelineNav.next.disabled = isToday(timelineDate);

    const entries = Store.getEntriesForDate(timelineDate);
    const catMap = Store.getCategoryMap();

    // Sort descending by timestamp
    entries.sort((a, b) => b.timestamp - a.timestamp);

    dom.timelineList.innerHTML = '';
    if (entries.length === 0) {
      dom.timelineList.innerHTML = '<li class="timeline-empty">記録がありません</li>';
    } else {
      entries.forEach(entry => {
        const cat = catMap[entry.categoryId];
        const li = document.createElement('li');
        li.className = 'timeline-entry';
        li.innerHTML = `
          <span class="entry-color" style="background:${cat ? cat.color : '#ccc'}"></span>
          <span class="entry-time">${formatTime(entry.timestamp)}</span>
          <span class="entry-name">${cat ? esc(cat.name) : '(削除済み)'}</span>
        `;
        const delBtn = document.createElement('button');
        delBtn.className = 'entry-delete';
        delBtn.textContent = '削除';
        delBtn.addEventListener('click', () => {
          if (confirm('この記録を削除しますか？')) {
            Store.deleteEntry(entry.id);
            renderTimeline();
            if (currentView === 'counter') renderCounter();
          }
        });
        li.appendChild(delBtn);
        dom.timelineList.appendChild(li);
      });
    }

    // Summary
    const summary = {};
    entries.forEach(e => {
      summary[e.categoryId] = (summary[e.categoryId] || 0) + 1;
    });

    dom.summaryList.innerHTML = '';
    Object.keys(summary).forEach(catId => {
      const cat = catMap[catId];
      const li = document.createElement('li');
      li.className = 'summary-item';
      li.innerHTML = `
        <span class="summary-color" style="background:${cat ? cat.color : '#ccc'}"></span>
        <span class="summary-name">${cat ? esc(cat.name) : '(削除済み)'}</span>
        <span class="summary-count">${summary[catId]}件</span>
      `;
      dom.summaryList.appendChild(li);
    });
  }

  dom.timelineNav.prev.addEventListener('click', () => {
    timelineDate.setDate(timelineDate.getDate() - 1);
    renderTimeline();
  });

  dom.timelineNav.next.addEventListener('click', () => {
    if (!isToday(timelineDate)) {
      timelineDate.setDate(timelineDate.getDate() + 1);
      renderTimeline();
    }
  });

  // ============================================================
  // Settings View
  // ============================================================
  function renderSettings() {
    const cats = Store.getCategories();
    dom.categoryList.innerHTML = '';
    cats.forEach(cat => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.innerHTML = `
        <span class="category-color-dot" style="background:${cat.color}"></span>
        <span class="category-name">${esc(cat.name)}</span>
        <div class="category-actions">
          <button class="btn-edit">編集</button>
          <button class="btn-delete-cat">削除</button>
        </div>
      `;
      li.querySelector('.btn-edit').addEventListener('click', () => openModal(cat));
      li.querySelector('.btn-delete-cat').addEventListener('click', () => {
        if (confirm(`「${cat.name}」を削除しますか？\n関連する記録は「(削除済み)」として残ります。`)) {
          Store.deleteCategory(cat.id);
          renderSettings();
        }
      });
      dom.categoryList.appendChild(li);
    });
  }

  // -- Modal --
  function buildPalette() {
    dom.colorPalette.innerHTML = '';
    COLOR_PALETTE.forEach(color => {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color;
      if (color === selectedColor) swatch.classList.add('selected');
      swatch.addEventListener('click', () => {
        selectedColor = color;
        dom.colorPalette.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      dom.colorPalette.appendChild(swatch);
    });
  }

  function openModal(cat) {
    editingCategoryId = cat ? cat.id : null;
    dom.modalTitle.textContent = cat ? 'カテゴリ編集' : 'カテゴリ追加';
    dom.inputCatName.value = cat ? cat.name : '';
    selectedColor = cat ? cat.color : COLOR_PALETTE[0];
    buildPalette();
    dom.modal.classList.remove('hidden');
    dom.inputCatName.focus();
  }

  function closeModal() {
    dom.modal.classList.add('hidden');
    editingCategoryId = null;
  }

  dom.btnAddCategory.addEventListener('click', () => openModal(null));
  dom.btnModalCancel.addEventListener('click', closeModal);

  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  });

  dom.btnModalSave.addEventListener('click', () => {
    const name = dom.inputCatName.value.trim();
    if (!name) {
      alert('カテゴリ名を入力してください。');
      return;
    }
    if (editingCategoryId) {
      Store.updateCategory(editingCategoryId, name, selectedColor);
    } else {
      Store.addCategory(name, selectedColor);
    }
    closeModal();
    renderSettings();
    renderCounter();
  });

  // -- CSV Export --
  dom.btnExportCsv.addEventListener('click', () => {
    const entries = Store.getEntries();
    const catMap = Store.getCategoryMap();
    if (entries.length === 0) {
      alert('エクスポートするデータがありません。');
      return;
    }

    const rows = [['日時', 'カテゴリ', 'カテゴリID']];
    entries
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(e => {
        const d = new Date(e.timestamp);
        const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${formatTime(e.timestamp)}`;
        const cat = catMap[e.categoryId];
        rows.push([dateStr, cat ? cat.name : '(削除済み)', e.categoryId]);
      });

    const bom = '\uFEFF';
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `front_counter_${formatFileDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function formatFileDate(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  // -- Clear Data --
  dom.btnClearData.addEventListener('click', () => {
    if (!confirm('全データを削除しますか？この操作は取り消せません。')) return;
    if (!confirm('本当に削除しますか？')) return;
    Store.clearAll();
    Store.seedIfEmpty();
    timelineDate = todayStart();
    showView(currentView);
  });

  // ============================================================
  // Utility
  // ============================================================
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ============================================================
  // Init
  // ============================================================
  Store.seedIfEmpty();
  showView('counter');

})();
