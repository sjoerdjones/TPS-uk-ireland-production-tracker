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
  
  // Check if we should expand a specific card (after dig deeper)
  const expandedCardId = sessionStorage.getItem('expandedCardId');
  if (expandedCardId) {
    const cardToExpand = document.querySelector(`.card[data-id="${expandedCardId}"]`);
    if (cardToExpand) {
      cardToExpand.classList.remove('collapsed');
      // Scroll to the card
      cardToExpand.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Clear the stored ID
    sessionStorage.removeItem('expandedCardId');
  }
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

  const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
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
        ${p.background ? `<div class="field" style="grid-column: 1 / -1;">
          <div class="field-label">Background</div>
          <div class="field-value background">${escapeHtml(p.background)}</div>
        </div>` : ''}
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
        <button class="action-btn dig-deeper" onclick="digDeeper(${p.id})">${searchIcon} Dig Deeper</button>
        <button class="action-btn greenlight" onclick="setStatus(${p.id}, 'greenlight')">Greenlight</button>
        <button class="action-btn not-interested" onclick="setStatus(${p.id}, 'not_interested')">Not Interested</button>
        <button class="action-btn archive" onclick="setStatus(${p.id}, 'archived')">Archive</button>
      </div>
      ${p.enriched_data ? renderEnrichedData(p.enriched_data) : ''}
      </div>
    </article>
  `;
}

function renderEnrichedData(enrichedDataJson) {
  let data;
  try {
    data = typeof enrichedDataJson === 'string' ? JSON.parse(enrichedDataJson) : enrichedDataJson;
  } catch (err) {
    console.error('Failed to parse enriched data:', err);
    return '';
  }

  let html = '<div class="enriched-section">';
  html += '<hr class="card-divider">';
  html += '<div class="enriched-header">Dig Deeper Results</div>';
  
  // IMDb Link
  if (data.imdb_url) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">IMDb</div>`;
    html += `<div class="field-value"><a href="${escapeHtml(data.imdb_url)}" target="_blank" rel="noopener">${escapeHtml(data.imdb_url)}</a>`;
    if (data.imdb_rating) {
      html += ` (Rating: ${escapeHtml(data.imdb_rating)})`;
    }
    html += '</div></div>';
  }
  
  // Detailed Synopsis
  if (data.detailed_synopsis) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Detailed Synopsis</div>`;
    html += `<div class="field-value">${escapeHtml(data.detailed_synopsis)}</div>`;
    html += '</div>';
  }
  
  // Themes
  if (data.themes) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Themes & Tone</div>`;
    html += `<div class="field-value">${escapeHtml(data.themes)}</div>`;
    html += '</div>';
  }
  
  // Director
  if (data.director && data.director.length > 0) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Director(s)</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    data.director.forEach(person => {
      html += `<li><strong>${escapeHtml(person.name)}</strong>`;
      if (person.notable_works) html += ` (${escapeHtml(person.notable_works)})`;
      html += '</li>';
    });
    html += '</ul></div></div>';
  }
  
  // Writer
  if (data.writer && data.writer.length > 0) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Writer(s)</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    data.writer.forEach(person => {
      html += `<li><strong>${escapeHtml(person.name)}</strong>`;
      if (person.notable_works) html += ` (${escapeHtml(person.notable_works)})`;
      html += '</li>';
    });
    html += '</ul></div></div>';
  }
  
  // Cast
  if (data.cast && data.cast.length > 0) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Cast</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    data.cast.forEach(member => {
      html += `<li><strong>${escapeHtml(member.name)}</strong>`;
      if (member.character) html += ` as ${escapeHtml(member.character)}`;
      html += '</li>';
    });
    html += '</ul></div></div>';
  }
  
  // Producers
  if (data.producers && data.producers.length > 0) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Producers</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    data.producers.forEach(name => {
      html += `<li>${escapeHtml(name)}</li>`;
    });
    html += '</ul></div></div>';
  }
  
  // Production Details
  const hasProductionDetails = data.production_companies || data.filming_locations || data.production_status || 
                                data.filming_dates || data.budget || data.episodes;
  if (hasProductionDetails) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Production Details</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    
    if (data.production_companies) {
      const companies = Array.isArray(data.production_companies) 
        ? data.production_companies.join(', ') 
        : data.production_companies;
      html += `<li><strong>Companies:</strong> ${escapeHtml(companies)}</li>`;
    }
    
    if (data.filming_locations) {
      const locations = Array.isArray(data.filming_locations) 
        ? data.filming_locations.join(', ') 
        : data.filming_locations;
      html += `<li><strong>Locations:</strong> ${escapeHtml(locations)}</li>`;
    }
    
    if (data.production_status) html += `<li><strong>Status:</strong> ${escapeHtml(data.production_status)}</li>`;
    
    if (data.filming_dates) {
      if (data.filming_dates.start) html += `<li><strong>Start Date:</strong> ${escapeHtml(data.filming_dates.start)}</li>`;
      if (data.filming_dates.end) html += `<li><strong>End Date:</strong> ${escapeHtml(data.filming_dates.end)}</li>`;
    }
    
    if (data.budget) html += `<li><strong>Budget:</strong> ${escapeHtml(data.budget)}</li>`;
    if (data.episodes) html += `<li><strong>Episodes:</strong> ${escapeHtml(data.episodes)}</li>`;
    
    html += '</ul></div></div>';
  }
  
  // Distribution
  if (data.distributor || data.release_date || data.platform) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Distribution</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    
    if (data.distributor) {
      const distributors = Array.isArray(data.distributor) 
        ? data.distributor.join(', ') 
        : data.distributor;
      html += `<li><strong>Distributor:</strong> ${escapeHtml(distributors)}</li>`;
    }
    
    if (data.release_date) html += `<li><strong>Release Date:</strong> ${escapeHtml(data.release_date)}</li>`;
    if (data.platform) html += `<li><strong>Platform:</strong> ${escapeHtml(data.platform)}</li>`;
    
    html += '</ul></div></div>';
  }
  
  // Recent News
  if (data.recent_news && data.recent_news.length > 0) {
    html += `<div class="enriched-field">`;
    html += `<div class="field-label">Recent News</div>`;
    html += '<div class="field-value"><ul class="enriched-list">';
    data.recent_news.forEach(news => {
      html += '<li>';
      if (news.source_url) {
        html += `<a href="${escapeHtml(news.source_url)}" target="_blank" rel="noopener"><strong>${escapeHtml(news.headline)}</strong></a>`;
      } else {
        html += `<strong>${escapeHtml(news.headline)}</strong>`;
      }
      if (news.date) html += ` (${escapeHtml(news.date)})`;
      html += '</li>';
    });
    html += '</ul></div></div>';
  }
  
  html += '</div>';
  return html;
}

function toggleCard(headerEl) {
  const card = headerEl.closest('.card');
  card.classList.toggle('collapsed');
}

// === Actions ===
async function digDeeper(id) {
  const card = document.querySelector(`.card[data-id="${id}"]`);
  const btn = card.querySelector('.action-btn.dig-deeper');
  const origHtml = btn.innerHTML;
  
  btn.innerHTML = '&#x23F3; Researching...';
  btn.disabled = true;
  
  try {
    const res = await fetch(`/api/productions/${id}/dig-deeper`, {
      method: 'POST',
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert('Error: ' + err.error);
      return;
    }
    
    const result = await res.json();
    
    // Store the ID to keep it expanded after reload
    sessionStorage.setItem('expandedCardId', id);
    
    // Reload to show enriched data
    await loadProductions();
    
    alert('Research complete! The card has been expanded to show detailed information.');
  } catch (err) {
    console.error(err);
    alert('Failed to research production.');
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

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
async function triggerScrape(days = 2) {
  const btnId = days === 7 ? 'btn-scrape-week' : 'btn-scrape';
  const btn = document.getElementById(btnId);
  const origHtml = btn.innerHTML;
  btn.innerHTML = '&#x23F3; Searching...';
  btn.disabled = true;
  
  // Also disable the other button to prevent concurrent searches
  const otherBtnId = days === 7 ? 'btn-scrape' : 'btn-scrape-week';
  const otherBtn = document.getElementById(otherBtnId);
  otherBtn.disabled = true;

  try {
    const res = await fetch(`/api/scrape?days=${days}`, { method: 'POST' });
    const result = await res.json();
    loadProductions();
    loadScrapeStatus();
    alert(`Search complete (${days} day lookback).\nSources checked: ${result.sourcesChecked}\nRelevant articles: ${result.relevantArticles}\nNew productions found: ${result.newProductionsFound}\n\n${result.message}`);
  } catch (err) {
    alert('Error running search: ' + err.message);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
    otherBtn.disabled = false;
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
