import re
import json
import asyncio
import datetime
from playwright.async_api import async_playwright

# Configuration
CATEGORY_URL = "https://chaldal.com/fresh-vegetable"  # Default, can be changed
DATA_FILE = "data.js"

def normalize_price(price_text, unit_text):
    """
    Converts price to 'per 1kg' or 'per 1L' if applicable.
    Returns: (normalized_price, normalized_unit_label)
    """
    try:
        # Clean inputs
        price = float(re.sub(r'[^\d.]', '', str(price_text)))
        unit_text = unit_text.lower().strip()
        
        # Regex to find quantity and unit
        match = re.search(r'(\d+(\.\d+)?)\s*(kg|gm|g|ltr|liter|l|ml|pcs|piece|each|dzn|dozen)', unit_text)
        if not match:
            return price, unit_text # Cannot normalize

        qty = float(match.group(1))
        unit = match.group(3)

        # Weight Normalization
        if unit in ['gm', 'g']:
            return (price / qty) * 1000, "1 kg"
        elif unit == 'kg':
            return price / qty, "1 kg"
        
        # Volume Normalization
        elif unit == 'ml':
            return (price / qty) * 1000, "1 L"
        elif unit in ['ltr', 'liter', 'l']:
            return price / qty, "1 L"

        # Count Normalization (Keep as is usually, or normalize to 1 pc if needed)
        elif unit in ['dzn', 'dozen']:
            return price / (qty * 12), "1 pc"
        elif unit in ['pcs', 'piece', 'each']:
             if qty > 1:
                 return price / qty, "1 pc"
             return price, "1 pc"

        return price, unit_text

    except Exception as e:
        print(f"Error normalizing {price_text} / {unit_text}: {e}")
        return price_text, unit_text

async def discover_categories(page):
    print("Discovering categories with menu expansion...")
    discovered = {}
    
    # Slugify helper
    def slugify(text):
        text = text.lower().strip()
        text = text.replace(' & ', '-')
        text = text.replace('&', '-')
        text = text.replace(' ', '-')
        text = re.sub(r'[^a-z0-9\-]', '', text)
        return text

    try:
        # Wait for menu
        await page.wait_for_selector('.level-0', timeout=15000)
        
        # Select Top Level Items
        top_items = await page.query_selector_all('.level-0 > li')
        print(f"Found {len(top_items)} top-level categories.")
        
        for item in top_items:
            # 1. Get Top Level Name
            try:
                name_el = await item.query_selector('.category-name')
                if not name_el: continue
                name = (await name_el.inner_text()).strip()
                slug = slugify(name)
                
                # Add Top Level
                if slug not in discovered:
                    discovered[slug] = {"name": name, "url": f"https://chaldal.com/{slug}", "active": True}
                
                # 2. Check for Subcategories (level-1)
                # Chaldal loads these dynamically or hides them?
                # Let's try to hover or click to expand if needed.
                # Usually sub-menus are in the DOM but might be hidden.
                # Let's just try to query them directly inside this item.
                
                subs = await item.query_selector_all('.level-1 > li')
                
                # If no subs found, maybe we need to click/hover?
                if not subs:
                    # Try hovering
                    await item.hover()
                    await asyncio.sleep(0.2)
                    subs = await item.query_selector_all('.level-1 > li')
                
                for sub in subs:
                    sub_name_el = await sub.query_selector('.category-name')
                    if sub_name_el:
                        sub_name = (await sub_name_el.inner_text()).strip()
                        sub_slug = slugify(sub_name)
                        # Construct URL: chaldal.com/parent-slug/child-slug ??
                        # Or just chaldal.com/child-slug ?
                        # Chaldal usually uses flat slugs for subcategories too: chaldal.com/fresh-fruit
                        # But sometimes it's nested. Let's assume flat first, if 404 we can try nested later?
                        # Actually, clicking it in a real browser shows the URL.
                        # Since we can't click everything now without navigating away, 
                        # We will assume Chaldal's convention: mostly unique flat slugs.
                        
                        # Fix for specific known subcats if they collide?
                        # "Cooking" might be under multiple parents? No usually unique.
                        
                        if sub_slug not in discovered:
                            discovered[sub_slug] = {"name": sub_name, "url": f"https://chaldal.com/{sub_slug}", "active": True}

            except Exception as e:
                print(f"Error processing menu item: {e}")
                continue

    except Exception as e:
        print(f"Discovery error: {e}")
        
    # Fallback to general link scraping if menu fails
    if len(discovered) < 5:
        print("Menu discovery yielded few results. Using fallback link scrape...")
        links = await page.query_selector_all('a')
        for link in links:
             href = await link.get_attribute('href')
             if href and '/product' not in href and len(href) > 2 and not href.startswith('#'):
                 name = (await link.inner_text()).strip()
                 if name:
                     slug = href.strip('/').lower()
                     if slug not in discovered and 'chaldal.com' not in slug: # href is relative
                         discovered[slug] = {"name": name, "url": f"https://chaldal.com{href}", "active": True}

    return discovered

async def scrape_chaldal():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        # --- Discovery Phase ---
        print("Navigating to home for discovery...")
        await page.goto("https://chaldal.com/", timeout=60000)
        await asyncio.sleep(5) # Wait for menu
        
        new_cats_map = await discover_categories(page)
        print(f"Discovered {len(new_cats_map)} potential categories.")
        
        # Load existing
        existing_cats = []
        try:
            with open("categories.json", 'r') as f:
                existing_cats = json.load(f)
        except: pass
        
        # Merge
        existing_urls = {c['url']: c for c in existing_cats}
        final_cats = []
        
        # Keep existing
        for c in existing_cats:
            if c['url'] in [nc['url'] for nc in new_cats_map.values()]:
                final_cats.append(c) 
            else:
                final_cats.append(c)

        # Add New
        new_count = 0
        for cat_id, cat_data in new_cats_map.items():
            if cat_data['url'] not in existing_urls:
                print(f"New Category Found: {cat_data['name']}")
                cat_data['new'] = True
                final_cats.append(cat_data)
                new_count += 1
        
        with open("categories.json", 'w') as f:
            json.dump(final_cats, f, indent=2)
            
        with open("categories.js", 'w', encoding='utf-8') as f:
            f.write(f"window.CATEGORY_DATA = {json.dumps(final_cats, indent=2)};")

        print(f"Updated categories.json with {new_count} new categories.")
        
        # Reload categories
        categories = final_cats

        products_data = {}
        # Load existing data first
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
                json_str = content.replace('window.PRODUCT_DATA = ', '').replace(';', '')
                products_data = json.loads(json_str)
                print(f"Loaded {len(products_data)} existing products.")
        except:
            print("No existing data found. Starting fresh.")

        timestamp = datetime.datetime.now().isoformat()
        today_date = datetime.datetime.now().strftime("%Y-%m-%d")

        for cat_entry in categories:

            if not cat_entry.get('active', True): continue
            
            url = cat_entry['url']
            cat_name = cat_entry['name']
            print(f"Navigating to {cat_name} ({url})...")
            
            try:
                await page.goto(url, timeout=60000)

                # Scroll to load all items (Infinite Scroll)
                last_height = await page.evaluate("document.body.scrollHeight")
                while True:
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await asyncio.sleep(2) # Wait for load
                    new_height = await page.evaluate("document.body.scrollHeight")
                    if new_height == last_height:
                        break
                    last_height = new_height
                    print("Scrolling...")

                # Extract Items
                await page.wait_for_selector('.nameTextWithEllipsis', timeout=15000)
                
                # Robust extraction
                product_cards = await page.query_selector_all('.product, .productV2, [data-reactid*="$"]')
                if len(product_cards) < 5:
                     names = await page.query_selector_all('.nameTextWithEllipsis')
                     product_cards = []
                     for n in names:
                         parent = await n.evaluate_handle("el => el.closest('.product') || el.closest('.productV2') || el.parentElement.parentElement.parentElement")
                         if parent: product_cards.append(parent)

                print(f"Found {len(product_cards)} items in {cat_name}")

                for card in product_cards:
                    try:
                        if hasattr(card, 'as_element'): card = card.as_element()

                        name_el = await card.query_selector('.nameTextWithEllipsis')
                        if not name_el: continue
                        name = await name_el.inner_text()
                        
                        img_el = await card.query_selector('.imageWrapperWrapper img, img')
                        img_src = await img_el.get_attribute('src') if img_el else ""
                        
                        price_el = await card.query_selector('.productV2discountedPrice span, .price span, .price')
                        if not price_el: continue
                        price_text = await price_el.inner_text()
                        
                        unit_el = await card.query_selector('.subText span, .quantity')
                        unit_text = await unit_el.inner_text() if unit_el else "1 unit"

                        # Clean Price - find first numeric value (avoids joining price + change)
                        price_match = re.search(r'([\d,]+(\.\d+)?)', str(price_text))
                        if price_match:
                            price_val = float(price_match.group(1).replace(',', ''))
                        else:
                            price_val = float(re.sub(r'[^\d.]', '', str(price_text).replace('৳', '')) or 0)

                        # Normalize
                        norm_price, norm_unit = normalize_price(price_val, unit_text)

                        # ID Generation
                        prod_id = re.sub(r'\W+', '_', name + "_" + unit_text).lower()

                        # Update Data
                        if prod_id not in products_data:
                            products_data[prod_id] = {
                                "id": prod_id, "name": name, "image": img_src,
                                "category": cat_name, # Save Category
                                "current_price": price_val, "current_unit": unit_text, "history": []
                            }
                        else:
                            # Update category if it changed or wasn't set
                            products_data[prod_id]["category"] = cat_name

                        
                        history = products_data[prod_id]["history"]
                        if not history or history[-1]['date'] != today_date:
                             history.append({
                                "date": today_date, "timestamp": timestamp,
                                "price": price_val, "unit": unit_text,
                                "norm_price": round(norm_price, 2), "norm_unit": norm_unit
                            })
                        else:
                            if history[-1]['price'] != price_val:
                                history[-1]['price'] = price_val
                                history[-1]['norm_price'] = round(norm_price, 2)
                                history[-1]['timestamp'] = timestamp

                        products_data[prod_id]['current_price'] = price_val
                        products_data[prod_id]['current_unit'] = unit_text
                        products_data[prod_id]['norm_price_display'] = f"{round(norm_price, 2)} / {norm_unit}"

                    except Exception as e:
                        continue
            except Exception as e:
                print(f"Error processing {url}: {e}")

        await browser.close()

        # Save to data.js
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            f.write(f"window.PRODUCT_DATA = {json.dumps(products_data, indent=2)};")
        
        print("Scraping complete. Data saved to data.js")

if __name__ == "__main__":
    asyncio.run(scrape_chaldal())
