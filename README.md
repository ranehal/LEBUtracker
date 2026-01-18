# Price Tracker Project

## Setup

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    playwright install chromium
    ```

2.  **Run Scraper:**
    ```bash
    python scraper/scraper.py
    ```
    *You can edit `scraper/scraper.py` to change the category URL.*

3.  **View Data:**
    *   Open `viewer/index.html` in your browser.
    *   Toggle themes, search for items, and click on rows to see price history.
