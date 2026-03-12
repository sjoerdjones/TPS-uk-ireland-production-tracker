/**
 * Scraper module for UK & Ireland production news.
 *
 * Fetches RSS feeds from major entertainment news sites,
 * filters for UK/Ireland-related production announcements,
 * extracts structured data, and inserts into the database.
 *
 * Optionally uses OpenAI API for smarter extraction if OPENAI_API_KEY is set.
 */

const https = require('https');
const http = require('http');
const { XMLParser } = require('fast-xml-parser');
const cheerio = require('cheerio');
const { insertProduction } = require('./db');

// --- Configuration ---

// Set this env var for AI-powered extraction: set OPENAI_API_KEY=sk-...
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// Set this env var for TMDB discovery: get a free key at https://www.themoviedb.org/settings/api
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
// Set this env var for OMDb enrichment: get a free key at http://www.omdbapi.com/apikey.aspx
const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
// Set this env var for Gemini web search: get a free key at https://ai.google.dev/
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// DEBUG: Log what we actually got from environment
console.log('[Scraper/DEBUG] OPENAI_API_KEY loaded:', OPENAI_API_KEY ? `YES (${OPENAI_API_KEY.substring(0, 10)}...)` : 'NO');
console.log('[Scraper/DEBUG] TMDB_API_KEY loaded:', TMDB_API_KEY ? 'YES' : 'NO');
console.log('[Scraper/DEBUG] OMDB_API_KEY loaded:', OMDB_API_KEY ? 'YES' : 'NO');

const RSS_FEEDS = [
  { name: 'Variety - Film',         url: 'https://variety.com/v/film/feed/' },
  { name: 'Variety - TV',           url: 'https://variety.com/v/tv/feed/' },
  { name: 'Deadline - Main',        url: 'https://deadline.com/feed/rss' },
  { name: 'Deadline - Film',        url: 'https://deadline.com/category/film/feed/' },
  { name: 'Deadline - TV',          url: 'https://deadline.com/category/tv/feed/' },
  { name: 'Hollywood Reporter',     url: 'https://www.hollywoodreporter.com/feed/' },
  { name: 'IndieWire',              url: 'https://www.indiewire.com/feed/' },
  { name: 'Screen Daily - News',      url: 'https://www.screendaily.com/901.rss' },
  { name: 'Screen Daily - Intl',      url: 'https://www.screendaily.com/international/902.rss' },
  { name: 'Screen Daily - Production', url: 'https://www.screendaily.com/production/903.rss' },
  { name: 'Screen Daily - Business',   url: 'https://www.screendaily.com/business/904.rss' },
  { name: 'Screen Daily - UK/IE',     url: 'https://www.screendaily.com/territories/uk-and-ireland/2.rss' },
  { name: 'Production Intelligence', url: 'https://www.productionintelligence.com/feed' },
  { name: 'BFI News',               url: 'https://www.bfi.org.uk/news/feed' },
  { name: 'Little White Lies',      url: 'https://littlewhitelies.co.uk/feed' },
  { name: 'IFTN (Irish Film & TV)', url: 'https://www.iftn.ie/rss/rss.xml' },
  { name: 'Shoot Magazine',         url: 'https://www.shootonline.com/feed' },
  { name: 'Film News UK',           url: 'https://www.film-news.co.uk/rss/film-news.xml' },
  { name: 'Broadcast Now',          url: 'https://www.broadcastnow.co.uk/rss' },
  { name: 'Google Alerts - UK/IE',  url: 'https://www.google.nl/alerts/feeds/02410166039308921775/590286846440630370' },
  { name: 'Google Alerts - UK/IE 2', url: 'https://www.google.nl/alerts/feeds/02410166039308921775/2641158984982489582' },
  { name: 'Google Alerts - UK/IE 3', url: 'https://www.google.nl/alerts/feeds/02410166039308921775/11756065659132789461' },
  { name: 'The People\'s Movies',    url: 'https://thepeoplesmovies.com/feed/' },
];

// Keywords that indicate UK/Ireland relevance
const UK_IRELAND_KEYWORDS = [
  'uk', 'u.k.', 'united kingdom', 'britain', 'british',
  'england', 'english', 'scotland', 'scottish', 'wales', 'welsh',
  'ireland', 'irish', 'northern ireland',
  'london', 'belfast', 'dublin', 'edinburgh', 'cardiff', 'glasgow',
  'manchester', 'liverpool', 'leeds', 'bristol', 'cornwall',
  'wicklow', 'cork', 'galway', 'shepperton', 'pinewood', 'elstree', 'leavesden',
  'bbc', 'itv', 'channel 4', 'sky', 'film4', 'bfi',
  'screen ireland', 'northern ireland screen',
  'element pictures', 'working title', 'aardman',
  'bafta', 'ealing', 'west end',
];

// Keywords indicating production news (not just reviews/box office)
const PRODUCTION_KEYWORDS = [
  'greenlit', 'greenlight', 'green-lit',
  'filming', 'shoots', 'shooting', 'production underway', 'begins production',
  'starts filming', 'wraps filming', 'principal photography', 'wraps',
  'cast', 'casting', 'joins cast', 'set to star', 'attached to',
  'director attached', 'to direct', 'boards', 'set to direct',
  'renewed', 'ordered', 'picked up', 'commission', 'commissioned',
  'adaptation', 'reboot', 'sequel', 'prequel', 'spin-off',
  'new series', 'new film', 'new movie',
  'funding', 'backed by', 'investment',
  'production', 'in production', 'pre-production', 'post-production',
  'announcement', 'announced', 'sets', 'in development', 'development',
  'produces', 'producer', 'director', 'starring', 'stars',
  'latest updates', 'roundup', 'update',
];

// Industry sites to scrape for production listings
const INDUSTRY_SITES = [
  { name: 'Screen Ireland - Funding Decisions', url: 'https://www.screenireland.ie/funding/funding-decisions' },
  { name: 'BFC Filmography', url: 'https://britishfilmcommission.org.uk/filmography/' },
  { name: 'Screen Ireland - News', url: 'https://www.screenireland.ie/news' },
  { name: 'Movie Insider', url: 'https://www.movieinsider.com/production-listings' },
];

// TMDB genre ID mapping
const TMDB_GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'Historical',
  27: 'Horror', 10402: 'Musical', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi', 10766: 'Soap', 10767: 'Talk', 10768: 'War',
};

// --- Main Search Function ---

async function searchForNewProductions() {
  console.log(`[Scraper] Starting search at ${new Date().toISOString()}`);
  console.log(`[Scraper] AI extraction: ${OPENAI_API_KEY ? 'ENABLED' : 'DISABLED (set OPENAI_API_KEY for better results)'}`);
  console.log(`[Scraper] Gemini web search: ${GEMINI_API_KEY ? 'ENABLED' : 'DISABLED (set GEMINI_API_KEY for Google Search)'}`);
  console.log(`[Scraper] TMDB discovery: ${TMDB_API_KEY ? 'ENABLED' : 'DISABLED (set TMDB_API_KEY for movie/TV database results)'}`);
  console.log(`[Scraper] OMDb enrichment: ${OMDB_API_KEY ? 'ENABLED' : 'DISABLED (set OMDB_API_KEY for better details)'}`);

  const allArticles = [];
  let sourcesChecked = 0;
  let newCount = 0;
  const newTitles = [];

  // 1. Fetch all RSS feeds in parallel
  const feedPromises = RSS_FEEDS.map(async (feed) => {
    try {
      const xml = await fetchUrl(feed.url);
      const articles = parseRssFeed(xml, feed.name);
      sourcesChecked++;
      console.log(`[Scraper] ${feed.name}: ${articles.length} recent articles`);
      return articles;
    } catch (err) {
      console.warn(`[Scraper] Failed to fetch ${feed.name}: ${err.message}`);
      return [];
    }
  });

  const feedResults = await Promise.all(feedPromises);
  for (const articles of feedResults) {
    allArticles.push(...articles);
  }

  console.log(`[Scraper] Fetched ${allArticles.length} total articles from ${sourcesChecked} sources`);

  // 2. Filter for UK/Ireland + production-related articles
  const relevant = allArticles.filter(article => {
    const text = `${article.title} ${article.description}`.toLowerCase();
    const hasUkIreland = UK_IRELAND_KEYWORDS.some(kw => text.includes(kw));
    const hasProduction = PRODUCTION_KEYWORDS.some(kw => text.includes(kw));
    const isRelevant = hasUkIreland && hasProduction;
    
    // Debug logging: show why articles are filtered out
    if (!isRelevant && (hasUkIreland || hasProduction)) {
      if (hasUkIreland && !hasProduction) {
        console.log(`[Scraper/Debug] Filtered out (UK/IE but no production keywords): ${article.title.substring(0, 80)}`);
      } else if (hasProduction && !hasUkIreland) {
        console.log(`[Scraper/Debug] Filtered out (production keywords but no UK/IE): ${article.title.substring(0, 80)}`);
      }
    }
    
    return isRelevant;
  });

  console.log(`[Scraper] Found ${relevant.length} UK/Ireland production articles`);
  console.log(`[Scraper] Filtered out: ${allArticles.length - relevant.length} articles (${allArticles.length - relevant.length} didn't match both UK/IE + production criteria)`);

  // 3. Extract structured data from RSS and insert
  for (const article of relevant) {
    try {
      // Check if this is a roundup article (multiple productions in one article)
      const isRoundup = /\blatest updates\b|\bproductions shooting\b|\broundup\b/i.test(article.title);
      
      let productions = [];

      if (OPENAI_API_KEY && isRoundup) {
        // For roundup articles, fetch full content and extract multiple productions
        console.log(`[Scraper] Detected roundup article: ${article.title}`);
        try {
          const fullContent = await fetchArticleContent(article.link);
          productions = await extractMultipleProductionsWithAI(fullContent, article);
          console.log(`[Scraper] Extracted ${productions.length} productions from roundup article`);
        } catch (err) {
          console.warn(`[Scraper] Failed to fetch full article content: ${err.message}`);
          // Fall back to single extraction from RSS
          const single = await extractWithAI(article);
          if (single) productions = [single];
        }
      } else if (OPENAI_API_KEY) {
        const single = await extractWithAI(article);
        if (single) productions = [single];
      } else {
        const single = extractFromArticle(article);
        if (single) productions = [single];
      }

      // Process each extracted production
      for (const production of productions) {
        if (production && production.title) {
          // Enrich with OMDb if enabled
          if (OMDB_API_KEY) {
            try {
              const enriched = await enrichWithOMDB(production);
              if (enriched) production = enriched;
            } catch (err) {
              console.warn(`[Scraper/OMDb] Failed to enrich "${production.title}": ${err.message}`);
            }
          }

          const result = insertProduction(production);
          if (result) {
            newCount++;
            newTitles.push(production.title);
            console.log(`[Scraper] NEW (RSS): ${production.title}`);
          }
        }
      }
    } catch (err) {
      console.warn(`[Scraper] Error processing "${article.title}": ${err.message}`);
    }
  }

  // 4. Gemini Web Search with Google Search grounding (if API key is set)
  if (GEMINI_API_KEY) {
    try {
      const geminiResults = await searchWithGemini();
      sourcesChecked++;
      for (const production of geminiResults) {
        const result = insertProduction(production);
        if (result) {
          newCount++;
          newTitles.push(production.title);
          console.log(`[Scraper] NEW (Gemini Search): ${production.title}`);
        }
      }
    } catch (err) {
      console.warn(`[Scraper] Gemini web search failed: ${err.message}`);
    }
  }

  // 5. TMDB Discovery (if API key is set)
  if (TMDB_API_KEY) {
    try {
      const tmdbResults = await searchTMDB();
      sourcesChecked++;
      for (const production of tmdbResults) {
        const result = insertProduction(production);
        if (result) {
          newCount++;
          newTitles.push(production.title);
          console.log(`[Scraper] NEW (TMDB): ${production.title}`);
        }
      }
    } catch (err) {
      console.warn(`[Scraper] TMDB search failed: ${err.message}`);
    }
  }

  // 6. Industry site scraping - Movie Insider only (others still disabled due to quality issues)
  try {
    // Only scrape Movie Insider
    const miProductions = await scrapeMovieInsider();
    sourcesChecked++;
    for (let production of miProductions) {
      // Enrich with OMDb if enabled
      if (OMDB_API_KEY) {
        try {
          const enriched = await enrichWithOMDB(production);
          if (enriched) production = enriched;
        } catch (err) {
          console.warn(`[Scraper/OMDb] Failed to enrich "${production.title}": ${err.message}`);
        }
      }

      const result = insertProduction(production);
      if (result) {
        newCount++;
        newTitles.push(production.title);
        console.log(`[Scraper] NEW (Movie Insider): ${production.title}`);
      }
    }
  } catch (err) {
    console.warn(`[Scraper] Movie Insider scraping failed: ${err.message}`);
  }

  const results = {
    timestamp: new Date().toISOString(),
    sourcesChecked,
    totalArticlesFetched: allArticles.length,
    relevantArticles: relevant.length,
    newProductionsFound: newCount,
    productions: newTitles,
    aiEnabled: !!OPENAI_API_KEY,
    tmdbEnabled: !!TMDB_API_KEY,
    omdbEnabled: !!OMDB_API_KEY,
    message: newCount > 0
      ? `Found ${newCount} new production(s): ${newTitles.join(', ')}`
      : `Search complete. ${relevant.length} relevant articles found, but no new productions to add (may already exist in database).`,
  };

  console.log(`[Scraper] Done. ${newCount} new productions added.`);
  return results;
}

// --- Gemini Web Search with Google Search Grounding ---

async function searchWithGemini() {
  console.log('[Scraper/Gemini] Searching web with Google Search for UK/Ireland production news...');
  
  const prompt = `Search the web for UK and Ireland film and television production news from the last 24-48 hours.

Focus on:
- Greenlit projects and new commissions
- Casting announcements
- Filming start dates and production updates
- New series orders and renewals
- UK/Ireland co-productions

Only include productions that are:
- Based in UK or Ireland (filming location or production company)
- In active development, pre-production, or production (not released/completed)
- Announced recently

IMPORTANT: For source_url, provide the DIRECT article URL (e.g., https://www.screendaily.com/news/..., https://deadline.com/..., https://variety.com/...). Do NOT use redirect or temporary URLs.

Return ONLY a JSON array with this exact structure (no markdown, no explanations):
[
  {
    "title": "Production title",
    "type": "Movie" or "TV Series",
    "genre": "Genre(s)",
    "synopsis": "Brief 1-2 sentence description",
    "release_year": "2026" or "TBD",
    "studio": "Production company/studio",
    "personnel": "Dir: Name. Writer: Name. Cast: Names",
    "source_url": "Direct URL to the article (not a redirect)",
    "source_title": "Article headline"
  }
]

If no relevant news found, return empty array [].`;

  try {
    const result = await callGeminiWithSearch(prompt);
    const response = result.text;
    const groundingMetadata = result.groundingMetadata;
    
    console.log('[Scraper/Gemini] Response length:', response.length, 'characters');
    console.log('[Scraper/Gemini] Raw response preview:', response.substring(0, 500));
    
    // Note: Gemini's grounding metadata doesn't provide actual article URLs,
    // only redirect links that aren't useful for end users
    
    // Try to parse JSON from response (Gemini might wrap it in markdown)
    // First try to extract from markdown code blocks
    let jsonText = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }
    
    // Now try to find complete JSON array
    let jsonMatch = jsonText.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
    }
    
    if (!jsonMatch) {
      console.log('[Scraper/Gemini] No JSON array found in response');
      console.log('[Scraper/Gemini] Full response:', response);
      return [];
    }
    
    const productions = JSON.parse(jsonMatch[0]);
    console.log(`[Scraper/Gemini] Found ${productions.length} productions from web search`);
    
    // Replace Gemini redirect URLs with generic search links
    return productions.map(p => {
      let cleanUrl = p.source_url;
      let cleanSourceTitle = p.source_title;
      
      // Check if it's a grounding redirect URL
      if (cleanUrl && cleanUrl.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
        // Create a Google search URL for the production title
        const searchQuery = encodeURIComponent(`"${p.title}" UK Ireland film production`);
        cleanUrl = `https://www.google.com/search?q=${searchQuery}`;
        cleanSourceTitle = 'Search Google for this production';
        console.log(`[Scraper/Gemini] Replaced redirect with search link for: ${p.title}`);
      }
      
      return {
        ...p,
        source_url: cleanUrl,
        source_title: cleanSourceTitle,
        publication_date: new Date().toISOString().split('T')[0],
      };
    });
  } catch (err) {
    console.warn(`[Scraper/Gemini] Failed to parse results: ${err.message}`);
    return [];
  }
}

function callGeminiWithSearch(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      tools: [{
        google_search: {}  // Enable Google Search grounding for Gemini 2.5+ (v1beta required)
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8000,  // Increased to handle multiple productions
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else if (parsed.candidates && parsed.candidates[0]) {
            const candidate = parsed.candidates[0];
            const finishReason = candidate.finishReason || 'UNKNOWN';
            console.log(`[Scraper/Gemini] Finish reason: ${finishReason}`);
            
            if (finishReason === 'MAX_TOKENS') {
              console.warn('[Scraper/Gemini] Response truncated due to token limit');
            }
            
            // Extract grounding metadata for actual URLs
            const groundingMetadata = candidate.groundingMetadata;
            
            if (candidate.content?.parts?.[0]?.text) {
              resolve({ text: candidate.content.parts[0].text, groundingMetadata });
            } else {
              reject(new Error('No text in Gemini response'));
            }
          } else {
            reject(new Error('Unexpected Gemini response format'));
          }
        } catch (e) {
          reject(new Error('Failed to parse Gemini response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Gemini request timeout')); });
    req.write(body);
    req.end();
  });
}

// --- ChatGPT Web Search (DISABLED - kept for reference) ---

async function searchWithChatGPT_DISABLED() {
  console.log('[Scraper/ChatGPT] Searching web for UK/Ireland production news...');
  
  const prompt = `You are a film industry news researcher. Search the web for UK and Ireland film and television production news from the last 24 hours.

Focus on:
- Greenlit projects and new commissions
- Casting announcements
- Filming start dates and production updates
- New series orders and renewals
- UK/Ireland co-productions

Only include productions that are:
- Based in UK or Ireland (filming location or production company)
- In active development, pre-production, or production (not released/completed)
- Announced in the last 24-48 hours

Return ONLY a JSON array with this exact structure:
[
  {
    "title": "Production title",
    "type": "Movie" or "TV Series",
    "genre": "Genre(s)",
    "synopsis": "Brief 1-2 sentence description",
    "release_year": "2026" or "TBD",
    "studio": "Production company/studio",
    "personnel": "Dir: Name. Writer: Name. Cast: Names",
    "source_url": "URL of the news article",
    "source_title": "Article headline"
  }
]

If no relevant news found, return empty array [].`;

  try {
    const response = await callOpenAIWithSearch(prompt);
    console.log('[Scraper/ChatGPT] Raw response:', response.substring(0, 500));
    
    // Try to parse JSON from response
    let jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      console.log('[Scraper/ChatGPT] No JSON array found in response');
      console.log('[Scraper/ChatGPT] Full response:', response);
      return [];
    }
    
    const productions = JSON.parse(jsonMatch[0]);
    console.log(`[Scraper/ChatGPT] Found ${productions.length} productions from web search`);
    
    // Add publication_date to each
    return productions.map(p => ({
      ...p,
      publication_date: new Date().toISOString().split('T')[0],
    }));
  } catch (err) {
    console.warn(`[Scraper/ChatGPT] Failed to parse results: ${err.message}`);
    return [];
  }
}

function callOpenAIWithSearch(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o',  // gpt-4o has web search capability
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed.choices[0].message.content.trim());
          }
        } catch (e) {
          reject(new Error('Failed to parse OpenAI response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('OpenAI request timeout')); });
    req.write(body);
    req.end();
  });
}

// --- OMDb Enrichment ---

async function enrichWithOMDB(production) {
  if (!production.title) return null;

  // Search for the title
  // We use type=movie or type=series if known, but scraper often defaults to Movie
  const typeParam = production.type === 'TV Series' ? '&type=series' : '&type=movie';
  const yearParam = production.release_year && production.release_year !== 'TBD' ? `&y=${production.release_year}` : '';

  const searchUrl = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(production.title)}${typeParam}${yearParam}`;
  
  try {
    const searchData = JSON.parse(await fetchUrl(searchUrl));

    if (searchData.Response === 'True' && searchData.Search && searchData.Search.length > 0) {
      // iterate through results to find the best match
      for (const result of searchData.Search) {
        // Skip if year is too far off (unless we didn't have a year)
        // Note: OMDb years can be ranges for series (e.g. "2024–")
        const resultYear = parseInt(result.Year.substring(0, 4));
        const expectedYear = parseInt(production.release_year);
        
        // If we have a specific year, ensure match is close (+/- 1 year)
        if (!isNaN(expectedYear) && !isNaN(resultYear)) {
          if (Math.abs(expectedYear - resultYear) > 1) continue;
        }

        // Fetch full details to check Country
        const detailsUrl = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${result.imdbID}&plot=full`;
        const details = JSON.parse(await fetchUrl(detailsUrl));

        if (details.Response === 'True') {
          // Check Country (must include UK or Ireland)
          const countries = (details.Country || '').toLowerCase();
          const isRelevant = /uk|united kingdom|britain|ireland|northern ireland/.test(countries);
          
          if (!isRelevant) {
            console.log(`[Scraper/OMDb] Skipped "${details.Title}" (${details.Country}) - not UK/Ireland`);
            continue;
          }

          console.log(`[Scraper/OMDb] Enriched "${production.title}" with data from ${details.Title} (${details.Year})`);

          // Merge details, preferring OMDb data for missing/generic fields
          return {
            ...production,
            // Only override if OMDb has better data and current is generic/empty
            genre: (!production.genre || production.genre === 'Not specified') ? details.Genre : production.genre,
            synopsis: (!production.synopsis || production.synopsis.length < 50) ? details.Plot : production.synopsis,
            release_year: (!production.release_year || production.release_year === 'TBD') ? details.Year : production.release_year,
            studio: (!production.studio || production.studio.includes('not yet announced')) ? details.Production || details.BoxOffice : production.studio,
            personnel: (!production.personnel || production.personnel.includes('not yet announced')) 
              ? `Dir: ${details.Director}. Writer: ${details.Writer}. Cast: ${details.Actors}` 
              : production.personnel,
            // Append OMDb link if source URL is generic
            source_url: production.source_url || `https://www.imdb.com/title/${result.imdbID}/`,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Scraper/OMDb] Error enriching "${production.title}": ${err.message}`);
  }

  return null;
}

// --- TMDB Discovery ---

async function searchTMDB() {
  console.log('[Scraper/TMDB] Searching TMDB for UK/Ireland productions...');
  const productions = [];
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pastDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Search for movies from GB and IE
  for (const country of ['GB', 'IE']) {
    try {
      // Upcoming + recently released movies
      const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_origin_country=${country}&primary_release_date.gte=${pastDate}&primary_release_date.lte=${futureDate}&sort_by=primary_release_date.desc&page=1`;
      const movieData = JSON.parse(await fetchUrl(movieUrl));
      console.log(`[Scraper/TMDB] ${country} movies: ${movieData.results?.length || 0} found`);

      for (const movie of (movieData.results || []).slice(0, 10)) {
        try {
          const detail = await fetchTMDBDetails('movie', movie.id);
          if (detail) productions.push(detail);
        } catch (err) {
          console.warn(`[Scraper/TMDB] Failed to get details for movie ${movie.id}: ${err.message}`);
        }
      }

      // Upcoming + recently aired TV
      const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=${country}&first_air_date.gte=${pastDate}&first_air_date.lte=${futureDate}&sort_by=first_air_date.desc&page=1`;
      const tvData = JSON.parse(await fetchUrl(tvUrl));
      console.log(`[Scraper/TMDB] ${country} TV: ${tvData.results?.length || 0} found`);

      for (const show of (tvData.results || []).slice(0, 10)) {
        try {
          const detail = await fetchTMDBDetails('tv', show.id);
          if (detail) productions.push(detail);
        } catch (err) {
          console.warn(`[Scraper/TMDB] Failed to get details for TV ${show.id}: ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`[Scraper/TMDB] Failed to discover ${country} productions: ${err.message}`);
    }
  }

  console.log(`[Scraper/TMDB] Total productions extracted: ${productions.length}`);
  return productions;
}

async function fetchTMDBDetails(type, id) {
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
  const data = JSON.parse(await fetchUrl(url));

  const title = data.title || data.name || '';
  if (!title) return null;

  // Extract genre names
  const genres = (data.genres || []).map(g => g.name).slice(0, 3).join(' / ') || 'Not specified';

  // Extract personnel from credits
  const personnel = [];
  if (data.credits) {
    const directors = (data.credits.crew || []).filter(c => c.job === 'Director').slice(0, 2);
    if (directors.length) personnel.push(`Dir: ${directors.map(d => d.name).join(', ')}`);

    const writers = (data.credits.crew || []).filter(c => c.department === 'Writing').slice(0, 2);
    if (writers.length) personnel.push(`Writer: ${writers.map(w => w.name).join(', ')}`);

    const cast = (data.credits.cast || []).slice(0, 4);
    if (cast.length) personnel.push(`Cast: ${cast.map(c => c.name).join(', ')}`);
  }

  // Extract studios/networks
  let studio = '';
  if (type === 'movie') {
    studio = (data.production_companies || []).map(c => c.name).slice(0, 3).join(', ');
  } else {
    const networks = (data.networks || []).map(n => n.name).slice(0, 3);
    const companies = (data.production_companies || []).map(c => c.name).slice(0, 2);
    studio = [...networks, ...companies].join(', ');
  }

  const releaseDate = data.release_date || data.first_air_date || '';
  const releaseYear = releaseDate ? releaseDate.substring(0, 4) : 'TBD';

  return {
    title,
    type: type === 'movie' ? 'Movie' : 'TV Series',
    genre: genres,
    synopsis: (data.overview || '').substring(0, 300) || 'No synopsis available',
    release_year: releaseYear,
    publication_date: new Date().toISOString().split('T')[0],
    studio: studio || 'Studio not listed',
    personnel: personnel.join('. ') || 'Personnel not listed',
    source_title: `TMDB: ${title}`,
    source_url: `https://www.themoviedb.org/${type}/${id}`,
  };
}

// --- Industry Site Scraping ---

async function scrapeIndustrySites() {
  console.log('[Scraper/Industry] Scraping industry sites...');
  const productions = [];

  // 1. Screen Ireland Funding Decisions
  try {
    const siProductions = await scrapeScreenIreland();
    productions.push(...siProductions);
    console.log(`[Scraper/Industry] Screen Ireland: ${siProductions.length} productions found`);
  } catch (err) {
    console.warn(`[Scraper/Industry] Screen Ireland scraping failed: ${err.message}`);
  }

  // 2. BFC Filmography
  try {
    const bfcProductions = await scrapeBFCFilmography();
    productions.push(...bfcProductions);
    console.log(`[Scraper/Industry] BFC Filmography: ${bfcProductions.length} productions found`);
  } catch (err) {
    console.warn(`[Scraper/Industry] BFC Filmography scraping failed: ${err.message}`);
  }

  // 3. Screen Ireland News
  try {
    const siNews = await scrapeScreenIrelandNews();
    productions.push(...siNews);
    console.log(`[Scraper/Industry] Screen Ireland News: ${siNews.length} productions found`);
  } catch (err) {
    console.warn(`[Scraper/Industry] Screen Ireland News scraping failed: ${err.message}`);
  }

  // 4. Movie Insider Production Listings
  try {
    const miProductions = await scrapeMovieInsider();
    productions.push(...miProductions);
    console.log(`[Scraper/Industry] Movie Insider: ${miProductions.length} productions found`);
  } catch (err) {
    console.warn(`[Scraper/Industry] Movie Insider scraping failed: ${err.message}`);
  }

  console.log(`[Scraper/Industry] Total from industry sites: ${productions.length}`);
  return productions;
}

async function scrapeScreenIreland() {
  const html = await fetchUrl('https://www.screenireland.ie/funding/funding-decisions');
  const $ = cheerio.load(html);
  const productions = [];

  // Screen Ireland lists funding decisions in structured blocks
  // Look for production-related entries (not just development)
  $('div, article, section, tr').each((_, el) => {
    const text = $(el).text();
    // Look for entries that mention production-related funding types
    if (/Production|Completion|Animation Production/i.test(text) &&
        !/^\s*$/.test(text) && text.length < 2000) {

      // Try to extract project details from the block
      const lines = text.split(/\n/).map(l => l.trim()).filter(l => l);

      let title = '';
      let director = '';
      let writer = '';
      let company = '';
      let year = '';
      let fundingType = '';

      for (const line of lines) {
        if (/^Director/i.test(line)) director = line.replace(/^Director\s*/i, '').trim();
        if (/^Writer/i.test(line)) writer = line.replace(/^Writer\s*/i, '').trim();
        if (/^Production Company/i.test(line)) company = line.replace(/^Production Company\s*/i, '').trim();
        if (/^Year/i.test(line)) year = line.replace(/^Year\s*/i, '').trim();
        if (/Production$|Completion$/i.test(line)) fundingType = line.trim();
      }

      // The title is typically the first meaningful line or the project name
      for (const line of lines) {
        if (line.length > 2 && line.length < 100 &&
            !/^(Director|Writer|Production Company|Year|Quarter|Funding Award|N\/A)/i.test(line) &&
            !/^\d/.test(line) && !/^€/.test(line)) {
          title = line;
          break;
        }
      }

      if (title && title.length > 2 && /production|completion/i.test(fundingType || text)) {
        const personnel = [];
        if (director && director !== 'N/A') personnel.push(`Dir: ${director}`);
        if (writer && writer !== 'N/A') personnel.push(`Writer: ${writer}`);

        productions.push({
          title,
          type: /animation/i.test(text) ? 'Animation' : 'Movie',
          genre: 'Not specified',
          synopsis: `Screen Ireland funded production. ${fundingType || ''}`.trim(),
          release_year: year || 'TBD',
          publication_date: new Date().toISOString().split('T')[0],
          studio: company || 'Irish Production',
          personnel: personnel.join('. ') || 'See Screen Ireland for details',
          source_title: `Screen Ireland Funding: ${title}`,
          source_url: 'https://www.screenireland.ie/funding/funding-decisions',
        });
      }
    }
  });

  // Deduplicate by title
  const seen = new Set();
  return productions.filter(p => {
    const key = p.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeBFCFilmography() {
  const html = await fetchUrl('https://britishfilmcommission.org.uk/filmography/');
  const $ = cheerio.load(html);
  const productions = [];

  // BFC filmography page lists productions as cards/entries
  $('article, .film-item, .filmography-item, .entry, .card, [class*="film"], [class*="production"]').each((_, el) => {
    const title = $(el).find('h2, h3, h4, .title, .film-title').first().text().trim();
    const description = $(el).find('p, .description, .synopsis, .content').first().text().trim();
    const link = $(el).find('a').first().attr('href') || '';

    if (title && title.length > 2 && title.length < 150) {
      let type = 'Movie';
      const fullText = `${title} ${description}`.toLowerCase();
      if (/\b(series|season|tv|television|episode)\b/.test(fullText)) {
        type = 'TV Series';
      }

      productions.push({
        title,
        type,
        genre: extractGenre(fullText) || 'Not specified',
        synopsis: description.substring(0, 300) || 'Listed on BFC Filmography',
        release_year: extractYear(fullText) || 'TBD',
        publication_date: new Date().toISOString().split('T')[0],
        studio: extractStudio(fullText) || 'UK Production',
        personnel: extractPersonnel(fullText) || 'See BFC for details',
        source_title: `BFC: ${title}`,
        source_url: link.startsWith('http') ? link : `https://britishfilmcommission.org.uk${link}`,
      });
    }
  });

  // Also try grabbing text-based listings (some pages use simple text/links)
  $('a[href*="filmography"], a[href*="film"], li').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (text.length > 3 && text.length < 100 && !text.includes('Read more') &&
        !text.includes('Menu') && !text.includes('Search') &&
        /filmography|film|production/i.test(href)) {
      // Avoid duplicates from the block above
      if (!productions.find(p => p.title === text)) {
        productions.push({
          title: text,
          type: 'Movie',
          genre: 'Not specified',
          synopsis: 'Listed on BFC Filmography',
          release_year: 'TBD',
          publication_date: new Date().toISOString().split('T')[0],
          studio: 'UK Production (BFC supported)',
          personnel: 'See BFC for details',
          source_title: `BFC: ${text}`,
          source_url: href.startsWith('http') ? href : `https://britishfilmcommission.org.uk${href}`,
        });
      }
    }
  });

  return productions;
}

async function scrapeScreenIrelandNews() {
  const html = await fetchUrl('https://www.screenireland.ie/news');
  const $ = cheerio.load(html);
  const productions = [];

  // Look for news articles that mention productions
  $('article, .news-item, .post, [class*="news"]').each((_, el) => {
    const titleEl = $(el).find('h2, h3, h4, .title').first();
    const title = titleEl.text().trim();
    const description = $(el).find('p, .excerpt, .summary').first().text().trim();
    const link = $(el).find('a').first().attr('href') || '';
    const dateText = $(el).find('time, .date, [class*="date"]').first().text().trim();

    const fullText = `${title} ${description}`.toLowerCase();

    // Only include if it mentions production-related keywords
    const hasProduction = PRODUCTION_KEYWORDS.some(kw => fullText.includes(kw)) ||
      /slate|greenlit|funded|production|filming|new series|new film/i.test(fullText);

    if (title && title.length > 5 && hasProduction) {
      let type = 'Movie';
      if (/\b(series|season|tv|television|drama series|animated series)\b/i.test(fullText)) {
        type = 'TV Series';
      }

      let pubDate = new Date().toISOString().split('T')[0];
      if (dateText) {
        try {
          const d = new Date(dateText);
          if (!isNaN(d.getTime())) pubDate = d.toISOString().split('T')[0];
        } catch {}
      }

      productions.push({
        title: title.substring(0, 150),
        type,
        genre: extractGenre(fullText) || 'Not specified',
        synopsis: description.substring(0, 300) || 'Screen Ireland news',
        release_year: extractYear(fullText) || 'TBD',
        publication_date: pubDate,
        studio: extractStudio(fullText) || 'Irish Production',
        personnel: extractPersonnel(fullText) || 'See Screen Ireland for details',
        source_title: `Screen Ireland News: ${title.substring(0, 100)}`,
        source_url: link.startsWith('http') ? link : `https://www.screenireland.ie${link}`,
      });
    }
  });

  return productions;
}

// --- RSS Parsing ---

function parseRssFeed(xml, sourceName) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  try {
    const parsed = parser.parse(xml);

    let items = [];
    if (parsed?.rss?.channel?.item) {
      items = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : [parsed.rss.channel.item];
    } else if (parsed?.feed?.entry) {
      items = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry];
    }

    // Only look at articles from the last 48 hours
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    return items
      .map(item => ({
        title: stripHtml(item.title || item['media:title'] || ''),
        description: stripHtml(item.description || item['content:encoded'] || item.summary || ''),
        link: item.link?.['@_href'] || item.link || '',
        pubDate: item.pubDate || item.published || item.updated || '',
        source: sourceName,
      }))
      .filter(item => {
        if (!item.pubDate) return true;
        try {
          return new Date(item.pubDate) >= cutoff;
        } catch {
          return true;
        }
      });
  } catch (err) {
    console.warn(`[Scraper] XML parse error for ${sourceName}: ${err.message}`);
    return [];
  }
}

// --- Rule-Based Extraction ---

function extractFromArticle(article) {
  const title = extractProductionTitle(article.title);
  const text = `${article.title} ${article.description}`;

  let type = 'Movie';
  if (/\b(series|season|tv|television|episode|show)\b/i.test(text)) {
    type = 'TV Series';
  }

  const genre = extractGenre(text);

  let pubDate = '';
  if (article.pubDate) {
    try {
      const d = new Date(article.pubDate);
      if (!isNaN(d.getTime())) pubDate = d.toISOString().split('T')[0];
    } catch {}
  }

  const personnel = extractPersonnel(text);
  const studio = extractStudio(text);

  return {
    title: title || article.title.substring(0, 100),
    type,
    genre: genre || 'Not specified',
    synopsis: cleanSynopsis(article.description),
    release_year: extractYear(text) || 'TBD',
    publication_date: pubDate || new Date().toISOString().split('T')[0],
    studio: studio || 'Studio/Production Company not yet announced',
    personnel: personnel || 'Key personnel details not yet announced',
    source_title: article.title,
    source_url: typeof article.link === 'string' ? article.link : '',
  };
}

function extractProductionTitle(headline) {
  // Try quoted title first: 'Title' or "Title"
  const quoteMatch = headline.match(/[''\u2018\u2019\u201C\u201D""]([^''\u2018\u2019\u201C\u201D""]+)[''\u2018\u2019\u201C\u201D""]/);
  if (quoteMatch) return quoteMatch[1].trim();

  // Try colon-separated: "Title: Some Description"
  const colonMatch = headline.match(/^([^:]+?):/);
  if (colonMatch && colonMatch[1].length < 60) return colonMatch[1].trim();

  return '';
}

function extractGenre(text) {
  const genres = [];
  const genreMap = {
    'thriller': 'Thriller', 'horror': 'Horror', 'comedy': 'Comedy',
    'drama': 'Drama', 'sci-fi': 'Sci-Fi', 'science fiction': 'Sci-Fi',
    'fantasy': 'Fantasy', 'action': 'Action', 'romance': 'Romance',
    'documentary': 'Documentary', 'animation': 'Animation', 'animated': 'Animation',
    'crime': 'Crime', 'mystery': 'Mystery', 'biographical': 'Biography',
    'biopic': 'Biography', 'historical': 'Historical', 'period': 'Period',
    'supernatural': 'Supernatural', 'war': 'War', 'musical': 'Musical',
  };

  const lower = text.toLowerCase();
  for (const [keyword, genre] of Object.entries(genreMap)) {
    if (lower.includes(keyword) && !genres.includes(genre)) {
      genres.push(genre);
    }
  }
  return genres.slice(0, 3).join(' / ') || '';
}

function extractPersonnel(text) {
  const parts = [];

  const dirMatch = text.match(/(?:directed? by|director[:\s]+|dir[.:\s]+)\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
  if (dirMatch) parts.push(`Dir: ${dirMatch[1]}`);

  const castMatch = text.match(/(?:starring|stars?|cast[:\s]+|set to star[:\s]*)\s*([A-Z][a-z]+ [A-Z][a-z]+(?:(?:,?\s*(?:and\s+)?[A-Z][a-z]+ [A-Z][a-z]+))*)/i);
  if (castMatch) parts.push(`Cast: ${castMatch[1]}`);

  const writerMatch = text.match(/(?:written by|writer[:\s]+|screenplay by)\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (writerMatch) parts.push(`Writer: ${writerMatch[1]}`);

  const prodMatch = text.match(/(?:produced by|producer[:\s]+)\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (prodMatch) parts.push(`Producer: ${prodMatch[1]}`);

  return parts.join('. ') || '';
}

function extractStudio(text) {
  const studios = [
    'BBC Film', 'BBC Studios', 'BBC', 'ITV Studios', 'ITV',
    'Channel 4', 'Film4', 'BFI', 'Sky Studios', 'Sky',
    'Netflix', 'Amazon MGM', 'Amazon', 'Apple TV+', 'Apple Studios',
    'Disney+', 'Disney', 'HBO', 'Paramount', 'Universal',
    'Sony', 'Warner Bros', 'Lionsgate', 'A24', 'Mubi', 'Curzon',
    'Element Pictures', 'Working Title', 'Aardman',
    'Screen Ireland', 'Northern Ireland Screen',
    'See-Saw Films', 'Potboiler', 'Neal Street',
    'Stigma Films', 'Happy Prince', 'Vertigo Films',
  ];

  const found = studios.filter(s => text.includes(s));
  return found.join(', ') || '';
}

function extractYear(text) {
  const matches = text.match(/\b(202[5-9])\b/g);
  if (matches) return matches[matches.length - 1];
  return '';
}

function cleanSynopsis(desc) {
  if (!desc) return '';
  let clean = desc.replace(/\s+/g, ' ').trim();
  if (clean.length > 300) {
    const cut = clean.substring(0, 300);
    const lastDot = cut.lastIndexOf('.');
    clean = lastDot > 100 ? cut.substring(0, lastDot + 1) : cut + '...';
  }
  return clean;
}

function stripHtml(str) {
  if (!str) return '';
  if (typeof str !== 'string') return String(str);
  return cheerio.load(str).text().trim();
}

// --- Full Article Content Fetching ---

async function fetchArticleContent(url) {
  try {
    const html = await fetchUrl(url);
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, .ad, .advertisement, .social-share').remove();
    
    // Try common article content selectors
    const contentSelectors = [
      'article',
      '.article-content',
      '.article-body', 
      '.entry-content',
      '.post-content',
      'main',
      '[role="main"]',
    ];
    
    let content = '';
    for (const selector of contentSelectors) {
      const el = $(selector);
      if (el.length) {
        // Preserve structured formatting by getting HTML and converting intelligently
        const htmlContent = el.html();
        // Replace <br>, <p>, and list items with newlines to preserve structure
        const structuredContent = htmlContent
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<li>/gi, '\n- ')
          .replace(/<\/li>/gi, '')
          .replace(/<[^>]+>/g, ' ')  // Remove remaining HTML tags
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/ +/g, ' ')  // Normalize multiple spaces to single space (but NOT newlines)
          .replace(/\n +/g, '\n')  // Clean up spaces after line breaks
          .replace(/ \n/g, '\n')  // Clean up spaces before line breaks
          .replace(/\n{3,}/g, '\n\n')  // Limit to max 2 consecutive newlines
          .trim();
        
        content = structuredContent;
        if (content.length > 500) break; // Found substantial content
      }
    }
    
    // If still no content, get all paragraph text
    if (content.length < 500) {
      content = $('p').map((_, el) => $(el).text().trim()).get().join('\n\n');
    }
    
    console.log(`[Scraper/Fetch] Fetched ${content.length} characters from article`);
    return content;
  } catch (err) {
    throw new Error(`Failed to fetch article: ${err.message}`);
  }
}

async function extractMultipleProductionsWithAI(fullContent, article) {
  // Truncate content if too long (keep first ~12000 chars for better coverage)
  const content = fullContent.substring(0, 12000);
  
  const prompt = `You are a film/TV industry analyst. This article lists MULTIPLE UK/Ireland productions. Extract ALL of them with COMPLETE details.

Article Title: ${article.title}
Article Content: ${content}
Source: ${article.source}
Published: ${article.pubDate}

Extract ALL UK/Ireland productions mentioned in this article. Return a JSON array where each item has:
- title: The production/film/series name (e.g., "Supacell (series two)")
- type: "Movie" or "TV Series"
- genre: Primary genre(s)
- synopsis: 1-2 sentence plot/premise summary
- release_year: Expected release year or "TBD"
- studio: Production companies/studios involved (look for labels like "Prod:", "Production:", "Studio:", "Distributor:")
- personnel: Key personnel including directors, writers, cast, producers, series creators (look for labels like "Cast:", "Dir:", "Director:", "Writer:", "Series creator:", "Starring:")
- background: 1-2 sentences about the production company's notable work OR key talent's credits

IMPORTANT INSTRUCTIONS:
1. Include EVERY production mentioned, not just the first few
2. Extract ALL available details - do NOT leave fields empty if information is present
3. Look for structured data markers like "Prod:", "Cast:", "Where:", "When:", "Distributor:", "Series creator:"
4. If a field has multiple items (e.g., multiple cast members, multiple production companies), include ALL of them
5. Be thorough - prioritize completeness over brevity

Return ONLY valid JSON array, no markdown.`;

  try {
    const response = await callOpenAI(prompt, 8000); // Increased token limit to 8000 for detailed extraction
    
    // Try to parse JSON array
    let jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      // Try extracting from markdown code blocks
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonMatch = codeBlockMatch[1].match(/\[\s*\{[\s\S]*\}\s*\]/);
      }
    }
    
    if (!jsonMatch) {
      console.warn('[Scraper/AI] No JSON array found in multi-production extraction');
      return [];
    }
    
    const productions = JSON.parse(jsonMatch[0]);
    
    // Add common fields to all productions
    return productions.map(p => ({
      title: p.title,
      type: p.type || 'Movie',
      genre: p.genre || 'Not specified',
      synopsis: p.synopsis || '',
      release_year: p.release_year || 'TBD',
      publication_date: article.pubDate
        ? new Date(article.pubDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      studio: p.studio || 'Studio not specified',
      personnel: p.personnel || 'Personnel details not yet announced',
      background: p.background || null,
      source_title: article.title,
      source_url: typeof article.link === 'string' ? article.link : '',
    }));
  } catch (err) {
    console.warn(`[Scraper/AI] Multi-production extraction failed: ${err.message}`);
    return [];
  }
}

// --- AI-Powered Extraction (Optional, requires OPENAI_API_KEY) ---

async function extractWithAI(article) {
  const prompt = `You are a film/TV industry analyst. Extract structured production data from this news article.

Article Title: ${article.title}
Article Description: ${article.description}
Source: ${article.source}
Published: ${article.pubDate}

Extract the following fields as JSON (use null if not found):
- title: The production/film/series name (not the article title)
- type: "Movie" or "TV Series"
- genre: Primary genre(s)
- synopsis: 1-3 sentence plot/premise summary
- release_year: Expected release year or "TBD"
- studio: Production companies/studios involved
- personnel: Key personnel (directors, writers, cast, producers)
- background: 1-2 sentences about the production company's notable work OR the director/key talent's previous credits (e.g., "Element Pictures previously produced The Favourite and Room" or "Director John Smith helmed the acclaimed drama XYZ")

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await callOpenAI(prompt);
    const data = JSON.parse(response);

    return {
      title: data.title || extractProductionTitle(article.title) || article.title.substring(0, 100),
      type: data.type || 'Movie',
      genre: data.genre || 'Not specified',
      synopsis: data.synopsis || cleanSynopsis(article.description),
      release_year: data.release_year || 'TBD',
      publication_date: article.pubDate
        ? new Date(article.pubDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      studio: data.studio || 'Studio/Production Company not yet announced',
      personnel: data.personnel || 'Key personnel details not yet announced',
      background: data.background || null,
      source_title: article.title,
      source_url: typeof article.link === 'string' ? article.link : '',
    };
  } catch (err) {
    console.warn(`[Scraper/AI] AI extraction failed, falling back to rule-based: ${err.message}`);
    return extractFromArticle(article);
  }
}

function callOpenAI(prompt, maxTokens = 500) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: maxTokens,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed.choices[0].message.content.trim());
          }
        } catch (e) {
          reject(new Error('Failed to parse OpenAI response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('OpenAI request timeout')); });
    req.write(body);
    req.end();
  });
}

// --- HTTP Fetch Utility ---

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProductionTracker/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 15000,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        res.resume();
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

async function scrapeMovieInsider() {
  const html = await fetchUrl('https://www.movieinsider.com/production-listings');
  const $ = cheerio.load(html);
  const productions = [];

  // Movie Insider lists productions in structured format
  // Look for production entries/cards
  $('.movie, .production, article, .listing-item, [class*="film"]').each((_, el) => {
    const title = $(el).find('h2, h3, h4, .title, .movie-title, a.title').first().text().trim();
    const description = $(el).find('p, .description, .synopsis, .plot').first().text().trim();
    const link = $(el).find('a').first().attr('href') || '';
    const fullText = $(el).text();

    if (title && title.length > 2 && title.length < 150) {
      // Check for UK/Ireland relevance
      const isRelevant = UK_IRELAND_KEYWORDS.some(kw => fullText.toLowerCase().includes(kw));
      
      if (isRelevant) {
        let type = 'Movie';
        if (/\b(series|season|tv|television)\b/i.test(fullText)) {
          type = 'TV Series';
        }

        productions.push({
          title,
          type,
          genre: extractGenre(fullText) || 'Not specified',
          synopsis: description.substring(0, 300) || 'UK/Ireland production listed on Movie Insider',
          release_year: extractYear(fullText) || 'TBD',
          publication_date: new Date().toISOString().split('T')[0],
          studio: extractStudio(fullText) || 'See Movie Insider for details',
          personnel: extractPersonnel(fullText) || 'Personnel details on Movie Insider',
          source_title: `Movie Insider: ${title}`,
          source_url: link.startsWith('http') ? link : `https://www.movieinsider.com${link}`,
        });
      }
    }
  });

  // Also try simpler selectors for links
  $('a[href*="/m/"]').each((_, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href') || '';
    const context = $(el).parent().text();
    
    if (title.length > 2 && title.length < 100 && !productions.find(p => p.title === title)) {
      // Check for UK/Ireland relevance in surrounding context
      const isRelevant = UK_IRELAND_KEYWORDS.some(kw => context.toLowerCase().includes(kw));
      
      if (isRelevant) {
        productions.push({
          title,
          type: 'Movie',
          genre: 'Not specified',
          synopsis: 'UK/Ireland production listed on Movie Insider',
          release_year: extractYear(context) || 'TBD',
          publication_date: new Date().toISOString().split('T')[0],
          studio: extractStudio(context) || 'See Movie Insider for details',
          personnel: extractPersonnel(context) || 'Personnel details on Movie Insider',
          source_title: `Movie Insider: ${title}`,
          source_url: href.startsWith('http') ? href : `https://www.movieinsider.com${href}`,
        });
      }
    }
  });

  console.log(`[Scraper/MovieInsider] Found ${productions.length} UK/Ireland productions`);
  return productions;
}

module.exports = { searchForNewProductions };
