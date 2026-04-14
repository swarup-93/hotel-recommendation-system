/* ══════════════════════════════════════════════
   DineAI – main.js
   ══════════════════════════════════════════════ */

// ── State ──────────────────────────────────────
let allRestaurants = [];
let currentScenario = 'visitor';

// ── Boot ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchRestaurants();
  initHamburger();
  initFilters();
  initButtons();
  initAutoComplete('heroSearch', 'heroAutoList', (val) => {
    document.getElementById('mainSearch').value = val;
    scrollToRecommend(currentScenario);
    doRecommend();
  });
  initAutoComplete('mainSearch', 'mainAutoList', () => doRecommend());
});

// ── Fetch restaurant list ───────────────────────
async function fetchRestaurants() {
  try {
    const res = await fetch('/api/restaurants');
    const data = await res.json();
    allRestaurants = data.restaurants || [];
  } catch (e) {
    console.warn('Could not fetch restaurant list:', e);
  }
}

// ── Autocomplete ────────────────────────────────
function initAutoComplete(inputId, listId, onSelect) {
  const input = document.getElementById(inputId);
  const list  = document.getElementById(listId);

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = '';
    if (!q || q.length < 2) { list.classList.add('hidden'); return; }

    const matches = allRestaurants.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { list.classList.add('hidden'); return; }

    matches.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = name;
        list.classList.add('hidden');
        if (onSelect) onSelect(name);
      });
      list.appendChild(li);
    });
    list.classList.remove('hidden');
  });

  input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { list.classList.add('hidden'); if (onSelect) onSelect(input.value); }
  });
}

// ── Buttons ─────────────────────────────────────
function initButtons() {
  document.getElementById('heroBtn').addEventListener('click', () => {
    const val = document.getElementById('heroSearch').value.trim();
    if (!val) return;
    document.getElementById('mainSearch').value = val;
    scrollToRecommend(currentScenario);
    setTimeout(doRecommend, 400);
  });

  document.getElementById('mainBtn').addEventListener('click', doRecommend);
}

// ── Filters ─────────────────────────────────────
function initFilters() {
  const costSlider   = document.getElementById('costFilter');
  const ratingSlider = document.getElementById('ratingFilter');

  costSlider.addEventListener('input', () => {
    document.getElementById('costVal').textContent = `₹${costSlider.value}`;
    refilterResults();
  });
  ratingSlider.addEventListener('input', () => {
    document.getElementById('ratingVal').textContent = `${parseFloat(ratingSlider.value).toFixed(1)} ★`;
    refilterResults();
  });
}

// ── Hamburger ────────────────────────────────────
function initHamburger() {
  document.getElementById('hamburger').addEventListener('click', () => {
    document.querySelector('.nav-links').classList.toggle('open');
  });
}

// ── Scroll helper ────────────────────────────────
function scrollToRecommend(scenario) {
  currentScenario = scenario || 'visitor';
  const pills = {
    visitor:  '👤 Scenario 1 – Restaurant Visitor',
    owner:    '🏪 Scenario 2 – Restaurant Owner',
    delivery: '🚗 Scenario 3 – Food Delivery Platform',
  };
  document.getElementById('scenarioPill').textContent = pills[scenario] || '🔍 Recommendation Engine';
  document.getElementById('recommend-section').scrollIntoView({ behavior: 'smooth' });
}

// ── Core recommend call ──────────────────────────
let lastResults = [];

async function doRecommend() {
  const name = document.getElementById('mainSearch').value.trim();
  if (!name) { showError('Please enter a restaurant name.'); return; }

  showLoading();

  try {
    const res  = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    if (!res.ok) { showError(data.error || 'Something went wrong.'); return; }

    lastResults = data.results || [];
    renderResults(name, lastResults);
  } catch (e) {
    showError('Network error – please make sure the Flask server is running.');
  }
}

// ── Re-filter without new API call ───────────────
function refilterResults() {
  if (!lastResults.length) return;
  const maxCost   = parseInt(document.getElementById('costFilter').value);
  const minRating = parseFloat(document.getElementById('ratingFilter').value);
  const filtered  = lastResults.filter(r => r.cost <= maxCost && r.rating >= minRating);
  renderGrid(filtered);
  document.getElementById('resultsCount').textContent = `${filtered.length} found`;
}

// ── Render ───────────────────────────────────────
function renderResults(query, results) {
  hideAll();
  const area = document.getElementById('resultsArea');
  area.classList.remove('hidden');

  const maxCost   = parseInt(document.getElementById('costFilter').value);
  const minRating = parseFloat(document.getElementById('ratingFilter').value);
  const filtered  = results.filter(r => r.cost <= maxCost && r.rating >= minRating);

  document.getElementById('resultsTitle').textContent = `Top results similar to "${query}"`;
  document.getElementById('resultsCount').textContent = `${filtered.length} found`;
  renderGrid(filtered);
}

function renderGrid(results) {
  const grid = document.getElementById('resultsGrid');
  grid.innerHTML = '';

  if (!results.length) {
    grid.innerHTML = '<p style="color:var(--text-sub);grid-column:1/-1;text-align:center;padding:24px">No restaurants match your current filters.</p>';
    return;
  }

  results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'restaurant-card';
    card.style.animationDelay = `${i * 60}ms`;

    const ratingClass = r.rating >= 3.5 ? '' : 'low';
    const costDisplay = r.cost ? `₹${r.cost} for two` : 'Cost N/A';

    card.innerHTML = `
      <div class="rest-header">
        <span class="rest-name">${escapeHtml(r.name)}</span>
        <span class="rest-rating ${ratingClass}">⭐ ${r.rating}</span>
      </div>
      <div class="rest-cuisine">${escapeHtml(r.cuisines)}</div>
      <div class="rest-cost">${costDisplay}</div>
    `;
    grid.appendChild(card);
  });
}

// ── Loading / Error / Hide ────────────────────────
function showLoading() {
  hideAll();
  document.getElementById('loadingArea').classList.remove('hidden');
}
function showError(msg) {
  hideAll();
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorArea').classList.remove('hidden');
}
function hideAll() {
  ['resultsArea', 'loadingArea', 'errorArea'].forEach(id => document.getElementById(id).classList.add('hidden'));
}

// ── Utility ──────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
