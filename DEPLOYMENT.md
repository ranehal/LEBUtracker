# Deployment Guide for LEBU Tracker

## 🌐 Publishing Online (3 Options)

### Option 1: GitHub Pages (FREE - Recommended for Static Hosting)
**Best for:** Simple deployment, no backend needed

1. **Enable GitHub Pages:**
   - Go to: https://github.com/ranehal/LEBUtracker/settings/pages
   - Under "Source", select branch `main` and folder `/ (root)`
   - Click Save
   - Your site will be live at: `https://ranehal.github.io/LEBUtracker/`

2. **Update data daily:**
   - Run scraper on your PC
   - Push updated `data.js` to GitHub
   - GitHub Pages auto-updates

**Pros:** Free, simple, fast
**Cons:** No dynamic backend, must push data manually

---

### Option 2: Vercel (FREE - Recommended for Full Features)
**Best for:** Automatic deployments + serverless functions

1. **Deploy to Vercel:**
   - Go to: https://vercel.com
   - Sign in with GitHub
   - Click "New Project"
   - Import `ranehal/LEBUtracker`
   - Click Deploy

2. **Your site will be live at:** `https://lebutracker.vercel.app`

3. **Auto-deploy:** Every push to GitHub auto-deploys

**Gmail Sign-In Setup on Vercel:**
- Use Firebase Authentication or Auth0
- See section below for details

**Pros:** Free, auto-deployment, serverless functions, custom domains
**Cons:** Requires some setup for auth

---

### Option 3: Netlify (FREE - Alternative to Vercel)
**Best for:** Similar to Vercel with drag-and-drop option

1. **Deploy to Netlify:**
   - Go to: https://netlify.com
   - Sign in with GitHub
   - Click "Add new site" > "Import an existing project"
   - Connect to `ranehal/LEBUtracker`
   - Deploy

2. **Your site will be live at:** `https://lebutracker.netlify.app`

**Pros:** Free, auto-deployment, simple UI
**Cons:** Similar to Vercel

---

## 🔒 Adding Gmail Sign-In

### Using Firebase Authentication (FREE)

1. **Create Firebase Project:**
   ```
   - Go to: https://console.firebase.google.com
   - Click "Add project"
   - Name it "LEBUtracker"
   - Disable Google Analytics (optional)
   ```

2. **Enable Google Sign-In:**
   ```
   - In Firebase Console > Authentication > Sign-in method
   - Enable "Google" provider
   - Add your domain (e.g., lebutracker.vercel.app)
   ```

3. **Get Firebase Config:**
   ```
   - Firebase Console > Project Settings > General
   - Under "Your apps", click Web icon (</>)
   - Copy the firebaseConfig object
   ```

4. **Add to Your Project:**
   
   Create `firebase-config.js`:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-app.appspot.com",
     messagingSenderId: "123456789",
     appId: "your-app-id"
   };
   ```

5. **Add Authentication to `index.html`:**
   ```html
   <!-- Add before closing </body> -->
   <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
   <script src="firebase-config.js"></script>
   <script>
     firebase.initializeApp(firebaseConfig);
     const auth = firebase.auth();
     const provider = new firebase.auth.GoogleAuthProvider();
     
     function signIn() {
       auth.signInWithPopup(provider)
         .then((result) => {
           console.log('Signed in:', result.user.email);
           document.getElementById('user-info').textContent = result.user.displayName;
         })
         .catch((error) => console.error(error));
     }
     
     function signOut() {
       auth.signOut();
     }
   </script>
   ```

6. **Add Sign-In Button to UI:**
   ```html
   <div id="auth-section">
     <button onclick="signIn()">Sign in with Google</button>
     <span id="user-info"></span>
     <button onclick="signOut()">Sign Out</button>
   </div>
   ```

---

## 🤖 Automating Web Scraping

### Option A: Local PC + GitHub Actions (RECOMMENDED)

**How it works:**
1. Scraper runs on your PC daily
2. Automatically commits and pushes `data.js` to GitHub
3. Hosted site auto-updates

**Setup:**

1. **Create a scheduled task (Windows):**
   ```
   - Open Task Scheduler
   - Create Basic Task > Name: "LEBU Scraper"
   - Trigger: Daily at 3:00 AM
   - Action: Start a program
   - Program: C:\PROJECTS\PRICETRACKER\auto_scrape.bat
   ```

2. **Update `auto_scrape.bat`:**
   ```batch
   @echo off
   cd /d C:\PROJECTS\PRICETRACKER
   
   REM Run scraper
   python scraper.py
   
   REM Commit and push changes
   git add data.js
   git commit -m "Update prices - %date% %time%"
   git push origin main
   
   echo Done!
   ```

**Pros:** Free, reliable, full control
**Cons:** PC must be on at scheduled time

---

### Option B: GitHub Actions (Cloud-Based)

**How it works:** GitHub runs scraper in the cloud daily

1. **Create `.github/workflows/scrape.yml`:**
   ```yaml
   name: Daily Price Scraper
   
   on:
     schedule:
       - cron: '0 3 * * *'  # 3 AM UTC daily
     workflow_dispatch:  # Manual trigger
   
   jobs:
     scrape:
       runs-on: ubuntu-latest
       
       steps:
         - uses: actions/checkout@v3
         
         - name: Setup Python
           uses: actions/setup-python@v4
           with:
             python-version: '3.11'
         
         - name: Install dependencies
           run: |
             pip install -r requirements.txt
             playwright install chromium
         
         - name: Run scraper
           run: python scraper.py
         
         - name: Commit and push
           run: |
             git config user.name "GitHub Actions"
             git config user.email "actions@github.com"
             git add data.js
             git diff --quiet && git diff --staged --quiet || git commit -m "Auto-update prices"
             git push
   ```

2. **Push workflow to GitHub:**
   ```bash
   git add .github/workflows/scrape.yml
   git commit -m "Add automated scraping workflow"
   git push
   ```

**Pros:** Fully automated, no PC needed, free (2000 min/month)
**Cons:** May hit rate limits, requires GitHub Actions quota

---

### Option C: Cloud Server (Paid but Professional)

**Use services like:**
- **Railway.app** ($5/month)
- **Render.com** (Free tier available)
- **DigitalOcean** ($4/month)

**Setup:**
1. Deploy your Python scraper
2. Set up cron job on server
3. Server updates database/file storage
4. Frontend fetches from API

**Pros:** Professional, scalable, always-on
**Cons:** Costs money

---

## 📊 Recommended Setup for You

**For a FREE, simple solution:**

1. ✅ **Hosting:** Vercel or GitHub Pages
2. ✅ **Authentication:** Firebase (Google Sign-In)
3. ✅ **Scraping:** Option A (Local PC + auto-push) or Option B (GitHub Actions)

**Workflow:**
```
Daily at 3 AM → Scraper runs → Updates data.js → Pushes to GitHub → 
Vercel/GitHub Pages auto-deploys → Users see updated prices
```

---

## 🚀 Quick Start Commands

**For local testing with auth:**
```bash
python server.py
# Visit: http://localhost:8000
```

**To manually update and push:**
```bash
python scraper.py
git add data.js
git commit -m "Update prices"
git push
```

**To deploy to Vercel (one-time):**
```bash
npm install -g vercel
vercel --prod
```

---

## 📝 Next Steps

1. Choose hosting (Vercel recommended)
2. Set up Firebase for Google Sign-In
3. Set up automation (GitHub Actions or local scheduled task)
4. Test everything
5. Share your live URL!

Your project is now on GitHub: https://github.com/ranehal/LEBUtracker
