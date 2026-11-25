# Deploy on Render (backend) + Netlify (frontend)

## 1. Push to GitHub
Unzip, then in this folder: `git init && git add . && git commit -m "deploy" && git push` to a new GitHub repo.
(`backend/.env` is git-ignored - never upload it.)

## 2. Database
Create a free Postgres on https://neon.tech and copy its connection string.
Render's own free Postgres expires after 30 days, so Neon is safer.
`postgres://` / `postgresql://` URLs are converted automatically.

## 3. Backend on Render
New + -> Blueprint -> pick the repo (it reads `render.yaml`). Fill in:
- `DATABASE_URL` = the Neon connection string
- `CORS_ORIGINS` = your frontend URL (add after step 4, no trailing slash), e.g. `https://your-app.netlify.app`
- `REPLICATE_*` only if you use "AI Motion per scene"
Check: https://YOUR-API.onrender.com/health -> {"status":"ok"}

Notes
- FFmpeg is not installed on Render; the bundled one (imageio-ffmpeg) is used automatically.
- `plan: starter` + disk are paid. On the free plan, delete the `plan`, `disk`, `OUTPUT_DIR`, `UPLOAD_DIR`
  lines; videos then disappear on restart and 720p with few scenes is the safe limit (512 MB RAM).
- Microsoft's voice service sometimes blocks cloud server IPs. If so the video is still created, silent,
  with a "Voice note" warning (the Voice preview will also fail). Local PC voice is not affected.

## 4. Frontend on Netlify
New site from the same repo: base directory `frontend`, build `npm run build`, publish `dist`
(already in `frontend/netlify.toml`). Environment variable:
`VITE_API_URL` = https://YOUR-API.onrender.com
Then put this Netlify URL into `CORS_ORIGINS` on Render and redeploy the backend.

## 5. First use
Open the Netlify site -> Create account -> log in. (Make a user admin by setting `is_admin` in the DB if needed.)
