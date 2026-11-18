/* ClipDeck renderer — ledger index + paper receipt, vanilla and in sync with the main process. */
(function () {
  'use strict';

  const api = window.clipdeck;
  const Icons = window.Icons || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const icon = (name) => {
    const node = el('span', 'ico');
    node.innerHTML = Icons[name] || '';
    return node;
  };

  const stage = $('#stage');
  const deck = $('#deck');
  const empty = $('#empty');
  const noResults = $('#noResults');
  const noQuery = $('#noQuery');
  const clearFilters = $('#clearFilters');
  const stack = $('#stack');
  const stackScroll = $('#stackScroll');
  const chips = $('#chips');
  const tabInk = $('#tabInk');
  const search = $('#search');
  const searchClear = $('#searchClear');
  const slashHint = $('#slashHint');
  const clipCount = $('#clipCount');
  const livePill = $('#livePill');
  const liveLabel = $('#liveLabel');
  const loginToggle = $('#loginToggle');
  const loginLabel = $('#loginLabel');
  const hotkeyText = $('#hotkeyText');
  const ver = $('#ver');
  const toastZone = $('#toastZone');
  const receiptWrap = $('#receiptWrap');
  const receipt = $('#receipt');

  const filters = [
    { id: 'all', label: 'Everything' },
    { id: 'text', label: 'Text' },
    { id: 'links', label: 'Links' },
    { id: 'images', label: 'Images' },
    { id: 'pinned', label: 'Pinned' },
  ];

  const state = {
    items: [],
    filter: 'all',
    query: '',
    activeId: null,
    receiptId: null,
    paused: false,
    launchAtLogin: false,
    shortcut: 'Ctrl+Alt+V',
    version: '1.0.0',
    platform: 'win32',
    isOpen: false,
    copying: false,
    deleting: false,
    shownCount: -1,
  };

  let previewTimer = 0;
  let closeTimer = 0;

  /* ------------------------------------------------------------
     small helpers
     ------------------------------------------------------------ */

  function relativeTime(timestamp) {
    const then = Number(timestamp) || Date.now();
    const diff = Math.max(0, Date.now() - then);
    if (diff < 45 * 1000) return 'just now';
    if (diff < 60 * 1000) return `${Math.max(1, Math.round(diff / 1000))}s`;
    if (diff < 3600 * 1000) return `${Math.round(diff / 60000)}m`;
    if (diff < 86400 * 1000) return `${Math.round(diff / 3600000)}h`;
    if (diff < 7 * 86400 * 1000) return `${Math.round(diff / 86400000)}d`;
    try {
      return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function shortNumber(n) {
    if (n < 1000) return String(n);
    if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
    return `${(n / 1000000).toFixed(1)}m`;
  }

  function isUrl(text) {
    const value = (text || '').trim();
    if (!value || /\s/.test(value)) return false;
    if (!/^(https?:\/\/|www\.)/i.test(value)) return false;
    try {
      const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
      return url.hostname.includes('.');
    } catch {
      return false;
    }
  }

  function looksLikeCode(text) {
    const value = (text || '').trim();
    if (value.length < 14) return false;
    const signals = [
      /[{};]\s*$/m,
      /^\s*(const|let|var|function|class|import|export|def|fn|SELECT|npm|git|yarn|pnpm)\b/m,
      /=>|<\/?[a-z][\w-]*[\s>]/i,
      /^\s*[.#][\w-]+\s*\{/m,
      /^\s*<[a-z][\w-]*(\s|>)/im,
    ];
    const hits = signals.reduce((sum, pattern) => sum + (pattern.test(value) ? 1 : 0), 0);
    return hits > 0 && (value.includes('\n') || /=>|;\s*$|[{}]/.test(value));
  }

  function classify(item) {
    if (!item) return { key: 'text', label: 'Text', icon: 'text' };
    if (item.kind === 'image') return { key: 'image', label: 'Image', icon: 'image' };
    const text = item.text || '';
    if (isUrl(text)) return { key: 'link', label: 'Link', icon: 'link' };
    if (looksLikeCode(text)) return { key: 'text', label: 'Code', icon: 'code' };
    if (text.includes('\n')) return { key: 'text', label: 'Note', icon: 'text' };
    return { key: 'text', label: 'Text', icon: 'text' };
  }

  function matchesQuery(item) {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    const type = classify(item);
    const haystack = [item.text || '', type.label, item.kind];
    if (item.kind === 'image') haystack.push('image screenshot picture', `${item.width}x${item.height}`);
    return haystack.join(' ').toLowerCase().includes(query);
  }

  function filterKey(id) {
    if (id === 'links') return 'link';
    if (id === 'images') return 'image';
    return id;
  }

  function visibleItems() {
    const matching = state.items.filter(matchesQuery);
    if (state.filter === 'pinned') return matching.filter((item) => item.pinned);
    if (state.filter === 'all') return matching;
    return matching.filter((item) => classify(item).key === filterKey(state.filter));
  }

  function countFor(filterId) {
    const list = state.items.filter(matchesQuery);
    if (filterId === 'all') return list.length;
    if (filterId === 'pinned') return list.filter((item) => item.pinned).length;
    return list.filter((item) => classify(item).key === filterKey(filterId)).length;
  }

  function listSignature(items) {
    return items
      .map((item) => `${item.id}:${item.pinned ? 1 : 0}:${item.createdAt}:${(item.text || '').length}`)
      .join('|');
  }

  /* ------------------------------------------------------------
     tabs
     ------------------------------------------------------------ */

  function buildChips() {
    const nodes = filters.map((filter) => {
      const button = el('button', 'tab');
      button.type = 'button';
      button.dataset.filter = filter.id;
      button.setAttribute('role', 'tab');
      button.append(el('span', 'tab-label', filter.label));
      button.append(el('span', 'n', '0'));
      button.addEventListener('click', () => {
        if (state.filter === filter.id) return;
        state.filter = filter.id;
        if (state.query) {
          state.query = '';
          search.value = '';
          searchClear.hidden = true;
          slashHint.hidden = false;
        }
        state.activeId = null;
        renderAll({ animate: true });
        search.focus({ preventScroll: true });
      });
      return button;
    });
    chips.replaceChildren(...nodes);
  }

  function positionTabInk() {
    const active = chips.querySelector('.tab.is-active');
    if (!active || active.offsetParent === null) {
      tabInk.style.width = '0px';
      return;
    }
    tabInk.style.width = `${active.offsetWidth}px`;
    tabInk.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  function syncChips() {
    for (const tab of chips.children) {
      const id = tab.dataset.filter;
      tab.classList.toggle('is-active', id === state.filter);
      tab.setAttribute('aria-selected', String(id === state.filter));
      const badge = tab.querySelector('.n');
      if (badge) badge.textContent = String(countFor(id));
    }
    positionTabInk();
  }

  function syncCounts() {
    const total = state.items.length;
    const label = String(total).padStart(2, '0');
    if (clipCount.textContent !== label) {
      clipCount.textContent = label;
      clipCount.classList.remove('is-bumping');
      void clipCount.offsetWidth;
      clipCount.classList.add('is-bumping');
    }
    state.shownCount = total;
  }

  /* ------------------------------------------------------------
     ledger rows
     ------------------------------------------------------------ */

  function clipRow(item, index) {
    const type = classify(item);
    const row = el('div', 'clip');
    row.dataset.id = item.id;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(item.id === state.activeId));
    row.style.setProperty('--i', String(Math.min(index, 9)));
    if (item.id === state.activeId) row.classList.add('is-active');

    row.append(el('span', 'idx', String(index + 1).padStart(2, '0')));

    const lead = el('span', 'lead');
    if (item.kind === 'image' && item.thumb) {
      const img = document.createElement('img');
      img.src = item.thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      lead.append(img);
    } else {
      lead.append(icon(type.icon));
    }
    row.append(lead);

    const content = el('span', 'content');
    if (item.kind === 'image') {
      content.textContent = item.width && item.height ? `Image ${item.width} × ${item.height}` : 'Image';
    } else {
      const compact = (item.text || '').replace(/\s+/g, ' ').trim();
      content.textContent = compact || 'Empty clip';
    }
    content.title = item.kind === 'image' ? 'Image clip' : (item.text || '').slice(0, 400);
    row.append(content);

    row.append(el('span', 'type', type.label.toUpperCase()));

    const age = el('span', 'age', relativeTime(item.createdAt));
    age.dataset.time = String(item.createdAt);
    row.append(age);

    const actions = el('span', 'actions');
    const pinButton = el('button', 'mini' + (item.pinned ? ' is-on' : ''));
    pinButton.type = 'button';
    pinButton.dataset.act = 'pin';
    pinButton.title = item.pinned ? 'Unpin' : 'Pin';
    pinButton.setAttribute('aria-label', pinButton.title);
    pinButton.append(icon('pin'));

    const deleteButton = el('button', 'mini');
    deleteButton.type = 'button';
    deleteButton.dataset.act = 'delete';
    deleteButton.title = 'Delete';
    deleteButton.setAttribute('aria-label', 'Delete clip');
    deleteButton.append(icon('trash'));

    actions.append(pinButton, deleteButton);
    row.append(actions);

    return row;
  }

  function renderList(visible, animate) {
    stack.dataset.animate = animate ? 'on' : 'off';
    const fragment = document.createDocumentFragment();
    visible.forEach((item, index) => fragment.append(clipRow(item, index)));
    stack.replaceChildren(fragment);
    if (animate) stackScroll.scrollTop = 0;
  }

  function syncActiveClasses() {
    for (const row of stack.children) {
      const active = row.dataset.id === state.activeId;
      row.classList.toggle('is-active', active);
      row.setAttribute('aria-selected', String(active));
    }
  }

  /* ------------------------------------------------------------
     paper receipt
     ------------------------------------------------------------ */

  function renderReceipt(item, animateSwap) {
    if (!item) {
      state.receiptId = null;
      receipt.replaceChildren();
      return;
    }

    const changed = item.id !== state.receiptId;
    state.receiptId = item.id;
    const type = classify(item);
    const visible = visibleItems();
    const index = visible.findIndex((entry) => entry.id === item.id);

    receipt.classList.remove('is-copied', 'is-leaving');

    const left = el('div', 'receipt-main');
    const meta = el('div', 'receipt-meta');
    meta.append(el('span', 'receipt-no', `NO. ${index >= 0 ? String(index + 1).padStart(2, '0') : '--'}`));
    meta.append(el('span', 'receipt-sep', '/'));
    meta.append(el('span', '', type.label.toUpperCase()));
    meta.append(el('span', 'receipt-sep', '/'));
    meta.append(
      el(
        'span',
        '',
        item.kind === 'image'
          ? item.width && item.height
            ? `${item.width} × ${item.height}`
            : 'IMAGE'
          : `${shortNumber(item.chars || (item.text || '').length)} CHARS`,
      ),
    );
    meta.append(el('span', 'receipt-sep', '/'));
    const age = el('span', 'receipt-age', relativeTime(item.createdAt));
    age.dataset.time = String(item.createdAt);
    meta.append(age);
    left.append(meta);

    if (item.kind === 'image') {
      const media = el('div', 'receipt-image');
      const img = document.createElement('img');
      img.src = item.thumb || item.full || '';
      img.alt = 'Clipboard image';
      img.draggable = false;
      img.decoding = 'async';
      const caption = el('div', 'receipt-caption');
      caption.append(el('span', 'receipt-caption-title', 'Image capture'));
      caption.append(
        el(
          'span',
          'receipt-caption-meta',
          `${formatBytes(item.bytes) || 'image'}${item.width && item.height ? ` · ${item.width} × ${item.height}` : ''}`,
        ),
      );
      media.append(img, caption);
      left.append(media);
    } else {
      const text = el('p', 'receipt-text' + (looksLikeCode(item.text) ? ' is-code' : ''));
      text.textContent = item.text || '';
      left.append(text);
    }

    const side = el('div', 'receipt-side');
    side.append(el('span', 'receipt-stamp', type.label.toUpperCase()));

    const actions = el('div', 'receipt-actions');

    const copyButton = el('button', 'copy-btn');
    copyButton.type = 'button';
    copyButton.append(icon('copy'), el('span', '', 'COPY'), el('kbd', '', '↵'));

    const pinButton = el('button', 'paper-btn' + (item.pinned ? ' is-on' : ''));
    pinButton.type = 'button';
    pinButton.title = item.pinned ? 'Unpin clip' : 'Pin clip';
    pinButton.setAttribute('aria-label', pinButton.title);
    pinButton.append(icon('pin'));

    const deleteButton = el('button', 'paper-btn');
    deleteButton.type = 'button';
    deleteButton.title = 'Delete clip';
    deleteButton.setAttribute('aria-label', 'Delete clip');
    deleteButton.append(icon('trash'));

    actions.append(copyButton, pinButton, deleteButton);
    side.append(actions);
    receipt.replaceChildren(left, side);

    copyButton.addEventListener('click', () => copyItem(item.id));
    pinButton.addEventListener('click', () => pinItem(item.id));
    deleteButton.addEventListener('click', () => deleteItem(item.id));

    if (animateSwap && changed) {
      left.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
  }

  /* ------------------------------------------------------------
     render everything
     ------------------------------------------------------------ */

  function renderAll(options) {
    const animate = Boolean(options && options.animate);
    const total = state.items.length;
    const visible = visibleItems();

    empty.hidden = total !== 0;
    syncCounts();
    syncChips();

    if (total === 0) {
      noResults.hidden = true;
      stackScroll.hidden = true;
      receiptWrap.hidden = true;
      stack.replaceChildren();
      receipt.replaceChildren();
      state.activeId = null;
      state.receiptId = null;
      return;
    }

    if (!visible.length) {
      noResults.hidden = false;
      stackScroll.hidden = true;
      receiptWrap.hidden = true;
      stack.replaceChildren();
      receipt.replaceChildren();
      state.activeId = null;
      state.receiptId = null;
      noQuery.textContent = state.query.trim() || filters.find((entry) => entry.id === state.filter).label.toLowerCase();
      return;
    }

    noResults.hidden = true;
    stackScroll.hidden = false;
    receiptWrap.hidden = false;

    if (!visible.some((item) => item.id === state.activeId)) state.activeId = visible[0].id;

    renderList(visible, animate);
    const active = state.items.find((item) => item.id === state.activeId) || visible[0];
    renderReceipt(active, false);
    requestAnimationFrame(positionTabInk);
  }

  /* ------------------------------------------------------------
     actions
     ------------------------------------------------------------ */

  async function copyItem(id) {
    if (state.copying || !id) return;
    state.copying = true;
    try {
      const result = await api.copy(id);
      if (!result || !result.ok) {
        toast('That clip could not be copied', 'warn');
        return;
      }
      if (Array.isArray(result.items)) state.items = result.items;

      const row = Array.from(stack.children).find((entry) => entry.dataset.id === id);
      if (row) {
        row.classList.add('is-copied');
        setTimeout(() => row.classList.remove('is-copied'), 600);
      }

      const stamp = receipt.querySelector('.receipt-stamp');
      if (stamp) {
        stamp.textContent = 'COPIED';
        stamp.classList.remove('is-stamped');
        void stamp.offsetWidth;
        stamp.classList.add('is-stamped');
      }
      receipt.classList.add('is-copied');

      setTimeout(() => {
        if (state.isOpen) api.hide();
      }, 400);
    } catch (error) {
      console.error('copy failed', error);
      toast('That clip could not be copied', 'warn');
    } finally {
      setTimeout(() => {
        state.copying = false;
      }, 300);
    }
  }

  async function pinItem(id) {
    if (!id) return;
    try {
      const result = await api.pin(id);
      if (!result || !result.ok) return;
      if (Array.isArray(result.items)) state.items = result.items;
      if (!visibleItems().some((item) => item.id === state.activeId)) {
        const remaining = visibleItems();
        state.activeId = remaining.length ? remaining[0].id : null;
      }
      renderAll({ animate: false });
      toast(result.pinned ? 'Pinned to the index' : 'Unpinned', result.pinned ? 'pin' : 'check');
    } catch (error) {
      console.error('pin failed', error);
    }
  }

  async function deleteItem(id) {
    if (!id || state.deleting) return;
    state.deleting = true;
    const row = Array.from(stack.children).find((entry) => entry.dataset.id === id);
    if (row) row.classList.add('is-removing');
    if (state.activeId === id) receipt.classList.add('is-leaving');
    await new Promise((resolve) => setTimeout(resolve, 190));
    try {
      const result = await api.remove(id);
      if (result && Array.isArray(result.items)) state.items = result.items;
      if (!visibleItems().some((item) => item.id === state.activeId)) {
        const remaining = visibleItems();
        state.activeId = remaining.length ? remaining[0].id : null;
      }
      receipt.classList.remove('is-leaving');
      renderAll({ animate: false });
      toast('Clip deleted');
    } catch (error) {
      console.error('delete failed', error);
    } finally {
      state.deleting = false;
    }
  }

  /* ------------------------------------------------------------
     stage
     ------------------------------------------------------------ */

  function openStage(reason, focusSearch) {
    clearTimeout(previewTimer);
    clearTimeout(closeTimer);
    document.body.classList.remove('is-idle');
    state.isOpen = true;
    state.query = '';
    search.value = '';
    searchClear.hidden = true;
    slashHint.hidden = false;
    state.filter = 'all';
    state.activeId = state.items[0] ? state.items[0].id : null;
    state.receiptId = null;

    renderAll({ animate: true });
    stackScroll.scrollTop = 0;
    stage.dataset.state = 'open';
    pulseLive();

    if (focusSearch !== false) {
      requestAnimationFrame(() => search.focus({ preventScroll: true }));
    } else {
      requestAnimationFrame(() => search.blur());
    }
    setTimeout(positionTabInk, 120);

    if (apiavailable('list')) {
      api
        .list()
        .then((items) => {
          if (!Array.isArray(items)) return;
          if (listSignature(items) === listSignature(state.items)) return;
          state.items = items;
          if (!items.some((item) => item.id === state.activeId)) {
            state.activeId = items[0] ? items[0].id : null;
          }
          renderAll({ animate: false });
        })
        .catch(() => {});
    }
  }

  function closeStage() {
    if (!state.isOpen) return;
    state.isOpen = false;
    state.copying = false;
    stage.dataset.state = 'closed';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (state.isOpen) return;
      if (apiavailable('concealed')) api.concealed();
      document.body.classList.add('is-idle');
      if (window.__clipdeckMock) {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
          if (!state.isOpen) openStage('preview', true);
        }, 1500);
      }
    }, 300);
  }

  function pulseLive() {
    livePill.classList.remove('is-spiking');
    void livePill.offsetWidth;
    livePill.classList.add('is-spiking');
    setTimeout(() => livePill.classList.remove('is-spiking'), 760);
  }

  function applyState(next) {
    if (!next || typeof next !== 'object') return;
    if (typeof next.paused === 'boolean') state.paused = next.paused;
    if (typeof next.launchAtLogin === 'boolean') state.launchAtLogin = next.launchAtLogin;
    if (typeof next.shortcut === 'string' && next.shortcut) state.shortcut = next.shortcut;
    if (typeof next.version === 'string' && next.version) state.version = next.version;
    if (typeof next.platform === 'string') state.platform = next.platform;

    livePill.classList.toggle('is-paused', state.paused);
    livePill.setAttribute('aria-pressed', String(state.paused));
    livePill.title = state.paused ? 'Clipboard watcher paused — click to resume' : 'Clipboard watcher — click to pause';
    liveLabel.textContent = state.paused ? 'PAUSED' : 'LIVE';

    loginToggle.setAttribute('aria-checked', String(state.launchAtLogin));
    loginLabel.textContent = state.platform === 'darwin' ? 'START AT LOGIN' : 'START WITH WINDOWS';

    hotkeyText.textContent = state.shortcut || 'TOP EDGE';
    ver.textContent = `v${state.version}${window.__clipdeckMock ? ' · PREVIEW' : ''}`;
  }

  function apiavailable(name) {
    return api && typeof api[name] === 'function';
  }

  /* ------------------------------------------------------------
     feedback
     ------------------------------------------------------------ */

  function toast(message, kind) {
    toastZone.replaceChildren();
    const node = el('div', 'toast' + (kind === 'warn' ? ' is-warn' : ''));
    node.append(el('span', '', message));
    toastZone.append(node);
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 200);
    }, 1750);
  }

  /* ------------------------------------------------------------
     active row
     ------------------------------------------------------------ */

  function setActive(id, options) {
    if (!id) return;
    if (id !== state.activeId) {
      state.activeId = id;
      syncActiveClasses();
      const item = state.items.find((entry) => entry.id === id);
      if (item) renderReceipt(item, true);
    }
    if (options && options.scroll) {
      const row = Array.from(stack.children).find((entry) => entry.dataset.id === id);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function moveActive(direction) {
    const visible = visibleItems();
    if (!visible.length) return;
    const index = visible.findIndex((item) => item.id === state.activeId);
    const next = Math.max(0, Math.min(visible.length - 1, (index < 0 ? 0 : index) + direction));
    setActive(visible[next].id, { scroll: true });
  }

  /* ------------------------------------------------------------
     events
     ------------------------------------------------------------ */

  function bind() {
    const searchIcon = $('#searchIcon');
    const closeIcon = $('#closeIcon');
    if (searchIcon) searchIcon.innerHTML = Icons.search || '';
    if (closeIcon) closeIcon.innerHTML = Icons.close || '';

    $('#closeBtn').addEventListener('click', () => api.hide());

    search.addEventListener('input', () => {
      state.query = search.value;
      searchClear.hidden = !search.value;
      slashHint.hidden = Boolean(search.value);
      state.activeId = null;
      renderAll({ animate: false });
    });

    searchClear.addEventListener('click', () => {
      search.value = '';
      state.query = '';
      searchClear.hidden = true;
      slashHint.hidden = false;
      state.activeId = null;
      renderAll({ animate: false });
      search.focus({ preventScroll: true });
    });

    clearFilters.addEventListener('click', () => {
      state.query = '';
      state.filter = 'all';
      search.value = '';
      searchClear.hidden = true;
      slashHint.hidden = false;
      state.activeId = null;
      renderAll({ animate: true });
      search.focus({ preventScroll: true });
    });

    livePill.addEventListener('click', async () => {
      const next = !state.paused;
      try {
        const result = await api.setPaused(next);
        applyState(result);
        toast(state.paused ? 'Watcher paused' : 'Watcher live', state.paused ? 'warn' : 'check');
      } catch {
        toast('Could not change the watcher', 'warn');
      }
    });

    loginToggle.addEventListener('click', async () => {
      const next = !state.launchAtLogin;
      try {
        const result = await api.setLaunchAtLogin(next);
        applyState(result);
        if (state.launchAtLogin === next) {
          toast(next ? 'Starts with Windows' : 'Autostart off');
        } else {
          toast('Windows blocked the change', 'warn');
        }
      } catch {
        toast('Could not update autostart', 'warn');
      }
    });

    stack.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const row = event.target.closest('.clip');
      if (!row) return;
      const action = event.target.closest('button[data-act]');
      if (action) {
        if (action.dataset.act === 'pin') pinItem(row.dataset.id);
        else if (action.dataset.act === 'delete') deleteItem(row.dataset.id);
        return;
      }
      copyItem(row.dataset.id);
    });

    stack.addEventListener('mouseover', (event) => {
      if (!(event.target instanceof Element)) return;
      const row = event.target.closest('.clip');
      if (row && row.dataset.id !== state.activeId) setActive(row.dataset.id);
    });

    deck.addEventListener('mouseenter', () => {
      if (apiavailable('pointer')) api.pointer(true);
    });

    deck.addEventListener('mouseleave', () => {
      if (apiavailable('pointer')) api.pointer(false);
    });

    document.addEventListener('keydown', (event) => {
      if (!state.isOpen) return;
      const inSearch = document.activeElement === search;
      const onButton = event.target instanceof Element && Boolean(event.target.closest('button'));

      if (event.key === 'Escape') {
        if (search.value) {
          search.value = '';
          state.query = '';
          searchClear.hidden = true;
          slashHint.hidden = false;
          state.activeId = null;
          renderAll({ animate: false });
        } else {
          api.hide();
        }
        event.preventDefault();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key === 'Enter' && !onButton) {
        if (state.activeId) {
          event.preventDefault();
          copyItem(state.activeId);
        }
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && !inSearch && !onButton) {
        if (state.activeId) {
          event.preventDefault();
          deleteItem(state.activeId);
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (state.activeId) pinItem(state.activeId);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key)) {
        const visible = visibleItems();
        const target = visible[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          copyItem(target.id);
        }
        return;
      }

      if (event.key === '/' && !inSearch) {
        event.preventDefault();
        search.focus({ preventScroll: true });
      }
    });

    window.addEventListener('resize', positionTabInk);
    window.addEventListener('clipdeck:mock-hide', () => closeStage());

    if (apiavailable('onReveal')) {
      api.onReveal((payload) => openStage((payload && payload.reason) || 'event', !payload || payload.focused !== false));
    }
    if (apiavailable('onConceal')) api.onConceal(() => closeStage());
    if (apiavailable('onUpdate')) {
      api.onUpdate((items) => {
        if (!Array.isArray(items)) return;
        state.items = items;
        if (!items.some((item) => item.id === state.activeId)) {
          state.activeId = items[0] ? items[0].id : null;
        }
        renderAll({ animate: false });
        pulseLive();
      });
    }
    if (apiavailable('onState')) api.onState((next) => applyState(next));

    setInterval(() => {
      if (!state.isOpen) return;
      for (const node of document.querySelectorAll('[data-time]')) {
        const timestamp = Number(node.dataset.time);
        if (timestamp) node.textContent = relativeTime(timestamp);
      }
    }, 30000);
  }

  /* ------------------------------------------------------------
     boot
     ------------------------------------------------------------ */

  async function boot() {
    buildChips();
    bind();
    stack.setAttribute('role', 'listbox');
    stack.setAttribute('aria-label', 'Clipboard clips');

    try {
      const initial = await api.getState();
      applyState(initial);
      state.items = Array.isArray(initial.items) ? initial.items : [];
      state.activeId = state.items[0] ? state.items[0].id : null;
      renderAll({ animate: true });
      if (!api.isElectron) {
        openStage('preview', true);
      } else {
        document.body.classList.add('is-idle');
      }
    } catch (error) {
      console.error('boot failed', error);
      renderAll({ animate: true });
    }

    setTimeout(() => {
      if (!state.isOpen && !api.isElectron) openStage('preview', true);
    }, 2400);
  }

  boot();
})();
