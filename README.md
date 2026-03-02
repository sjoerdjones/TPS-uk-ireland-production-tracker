# UK & Ireland Production Tracker

A web application for tracking UK and Ireland film and television production news.

## Features

- **Automated News Scraping**: Daily searches from 18+ RSS feeds (Variety, Deadline, Screen Daily, etc.)
- **AI-Powered Filtering**: OpenAI GPT-4o-mini filters relevant UK/Ireland productions
- **Web Search Integration**: Gemini API with Google Search grounding for real-time news
- **TMDB & OMDb Integration**: Enriches production data with additional metadata
- **Card-Based UI**: Collapsible cards with status management (Greenlight, Not Interested, Archive)
- **Scheduled Searches**: Automatic daily searches at 06:00 Amsterdam time
- **Security**: Basic HTTP authentication and rate limiting

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla JavaScript, IBM Plex Sans font
- **APIs**: OpenAI, Gemini, TMDB, OMDb
- **Scraping**: RSS feed parsing, XML parsing
- **Scheduling**: node-cron

## Deployment to Render

### Prerequisites
- Render account
- GitHub account (to push code)
- API keys for OpenAI, Gemini, TMDB, OMDb

### Environment Variables (Set in Render Dashboard)
```
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
TMDB_API_KEY=your_tmdb_api_key_here (optional)
OMDB_API_KEY=your_omdb_api_key_here
AUTH_USER=your_username (optional, for HTTP auth)
AUTH_PASS=your_password (optional, for HTTP auth)
PORT=3000
```

### Deployment Steps

1. **Push code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/production-tracker.git
   git push -u origin main
   ```

2. **Create Web Service on Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: uk-ireland-production-tracker
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free or Starter ($7/month for always-on)

3. **Add Environment Variables**:
   - In Render dashboard, go to "Environment"
   - Add all required API keys

4. **Add Persistent Disk** (Important for SQLite database):
   - In Render dashboard, go to "Disks"
   - Click "Add Disk"
   - Mount Path: `/opt/render/project/src/data`
   - Update `db.js` to use this path for database

5. **Deploy**: Render will automatically deploy on push

## Local Development

```bash
# Install dependencies
npm install

# Create .env file with API keys
cp .env.example .env

# Start server
npm start

# Access at http://localhost:3000
```

## Security

- HTTP Basic Authentication (optional, via AUTH_USER/AUTH_PASS)
- Rate limiting on API endpoints
- API key protection via environment variables
- HTTPS automatic on Render

## License

ISC
