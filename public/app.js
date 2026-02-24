'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('token') || null,
  username: localStorage.getItem('username') || null,
  region: '',
  sort: '',
};

// ─── API helper ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || 'Request failed'), { status: res.status });
  return json;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function saveAuth(token, username) {
  state.token = token;
  state.username = username;
  localStorage.setItem('token', token);
  localStorage.setItem('username', username);
}

function clearAuth() {
  state.token = null;
  state.username = null;
  localStorage.removeItem('token');
  localStorage.removeItem('username');
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// Close buttons
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// ─── Navbar ───────────────────────────────────────────────────────────────────
function renderNav() {
  const nav = document.getElementById('nav-actions');
  if (state.token) {
    nav.innerHTML = `
      <span class="nav-user">👤 ${escHtml(state.username)}</span>
      <button class="btn btn-primary" id="btn-new-spot">+ New Spot</button>
      <button class="btn btn-ghost" id="btn-logout">Logout</button>
    `;
    document.getElementById('btn-new-spot').addEventListener('click', () => openModal('modal-new-spot'));
    document.getElementById('btn-logout').addEventListener('click', () => {
      clearAuth();
      renderNav();
      loadSpots();
    });
  } else {
    nav.innerHTML = `
      <button class="btn btn-outline" id="btn-login">Login</button>
      <button class="btn btn-primary" id="btn-register">Register</button>
    `;
    document.getElementById('btn-login').addEventListener('click', () => openModal('modal-login'));
    document.getElementById('btn-register').addEventListener('click', () => openModal('modal-register'));
  }
}

// ─── Spot cards ───────────────────────────────────────────────────────────────
function regionEmoji(region) {
  const map = { Europe: '🇪🇺', Asia: '🌏', Africa: '🌍', Americas: '🌎', Oceania: '🌊' };
  return map[region] || '🌐';
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function spotCardHtml(spot) {
  const img = spot.image_url
    ? `<img class="spot-card-img" src="${escHtml(spot.image_url)}" alt="${escHtml(spot.title)}" loading="lazy" onerror="this.replaceWith(makePlaceholder())">`
    : `<div class="spot-card-img-placeholder">${regionEmoji(spot.region)}</div>`;
  return `
    <article class="spot-card" data-id="${spot.id}" tabindex="0" role="button" aria-label="View ${escHtml(spot.title)}">
      ${img}
      <div class="spot-card-body">
        <div class="spot-card-region">${regionEmoji(spot.region)} ${escHtml(spot.region)}</div>
        <div class="spot-card-title">${escHtml(spot.title)}</div>
        <div class="spot-card-location">📍 ${escHtml(spot.location)}</div>
        <div class="spot-card-desc">${escHtml(spot.description)}</div>
      </div>
      <div class="spot-card-footer">
        <span class="rating-badge">🌟 <strong>${spot.beautiful_count || 0}</strong> beautiful</span>
        <span class="rating-badge">⚠️ <strong>${spot.dangerous_count || 0}</strong> dangerous</span>
      </div>
    </article>
  `;
}

function makePlaceholder() {
  const d = document.createElement('div');
  d.className = 'spot-card-img-placeholder';
  d.textContent = '🌐';
  return d;
}

async function loadSpots() {
  const grid = document.getElementById('spots-grid');
  grid.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const params = new URLSearchParams();
  if (state.region) params.set('region', state.region);
  if (state.sort)   params.set('sort', state.sort);

  try {
    const spots = await api('GET', `/api/spots?${params}`);
    if (spots.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🗺️</div>
          <h3>No spots found</h3>
          <p>Be the first to share a hidden gem${state.region ? ` in ${state.region}` : ''}!</p>
        </div>`;
      return;
    }
    grid.innerHTML = spots.map(spotCardHtml).join('');
    grid.querySelectorAll('.spot-card').forEach(card => {
      card.addEventListener('click', () => openSpotDetail(card.dataset.id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openSpotDetail(card.dataset.id); });
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><h3>Failed to load spots</h3><p>${escHtml(err.message)}</p></div>`;
  }
}

// ─── Spot detail ──────────────────────────────────────────────────────────────
async function openSpotDetail(id) {
  document.getElementById('detail-title').textContent = 'Loading…';
  document.getElementById('detail-body').innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  openModal('modal-spot-detail');

  try {
    const spot = await api('GET', `/api/spots/${id}`);
    renderSpotDetail(spot);
  } catch (err) {
    document.getElementById('detail-body').innerHTML = `<p class="alert alert-error">${escHtml(err.message)}</p>`;
  }
}

function renderSpotDetail(spot) {
  document.getElementById('detail-title').textContent = spot.title;

  const isMine = state.username && spot.author === state.username;

  const imgHtml = spot.image_url
    ? `<img class="spot-detail-img" src="${escHtml(spot.image_url)}" alt="${escHtml(spot.title)}" onerror="this.style.display='none'">`
    : '';

  let ratingHtml = '';
  if (!state.token) {
    ratingHtml = `<p class="rating-info">Please <a href="#" id="detail-login-link">login</a> to rate this spot.</p>`;
  } else if (isMine) {
    ratingHtml = `<p class="rating-info">This is your spot – you cannot rate it.</p>`;
  } else {
    ratingHtml = `
      <div class="rating-buttons" id="rating-buttons" data-spot-id="${spot.id}">
        <button class="btn btn-rate btn-rate-beautiful" data-type="beautiful">
          🌟 Beautiful <span id="cnt-beautiful">${spot.beautiful_count || 0}</span>
        </button>
        <button class="btn btn-rate btn-rate-dangerous" data-type="dangerous">
          ⚠️ Dangerous <span id="cnt-dangerous">${spot.dangerous_count || 0}</span>
        </button>
      </div>
      <p class="rating-info" id="rating-msg">Click to add your rating. Click again to remove it.</p>
    `;
  }

  document.getElementById('detail-body').innerHTML = `
    ${imgHtml}
    <div class="spot-detail-meta">
      <span class="badge badge-region">${regionEmoji(spot.region)} ${escHtml(spot.region)}</span>
      <span class="badge badge-loc">📍 ${escHtml(spot.location)}</span>
      <span class="badge badge-author">✍️ ${escHtml(spot.author)}</span>
    </div>
    <p class="spot-detail-desc">${escHtml(spot.description)}</p>
    <div class="rating-section">
      <h3>Community Ratings</h3>
      ${ratingHtml}
    </div>
  `;

  if (!state.token) {
    document.getElementById('detail-login-link')?.addEventListener('click', e => {
      e.preventDefault();
      closeModal('modal-spot-detail');
      openModal('modal-login');
    });
  } else if (!isMine) {
    setupRatingButtons(spot);
  }
}

function setupRatingButtons(spot) {
  const btns = document.querySelectorAll('#rating-buttons .btn-rate');
  btns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const isActive = btn.classList.contains('active');
      try {
        let counts;
        if (isActive) {
          counts = await api('DELETE', `/api/spots/${spot.id}/rate/${type}`);
          btn.classList.remove('active');
        } else {
          counts = await api('POST', `/api/spots/${spot.id}/rate`, { type });
          btn.classList.add('active');
        }
        document.getElementById('cnt-beautiful').textContent = counts.beautiful_count || 0;
        document.getElementById('cnt-dangerous').textContent = counts.dangerous_count || 0;
        // Refresh grid counts
        loadSpots();
      } catch (err) {
        const msg = document.getElementById('rating-msg');
        if (msg) { msg.textContent = err.message; msg.style.color = 'var(--danger)'; }
      }
    });
  });
}

// ─── Filter & sort ────────────────────────────────────────────────────────────
document.getElementById('region-filter').addEventListener('change', e => {
  state.region = e.target.value;
  loadSpots();
});

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sort = btn.dataset.sort;
    loadSpots();
  });
});

// ─── Login form ───────────────────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('login-alert');
  alertEl.innerHTML = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) {
    alertEl.innerHTML = '<div class="alert alert-error">Please fill in all fields.</div>';
    return;
  }
  const btn = document.getElementById('btn-login-submit');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const data = await api('POST', '/api/auth/login', { username, password });
    saveAuth(data.token, data.username);
    closeModal('modal-login');
    document.getElementById('form-login').reset();
    renderNav();
    loadSpots();
  } catch (err) {
    alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Login';
  }
});

// ─── Register form ────────────────────────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('register-alert');
  alertEl.innerHTML = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !password) {
    alertEl.innerHTML = '<div class="alert alert-error">Please fill in all fields.</div>';
    return;
  }
  try {
    const data = await api('POST', '/api/auth/register', { username, password });
    saveAuth(data.token, data.username);
    closeModal('modal-register');
    document.getElementById('form-register').reset();
    renderNav();
    loadSpots();
  } catch (err) {
    alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
});

// ─── New spot form ────────────────────────────────────────────────────────────
document.getElementById('form-new-spot').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('spot-alert');
  alertEl.innerHTML = '';
  const title    = document.getElementById('spot-title').value.trim();
  const location = document.getElementById('spot-location').value.trim();
  const region   = document.getElementById('spot-region').value;
  const description = document.getElementById('spot-desc').value.trim();
  const imageUrl = document.getElementById('spot-image').value.trim();

  if (!title || !location || !region || !description) {
    alertEl.innerHTML = '<div class="alert alert-error">Please fill in all required fields.</div>';
    return;
  }
  try {
    await api('POST', '/api/spots', { title, location, region, description, imageUrl: imageUrl || undefined });
    closeModal('modal-new-spot');
    document.getElementById('form-new-spot').reset();
    alertEl.innerHTML = '';
    state.region = '';
    state.sort = '';
    document.getElementById('region-filter').value = '';
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.sort-btn[data-sort=""]').classList.add('active');
    loadSpots();
  } catch (err) {
    alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
renderNav();
loadSpots();
