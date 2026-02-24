@echo off
echo Starting Scraper in Background (Check server console or log)...
start /min python scraper.py
git add data.js
git commit -m "Update prices %DATE% %TIME%"

git push
exit
