require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const { getDb, getAllProductions, updateStatus } = require('./db');
const { searchForNewProductions } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Security: Basic HTTP Authentication (optional - only if AUTH_USER and AUTH_PASS are set)
if (process.env.AUTH_USER && process.env.AUTH_PASS) {
  console.log('[Security] HTTP Basic Authentication enabled');
  app.use(basicAuth({
    users: { [process.env.AUTH_USER]: process.env.AUTH_PASS },
    challenge: true,
    realm: 'UK & Ireland Production Tracker',
  }));
} else {
  console.warn('[Security] No authentication configured. Set AUTH_USER and AUTH_PASS in .env for production.');
}

// Security: Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit scrape endpoint to 5 requests per minute
  message: 'Too many scrape requests, please wait before trying again.',
});

app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

// Initialize database on startup
getDb();

// --- Scrape status tracking ---
let lastScrapeTime = null;
let lastScrapeResult = null;
let isScrapingInProgress = false;

// --- API Routes ---

// GET /api/scrape-status - get last search time and next scheduled run
app.get('/api/scrape-status', (req, res) => {
  // Next run: 06:00 Amsterdam time (CET/CEST)
  const now = new Date();
  const amsterdam = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
  const next = new Date(amsterdam);
  next.setHours(6, 0, 0, 0);
  if (next <= amsterdam) next.setDate(next.getDate() + 1);
  // Convert back to UTC for consistent display
  const offsetMs = amsterdam.getTime() - now.getTime();
  const nextUtc = new Date(next.getTime() - offsetMs);

  res.json({
    lastScrapeTime,
    lastScrapeResult: lastScrapeResult ? {
      newProductionsFound: lastScrapeResult.newProductionsFound,
      relevantArticles: lastScrapeResult.relevantArticles,
      totalArticlesFetched: lastScrapeResult.totalArticlesFetched,
      sourcesChecked: lastScrapeResult.sourcesChecked,
    } : null,
    nextScheduledRun: nextUtc.toISOString(),
    schedule: 'Daily at 06:00 Amsterdam time (CET/CEST)',
  });
});

// GET /api/productions - list productions with optional filters and sorting
app.get('/api/productions', (req, res) => {
  try {
    const { status, sort, order } = req.query;
    const productions = getAllProductions({
      status: status || undefined,
      sort: sort || 'publication_date',
      order: order || 'desc',
    });
    res.json(productions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/productions/archived - shortcut for archived items
app.get('/api/productions/archived', (req, res) => {
  try {
    const { sort, order } = req.query;
    const productions = getAllProductions({
      status: 'archived',
      sort: sort || 'publication_date',
      order: order || 'desc',
    });
    res.json(productions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/productions/:id - update production status
app.patch('/api/productions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    const result = updateStatus(Number(id), status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Production not found' });
    }
    res.json({ success: true, id: Number(id), status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/scrape - manually trigger a news search
// Query param: ?days=N (optional, default 2) - number of days to look back for articles
app.post('/api/scrape', scrapeLimiter, async (req, res) => {
  if (isScrapingInProgress) {
    return res.status(429).json({ error: 'A scrape operation is already in progress. Please wait.' });
  }
  
  try {
    isScrapingInProgress = true;
    
    // Get lookback days from query param (default to 2, max 30)
    const days = Math.min(Math.max(parseInt(req.query.days) || 2, 1), 30);
    
    const results = await searchForNewProductions(days);
    lastScrapeTime = new Date().toISOString();
    lastScrapeResult = results;
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isScrapingInProgress = false;
  }
});

// --- Cron Job: run daily at 06:00 Amsterdam time (Europe/Amsterdam) ---
cron.schedule('0 6 * * *', () => {
  // Run in background without blocking cron scheduler
  runScheduledScrape();
}, {
  timezone: 'Europe/Amsterdam',
  runOnInit: false,
});

// Background scraper with retry logic
async function runScheduledScrape() {
  if (isScrapingInProgress) {
    console.warn('[Cron] Scrape already in progress, skipping this run');
    return;
  }

  console.log('[Cron] Running scheduled news search (06:00 Amsterdam)...');
  isScrapingInProgress = true;

  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const results = await searchForNewProductions();
      lastScrapeTime = new Date().toISOString();
      lastScrapeResult = results;
      console.log(`[Cron] Scheduled search completed successfully`);
      break; // Success, exit retry loop
    } catch (err) {
      attempt++;
      console.error(`[Cron] Error during scheduled search (attempt ${attempt}/${maxRetries + 1}): ${err.message}`);
      
      if (attempt <= maxRetries) {
        console.log(`[Cron] Retrying in 5 minutes...`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      } else {
        console.error('[Cron] All retry attempts failed');
      }
    }
  }

  isScrapingInProgress = false;
}

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`UK & Ireland Production Tracker running at http://localhost:${PORT}`);
  console.log('Cron job scheduled: daily at 06:00 Amsterdam time');
});
