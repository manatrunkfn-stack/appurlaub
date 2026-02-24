'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  token:    localStorage.getItem('au_token') || null,
  username: localStorage.getItem('au_username') || null,
  currentNav: 'home',
  currentRegion: '',
  posts: [],
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'none';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; }
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
  }
  const closeTarget = e.target.closest('[data-close]');
  if (closeTarget) closeModal(closeTarget.dataset.close);
});

// ── Auth UI ───────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const actions = document.getElementById('headerActions');
  const userMenu = document.getElementById('userMenu');
  const usernameDisplay = document.getElementById('usernameDisplay');

  if (state.token && state.username) {
    actions.classList.add('hidden');
    userMenu.classList.remove('hidden');
    usernameDisplay.textContent = `👤 ${state.username}`;
  } else {
    actions.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function setNav(nav) {
  state.currentNav = nav;
  state.currentRegion = '';

  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === nav);
  });

  const heroSection = document.getElementById('heroSection');
  heroSection.style.display = nav === 'home' ? '' : 'none';

  document.getElementById('regionFilter').value = '';
  loadPosts();
}

// ── Load regions ──────────────────────────────────────────────────────────────
async function loadRegions() {
  try {
    const regions = await apiFetch('/api/regions');
    const sel = document.getElementById('regionFilter');
    sel.innerHTML = '<option value="">Alle Regionen</option>';
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      sel.appendChild(opt);
    });
  } catch { /* silent */ }
}

// ── Load posts ────────────────────────────────────────────────────────────────
async function loadPosts() {
  const grid = document.getElementById('postsGrid');
  const empty = document.getElementById('emptyState');
  const spinner = document.getElementById('loadingSpinner');
  const count = document.getElementById('resultsCount');

  grid.innerHTML = '';
  spinner.classList.remove('hidden');
  grid.appendChild(spinner);
  empty.classList.add('hidden');

  const params = new URLSearchParams();
  if (state.currentNav === 'beautiful') params.set('category', 'BEAUTIFUL');
  if (state.currentNav === 'dangerous') params.set('category', 'DANGEROUS');
  if (state.currentRegion) params.set('region', state.currentRegion);

  try {
    const posts = await apiFetch(`/api/posts?${params}`);
    state.posts = posts;
    spinner.classList.add('hidden');

    count.textContent = `${posts.length} Ort${posts.length !== 1 ? 'e' : ''}`;

    if (posts.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    posts.forEach(post => grid.appendChild(createPostCard(post)));
    // Refresh regions after loading
    loadRegions();
  } catch (err) {
    spinner.classList.add('hidden');
    showToast('Fehler beim Laden der Orte: ' + err.message, 'error');
  }
}

// ── Post card ─────────────────────────────────────────────────────────────────
function createPostCard(post) {
  const isBeautiful = post.category === 'BEAUTIFUL';
  const card = document.createElement('article');
  card.className = `post-card ${isBeautiful ? 'beautiful' : 'dangerous'}`;
  card.dataset.id = post.id;

  // Image
  const imgDiv = document.createElement('div');
  imgDiv.className = 'post-card-image';
  if (post.image_url) {
    const img = document.createElement('img');
    img.src = post.image_url;
    img.alt = post.title;
    img.loading = 'lazy';
    img.onerror = () => { imgDiv.innerHTML = isBeautiful ? '🌿' : '⚠️'; };
    imgDiv.appendChild(img);
  } else {
    imgDiv.textContent = isBeautiful ? '🌿' : '⚠️';
  }

  // Body
  const body = document.createElement('div');
  body.className = 'post-card-body';
  body.innerHTML = `
    <div class="post-card-header">
      <h3 class="post-card-title">${escHtml(post.title)}</h3>
      <span class="category-badge ${isBeautiful ? 'beautiful' : 'dangerous'}">
        ${isBeautiful ? '🌿 Schön' : '⚠️ Gefährlich'}
      </span>
    </div>
    <div class="post-card-meta">
      <span>📍 ${escHtml(post.location_name)}</span>
      <span>🗺️ ${escHtml(post.region)}</span>
    </div>
    <p class="post-card-description">${escHtml(post.description)}</p>
  `;

  // Footer
  const footer = document.createElement('div');
  footer.className = 'post-card-footer';

  const ratingDiv = document.createElement('div');
  ratingDiv.className = 'rating-buttons';
  ratingDiv.appendChild(makeRateBtn(post, 'BEAUTIFUL', '🌿', post.beautiful_count));
  ratingDiv.appendChild(makeRateBtn(post, 'DANGEROUS', '⚠️', post.dangerous_count));

  const authorDiv = document.createElement('div');
  authorDiv.className = 'post-author';
  authorDiv.textContent = `von ${escHtml(post.username)}`;

  footer.appendChild(ratingDiv);
  footer.appendChild(authorDiv);

  card.appendChild(imgDiv);
  card.appendChild(body);
  card.appendChild(footer);

  // Click opens detail (except on buttons)
  card.addEventListener('click', e => {
    if (!e.target.closest('.rate-btn')) openPostDetail(post.id);
  });

  return card;
}

function makeRateBtn(post, type, icon, count) {
  const isBeautiful = type === 'BEAUTIFUL';
  const btn = document.createElement('button');
  btn.className = `rate-btn rate-${isBeautiful ? 'beautiful' : 'dangerous'}${post.user_rating === type ? ' active' : ''}`;
  btn.title = isBeautiful ? 'Als schön bewerten' : 'Als gefährlich bewerten';
  btn.dataset.postId = post.id;
  btn.dataset.rateType = type;
  btn.innerHTML = `${icon} <span>${count || 0}</span>`;
  if (!state.token) btn.disabled = true;

  btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!state.token) { openModal('loginModal'); return; }
    await handleRate(post.id, type, btn);
  });
  return btn;
}

// ── Rate handler ──────────────────────────────────────────────────────────────
async function handleRate(postId, ratingType, btnEl) {
  btnEl.disabled = true;
  try {
    let updated;
    if (btnEl.classList.contains('active')) {
      updated = await apiFetch(`/api/posts/${postId}/rate`, { method: 'DELETE' });
    } else {
      updated = await apiFetch(`/api/posts/${postId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating_type: ratingType }),
      });
    }
    // Update card footer buttons
    updateCardRating(updated);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnEl.disabled = false;
  }
}

function updateCardRating(post) {
  const card = document.querySelector(`.post-card[data-id="${post.id}"]`);
  if (!card) return;
  const btns = card.querySelectorAll('.rate-btn');
  btns.forEach(btn => {
    const t = btn.dataset.rateType;
    const count = t === 'BEAUTIFUL' ? post.beautiful_count : post.dangerous_count;
    btn.querySelector('span').textContent = count || 0;
    btn.classList.toggle('active', post.user_rating === t);
  });
  // Also update state
  const idx = state.posts.findIndex(p => p.id === post.id);
  if (idx !== -1) state.posts[idx] = { ...state.posts[idx], ...post };
}

// ── Post detail ───────────────────────────────────────────────────────────────
async function openPostDetail(postId) {
  openModal('postDetailModal');
  const content = document.getElementById('postDetailContent');
  content.innerHTML = '<div style="padding:2rem;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';

  try {
    const post = await apiFetch(`/api/posts/${postId}`);
    renderPostDetail(post, content);
  } catch (err) {
    content.innerHTML = `<div style="padding:2rem"><p>Fehler: ${escHtml(err.message)}</p></div>`;
  }
}

function renderPostDetail(post, container) {
  const isBeautiful = post.category === 'BEAUTIFUL';
  const userRating = post.user_rating;
  const loggedIn = !!state.token;

  container.innerHTML = `
    <button class="modal-close" data-close="postDetailModal">&times;</button>

    <div class="post-detail-image">
      ${post.image_url
        ? `<img src="${escAttr(post.image_url)}" alt="${escAttr(post.title)}" onerror="this.parentElement.innerHTML='${isBeautiful ? '🌿' : '⚠️'}';">`
        : (isBeautiful ? '🌿' : '⚠️')}
    </div>

    <div class="post-detail-body">
      <div class="post-detail-badges">
        <span class="category-badge ${isBeautiful ? 'beautiful' : 'dangerous'}">
          ${isBeautiful ? '🌿 Wunderschön' : '⚠️ Gefährlich'}
        </span>
      </div>
      <h2 class="post-detail-title">${escHtml(post.title)}</h2>
      <div class="post-detail-meta">
        <span>📍 ${escHtml(post.location_name)}</span>
        <span>🗺️ ${escHtml(post.region)}</span>
        <span>👤 ${escHtml(post.username)}</span>
        <span>📅 ${formatDate(post.created_at)}</span>
      </div>
      <p class="post-detail-description">${escHtml(post.description)}</p>

      <div class="detail-rating-section">
        <div class="rating-counts">
          <div class="rating-count-item beautiful">🌿 <span id="detailBeautifulCount">${post.beautiful_count || 0}</span> Schön</div>
          <div class="rating-count-item dangerous">⚠️ <span id="detailDangerousCount">${post.dangerous_count || 0}</span> Gefährlich</div>
        </div>
        <div class="detail-rating-label">
          ${loggedIn ? 'Deine Bewertung:' : '<a href="#" id="detailLoginHint">Anmelden</a> um zu bewerten'}
        </div>
        ${loggedIn ? `
        <div class="detail-rating-buttons">
          <button class="detail-rate-btn beautiful${userRating === 'BEAUTIFUL' ? ' active' : ''}" id="detailBtnBeautiful">
            🌿 Wunderschön
          </button>
          <button class="detail-rate-btn dangerous${userRating === 'DANGEROUS' ? ' active' : ''}" id="detailBtnDangerous">
            ⚠️ Gefährlich
          </button>
          ${userRating ? '<button class="btn btn-outline btn-sm" id="detailBtnRemove">Bewertung entfernen</button>' : ''}
        </div>` : ''}
      </div>
    </div>
  `;

  if (!loggedIn) {
    const hint = container.querySelector('#detailLoginHint');
    if (hint) hint.addEventListener('click', e => { e.preventDefault(); closeModal('postDetailModal'); openModal('loginModal'); });
    return;
  }

  const btnB = container.querySelector('#detailBtnBeautiful');
  const btnD = container.querySelector('#detailBtnDangerous');
  const btnR = container.querySelector('#detailBtnRemove');

  const refreshDetail = async (updated) => {
    container.querySelector('#detailBeautifulCount').textContent = updated.beautiful_count || 0;
    container.querySelector('#detailDangerousCount').textContent = updated.dangerous_count || 0;
    updateCardRating(updated);
    // re-render buttons
    const newUserRating = updated.user_rating;
    if (btnB) btnB.classList.toggle('active', newUserRating === 'BEAUTIFUL');
    if (btnD) btnD.classList.toggle('active', newUserRating === 'DANGEROUS');
    if (btnR) btnR.style.display = newUserRating ? '' : 'none';
    // re-render remove button presence
    if (!newUserRating && btnR) btnR.remove();
    else if (newUserRating && !container.querySelector('#detailBtnRemove')) {
      const newRemove = document.createElement('button');
      newRemove.id = 'detailBtnRemove';
      newRemove.className = 'btn btn-outline btn-sm';
      newRemove.textContent = 'Bewertung entfernen';
      newRemove.addEventListener('click', () => doRate(post.id, null));
      container.querySelector('.detail-rating-buttons').appendChild(newRemove);
    }
  };

  const doRate = async (id, type) => {
    try {
      let updated;
      if (type === null) {
        updated = await apiFetch(`/api/posts/${id}/rate`, { method: 'DELETE' });
      } else {
        updated = await apiFetch(`/api/posts/${id}/rate`, {
          method: 'POST',
          body: JSON.stringify({ rating_type: type }),
        });
      }
      await refreshDetail(updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (btnB) btnB.addEventListener('click', () => doRate(post.id, 'BEAUTIFUL'));
  if (btnD) btnD.addEventListener('click', () => doRate(post.id, 'DANGEROUS'));
  if (btnR) btnR.addEventListener('click', () => doRate(post.id, null));
}

// ── Login form ────────────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmit');
  errEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Anmelden…';

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      }),
    });
    state.token = data.token;
    state.username = data.username;
    localStorage.setItem('au_token', data.token);
    localStorage.setItem('au_username', data.username);
    updateAuthUI();
    closeModal('loginModal');
    document.getElementById('loginForm').reset();
    showToast(`Willkommen zurück, ${data.username}! 👋`, 'success');
    loadPosts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Anmelden';
  }
});

// ── Register form ─────────────────────────────────────────────────────────────
document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('registerError');
  const submitBtn = document.getElementById('registerSubmit');
  errEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Konto wird erstellt…';

  try {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('regUsername').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        password: document.getElementById('regPassword').value,
      }),
    });
    state.token = data.token;
    state.username = data.username;
    localStorage.setItem('au_token', data.token);
    localStorage.setItem('au_username', data.username);
    updateAuthUI();
    closeModal('registerModal');
    document.getElementById('registerForm').reset();
    showToast(`Willkommen, ${data.username}! Konto erfolgreich erstellt. 🎉`, 'success');
    loadPosts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Konto erstellen';
  }
});

// ── New Post form ─────────────────────────────────────────────────────────────
document.getElementById('newPostForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('newPostError');
  const submitBtn = document.getElementById('newPostSubmit');
  errEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Wird veröffentlicht…';

  try {
    await apiFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify({
        title:         document.getElementById('postTitle').value.trim(),
        description:   document.getElementById('postDescription').value.trim(),
        region:        document.getElementById('postRegion').value.trim(),
        location_name: document.getElementById('postLocation').value.trim(),
        image_url:     document.getElementById('postImageUrl').value.trim(),
        category:      document.getElementById('postCategory').value,
      }),
    });
    closeModal('newPostModal');
    document.getElementById('newPostForm').reset();
    showToast('Ort erfolgreich veröffentlicht! 🌍', 'success');
    setNav('home');
    loadPosts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Ort veröffentlichen';
  }
});

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('btnLogin').addEventListener('click', e => { e.preventDefault(); openModal('loginModal'); });
document.getElementById('btnRegister').addEventListener('click', e => { e.preventDefault(); openModal('registerModal'); });
document.getElementById('btnNewPost').addEventListener('click', () => openModal('newPostModal'));
document.getElementById('btnLogout').addEventListener('click', () => {
  state.token = null;
  state.username = null;
  localStorage.removeItem('au_token');
  localStorage.removeItem('au_username');
  updateAuthUI();
  showToast('Erfolgreich abgemeldet', 'info');
  loadPosts();
});

document.getElementById('switchToRegister').addEventListener('click', e => {
  e.preventDefault(); closeModal('loginModal'); openModal('registerModal');
});
document.getElementById('switchToLogin').addEventListener('click', e => {
  e.preventDefault(); closeModal('registerModal'); openModal('loginModal');
});

// ── Nav links ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    setNav(link.dataset.nav);
    // Close mobile menu if open
    document.getElementById('mainNav').classList.remove('open');
  });
});

// ── Hamburger ─────────────────────────────────────────────────────────────────
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mainNav').classList.toggle('open');
});

// ── Region filter ─────────────────────────────────────────────────────────────
document.getElementById('regionFilter').addEventListener('change', e => {
  state.currentRegion = e.target.value;
  loadPosts();
});

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escAttr(str) { return escHtml(str); }

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateAuthUI();
loadRegions();
loadPosts();
