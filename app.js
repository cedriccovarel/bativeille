(() => {
  const DATA = window.BATIVEILLE_DATA || { articles: [], sources: [] };
  const PROFILE_NAME = 'Admin';
  const PROFILE_PASSWORD = 'Admin';
  const DEFAULT_FOLDERS = [
    { id: 'a-lire', name: 'À lire', articles: [] },
    { id: 'reglementaire', name: 'Réglementaire', articles: [] },
    { id: 'idees-observatoire', name: 'Idées observatoire', articles: [] }
  ];

  const state = {
    search: '',
    selectedTheme: '',
    selectedSourceType: '',
    selectedTag: '',
    selectedRegion: '',
    sourceSearch: '',
    sourcePageRegion: '',
    access: new Set(['open', 'paywall', 'pdf', 'official']),
    period: 'all',
    sort: 'date-desc',
    favoritesOnly: false,
    isAuthenticated: localStorage.getItem('bativeille-auth') === 'true',
    favorites: new Set(JSON.parse(localStorage.getItem('bativeille-favorites') || '[]')),
    folders: loadFolders()
  };

  const els = {
    searchInput: document.getElementById('searchInput'),
    resetFilters: document.getElementById('resetFilters'),
    themeList: document.getElementById('themeList'),
    sourceTypeList: document.getElementById('sourceTypeList'),
    tagCloud: document.getElementById('tagCloud'),
    regionList: document.getElementById('regionList'),
    periodFilter: document.getElementById('periodFilter'),
    sortSelect: document.getElementById('sortSelect'),
    articleGrid: document.getElementById('articleGrid'),
    newsMeta: document.getElementById('newsMeta'),
    emptyState: document.getElementById('emptyState'),
    followedSources: document.getElementById('followedSources'),
    totalDocs: document.getElementById('totalDocs'),
    favoriteCount: document.getElementById('favoriteCount'),
    favoritesToggle: document.getElementById('favoritesToggle'),
    sourceForm: document.getElementById('sourceForm'),
    sourceJsonOutput: document.getElementById('sourceJsonOutput'),
    profileButton: document.getElementById('profileButton'),
    loginModal: document.getElementById('loginModal'),
    closeLogin: document.getElementById('closeLogin'),
    loginForm: document.getElementById('loginForm'),
    loginError: document.getElementById('loginError'),
    loggedPanel: document.getElementById('loggedPanel'),
    logoutButton: document.getElementById('logoutButton'),
    favoritesManager: document.getElementById('favoritesManager'),
    folderForm: document.getElementById('folderForm'),
    favoriteFolders: document.getElementById('favoriteFolders'),
    filterMenuToggle: document.getElementById('filterMenuToggle'),
    filterMenuClose: document.getElementById('filterMenuClose'),
    filterDrawer: document.getElementById('filterDrawer'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    homeView: document.getElementById('homeView'),
    sourcesPage: document.getElementById('sourcesFollowedPage'),
    sourceSearchInput: document.getElementById('sourceSearchInput'),
    sourceRegionFilter: document.getElementById('sourceRegionFilter')
  };

  const accessLabels = {
    open: 'Accès libre',
    paywall: 'Payant',
    pdf: 'PDF',
    official: 'Officiel'
  };

  const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

  function loadFolders() {
    try {
      const raw = localStorage.getItem('bativeille-favorite-folders');
      if (!raw) return structuredClone(DEFAULT_FOLDERS);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return structuredClone(DEFAULT_FOLDERS);
      return parsed.map(folder => ({
        id: folder.id || createId(folder.name || 'dossier'),
        name: folder.name || 'Dossier sans nom',
        articles: Array.isArray(folder.articles) ? folder.articles : []
      }));
    } catch {
      return structuredClone(DEFAULT_FOLDERS);
    }
  }

  function normalize(text = '') {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function createId(text = 'dossier') {
    const base = normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'dossier';
    return `${base}-${Date.now().toString(36).slice(-5)}`;
  }

  function countBy(items, getValue) {
    return items.reduce((acc, item) => {
      const value = getValue(item);
      if (!value) return acc;
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function formatDate(dateString) {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateString));
  }

  function saveFavorites() {
    localStorage.setItem('bativeille-favorites', JSON.stringify(Array.from(state.favorites)));
  }

  function saveFolders() {
    localStorage.setItem('bativeille-favorite-folders', JSON.stringify(state.folders));
  }

  function setAuth(value) {
    state.isAuthenticated = value;
    localStorage.setItem('bativeille-auth', value ? 'true' : 'false');
    if (!value) {
      state.favoritesOnly = false;
    }
    renderAll();
  }


  function openFilterDrawer(targetId = '') {
    if (!els.filterDrawer) return;
    els.filterDrawer.classList.add('is-open');
    els.filterDrawer.setAttribute('aria-hidden', 'false');
    els.filterMenuToggle?.setAttribute('aria-expanded', 'true');
    if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = false;
    document.body.classList.add('no-scroll');
    if (targetId) {
      window.setTimeout(() => {
        const target = document.getElementById(targetId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }

  function closeFilterDrawer() {
    if (!els.filterDrawer) return;
    els.filterDrawer.classList.remove('is-open');
    els.filterDrawer.setAttribute('aria-hidden', 'true');
    els.filterMenuToggle?.setAttribute('aria-expanded', 'false');
    if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function openLogin() {
    els.loginModal.hidden = false;
    els.loginError.hidden = true;
    if (state.isAuthenticated) {
      els.loginForm.hidden = true;
      els.loggedPanel.hidden = false;
    } else {
      els.loginForm.hidden = false;
      els.loggedPanel.hidden = true;
      els.loginForm.elements.username.focus();
    }
  }

  function closeLogin() {
    els.loginModal.hidden = true;
  }

  function requireAuth(actionName = 'cette zone') {
    if (state.isAuthenticated) return true;
    openLogin();
    if (els.loginError) {
      els.loginError.hidden = false;
      els.loginError.textContent = `Connexion requise pour accéder à ${actionName}.`;
    }
    return false;
  }

  function getArticleById(id) {
    return DATA.articles.find(article => article.id === id);
  }

  function getFilteredArticles() {
    const now = new Date();
    let list = DATA.articles.filter(article => {
      const haystack = normalize([
        article.title,
        article.source,
        article.summary,
        article.premiumSummary,
        ...(article.tags || [])
      ].join(' '));

      if (state.search && !haystack.includes(normalize(state.search))) return false;
      if (state.selectedTheme && !(article.tags || []).includes(state.selectedTheme)) return false;
      if (state.selectedSourceType && article.sourceType !== state.selectedSourceType) return false;
      if (state.selectedRegion) {
        const source = DATA.sources.find(item => item.id === article.sourceId || item.name === article.source);
        const articleRegion = article.region || source?.region || 'National';
        if (articleRegion !== state.selectedRegion) return false;
      }
      if (state.selectedTag && !(article.tags || []).includes(state.selectedTag)) return false;
      if (!state.access.has(article.access)) return false;
      if (state.favoritesOnly && !state.favorites.has(article.id)) return false;
      if (state.period !== 'all') {
        const limitDays = Number(state.period);
        const articleDate = new Date(article.date);
        const diff = (now - articleDate) / (1000 * 60 * 60 * 24);
        if (diff > limitDays) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (state.sort === 'date-asc') return new Date(a.date) - new Date(b.date);
      return byDateDesc(a, b);
    });

    return list;
  }

  function renderProtectedZones() {
    document.querySelectorAll('[data-protected="true"]').forEach(zone => {
      zone.classList.toggle('is-locked', !state.isAuthenticated);
      zone.setAttribute('aria-disabled', state.isAuthenticated ? 'false' : 'true');
    });
    els.profileButton.textContent = state.isAuthenticated ? 'Admin' : 'Connexion';
    els.profileButton.classList.toggle('active', state.isAuthenticated);
    els.favoritesToggle.classList.toggle('locked-nav', !state.isAuthenticated);
  }

  function renderSidebar() {
    const themeCounts = countBy(DATA.articles.flatMap(article => article.tags || []), tag => tag);
    const sourceTypeCounts = countBy(DATA.articles, article => article.sourceType || article.type);
    const regionCounts = countBy(DATA.sources, item => item.region || 'National');
    const tags = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
    const sourceTypes = Object.entries(sourceTypeCounts).sort((a, b) => b[1] - a[1]);
    const regions = Object.entries(regionCounts).sort((a, b) => (a[0] === 'National' ? -1 : b[0] === 'National' ? 1 : a[0].localeCompare(b[0], 'fr')));

    els.themeList.innerHTML = tags.slice(0, 8).map(([tag, count]) => `
      <button class="side-item ${state.selectedTheme === tag ? 'active' : ''}" data-theme="${escapeHtml(tag)}">
        <span>${escapeHtml(tag)}</span>
        <span>${count}</span>
      </button>
    `).join('');

    els.sourceTypeList.innerHTML = sourceTypes.map(([type, count]) => `
      <button class="side-item ${state.selectedSourceType === type ? 'active' : ''}" data-source-type="${escapeHtml(type)}">
        <span>${escapeHtml(type)}</span>
        <span>${count}</span>
      </button>
    `).join('');

    if (els.regionList) {
      els.regionList.innerHTML = regions.map(([region, count]) => `
        <button class="side-item ${state.selectedRegion === region ? 'active' : ''}" data-region="${escapeHtml(region)}">
          <span>${escapeHtml(region)}</span>
          <span>${count}</span>
        </button>
      `).join('');
    }

    els.tagCloud.innerHTML = tags.map(([tag]) => `
      <button class="tag ${state.selectedTag === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join('');
  }

  function accessPill(article) {
    const cls = article.access === 'paywall' ? 'access-paywall' : (article.access === 'pdf' ? 'access-pdf' : 'access-open');
    return `<span class="pill ${cls}">${accessLabels[article.access] || article.access}</span>`;
  }

  function renderArticles() {
    const filtered = getFilteredArticles();
    els.totalDocs.textContent = DATA.articles.length.toLocaleString('fr-FR');
    els.favoriteCount.textContent = state.favorites.size.toLocaleString('fr-FR');
    els.favoritesToggle.classList.toggle('active', state.favoritesOnly);
    els.newsMeta.textContent = `${filtered.length.toLocaleString('fr-FR')} document${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''}${state.favoritesOnly ? ' dans tes favoris' : ''}`;

    els.articleGrid.innerHTML = filtered.map(article => {
      const favorite = state.favorites.has(article.id);
      const tagPills = (article.tags || []).slice(0, 3).map(tag => `<span class="pill theme">${escapeHtml(tag)}</span>`).join('');
      const premiumBlock = article.access === 'paywall' && article.premiumSummary
        ? `<p class="article-summary"><strong>Résumé utile :</strong> ${escapeHtml(article.premiumSummary)}</p>`
        : '';
      const imageBlock = article.image
        ? `<figure class="article-image"><img src="${escapeHtml(article.image)}" alt="Image associée à l’article : ${escapeHtml(article.title)}" loading="lazy"></figure>`
        : '';
      const dragAttrs = state.isAuthenticated ? `draggable="true" data-drag-article="${escapeHtml(article.id)}"` : '';
      const folderSelect = state.isAuthenticated && state.folders.length
        ? `<select class="folder-quick-assign" data-assign-article="${escapeHtml(article.id)}" aria-label="Classer l’article dans un dossier">
            <option value="">Classer…</option>
            ${state.folders.map(folder => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join('')}
          </select>`
        : '';
      return `
        <article class="article-card ${state.isAuthenticated ? 'is-draggable' : ''}" ${dragAttrs}>
          ${imageBlock}
          <div class="article-top">
            <div class="source-line">
              <span class="logo-badge">${escapeHtml((article.source || '?').slice(0, 2).toUpperCase())}</span>
              <span>${escapeHtml(article.source)}</span>
            </div>
            <span>${formatDate(article.date)}</span>
          </div>
          <div>
            <h3>${escapeHtml(article.title)}</h3>
          </div>
          <p class="article-summary">${escapeHtml(article.summary)}</p>
          ${premiumBlock}
          <div class="card-tags">${tagPills}</div>
          <div class="card-bottom">
            ${accessPill(article)}
            <div class="card-actions">
              <button class="favorite-btn ${favorite ? 'active' : ''} ${state.isAuthenticated ? '' : 'is-disabled'}" data-fav-id="${article.id}" title="${state.isAuthenticated ? 'Ajouter aux favoris' : 'Connexion requise'}">${favorite ? '★ Favori' : '☆ Favori'}</button>
              <a class="link-btn" href="${article.url}" target="_blank" rel="noopener noreferrer">Lire l’article</a>
            </div>
          </div>
          ${folderSelect}
        </article>
      `;
    }).join('');

    els.emptyState.hidden = filtered.length > 0;
  }

  function renderFavoriteFolders() {
    if (!els.favoriteFolders) return;
    if (!state.isAuthenticated) {
      els.favoriteFolders.innerHTML = `
        <div class="locked-panel">
          <strong>Connexion requise</strong>
          <p>Connecte-toi au profil Admin pour créer des dossiers favoris et classer les articles.</p>
          <button class="primary-btn" type="button" data-open-login>Se connecter</button>
        </div>
      `;
      return;
    }

    els.favoriteFolders.innerHTML = state.folders.map(folder => {
      const folderArticles = folder.articles
        .map(getArticleById)
        .filter(Boolean);
      const content = folderArticles.length
        ? folderArticles.map(article => `
          <article class="folder-article" draggable="true" data-drag-article="${escapeHtml(article.id)}">
            <div>
              <strong>${escapeHtml(article.title)}</strong>
              <span>${escapeHtml(article.source)} · ${formatDate(article.date)}</span>
            </div>
            <button class="folder-remove" type="button" data-remove-from-folder="${escapeHtml(folder.id)}" data-article-id="${escapeHtml(article.id)}" aria-label="Retirer du dossier">×</button>
          </article>
        `).join('')
        : '<p class="folder-empty">Dépose un article ici.</p>';

      return `
        <section class="favorite-folder" data-folder-id="${escapeHtml(folder.id)}">
          <div class="folder-head">
            <input class="folder-name-input" value="${escapeHtml(folder.name)}" data-rename-folder="${escapeHtml(folder.id)}" aria-label="Nom du dossier" />
            <span>${folderArticles.length}</span>
            <button class="folder-delete" type="button" data-delete-folder="${escapeHtml(folder.id)}" title="Supprimer le dossier">×</button>
          </div>
          <div class="folder-dropzone" data-drop-folder="${escapeHtml(folder.id)}">
            ${content}
          </div>
        </section>
      `;
    }).join('');
  }

  function renderSources() {
    if (!els.followedSources) return;
    const counts = countBy(DATA.articles, article => article.sourceId);
    const regions = Object.keys(countBy(DATA.sources, item => item.region || 'National'))
      .sort((a, b) => (a === 'National' ? -1 : b === 'National' ? 1 : a.localeCompare(b, 'fr')));

    if (els.sourceRegionFilter) {
      const current = state.sourcePageRegion;
      els.sourceRegionFilter.innerHTML = '<option value="">Toutes les régions</option>' + regions.map(region => `
        <option value="${escapeHtml(region)}" ${current === region ? 'selected' : ''}>${escapeHtml(region)}</option>
      `).join('');
    }

    const query = normalize(state.sourceSearch);
    const sourceList = [...DATA.sources]
      .filter(source => {
        const region = source.region || 'National';
        if (state.sourcePageRegion && region !== state.sourcePageRegion) return false;
        if (!query) return true;
        const haystack = normalize([source.name, source.type, source.category, source.region, source.url].join(' '));
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const regionCompare = (a.region || 'National').localeCompare(b.region || 'National', 'fr');
        if (regionCompare !== 0) return (a.region || 'National') === 'National' ? -1 : ((b.region || 'National') === 'National' ? 1 : regionCompare);
        return a.name.localeCompare(b.name, 'fr');
      });

    if (!sourceList.length) {
      els.followedSources.innerHTML = '<p class="empty-state">Aucune source ne correspond à la recherche.</p>';
      return;
    }

    els.followedSources.innerHTML = `
      <table class="sources-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Famille</th>
            <th>Région</th>
            <th>Statut</th>
            <th>Articles</th>
            <th>Lien</th>
          </tr>
        </thead>
        <tbody>
          ${sourceList.map(source => `
            <tr>
              <td>
                <div class="source-name-cell">
                  <span class="logo-badge">${escapeHtml(source.name.slice(0, 2).toUpperCase())}</span>
                  <strong>${escapeHtml(source.name)}</strong>
                </div>
              </td>
              <td>${escapeHtml(source.category || source.type || 'À qualifier')}</td>
              <td>${escapeHtml(source.region || 'National')}</td>
              <td>${source.official ? '<span class="pill access-official">Officielle</span>' : '<span class="pill theme">Suivie</span>'}</td>
              <td>${(counts[source.id] || 0).toLocaleString('fr-FR')}</td>
              <td><a class="source-direct-link" href="${escapeHtml(source.url || source.siteUrl || '#')}" target="_blank" rel="noopener noreferrer">Ouvrir</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderAll() {
    renderProtectedZones();
    renderSidebar();
    renderArticles();
    renderFavoriteFolders();
    renderSources();
  }

  function resetAll() {
    state.search = '';
    state.selectedTheme = '';
    state.selectedSourceType = '';
    state.selectedTag = '';
    state.selectedRegion = '';
    state.access = new Set(['open', 'paywall', 'pdf', 'official']);
    state.period = 'all';
    state.sort = 'date-desc';
    state.favoritesOnly = false;

    els.searchInput.value = '';
    els.periodFilter.value = 'all';
    els.sortSelect.value = 'date-desc';
    document.querySelectorAll('.access-check').forEach(check => {
      check.checked = true;
    });

    renderAll();
  }

  function setActiveNav(targetName = 'home') {
    document.querySelectorAll('.nav-link').forEach(item => {
      item.classList.toggle('active', item.dataset.target === targetName);
    });
  }

  function showHomeView() {
    if (els.homeView) {
      els.homeView.hidden = false;
      els.homeView.style.display = '';
    }
    if (els.sourcesPage) {
      els.sourcesPage.hidden = true;
      els.sourcesPage.style.display = 'none';
    }
    document.body.classList.remove('sources-view-active');
  }

  function showSourcesView() {
    if (els.homeView) {
      els.homeView.hidden = true;
      els.homeView.style.display = 'none';
    }
    if (els.sourcesPage) {
      els.sourcesPage.hidden = false;
      els.sourcesPage.style.display = 'block';
    }
    document.body.classList.add('sources-view-active');
    closeFilterDrawer();
    setActiveNav('sourcesFollowedPage');
    state.favoritesOnly = false;
    renderSources();
    const target = els.sourcesPage || document.getElementById('sourcesFollowedPage');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goHome() {
    resetAll();
    showHomeView();
    closeFilterDrawer();
    setActiveNav('home');
    const target = document.getElementById('home');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function addArticleToFolder(articleId, folderId) {
    if (!state.isAuthenticated) return;
    const folder = state.folders.find(item => item.id === folderId);
    if (!folder || !getArticleById(articleId)) return;

    state.favorites.add(articleId);
    state.folders.forEach(item => {
      item.articles = item.articles.filter(id => id !== articleId);
    });
    folder.articles.unshift(articleId);
    saveFavorites();
    saveFolders();
    renderAll();
  }

  function removeArticleFromFolder(articleId, folderId) {
    const folder = state.folders.find(item => item.id === folderId);
    if (!folder) return;
    folder.articles = folder.articles.filter(id => id !== articleId);
    saveFolders();
    renderFavoriteFolders();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function guessRssUrl(url) {
    if (!url) return null;
    const trimmed = url.trim();
    if (/\.xml($|\?)/i.test(trimmed) || /rss|feed|atom/i.test(trimmed)) return trimmed;
    const base = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
    return `${base}/feed`;
  }

  function bindEvents() {
    els.filterMenuToggle?.addEventListener('click', () => {
      if (els.filterDrawer?.classList.contains('is-open')) closeFilterDrawer();
      else openFilterDrawer();
    });

    els.filterMenuClose?.addEventListener('click', closeFilterDrawer);
    els.sidebarBackdrop?.addEventListener('click', closeFilterDrawer);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFilterDrawer();
    });

    els.searchInput.addEventListener('input', (event) => {
      state.search = event.target.value;
      renderArticles();
    });

    els.themeList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme]');
      if (!button) return;
      state.selectedTheme = state.selectedTheme === button.dataset.theme ? '' : button.dataset.theme;
      renderAll();
      closeFilterDrawer();
    });

    els.sourceTypeList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-source-type]');
      if (!button) return;
      state.selectedSourceType = state.selectedSourceType === button.dataset.sourceType ? '' : button.dataset.sourceType;
      renderAll();
      closeFilterDrawer();
    });

    els.regionList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-region]');
      if (!button) return;
      state.selectedRegion = state.selectedRegion === button.dataset.region ? '' : button.dataset.region;
      renderAll();
      closeFilterDrawer();
    });

    els.tagCloud.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (!button) return;
      state.selectedTag = state.selectedTag === button.dataset.tag ? '' : button.dataset.tag;
      renderAll();
      closeFilterDrawer();
    });

    document.querySelectorAll('.access-check').forEach(check => {
      check.addEventListener('change', () => {
        state.access = new Set(Array.from(document.querySelectorAll('.access-check:checked')).map(item => item.value));
        renderArticles();
      });
    });

    els.periodFilter.addEventListener('change', (event) => {
      state.period = event.target.value;
      renderArticles();
    });

    els.sortSelect.addEventListener('change', (event) => {
      state.sort = event.target.value;
      renderArticles();
    });

    els.articleGrid.addEventListener('click', (event) => {
      const favButton = event.target.closest('[data-fav-id]');
      if (!favButton) return;
      if (!requireAuth('tes favoris')) return;
      const articleId = favButton.dataset.favId;
      if (state.favorites.has(articleId)) {
        state.favorites.delete(articleId);
        state.folders.forEach(folder => {
          folder.articles = folder.articles.filter(id => id !== articleId);
        });
      } else {
        state.favorites.add(articleId);
      }
      saveFavorites();
      saveFolders();
      renderAll();
    });

    els.articleGrid.addEventListener('change', (event) => {
      const select = event.target.closest('[data-assign-article]');
      if (!select || !select.value) return;
      if (!requireAuth('tes favoris')) {
        select.value = '';
        return;
      }
      addArticleToFolder(select.dataset.assignArticle, select.value);
      select.value = '';
    });

    els.articleGrid.addEventListener('dragstart', (event) => {
      const card = event.target.closest('[data-drag-article]');
      if (!card || !state.isAuthenticated) return;
      event.dataTransfer.setData('text/plain', card.dataset.dragArticle);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    els.articleGrid.addEventListener('dragend', (event) => {
      const card = event.target.closest('[data-drag-article]');
      if (card) card.classList.remove('dragging');
    });

    els.favoriteFolders.addEventListener('dragstart', (event) => {
      const item = event.target.closest('[data-drag-article]');
      if (!item || !state.isAuthenticated) return;
      event.dataTransfer.setData('text/plain', item.dataset.dragArticle);
      event.dataTransfer.effectAllowed = 'move';
    });

    els.favoriteFolders.addEventListener('dragover', (event) => {
      const zone = event.target.closest('[data-drop-folder]');
      if (!zone || !state.isAuthenticated) return;
      event.preventDefault();
      zone.classList.add('is-over');
    });

    els.favoriteFolders.addEventListener('dragleave', (event) => {
      const zone = event.target.closest('[data-drop-folder]');
      if (zone) zone.classList.remove('is-over');
    });

    els.favoriteFolders.addEventListener('drop', (event) => {
      const zone = event.target.closest('[data-drop-folder]');
      if (!zone || !state.isAuthenticated) return;
      event.preventDefault();
      zone.classList.remove('is-over');
      const articleId = event.dataTransfer.getData('text/plain');
      addArticleToFolder(articleId, zone.dataset.dropFolder);
    });

    els.favoriteFolders.addEventListener('click', (event) => {
      const loginButton = event.target.closest('[data-open-login]');
      if (loginButton) openLogin();

      const deleteButton = event.target.closest('[data-delete-folder]');
      if (deleteButton) {
        const folderId = deleteButton.dataset.deleteFolder;
        state.folders = state.folders.filter(folder => folder.id !== folderId);
        saveFolders();
        renderFavoriteFolders();
      }

      const removeButton = event.target.closest('[data-remove-from-folder]');
      if (removeButton) {
        removeArticleFromFolder(removeButton.dataset.articleId, removeButton.dataset.removeFromFolder);
      }
    });

    els.favoriteFolders.addEventListener('change', (event) => {
      const input = event.target.closest('[data-rename-folder]');
      if (!input) return;
      const folder = state.folders.find(item => item.id === input.dataset.renameFolder);
      if (!folder) return;
      folder.name = input.value.trim() || 'Dossier sans nom';
      saveFolders();
      renderFavoriteFolders();
    });

    els.folderForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireAuth('la gestion des dossiers favoris')) return;
      const formData = new FormData(event.currentTarget);
      const name = (formData.get('folderName') || '').toString().trim();
      if (!name) return;
      state.folders.push({ id: createId(name), name, articles: [] });
      event.currentTarget.reset();
      saveFolders();
      renderFavoriteFolders();
    });

    els.favoritesToggle.addEventListener('click', () => {
      if (!requireAuth('tes favoris')) return;
      state.favoritesOnly = !state.favoritesOnly;
      renderArticles();
      els.favoritesManager.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    els.profileButton.addEventListener('click', openLogin);
    els.closeLogin.addEventListener('click', closeLogin);
    els.loginModal.addEventListener('click', (event) => {
      if (event.target === els.loginModal) closeLogin();
    });

    els.loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const username = (formData.get('username') || '').toString().trim();
      const password = (formData.get('password') || '').toString();
      if (username === PROFILE_NAME && password === PROFILE_PASSWORD) {
        els.loginError.hidden = true;
        setAuth(true);
        closeLogin();
        return;
      }
      els.loginError.textContent = 'Identifiants incorrects.';
      els.loginError.hidden = false;
    });

    els.logoutButton.addEventListener('click', () => {
      setAuth(false);
      closeLogin();
    });

    els.resetFilters.addEventListener('click', resetAll);

    document.querySelectorAll('[data-scroll]').forEach(btn => {
      btn.addEventListener('click', () => {
        openFilterDrawer(btn.dataset.scroll);
      });
    });

    document.querySelectorAll('.nav-link[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetName = btn.dataset.target;
        if (targetName === 'home') {
          goHome();
          return;
        }
        if (targetName === 'sourcesFollowedPage') {
          showSourcesView();
          return;
        }
        showHomeView();
        setActiveNav(targetName);
        const drawerTargets = new Set(['sources-section', 'tags-panel', 'regionSection']);
        if (drawerTargets.has(targetName)) {
          openFilterDrawer(targetName);
          return;
        }
        const target = document.getElementById(targetName);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    els.sourceSearchInput?.addEventListener('input', (event) => {
      state.sourceSearch = event.target.value;
      renderSources();
    });

    els.sourceRegionFilter?.addEventListener('change', (event) => {
      state.sourcePageRegion = event.target.value;
      renderSources();
    });

    els.sourceForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!requireAuth('l’ajout de sources')) return;
      const formData = new FormData(event.currentTarget);
      const name = (formData.get('name') || '').toString().trim();
      const siteUrl = (formData.get('siteUrl') || '').toString().trim();
      const type = (formData.get('type') || '').toString().trim() || 'À qualifier';
      const themes = (formData.get('themes') || '').toString()
        .split(';')
        .map(item => item.trim())
        .filter(Boolean);
      const official = formData.get('official') === 'on';
      const region = (formData.get('region') || '').toString().trim() || 'National';
      const sourceBlock = {
        id: normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        name,
        siteUrl,
        rss: guessRssUrl(siteUrl),
        type,
        defaultTags: themes,
        official,
        region,
        active: true
      };
      els.sourceJsonOutput.textContent = JSON.stringify(sourceBlock, null, 2);
    });
  }

  bindEvents();
  renderAll();
})();
