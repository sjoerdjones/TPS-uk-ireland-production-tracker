// === State ===
let currentSort = 'publication_date';
let currentOrder = 'desc';
let viewingArchived = false;

// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
  loadProductions();
  loadScrapeStatus();
  // Refresh scrape status every 30 seconds
  setInterval(loadScrapeStatus, 30000);
});

// === Data Fetching ===
async function loadProductions() {
  const container = document.getElementById('cards-container');
  container.innerHTML = '<div class="empty-state">Loading productions...</div>';

  try {
    const status = viewingArchived ? 'archived' : '';
    const params = new URLSearchParams({
      sort: currentSort,
      order: currentOrder,
    });
    if (status) params.set('status', status);

    const res = await fetch(`/api/productions?${params}`);
    const productions = await res.json();

    // If not viewing archived, filter out archived items
    const filtered = viewingArchived
      ? productions
      : productions.filter(p => p.status !== 'archived');

    renderCards(filtered);
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Error loading productions.</div>';
    console.error(err);
  }
}

// === Rendering ===
function renderCards(productions) {
  const container = document.getElementById('cards-container');

  if (productions.length === 0) {
    container.innerHTML = viewingArchived
      ? '<div class="empty-state">No archived items.</div>'
      : '<div class="empty-state">No productions found.</div>';
    return;
  }

  container.innerHTML = productions.map(p => createCard(p)).join('');
}

function createCard(p) {
  const chevronIcon = `<svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="#44755B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;

  // Action icons for collapsed view
  const thumbsUpIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
  </svg>`;

  const thumbsDownIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
  </svg>`;

  const archiveIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"></polyline>
    <rect x="1" y="3" width="22" height="5"></rect>
    <line x1="10" y1="12" x2="14" y2="12"></line>
  </svg>`;

  // Determine active states for icon buttons
  const isGreenlit = p.status === 'greenlight';
  const isNotInterested = p.status === 'not_interested';
  const isArchived = p.status === 'archived';

  const sourceUrlDisplay = p.source_url
    ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${escapeHtml(p.source_url)}</a>`
    : 'N/A';

  return `
    <article class="card collapsed" data-id="${p.id}">
      <div class="card-header" onclick="toggleCard(this)">
        <div class="card-icon-actions">
          <button class="icon-btn greenlight ${isGreenlit ? 'active' : ''}" onclick="event.stopPropagation(); setStatus(${p.id}, '${isGreenlit ? 'new' : 'greenlight'}');" title="${isGreenlit ? 'Remove Greenlight' : 'Greenlight'}">${thumbsUpIcon}</button>
          <button class="icon-btn not-interested ${isNotInterested ? 'active' : ''}" onclick="event.stopPropagation(); setStatus(${p.id}, '${isNotInterested ? 'new' : 'not_interested'}');" title="${isNotInterested ? 'Remove Not Interested' : 'Not Interested'}">${thumbsDownIcon}</button>
          <button class="icon-btn archive ${isArchived ? 'active' : ''}" onclick="event.stopPropagation(); setStatus(${p.id}, '${isArchived ? 'new' : 'archived'}');" title="${isArchived ? 'Unarchive' : 'Archive'}">${archiveIcon}</button>
        </div>
        <h2 class="card-title">${escapeHtml(p.title)}</h2>
        <div class="card-toggle">${chevronIcon}</div>
      </div>
      <div class="card-subtitle">
        <strong>Type:</strong> ${escapeHtml(p.type)} &nbsp;&nbsp; <strong>Date:</strong> ${escapeHtml(p.publication_date || 'N/A')}
      </div>
      <div class="card-body">
      <hr class="card-divider">
      <div class="card-fields">
        <div class="field">
          <div class="field-label">Genre</div>
          <div class="field-value">${escapeHtml(p.genre || 'N/A')}</div>
        </div>
        <div class="field">
          <div class="field-label">Synopsis</div>
          <div class="field-value">${escapeHtml(p.synopsis || 'N/A')}</div>
        </div>
        <div class="field">
          <div class="field-label">ReleaseYear</div>
          <div class="field-value">${escapeHtml(p.release_year || 'TBD')}</div>
        </div>
        <div class="field">
          <div class="field-label">Studio</div>
          <div class="field-value">${escapeHtml(p.studio || 'N/A')}</div>
        </div>
        <div class="field">
          <div class="field-label">Personnel</div>
          <div class="field-value personnel">${escapeHtml(p.personnel || 'Key personnel details not yet announced')}</div>
        </div>
        <div class="field">
          <div class="field-label">SourceURL</div>
          <div class="field-value">${sourceUrlDisplay}</div>
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <div class="field-label">SourceTitle</div>
          <div class="field-value">${escapeHtml(p.source_title || 'N/A')}</div>
        </div>
      </div>
      <hr class="card-actions-divider">
      <div class="card-actions">
        <button class="action-btn greenlight" onclick="setStatus(${p.id}, 'greenlight')">Greenlight</button>
        <button class="action-btn not-interested" onclick="setStatus(${p.id}, 'not_interested')">Not Interested</button>
        <button class="action-btn archive" onclick="setStatus(${p.id}, 'archived')">Archive</button>
      </div>
      </div>
    </article>
  `;
}

function toggleCard(headerEl) {
  const card = headerEl.closest('.card');
  card.classList.toggle('collapsed');
}

// === Actions ===
async function setStatus(id, status) {
  try {
    const res = await fetch(`/api/productions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Error: ' + err.error);
      return;
    }

    // Reload to reflect changes
    loadProductions();
  } catch (err) {
    console.error(err);
    alert('Failed to update status.');
  }
}

// === Sorting ===
function toggleSort(field) {
  if (currentSort === field) {
    // Toggle order
    currentOrder = currentOrder === 'desc' ? 'asc' : 'desc';
  } else {
    currentSort = field;
    currentOrder = 'desc';
  }

  // Update button UI
  document.getElementById('sort-date').classList.toggle('active', field === 'publication_date');
  document.getElementById('sort-genre').classList.toggle('active', field === 'genre');

  const dateArrow = document.getElementById('sort-date-arrow');
  const genreArrow = document.getElementById('sort-genre-arrow');

  if (field === 'publication_date') {
    dateArrow.textContent = currentOrder === 'desc' ? '▼' : '▲';
  } else {
    genreArrow.textContent = currentOrder === 'desc' ? '▼' : '▲';
  }

  loadProductions();
}

// === View Toggle ===
function toggleArchivedView() {
  viewingArchived = !viewingArchived;
  const btn = document.getElementById('btn-archived');
  btn.textContent = viewingArchived ? 'View Active Items' : 'View Archived Items';
  loadProductions();
}

// === Scrape Status ===
async function loadScrapeStatus() {
  try {
    const res = await fetch('/api/scrape-status');
    const data = await res.json();
    const el = document.getElementById('scrape-status');

    let html = '';
    if (data.lastScrapeTime) {
      html += `<span class="last-time">Last search: ${timeAgo(data.lastScrapeTime)}</span>`;
      if (data.lastScrapeResult) {
        html += `<br>${data.lastScrapeResult.newProductionsFound} new from ${data.lastScrapeResult.relevantArticles} relevant articles`;
      }
    } else {
      html += '<span class="last-time">No search run yet</span>';
    }
    html += `<br><span class="next-time">Next: ${formatTime(data.nextScheduledRun)}</span>`;
    el.innerHTML = html;
  } catch (err) {
    console.warn('Failed to load scrape status:', err);
  }
}

// === Manual Scrape Trigger ===
async function triggerScrape() {
  const btn = document.getElementById('btn-scrape');
  const origHtml = btn.innerHTML;
  btn.innerHTML = '&#x23F3; Searching...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/scrape', { method: 'POST' });
    const result = await res.json();
    loadProductions();
    loadScrapeStatus();
    alert(`Search complete.\nSources checked: ${result.sourcesChecked}\nRelevant articles: ${result.relevantArticles}\nNew productions found: ${result.newProductionsFound}\n\n${result.message}`);
  } catch (err) {
    alert('Error running search: ' + err.message);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

// === Utilities ===
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(isoString) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  return `${diffDay}d ${diffHr % 24}h ago`;
}

function formatTime(isoString) {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
    day: 'numeric', month: 'short',
  }) + ' (Amsterdam)';
}
