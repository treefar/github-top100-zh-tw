(() => {
  'use strict';

  const state = {
    data: null,
    items: [],
    query: '',
    filter: 'all',
    category: 'all',
    sort: 'rank',
    view: localStorage.getItem('gh-top100-view') || 'cards',
    favorites: new Set(JSON.parse(localStorage.getItem('gh-top100-favorites') || '[]')),
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const formatNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('zh-TW').format(number);
  };

  const formatCompactNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}k`;
    return String(number);
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const daysSince = (value) => {
    if (!value) return null;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  };

  const isLearning = (item) => /教材|清單|課程|論文|指南|筆記|倡議/.test(item.category || '');
  const isAI = (item) => /AI|LLM|Agent|模型|生成式|提示/.test(`${item.category || ''} ${item.summary_zh || ''}`);
  const isInstallable = (item) => {
    if (isLearning(item)) return false;
    if (item.grade === 'D') return false;
    if (/不需安裝|收藏|不適用|不建議/.test(item.install_action || '')) return false;
    return /工具|平台|框架|函式庫|引擎|介面|Agent|AI|編輯器|執行器|自動化|遠端|代理/.test(item.category || '') || ['A', 'B'].includes(item.grade);
  };
  const isResearch = (item) => Number(item.fit_score) >= 4 && /研究|AI|模型|教材|課程|遊戲|資料|視覺化|文件|白板|Android|本機/.test(`${item.category || ''} ${item.use_case_zh || ''} ${item.personal_reason || ''}`);
  const isPersonalPick = (item) => Number(item.fit_score) >= 5;
  const isHighlyRelevant = (item) => Number(item.fit_score) === 4;
  const archiveUrl = (item) => `https://github.com/${item.full_name}/archive/HEAD.zip`;
  const cloneCommand = (item) => `git clone ${item.html_url}.git`;

  async function loadData() {
    let data = null;
    try {
      const response = await fetch(`data/top100.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch (error) {
      console.info('使用內建資料快照：', error.message);
      data = window.__INITIAL_DATA__ || null;
    }
    if (!data || !Array.isArray(data.items)) {
      throw new Error('找不到有效排行資料。');
    }
    state.data = data;
    state.items = data.items;
    return data;
  }

  function countBy(predicate) {
    return state.items.filter(predicate).length;
  }

  function updateSidebarCounts() {
    const counts = {
      all: state.items.length,
      personal: countBy(isPersonalPick),
      A: countBy((item) => item.grade === 'A'),
      B: countBy((item) => item.grade === 'B'),
      C: countBy((item) => item.grade === 'C'),
      D: countBy((item) => item.grade === 'D'),
      installable: countBy(isInstallable),
      ai: countBy(isAI),
      learning: countBy(isLearning),
      research: countBy(isResearch),
      favorites: state.favorites.size,
    };
    Object.entries(counts).forEach(([key, value]) => {
      const element = document.querySelector(`[data-count="${key}"]`);
      if (element) element.textContent = value;
    });
  }

  function renderMeta() {
    const meta = state.data.meta || {};
    const gradeCounts = meta.grade_counts || {
      A: countBy((item) => item.grade === 'A'),
      B: countBy((item) => item.grade === 'B'),
      C: countBy((item) => item.grade === 'C'),
      D: countBy((item) => item.grade === 'D'),
    };

    $('#data-status').textContent = meta.data_status || '每日自動更新';
    $('#snapshot-label').textContent = meta.ranking_snapshot_date
      ? `排行快照 ${meta.ranking_snapshot_date}`
      : `更新 ${formatDateTime(meta.generated_at)}`;
    $('#sidebar-update').textContent = `更新：${formatDateTime(meta.generated_at)}`;
    $('#footer-generated').textContent = `資料更新 ${formatDateTime(meta.generated_at)}`;
    const methodology = meta.methodology || '依累積 Stars 排序，再加入個人需求判讀。';
    $('#methodology-text').textContent = `${methodology} ZIP 適合先查看內容；要持續更新則建議使用 git clone。不要因為上榜就一次下載全部 100 項。`;

    $('#kpi-total').textContent = formatNumber(state.items.length);
    $('#kpi-a').textContent = formatNumber(gradeCounts.A || 0);
    $('#kpi-b').textContent = formatNumber(gradeCounts.B || 0);
    $('#kpi-personal').textContent = formatNumber(countBy(isPersonalPick));

    const total = Math.max(1, state.items.length);
    const labels = {
      A: ['立即／保留', 'var(--green)'],
      B: ['專案按需', 'var(--amber)'],
      C: ['收藏／暫緩', 'var(--purple)'],
      D: ['不建議', 'var(--red)'],
    };
    $('#grade-bar').innerHTML = ['A', 'B', 'C', 'D'].map((grade) => {
      const count = Number(gradeCounts[grade] || 0);
      return `<span class="${grade}" style="width:${(count / total) * 100}%" title="${grade}：${count}"></span>`;
    }).join('');
    $('#grade-legend').innerHTML = ['A', 'B', 'C', 'D'].map((grade) => {
      const count = Number(gradeCounts[grade] || 0);
      return `<div class="legend-item">
        <div class="legend-head"><i style="background:${labels[grade][1]}"></i>${grade} · ${labels[grade][0]}</div>
        <strong>${formatNumber(count)}</strong>
      </div>`;
    }).join('');
    $('#grade-summary').textContent = `A＋B 共 ${formatNumber((gradeCounts.A || 0) + (gradeCounts.B || 0))} 項`;

    renderTopBars();
    renderPersonalPicks();
    updateSidebarCounts();
  }

  function renderPersonalPicks() {
    const picks = state.items
      .filter(isPersonalPick)
      .sort((a, b) => a.rank - b.rank);
    $('#personal-picks').innerHTML = picks.map((item) => `
      <button class="personal-pick" type="button" data-focus-repo="${escapeHtml(item.full_name)}">
        <span class="personal-pick-rank">#${item.rank}</span>
        <span class="personal-pick-copy">
          <strong>${escapeHtml(item.name || item.full_name)}</strong>
          <small>${escapeHtml(item.category || '未分類')}</small>
        </span>
        <span class="personal-pick-score">5／5</span>
      </button>
    `).join('');
  }

  function renderTopBars() {
    const top = [...state.items].sort((a, b) => a.rank - b.rank).slice(0, 5);
    const max = Math.max(...top.map((item) => Number(item.stars || 0)), 1);
    $('#top-bars').innerHTML = top.map((item) => `
      <div class="top-bar-row">
        <span class="top-bar-rank">#${item.rank}</span>
        <span class="top-bar-name" title="${escapeHtml(item.full_name)}">${escapeHtml(item.full_name)}</span>
        <span class="top-bar-track"><span class="top-bar-fill" style="width:${Math.max(4, (Number(item.stars || 0) / max) * 100)}%"></span></span>
        <span class="top-bar-value">${formatCompactNumber(item.stars)}</span>
      </div>
    `).join('');
  }

  function populateCategories() {
    const select = $('#category-select');
    const categories = [...new Set(state.items.map((item) => item.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.append(option);
    });
  }

  function matchesFilter(item) {
    switch (state.filter) {
      case 'personal': return isPersonalPick(item);
      case 'A':
      case 'B':
      case 'C':
      case 'D': return item.grade === state.filter;
      case 'installable': return isInstallable(item);
      case 'ai': return isAI(item);
      case 'learning': return isLearning(item);
      case 'research': return isResearch(item);
      case 'favorites': return state.favorites.has(item.full_name);
      default: return true;
    }
  }

  function getVisibleItems() {
    const normalizedQuery = state.query.trim().toLocaleLowerCase('zh-Hant');
    const filtered = state.items.filter((item) => {
      if (!matchesFilter(item)) return false;
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        item.full_name,
        item.summary_zh,
        item.use_case_zh,
        item.caution_zh,
        item.category,
        item.install_action,
        item.personal_reason,
        item.language,
        ...(item.topics || []),
      ].filter(Boolean).join(' ').toLocaleLowerCase('zh-Hant');
      return haystack.includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      switch (state.sort) {
        case 'stars': return Number(b.stars || 0) - Number(a.stars || 0) || a.rank - b.rank;
        case 'fit': return Number(b.fit_score || 0) - Number(a.fit_score || 0) || a.rank - b.rank;
        case 'change': return Number(b.rank_change || 0) - Number(a.rank_change || 0) || a.rank - b.rank;
        case 'name': return a.full_name.localeCompare(b.full_name, 'en');
        default: return a.rank - b.rank;
      }
    });
  }

  function rankChangeMarkup(item) {
    if (item.is_new) return '<span class="rank-change new">NEW</span>';
    const change = Number(item.rank_change || 0);
    if (change > 0) return `<span class="rank-change up">↑ ${change}</span>`;
    if (change < 0) return `<span class="rank-change down">↓ ${Math.abs(change)}</span>`;
    return '<span class="rank-change same">—</span>';
  }

  function fitMarkup(score) {
    const value = Math.max(0, Math.min(5, Number(score || 0)));
    return `<span class="fit-meter" title="適配度 ${value}/5">${[1,2,3,4,5].map((index) => `<i class="${index <= value ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function metricIcon(type) {
    const icons = {
      star: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.4 6.3-.9L12 2.8Z"/></svg>',
      fork: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="6" cy="5" r="2.3"/><circle cx="18" cy="5" r="2.3"/><circle cx="12" cy="19" r="2.3"/><path d="M6 7.3v2.3c0 2.2 1.8 4 4 4h2m6-6.3v2.3c0 2.2-1.8 4-4 4h-2V16.7"/></svg>',
      code: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8.5 5-6 7 6 7m7-14 6 7-6 7M14 3l-4 18"/></svg>',
      license: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5M10 12h6m-6 4h6"/></svg>',
      clock: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
      issue: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.2v6M12 17h.01"/></svg>',
    };
    return icons[type] || '';
  }

  function renderCard(item) {
    const favorite = state.favorites.has(item.full_name);
    const topics = (item.topics || []).slice(0, 7);
    const pushedDays = daysSince(item.pushed_at);
    const activityLabel = pushedDays == null
      ? '尚無更新資料'
      : pushedDays === 0 ? '今日有推送' : `${formatNumber(pushedDays)} 天前推送`;
    const starsChange = Number(item.stars_change || 0);
    const starsDelta = starsChange > 0 ? ` <span class="stars-delta">＋${formatNumber(starsChange)}</span>` : '';
    const keyPoints = Array.isArray(item.key_points_zh) && item.key_points_zh.length
      ? item.key_points_zh
      : [item.summary_zh, item.use_case_zh, `採用判斷：${item.install_action}`].filter(Boolean);
    const personalPick = isPersonalPick(item);
    const highlyRelevant = isHighlyRelevant(item);

    return `
      <article class="repo-card ${personalPick ? 'is-personal-pick' : ''}" data-repo="${escapeHtml(item.full_name)}">
        <div class="rank-cell">
          <span class="rank-label">RANK</span>
          <strong class="rank-number">${item.rank}</strong>
          ${rankChangeMarkup(item)}
        </div>
        <div class="repo-content">
          <div class="repo-topline">
            <div class="repo-identity">
              <div class="repo-name-line">
                <a class="repo-link" href="${escapeHtml(item.html_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.full_name)}</a>
              </div>
              <div class="repo-owner">${escapeHtml(item.owner || '')}${item.archived ? ' · 已封存' : ''}</div>
            </div>
            <div class="repo-actions">
              <button class="icon-button copy-button" type="button" data-copy="${escapeHtml(item.html_url)}" aria-label="複製 GitHub 連結" title="複製連結">
                <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
              </button>
              <button class="icon-button favorite-button ${favorite ? 'is-favorite' : ''}" type="button" data-favorite="${escapeHtml(item.full_name)}" aria-label="${favorite ? '取消收藏' : '加入收藏'}" title="${favorite ? '取消收藏' : '加入收藏'}">
                <svg class="star-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.4 6.3-.9L12 2.8Z"/></svg>
              </button>
            </div>
          </div>

          <div class="badge-row">
            ${personalPick ? '<span class="badge personal-pick-badge">★ 老師精選</span>' : ''}
            ${highlyRelevant ? '<span class="badge relevant-badge">高度相關</span>' : ''}
            <span class="badge grade-${escapeHtml(item.grade)}">${escapeHtml(item.grade)}｜${escapeHtml(item.grade_label || '')}</span>
            <span class="badge category">${escapeHtml(item.category || '未分類')}</span>
            <span class="badge action">${escapeHtml(item.install_action || '待判讀')}</span>
            ${item.is_new ? '<span class="badge new-entry">新進榜</span>' : ''}
          </div>

          <p class="repo-summary">${escapeHtml(item.summary_zh || item.description_zh || item.description || '尚無繁中摘要。')}</p>

          ${personalPick || highlyRelevant ? `
            <div class="personal-reason ${personalPick ? 'priority' : ''}">
              <span>${personalPick ? '為您特別標示' : '與您的工作高度相關'}</span>
              <p>${escapeHtml(item.personal_reason || '符合目前工作方向。')}</p>
            </div>
          ` : ''}

          <div class="repo-cta-row" aria-label="${escapeHtml(item.full_name)} 下載與開啟選項">
            <a class="repo-cta download" href="${escapeHtml(archiveUrl(item))}" target="_blank" rel="noreferrer" download>下載 ZIP</a>
            <button class="repo-cta" type="button" data-clone="${escapeHtml(cloneCommand(item))}">複製 git clone</button>
            <a class="repo-cta ghost" href="${escapeHtml(item.html_url)}" target="_blank" rel="noreferrer">查看 GitHub 說明 ↗</a>
          </div>

          <div class="repo-metrics">
            <span class="metric">${metricIcon('star')}<strong>${formatNumber(item.stars)}</strong> Stars${starsDelta}</span>
            ${item.forks != null ? `<span class="metric">${metricIcon('fork')}<strong>${formatNumber(item.forks)}</strong> Forks</span>` : ''}
            ${item.language ? `<span class="metric">${metricIcon('code')}<strong>${escapeHtml(item.language)}</strong></span>` : ''}
            <span class="metric">${metricIcon('license')}<strong>${escapeHtml(item.license || '授權待確認')}</strong></span>
            ${item.open_issues != null ? `<span class="metric issue-metric">${metricIcon('issue')}<strong>${formatNumber(item.open_issues)}</strong> Issues</span>` : ''}
            <span class="metric updated-metric">${metricIcon('clock')}<strong>${escapeHtml(activityLabel)}</strong></span>
            <span class="metric"><span>適配度</span>${fitMarkup(item.fit_score)}<strong>${Number(item.fit_score || 0)}/5</strong></span>
          </div>

          <details class="repo-details">
            <summary>展開重點與判讀</summary>
            <ul class="key-points">
              ${keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}
            </ul>
            <div class="detail-grid">
              <div class="detail-box">
                <h4>適合情境</h4>
                <p>${escapeHtml(item.use_case_zh || '依專案需求評估。')}</p>
              </div>
              <div class="detail-box">
                <h4>針對您的判讀</h4>
                <p>${escapeHtml(item.personal_reason || '先確認是否補上現有工作流缺口。')}</p>
              </div>
              <div class="detail-box">
                <h4>注意事項</h4>
                <p>${escapeHtml(item.caution_zh || '使用前檢查授權、安全與維護狀態。')}</p>
              </div>
            </div>
            ${topics.length ? `<div class="topic-row">${topics.map((topic) => `<span class="topic">${escapeHtml(topic)}</span>`).join('')}</div>` : ''}
          </details>
        </div>
      </article>
    `;
  }

  function filterTitle() {
    const titles = {
      all: '全部排行',
      personal: '老師精選｜個人適配度 5／5',
      A: 'A 級｜立即採用／保留',
      B: 'B 級｜專案按需',
      C: 'C 級｜收藏／暫緩',
      D: 'D 級｜不建議',
      installable: '可安裝工具',
      ai: 'AI／Agent 專案',
      learning: '教材／清單',
      research: '研究／教學適用',
      favorites: '我的收藏',
    };
    return titles[state.filter] || '排行結果';
  }

  function renderList() {
    const items = getVisibleItems();
    const list = $('#repo-list');
    list.classList.toggle('compact', state.view === 'compact');
    list.setAttribute('aria-busy', 'false');
    $('#results-title').textContent = state.category === 'all' ? filterTitle() : `${filterTitle()} · ${state.category}`;
    $('#results-count').textContent = `顯示 ${formatNumber(items.length)}／${formatNumber(state.items.length)} 項`;

    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><strong>沒有符合條件的專案</strong><p>可清除搜尋字詞、類別或快速篩選後再查看。</p></div>`;
      return;
    }
    list.innerHTML = items.map(renderCard).join('');
  }

  function persistFavorites() {
    localStorage.setItem('gh-top100-favorites', JSON.stringify([...state.favorites]));
    updateSidebarCounts();
  }

  function showToast(message) {
    let toast = $('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
  }

  function exportCsv() {
    const visible = getVisibleItems();
    const headers = ['排名', 'Repository', 'Stars', '名次變化', '性質', '繁中功能摘要', '安裝判斷', '適配度', '分級', '針對您的理由', '注意事項', 'GitHub URL', 'ZIP 下載'];
    const rows = visible.map((item) => [
      item.rank,
      item.full_name,
      item.stars,
      item.rank_change || 0,
      item.category,
      item.summary_zh,
      item.install_action,
      item.fit_score,
      item.grade,
      item.personal_reason,
      item.caution_zh,
      item.html_url,
      archiveUrl(item),
    ]);
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = '\ufeff' + [headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `github-top100-zh-tw-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${visible.length} 項 CSV`);
  }

  function exportFavoritesScript() {
    const favorites = state.items
      .filter((item) => state.favorites.has(item.full_name))
      .sort((a, b) => a.rank - b.rank);
    if (!favorites.length) {
      showToast('請先用星號收藏要下載的專案');
      return;
    }

    const commands = favorites.map((item) => {
      const folderName = item.full_name.replace('/', '--');
      return `git clone ${item.html_url}.git "${folderName}"`;
    });
    const script = [
      '# GitHub 前百大收藏下載腳本',
      '# 請先安裝 Git；腳本會在目前位置建立「GitHub-收藏下載」。',
      "$target = Join-Path (Get-Location) 'GitHub-收藏下載'",
      'New-Item -ItemType Directory -Force -Path $target | Out-Null',
      'Set-Location -LiteralPath $target',
      '',
      ...commands,
      '',
      `Write-Host '完成：已處理 ${favorites.length} 個收藏專案。'`,
    ].join('\r\n');
    const blob = new Blob(['\ufeff' + script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `github-top100-favorites-${new Date().toISOString().slice(0, 10)}.ps1`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`已產生 ${favorites.length} 項收藏下載腳本`);
  }

  function activatePersonalFilter() {
    state.filter = 'personal';
    state.category = 'all';
    state.query = '';
    $('#category-select').value = 'all';
    $('#search-input').value = '';
    $$('.nav-button').forEach((element) => {
      element.classList.toggle('is-active', element.dataset.filter === 'personal');
    });
    renderList();
    $('.results-header').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function focusRepo(fullName) {
    state.filter = 'all';
    state.category = 'all';
    state.query = fullName;
    $('#category-select').value = 'all';
    $('#search-input').value = fullName;
    $$('.nav-button').forEach((element) => {
      element.classList.toggle('is-active', element.dataset.filter === 'all');
    });
    renderList();
    const card = document.querySelector(`[data-repo="${CSS.escape(fullName)}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bindEvents() {
    $('.filter-nav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      $$('.nav-button').forEach((element) => element.classList.toggle('is-active', element === button));
      renderList();
      if (window.innerWidth < 881) $('#main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#search-input').addEventListener('input', (event) => {
      state.query = event.target.value;
      renderList();
    });
    $('#category-select').addEventListener('change', (event) => {
      state.category = event.target.value;
      renderList();
    });
    $('#sort-select').addEventListener('change', (event) => {
      state.sort = event.target.value;
      renderList();
    });
    $('.view-toggle').addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      state.view = button.dataset.view;
      localStorage.setItem('gh-top100-view', state.view);
      $$('.view-toggle button').forEach((element) => element.classList.toggle('is-active', element === button));
      renderList();
    });

    $('#repo-list').addEventListener('click', async (event) => {
      const favoriteButton = event.target.closest('[data-favorite]');
      if (favoriteButton) {
        const repo = favoriteButton.dataset.favorite;
        if (state.favorites.has(repo)) {
          state.favorites.delete(repo);
          showToast(`已取消收藏 ${repo}`);
        } else {
          state.favorites.add(repo);
          showToast(`已收藏 ${repo}`);
        }
        persistFavorites();
        renderList();
        return;
      }

      const copyButton = event.target.closest('[data-copy]');
      if (copyButton) {
        try {
          await navigator.clipboard.writeText(copyButton.dataset.copy);
          showToast('已複製 GitHub 連結');
        } catch {
          const temporary = document.createElement('textarea');
          temporary.value = copyButton.dataset.copy;
          document.body.append(temporary);
          temporary.select();
          document.execCommand('copy');
          temporary.remove();
          showToast('已複製 GitHub 連結');
        }
        return;
      }

      const cloneButton = event.target.closest('[data-clone]');
      if (cloneButton) {
        try {
          await navigator.clipboard.writeText(cloneButton.dataset.clone);
        } catch {
          const temporary = document.createElement('textarea');
          temporary.value = cloneButton.dataset.clone;
          document.body.append(temporary);
          temporary.select();
          document.execCommand('copy');
          temporary.remove();
        }
        showToast('已複製 git clone 指令');
      }
    });

    $('#personal-picks').addEventListener('click', (event) => {
      const button = event.target.closest('[data-focus-repo]');
      if (button) focusRepo(button.dataset.focusRepo);
    });

    $('#show-personal-picks').addEventListener('click', activatePersonalFilter);
    $('#show-all-personal').addEventListener('click', activatePersonalFilter);
    $('#export-favorites').addEventListener('click', exportFavoritesScript);
    $('#export-csv').addEventListener('click', exportCsv);

    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        $('#search-input').focus();
      }
      if (event.key === 'Escape' && document.activeElement === $('#search-input')) {
        $('#search-input').value = '';
        state.query = '';
        renderList();
        $('#search-input').blur();
      }
    });
  }

  function setInitialView() {
    $$('.view-toggle button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === state.view);
    });
  }

  async function init() {
    try {
      await loadData();
      renderMeta();
      populateCategories();
      setInitialView();
      bindEvents();
      renderList();
    } catch (error) {
      console.error(error);
      $('#repo-list').setAttribute('aria-busy', 'false');
      $('#repo-list').innerHTML = `<div class="empty-state"><strong>資料載入失敗</strong><p>${escapeHtml(error.message)} 請確認 data/top100.json 或 assets/initial-data.js 是否存在。</p></div>`;
      $('#data-status').textContent = '資料載入失敗';
    }
  }

  init();
})();
