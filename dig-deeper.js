/**
 * Dig Deeper - AI-powered production research
 * 
 * Uses Gemini with Google Search grounding to gather comprehensive information
 * about film/TV productions including cast, crew, news, and IMDb links.
 */

const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Perform deep research on a production using AI web search
 * @param {Object} production - Basic production info from database
 * @returns {Promise<Object>} Enriched production data
 */
async function digDeeper(production) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  console.log(`[DigDeeper] Researching: ${production.title}`);

  const prompt = `Research the ${production.type} "${production.title}" and provide comprehensive production information.

Current known information:
- Title: ${production.title}
- Type: ${production.type}
- Genre: ${production.genre || 'Unknown'}
- Release Year: ${production.release_year || 'Unknown'}
- Studio: ${production.studio || 'Unknown'}

Search the web thoroughly and provide comprehensive, up-to-date information:

1. **IMDb Information**
   - Find the exact IMDb URL (must be https://www.imdb.com/title/ttXXXXXXX/)
   - Include IMDb rating if the production has been released

2. **Synopsis & Themes**
   - Detailed plot summary (3-5 sentences) - FIND ACTUAL PLOT DETAILS
   - Themes, tone, and genre classification

3. **Cast & Crew** (SEARCH FOR REAL NAMES)
   - Director(s): Full names with notable previous works
   - Writer(s)/Creator(s): Full names with notable previous works  
   - Lead cast members: Actor names with character names if announced
   - Producers: Key producers and production companies involved

4. **Production Details** (FIND SPECIFIC DETAILS)
   - All production companies involved
   - Filming locations (cities/regions in UK/Ireland)
   - Current production status
   - Filming dates (start and end dates if publicly known)
   - Budget if disclosed
   - Episode count and season info for TV series

5. **Recent News** (FIND ACTUAL NEWS ARTICLES)
   - 3-5 most recent news items from the last few months
   - Include headline, publication date, and DIRECT article URL
   - Focus on casting news, production updates, release dates

6. **Distribution & Release**
   - Distributor/broadcaster names (BBC, Netflix, Warner Bros, etc.)
   - Announced release date or premiere date
   - Platform (theatrical/streaming service name/TV channel)

Return the information as a JSON object with this structure:
{
  "imdb_id": "tt1234567" or null,
  "imdb_url": "https://www.imdb.com/title/tt1234567/" or null,
  "imdb_rating": "7.5" or null,
  "detailed_synopsis": "Full synopsis here...",
  "themes": "Brief description of themes and tone",
  "director": [{"name": "Name", "notable_works": "Film1, Film2"}],
  "writer": [{"name": "Name", "notable_works": "Film1, Film2"}],
  "cast": [{"name": "Actor Name", "character": "Character Name"}],
  "producers": ["Producer 1", "Producer 2"],
  "production_companies": ["Company 1", "Company 2"],
  "filming_locations": ["Location 1", "Location 2"],
  "production_status": "Status",
  "filming_dates": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"},
  "budget": "$X million" or null,
  "episodes": "X episodes" or "X seasons" or null,
  "distributor": ["Distributor 1"],
  "release_date": "YYYY-MM-DD" or null,
  "platform": "theatrical/streaming/TV",
  "recent_news": [
    {"headline": "News headline", "date": "YYYY-MM-DD", "source_url": "https://..."}
  ]
}

IMPORTANT:
- Use web search to find REAL, current information - don't make up data
- For IMDb URL, search "[title] imdb" and find the actual IMDb page
- For cast/crew, search for official announcements and casting news
- For news articles, provide actual article URLs from reputable sources (Deadline, Variety, Screen Daily, Hollywood Reporter, etc.)
- If you cannot find specific information after searching, use null
- Prioritize accuracy over completeness - only include verified information`;

  try {
    const response = await callGeminiWithSearch(prompt);
    console.log('[DigDeeper] Gemini response length:', response.length, 'characters');
    
    // Try to parse JSON from response
    let jsonMatch = response.match(/\{\s*"imdb_id"[\s\S]*\}/);
    if (!jsonMatch) {
      // Try extracting from markdown code blocks
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonMatch = codeBlockMatch[1].match(/\{\s*"imdb_id"[\s\S]*\}/);
      }
    }
    
    if (!jsonMatch) {
      throw new Error('Could not extract JSON from AI response');
    }
    
    const enrichedData = JSON.parse(jsonMatch[0]);
    console.log(`[DigDeeper] Successfully enriched ${production.title}`);
    
    return {
      ...enrichedData,
      researched_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[DigDeeper] Failed to research ${production.title}:`, err.message);
    throw err;
  }
}

/**
 * Call Gemini API with Google Search grounding for real-time web search
 */
function callGeminiWithSearch(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      tools: [{
        google_search: {}  // Enable Google Search grounding
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000,
      },
      systemInstruction: {
        parts: [{
          text: 'You are a film and television production researcher with access to web search. Use Google Search to find accurate, up-to-date information about productions. Always cite your sources and include actual URLs. When uncertain, indicate that information is not available rather than guessing. Format responses as valid JSON.'
        }]
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
            console.log(`[DigDeeper/Gemini] Finish reason: ${finishReason}`);
            
            if (finishReason === 'MAX_TOKENS') {
              console.warn('[DigDeeper/Gemini] Response truncated due to token limit');
            }
            
            if (candidate.content?.parts?.[0]?.text) {
              resolve(candidate.content.parts[0].text);
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
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Gemini request timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = { digDeeper };
