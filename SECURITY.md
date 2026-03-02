# Security Guide

## For Local Development
Authentication is **disabled by default**. You can access the app at `http://localhost:3000` without a password.

## For Production Deployment

### 1. Enable HTTP Basic Authentication
Add these to your `.env` file:
```
AUTH_USER=your_username
AUTH_PASS=your_secure_password
```

When deployed, all users will need to enter this username/password to access the app.

**Recommendation for 4 users:**
- Use a shared username/password
- Store it in a team password manager (1Password, LastPass, etc.)
- Change the password if someone leaves the team

### 2. Use HTTPS (Required for Production)

Choose one of these options:

#### Option A: Cloudflare Tunnel (Easiest - Free)
1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Run: `cloudflared tunnel --url http://localhost:3000`
3. Share the HTTPS URL it generates (e.g., `https://xyz.trycloudflare.com`)
4. Free, automatic HTTPS, no port forwarding needed

#### Option B: Reverse Proxy (nginx/Caddy)
If hosting on a VPS:
1. Use Caddy (easiest) or nginx with Let's Encrypt
2. Configure reverse proxy to your Node.js app
3. Caddy handles HTTPS automatically

#### Option C: Hosting Platform
Deploy to:
- Render.com (free tier available)
- Railway.app
- Fly.io
- Heroku

All provide HTTPS automatically.

### 3. Rate Limiting (Already Configured)

✅ **Already enabled** in the app:
- General API: 100 requests per 15 minutes per IP
- Scrape endpoint: 5 requests per minute per IP

This prevents abuse even if someone gets your credentials.

### 4. Firewall (If Self-Hosting)

If running on your own server:
- Only allow connections from your team's IP addresses
- Use your router/firewall to whitelist IPs
- Or use a VPN for the team

### 5. Environment Variables

⚠️ **Never commit `.env` to git!**

The `.env` file is already in `.gitignore`, but double-check:
```bash
git ls-files .env
```
If it shows output, remove it:
```bash
git rm --cached .env
git commit -m "Remove .env from git"
```

### 6. Database Backups

Set up automatic backups of `productions.db`:
```bash
# Example: daily backup script
cp productions.db "backups/productions_$(date +%Y%m%d).db"
```

## Security Checklist for Going Live

- [ ] Set `AUTH_USER` and `AUTH_PASS` in `.env`
- [ ] Deploy with HTTPS (Cloudflare Tunnel or hosting platform)
- [ ] Verify `.env` is not in git
- [ ] Test the authentication works
- [ ] Share credentials with team via secure channel (password manager)
- [ ] Set up database backups
- [ ] (Optional) Configure firewall/IP whitelist

## Additional Recommendations

### For 4 Users - Current Setup is Good
The basic auth + rate limiting is sufficient for a small team.

### If You Need More Control Later
Consider adding:
- Individual user accounts (use Passport.js)
- Session management with cookies
- API keys instead of shared password
- Audit logging for who changed what

But for now, the implemented solution is appropriate for your team size.
