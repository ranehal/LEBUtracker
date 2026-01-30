// --- State ---
let products = window.PRODUCT_DATA ? Object.values(window.PRODUCT_DATA) : [];
let categories = [];
let favorites = new Set(JSON.parse(localStorage.getItem('tracker_favs') || '[]'));
let pinnedCategories = new Set(JSON.parse(localStorage.getItem('pinnedCategories') || '[]'));
let activeViewCategories = new Set(JSON.parse(localStorage.getItem('activeViewCategories') || '[]'));
let selectedForCompare = new Set();
let isCompareMode = false;
let isGroupView = false; // Grid Grouping
let isSidebarGroupView = JSON.parse(localStorage.getItem('isSidebarGroupView') || 'false'); // Sidebar Grouping
let filterMode = 'normal'; // 'normal', 'recent'
let recentDateRange = { from: null, to: null };
let currentProductViewLimit = 50;
let currentFilteredResults = []; // For bulk actions
let chartInstance = null;

const dom = {
    productGrid: document.getElementById('product-grid'),
    categoryList: document.getElementById('categoryList'),
    catSearch: document.getElementById('catSearch'),
    searchInput: document.getElementById('searchInput'),
    selectAllCats: document.getElementById('selectAllCats'),
    totalItems: document.getElementById('totalItems'),
    totalCats: document.getElementById('totalCats'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    compareBar: document.getElementById('compareBar'),
    modal: document.getElementById('historyModal'),
    hamburger: document.getElementById('toggleSidebarBtn'),
    recentUpdatesBtn: document.getElementById('recentUpdatesBtn'),
    recentModal: document.getElementById('recentUpdatesModal'),
    updateFromDate: document.getElementById('updateFromDate'),
    updateToDate: document.getElementById('updateToDate'),
    applyUpdatesBtn: document.getElementById('applyUpdatesFilterBtn'),
    toggleGroupViewBtn: document.getElementById('toggleGroupViewBtn')
};

// --- Global Helpers ---
window.normalizeProduct = (p) => {
    let price = p.current_price;
    let unit = (p.current_unit || "").toLowerCase().trim();
    let qty = 1;
    let standardUnit = "/1pc";

    const match = unit.match(/^(\d+(\.\d+)?)\s*([a-z]+)/);
    if (match) {
        qty = parseFloat(match[1]);
        const uStr = match[3];
        if (['kg', 'kgs'].includes(uStr)) { standardUnit = "/1kg"; }
        else if (['g', 'gm', 'gms', 'gram'].includes(uStr)) { standardUnit = "/1kg"; qty = qty / 1000; }
        else if (['l', 'ltr', 'liter'].includes(uStr)) { standardUnit = "/1L"; }
        else if (['ml', 'milli'].includes(uStr)) { standardUnit = "/1L"; qty = qty / 1000; }
        else if (['pc', 'pcs', 'piece'].includes(uStr)) { standardUnit = "/1pc"; }
        else if (['dz', 'dozen', 'hali'].includes(uStr)) {
            standardUnit = "/1pc";
            if (uStr.includes('dz') || uStr.includes('dozen')) qty = qty * 12;
            if (uStr.includes('hali')) qty = qty * 4;
        }
    } else {
        if (unit.includes('kg')) standardUnit = "/1kg";
        else if (unit.includes('gm') || unit.includes('g')) { standardUnit = "/1kg"; qty = 0.001; }
        else if (unit.includes('l') || unit.includes('ml')) standardUnit = "/1L";
        else standardUnit = "/1pc";
    }
    if (qty === 0) qty = 1;
    return { price: price / qty, unit: standardUnit };
};

// --- Helpers ---

window.toggleFav = (id) => {
    if (favorites.has(id)) {
        favorites.delete(id);
    } else {
        favorites.add(id);
    }
    localStorage.setItem('tracker_favs', JSON.stringify([...favorites]));
    renderProducts(); // Re-render to update UI
};

function getTrend(history) {
    if (!history || history.length < 2) return 'steady';
    const current = history[history.length - 1].price;
    const previous = history[history.length - 2].price;
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'steady';
}

function isMobile() { return window.innerWidth <= 1024; }

function openSidebar() {
    if (isMobile()) {
        dom.sidebar.classList.add('visible');
        dom.sidebarOverlay.classList.add('active');
    }
    dom.sidebar.classList.remove('hidden');
    dom.hamburger.classList.add('active');
}

function closeSidebar() {
    if (isMobile()) {
        dom.sidebar.classList.remove('visible');
        dom.sidebarOverlay.classList.remove('active');
    } else {
        dom.sidebar.classList.add('hidden');
    }
    dom.hamburger.classList.remove('active');
}

function isSidebarOpen() {
    if (isMobile()) return dom.sidebar.classList.contains('visible');
    return !dom.sidebar.classList.contains('hidden');
}

function toggleSidebar() {
    if (isSidebarOpen()) closeSidebar();
    else openSidebar();
}

// --- Init ---
async function init() {
    // Protocol check is less critical now that we support static, but good to keep
    const isFileProtocol = window.location.protocol === 'file:';
    console.log("Running in " + (isFileProtocol ? "STATIC/FILE" : "SERVER") + " mode");

    if (isFileProtocol) {
        alert("⚠️ You are opening this file directly! The API changes won't work.\n\nPlease open 'http://localhost:5000' in your browser.");
        dom.categoryList.innerHTML = `<div style="padding:20px; color:red;"><b>Error:</b> Opened as file.<br>Please use http://localhost:5000</div>`;
    }

    try {
        initEvents();
    } catch (e) { console.error(e); }

    await loadCategories();
    updateStats();
    renderProducts();

    // Check availability
    if (!window.PRODUCT_DATA && isFileProtocol) alert("Missing data.js! Please run scraper or scraper.py first.");

    // Sidebar is hidden by CSS on mobile, visible by default on desktop
    // No JS action needed on init — CSS handles the default state
}

function initEvents() {
    // Recent Updates Modal
    dom.recentUpdatesBtn.onclick = () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        dom.updateFromDate.valueAsDate = yesterday;
        dom.updateToDate.valueAsDate = new Date();
        dom.recentModal.classList.remove('hidden');
    };
    dom.recentModal.querySelector('.close-modal').onclick = () => dom.recentModal.classList.add('hidden');
    dom.applyUpdatesBtn.onclick = () => {
        filterMode = 'recent';
        recentDateRange.from = dom.updateFromDate.value;
        recentDateRange.to = dom.updateToDate.value;
        dom.recentModal.classList.add('hidden');
        renderProducts();
    };

    // Sidebar Group Toggle
    if (dom.toggleGroupViewBtn) {
        dom.toggleGroupViewBtn.onclick = () => {
            isSidebarGroupView = !isSidebarGroupView;
            localStorage.setItem('isSidebarGroupView', JSON.stringify(isSidebarGroupView));
            loadCategories();
        };
    }

    // Sort Change
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.onchange = () => renderProducts();

    // Existing listeners
    dom.hamburger.onclick = toggleSidebar;
    dom.sidebarOverlay.onclick = closeSidebar;

    document.getElementById('themeToggle').onclick = () => document.body.classList.toggle('theme-dark');
    document.getElementById('refreshCats').onclick = loadCategories;
    document.getElementById('scrapeNowBtn').onclick = () => {
        fetch('/api/scrape', { method: 'POST' }).then(() => alert("Scraper started in background."));
    };

    dom.catSearch.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.category-group').forEach(group => {
            let hasVisible = false;
            group.querySelectorAll('.category-item').forEach(li => {
                const match = li.dataset.name.includes(term);
                li.style.display = match ? 'flex' : 'none';
                if (match) hasVisible = true;
            });
            group.style.display = hasVisible ? 'block' : 'none';
            if (hasVisible) group.open = true;
        });
    };

    dom.searchInput.oninput = () => renderProducts();
    document.getElementById('sortSelect').onchange = () => renderProducts();
    document.getElementById('filterType').onchange = () => renderProducts();

    document.getElementById('showChangesBtn').onclick = (e) => {
        const btn = e.currentTarget;
        const active = btn.classList.toggle('active-highlight');
        document.querySelector('.app-header').classList.toggle('changes-active', active);
        renderProducts();
    };

    // Deals Stat Pill Click
    const dealsStat = document.getElementById('dealsStat');
    if (dealsStat) {
        dealsStat.onclick = () => {
            const changesBtn = document.getElementById('showChangesBtn');
            const movementSelect = document.getElementById('changesMovement');

            // Set for "Decreased" movement
            if (movementSelect) movementSelect.value = 'down';

            // Activate Changes tab if not active
            if (!changesBtn.classList.contains('active-highlight')) {
                changesBtn.classList.add('active-highlight');
                document.querySelector('.app-header').classList.add('changes-active');
            }
            renderProducts();
        };
    }

    // Changes Controls
    const movementSelect = document.getElementById('changesMovement');
    const changesSortSelect = document.getElementById('changesSort');
    if (movementSelect) movementSelect.onchange = () => renderProducts();
    if (changesSortSelect) changesSortSelect.onchange = () => renderProducts();

    document.getElementById('groupToggleBtn').onclick = (e) => {
        isGroupView = !isGroupView;
        e.currentTarget.classList.toggle('active', isGroupView);
        renderProducts();
    };

    dom.selectAllCats.onchange = (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.view-toggle').forEach(cb => {
            cb.checked = checked;
            const name = cb.dataset.catname;
            if (checked) activeViewCategories.add(name);
            else activeViewCategories.delete(name);
        });
        localStorage.setItem('activeViewCategories', JSON.stringify([...activeViewCategories]));
        currentProductViewLimit = 50; // Reset pagination
        renderProducts();
    };

    document.getElementById('toggleCompareBtn').onclick = toggleCompareMode;
    document.getElementById('doCompareBtn').onclick = showComparisonGraph;

    // Close modal: X button + backdrop click
    const closeBtn = document.querySelector('.close-modal');
    if (closeBtn) closeBtn.onclick = () => dom.modal.classList.add('hidden');
    const modalBackdrop = document.querySelector('.modal-backdrop');
    if (modalBackdrop) modalBackdrop.onclick = () => dom.modal.classList.add('hidden');


    document.getElementById('addCatBtn').onclick = async () => {
        const name = document.getElementById('newCatName').value;
        const url = document.getElementById('newCatUrl').value;
        if (name && url) {
            await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', name, url }) });
            loadCategories();
        }
    };

    // Responsive: close sidebar on resize to desktop
    window.addEventListener('resize', () => {
        if (!isMobile()) {
            dom.sidebarOverlay.classList.remove('active');
            dom.hamburger.classList.remove('active');
        }
    });

    // Swipe to close sidebar on mobile
    let touchStartX = 0;
    dom.sidebar.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    dom.sidebar.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        if (deltaX < -60 && isMobile()) {
            closeSidebar();
        }
    }, { passive: true });
}

// --- Category Logic ---

async function loadCategories() {
    // 1. Try Local Data (Static Mode)
    if (window.CATEGORY_DATA) {
        categories = window.CATEGORY_DATA;
        console.log('Loaded categories from categories.js:', categories.length);
    }
    // 2. Fallback to API (Server Mode)
    else {
        try {
            const res = await fetch('/api/categories');
            if (res.ok) categories = await res.json();
        } catch (e) {
            console.warn('API load failed, checking for backup...', e);
        }
    }

    if (!categories || categories.length === 0) {
        dom.categoryList.innerHTML = `<div style="padding:20px; color:var(--text-muted); text-align:center;">No categories found.<br><small>Run scraper first.</small></div>`;
        return;
    }

    dom.totalCats.innerText = categories.length;

    // Grouping
    const groups = {};
    const pinned = [];

    categories.forEach(cat => {
        if (pinnedCategories.has(cat.url)) {
            pinned.push(cat);
        }

        let g = "Others";
        if (cat.name.includes(" - ")) g = cat.name.split(" - ")[0];
        else if (cat.name.includes("&")) g = cat.name.split("&")[0].trim();
        else g = cat.name.split(" ")[0];

        if (!groups[g]) groups[g] = [];
        groups[g].push(cat);
    });

    dom.categoryList.innerHTML = '';
    const frag = document.createDocumentFragment();

    // --- Rendering Strategy: Flat vs Grouped ---
    // 1. Render Pinned Section (Always at top)
    if (pinned.length > 0) {
        const pinnedDetails = document.createElement('details');
        pinnedDetails.className = 'category-group pinned-group';
        pinnedDetails.open = true;
        pinnedDetails.innerHTML = `<summary>⭐ Favorites (${pinned.length})</summary>`;
        pinned.forEach(cat => pinnedDetails.appendChild(createCategoryItem(cat)));
        frag.appendChild(pinnedDetails);
    }

    // 2. Render Main List
    if (isSidebarGroupView) {
        // Grouped View (Accordion)
        Object.keys(groups).sort().forEach(gName => {
            const details = document.createElement('details');
            details.className = 'category-group';
            // details.open = false; // Closed by default
            const summary = document.createElement('summary');
            summary.innerText = gName;
            details.appendChild(summary);
            groups[gName].forEach(cat => details.appendChild(createCategoryItem(cat)));
            frag.appendChild(details);
        });
    } else {
        // Flat View (Simple List)
        // Sort all non-pinned categories alphabetically
        const flatList = categories.filter(c => !pinnedCategories.has(c.url));
        flatList.sort((a, b) => a.name.localeCompare(b.name));

        flatList.forEach(cat => {
            frag.appendChild(createCategoryItem(cat));
        });
    }

    dom.categoryList.appendChild(frag);
    // Add logic to update toggle button icon if desired
    if (dom.toggleGroupViewBtn) {
        dom.toggleGroupViewBtn.innerHTML = isSidebarGroupView ? '<i class="fa-solid fa-list"></i>' : '<i class="fa-solid fa-folder-tree"></i>';
        dom.toggleGroupViewBtn.title = isSidebarGroupView ? "Switch to Flat View" : "Switch to Grouped View";
    }
}

function createCategoryItem(cat) {
    const li = document.createElement('li');
    li.className = `category-item`;
    li.dataset.name = cat.name.toLowerCase();

    const isChecked = activeViewCategories.has(cat.name);
    const isPinned = pinnedCategories.has(cat.url);

    li.innerHTML = `
        <input type="checkbox" class="view-toggle" data-catname="${cat.name}" ${isChecked ? 'checked' : ''}>
        <div class="category-name" title="${cat.name}">${cat.name}</div>
        <div style="display:flex; gap:8px; align-items:center;">
            <button class="pin-btn" style="color:${isPinned ? 'orange' : 'var(--text-muted)'}" 
                onclick="window.togglePin('${cat.url}', this)">${isPinned ? '★' : '☆'}</button>
        </div>
    `;

    // Event Delegation handling inside initEvents better, but inline for now is robust
    li.querySelector('.view-toggle').onchange = (e) => {
        if (e.target.checked) activeViewCategories.add(cat.name);
        else activeViewCategories.delete(cat.name);

        localStorage.setItem('activeViewCategories', JSON.stringify([...activeViewCategories]));

        currentProductViewLimit = 50; // Reset pagination
        renderProducts();

        if (window.innerWidth <= 768) setTimeout(closeSidebar, 150);
    };

    li.querySelector('.category-name').onclick = () => {
        const cb = li.querySelector('.view-toggle');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    };

    return li;
}

// Global for inline onclick
window.togglePin = (url, btn) => {
    if (pinnedCategories.has(url)) {
        pinnedCategories.delete(url);
        btn.innerHTML = '☆';
        btn.style.color = 'var(--text-muted)';
    } else {
        pinnedCategories.add(url);
        btn.innerHTML = '★';
        btn.style.color = 'orange';
    }
    localStorage.setItem('pinnedCategories', JSON.stringify([...pinnedCategories]));

    // Config: Refresh list to update "Favorites" group? 
    // Maybe just reload to simplify logic or move item naturally?
    // For now, let's just keep it simple. Reloading might close groups.
    // User can refresh if they want to see it move to top.
};

window.toggleActive = (url) => {
    // Deprecated for static view, or implement localStorage for scrape-list
    console.log("Toggle active scraping not supported in static viewer mode.");
};

// --- Product Rendering & Pagination ---

function renderProducts() {
    dom.productGrid.innerHTML = '';

    // Convert map to array
    let products = Object.values(window.PRODUCT_DATA || {});

    // Sort logic
    // Sort logic
    const sortSelect = document.getElementById('sortSelect');
    const sortMode = sortSelect ? sortSelect.value : 'default';

    if (sortMode === 'priceAsc') products.sort((a, b) => window.normalizeProduct(a).price - window.normalizeProduct(b).price);
    else if (sortMode === 'priceDesc') products.sort((a, b) => window.normalizeProduct(b).price - window.normalizeProduct(a).price);
    else if (sortMode === 'name') products.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'fav') products.sort((a, b) => (favorites.has(b.id) ? 1 : 0) - (favorites.has(a.id) ? 1 : 0));

    // Filter
    let filtered = products;

    // 1. Search Filter
    const searchTerm = dom.searchInput?.value?.toLowerCase() || "";
    if (searchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm));

    // 2. Recent Updates Filter
    if (filterMode === 'recent') {
        const fromDate = new Date(recentDateRange.from);
        const toDate = new Date(recentDateRange.to);
        // Adjustment to include the 'toDate' full day
        toDate.setHours(23, 59, 59);

        filtered = filtered.filter(p => {
            if (!p.history || p.history.length < 2) return false;
            // Find price at start and end of range
            // We need ANY change within this range. 
            // Better logic: Last price update date >= fromDate?
            // User wants "recently updated prices".
            // Let's check history entries within range.
            const updatesInRange = p.history.filter(h => {
                const d = new Date(h.date);
                return d >= fromDate && d <= toDate;
            });
            // If there's an update in range, and price changed from previous?
            // Or just any new entry? Scraper adds entry every run.
            // We only want Price CHANGES. 
            // So if multiple entries in range have DIFFERENT prices. 
            // OR if the first entry in range diffs from the one before it.

            // Simplest: Check if last update date is in range AND price != prev price
            const lastH = p.history[p.history.length - 1];
            const lastD = new Date(lastH.date);
            if (lastD < fromDate || lastD > toDate) return false;

            // Check if price changed recently
            if (p.history.length >= 2) {
                return p.history[p.history.length - 1].price !== p.history[p.history.length - 2].price;
            }
            return false;
        });

        dom.totalItems.parentElement.querySelector('span').innerText = "Updated Items";
    }

    // 3. Category Filter (Fixed Toggling Bug)
    if (filterMode === 'normal' && activeViewCategories.size > 0) {
        // Normalize set for comparison
        const activeCatsNorm = new Set([...activeViewCategories].map(c => c.trim().toLowerCase()));

        filtered = filtered.filter(p => {
            const cat = (p.category || "Uncategorized").trim().toLowerCase();
            return activeCatsNorm.has(cat);
        });
    } else {
        // Reset label
        if (filterMode === 'normal') dom.totalItems.parentElement.querySelector('span').innerText = "Items";
    }

    // 4. "Only Changes" Filter (Enhanced)
    const onlyChanges = document.getElementById('showChangesBtn').classList.contains('active-highlight');
    if (onlyChanges) {
        const movement = document.getElementById('changesMovement')?.value || 'any';

        filtered = filtered.filter(p => {
            if (!p.history || p.history.length < 2) return false;
            const current = p.history[p.history.length - 1].price;
            const prev = p.history[p.history.length - 2].price;

            if (movement === 'up') return current > prev;
            if (movement === 'down') return current < prev;
            return current !== prev;
        });

        // 5. Advanced Sort for Changes
        const cSort = document.getElementById('changesSort')?.value;
        if (cSort === 'diffDesc' || cSort === 'diffAsc') {
            filtered.sort((a, b) => {
                const diffA = Math.abs(a.history[a.history.length - 1].price - a.history[a.history.length - 2].price);
                const diffB = Math.abs(b.history[b.history.length - 1].price - b.history[b.history.length - 2].price);
                return cSort === 'diffDesc' ? diffB - diffA : diffA - diffB;
            });
        }
    }

    // 4. Type Filter
    const type = document.getElementById('filterType').value;
    const bundleRegex = /pack|bundle|combo|set|box|case|dz|dozen|hali/i;

    if (type === 'kg') {
        filtered = filtered.filter(p => /kg|gm|g/i.test(p.current_unit));
    } else if (type === 'liter') {
        filtered = filtered.filter(p => /ltr|l|ml/i.test(p.current_unit));
    } else if (type === 'bundle') {
        filtered = filtered.filter(p => {
            const unit = (p.current_unit || '').toLowerCase();
            const hasBundleKeyword = bundleRegex.test(p.name) || bundleRegex.test(unit);
            const isMultiPiece = /pcs/i.test(unit) && parseFloat(unit) > 1;
            return hasBundleKeyword || isMultiPiece;
        });
    } else if (type === 'piece') {
        filtered = filtered.filter(p => {
            const unit = (p.current_unit || '').toLowerCase();
            const isWeight = /kg|gm|g/i.test(unit);
            const isVolume = /ltr|l|ml/i.test(unit);
            const hasBundleKeyword = bundleRegex.test(p.name) || bundleRegex.test(unit);
            const isMultiPiece = /pcs/i.test(unit) && parseFloat(unit) > 1;
            return !isWeight && !isVolume && !hasBundleKeyword && !isMultiPiece;
        });
    }

    currentFilteredResults = filtered; // Update global for bulk actions
    dom.totalItems.innerText = filtered.length;

    // Grid Grouping Logic: Sort by Category if enabled
    if (isGroupView) {
        filtered.sort((a, b) => {
            const catA = (a.category || "Uncategorized");
            const catB = (b.category || "Uncategorized");
            return catA.localeCompare(catB);
        });
    }

    if (filtered.length === 0) {
        dom.productGrid.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-basket-shopping" style="font-size:3rem; margin-bottom:1rem; opacity:0.5;"></i>
                <p>No products found based on filters.</p>
                ${activeViewCategories.size === 0 ? '<p><small>Select a category from the sidebar to start.</small></p>' : ''}
            </div>
        `;
        return;
    }

    const frag = document.createDocumentFragment();

    // PAGINATION: Only render up to currentProductViewLimit
    // PAGINATION: Only render up to currentProductViewLimit
    // Note: If GroupView is ON, pagination cuts off groups mid-way? 
    // Yes. It's acceptable for performance.
    const toShow = filtered.slice(0, currentProductViewLimit);
    let lastRenderedCategory = null;

    toShow.forEach((p, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.animationDelay = `${index * 50}ms`; // Stagger animation

        // Handle click for comparison or history
        // Handle click for comparison or history
        card.onclick = (e) => {
            if (isCompareMode) {
                if (selectedForCompare.has(p.id)) selectedForCompare.delete(p.id);
                else {
                    if (selectedForCompare.size >= 10) return alert("Max 10 items for comparison");
                    selectedForCompare.add(p.id);
                }
                renderProducts(); // Re-render to show selection state
            } else {
                // Show Graph on click
                showHistory(p.id);
            }
        };

        const history = p.history || [];
        const hasHistory = history.length > 1;

        // Use Global Normalization
        const std = window.normalizeProduct(p);
        const displayPrice = std.price;
        const displayUnit = std.unit;

        // Change calculation (Normalized)
        let changeLabel = "";
        let changeClass = "";

        if (hasHistory) {
            const hPrev = history[history.length - 2];
            const hCurr = history[history.length - 1];

            // Apply current normalization ratio to history
            const ratio = std.price / (p.current_price || 1);
            const prevVal = hPrev.price * ratio;
            const currVal = hCurr.price * ratio;

            if (currVal > prevVal) { changeLabel = `+${(currVal - prevVal).toFixed(0)}`; changeClass = 'price-up'; }
            else if (currVal < prevVal) { changeLabel = `-${(prevVal - currVal).toFixed(0)}`; changeClass = 'price-down'; }
        }

        const isFav = favorites.has(p.id);
        const isSelected = selectedForCompare.has(p.id);
        const isSelectionMode = isCompareMode;

        // Group Header logic (preserved)
        if (isGroupView) {
            const currentCat = p.category || "Uncategorized";
            if (currentCat !== lastRenderedCategory) {
                const header = document.createElement('h3');
                header.className = 'grid-group-header';
                header.innerText = currentCat;
                header.style.gridColumn = "1 / -1";
                header.style.marginTop = "20px";
                header.style.borderBottom = "2px solid var(--border)";
                frag.appendChild(header);
                lastRenderedCategory = currentCat;
            }
        }

        card.innerHTML = `
            <div class="product-image-container">
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.toggleFav('${p.id}')">♥</button>
                <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='https://placehold.co/150x150?text=No+Img'">
                ${changeLabel ? `<span class="price-badge ${changeClass}">${changeLabel}</span>` : ''}
                ${isSelected ? '<div class="compare-check"><i class="fa-solid fa-check"></i></div>' : ''}
            </div>
            <div class="product-details">
                <div class="product-name" title="${p.name}">${p.name}</div>
                <div class="product-meta">
                    <div class="product-price">
                        <span class="price-large">${Math.round(displayPrice)}</span> 
                        <span class="unit-text">${displayUnit}</span>
                    </div>
                    ${hasHistory ? `<button class="history-btn" onclick="event.stopPropagation(); showHistory('${p.id}')"><i class="fa-solid fa-chart-line"></i></button>` : ''}
                </div>
                <!-- Hover: Real Details (Actual Price & Unit) -->
                 <div class="extra-info trigger-hover" style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
                    Actual: ${Math.round(p.current_price)}/${p.current_unit}
                </div>
            </div>
        `;
        if (isSelected) card.classList.add('selected-compare');
        frag.appendChild(card);
    });

    dom.productGrid.appendChild(frag);

    // Render "Load More" button if needed
    if (filtered.length > currentProductViewLimit) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.style.gridColumn = "1 / -1";
        loadMoreDiv.style.textAlign = "center";
        loadMoreDiv.style.padding = "20px";

        const btn = document.createElement('button');
        btn.className = "btn btn-primary";
        btn.innerHTML = `<i class="fa-solid fa-arrow-down"></i> Load More (${filtered.length - currentProductViewLimit} remaining)`;
        btn.onclick = () => {
            currentProductViewLimit += 50;
            renderProducts(); // Re-render with new limit
        };

        loadMoreDiv.appendChild(btn);
        dom.productGrid.appendChild(loadMoreDiv);
    }
}

// --- Helpers ---
window.toggleFav = (id) => {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    localStorage.setItem('tracker_favs', JSON.stringify([...favorites]));
    renderProducts();
};

window.toggleActive = (url) => {
    console.warn("Scraping activation is disabled in static mode.");
    // Optional: Implement local toggle if needed for logic, but for now just stub.
};

window.pinCat = (url) => {
    if (pinnedCategories.has(url)) pinnedCategories.delete(url);
    else pinnedCategories.add(url);
    localStorage.setItem('pinnedCategories', JSON.stringify([...pinnedCategories]));
    loadCategories();
};

function toggleCompareMode() {
    isCompareMode = !isCompareMode;
    const btn = document.getElementById('toggleCompareBtn');
    btn.querySelector('.btn-label').innerText = isCompareMode ? "Exit" : "Compare";
    btn.classList.toggle('active', isCompareMode);
    dom.compareBar.classList.toggle('visible', isCompareMode);
    dom.compareBar.style.display = isCompareMode ? 'flex' : 'none';
    if (!isCompareMode) selectedForCompare.clear();

    // Add "Compare All Visible" button if logic warrants
    // We already have toggleCompareBtn. 
    // Maybe add a small button in the Compare Bar?
    const compareBar = document.getElementById('compareBar');
    if (isCompareMode) {
        // Ensure we have a bulk add button if not exists
        if (!document.getElementById('bulkCompareBtn')) {
            const btn = document.createElement('button');
            btn.id = 'bulkCompareBtn';
            btn.className = 'btn btn-sm btn-outline';
            btn.innerText = "Add All Visible (max 10)";
            btn.onclick = () => window.addAllToCompare();
            btn.style.marginLeft = "10px";
            // Insert after the count check
            const countDiv = document.getElementById('compareCount');
            countDiv.parentNode.insertBefore(btn, countDiv.nextSibling);
        }
    }
    renderProducts();
}

// Bulk Compare Helper
window.addAllToCompare = () => {
    if (currentFilteredResults.length === 0) return alert("No items to add.");

    let addedCount = 0;
    for (const p of currentFilteredResults) {
        if (selectedForCompare.size >= 10) break;
        if (!selectedForCompare.has(p.id)) {
            selectedForCompare.add(p.id);
            addedCount++;
        }
    }

    if (addedCount > 0) {
        renderProducts();
    } else {
        if (selectedForCompare.size >= 10) alert("Comparison list full (max 10).");
        else alert("All visible items already added.");
    }
};

function showComparisonGraph() {
    if (selectedForCompare.size < 1) return;
    dom.modal.classList.remove('hidden');
    document.getElementById('modalTitle').querySelector('span').innerText = 'Comparison';
    const selected = products.filter(p => selectedForCompare.has(p.id));
    const allDates = [...new Set(selected.flatMap(p => p.history.map(h => h.date)))].sort();
    const datasets = selected.map((p, i) => ({
        label: p.name,
        data: allDates.map(d => { const h = p.history.find(x => x.date === d); return h ? h.norm_price : null; }),
        borderColor: `hsl(${i * (360 / selected.length)}, 70%, 50%)`,
        tension: 0.2, fill: false
    }));
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('priceChart').getContext('2d'), {
        type: 'line',
        data: { labels: allDates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text').trim() } } },
            scales: {
                x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted').trim() }, grid: { color: getComputedStyle(document.body).getPropertyValue('--border').trim() } },
                y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted').trim() }, grid: { color: getComputedStyle(document.body).getPropertyValue('--border').trim() } }
            }
        }
    });
}

function showHistory(pid) {
    const p = products.find(prod => prod.id === pid);
    if (!p) return;

    dom.modal.classList.remove('hidden');
    document.getElementById('modalTitle').querySelector('span').innerText = p.name;
    const details = document.getElementById('modalDetails');
    if (details) details.innerHTML = `<div class="detail-item"><i class="fa-solid fa-folder"></i> <strong>Category:</strong> ${p.category || 'N/A'}</div><div class="detail-item"><i class="fa-solid fa-tag"></i> <strong>Current:</strong> ৳${p.current_price} / ${p.current_unit}</div><div class="detail-item"><i class="fa-solid fa-scale-balanced"></i> <strong>Standard:</strong> ${p.norm_price_display}</div>`;
    const labels = p.history.map(h => h.date);
    const data = p.history.map(h => h.norm_price);
    if (chartInstance) chartInstance.destroy();

    const style = getComputedStyle(document.body);
    chartInstance = new Chart(document.getElementById('priceChart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Price',
                data,
                borderColor: style.getPropertyValue('--accent').trim(),
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                pointBackgroundColor: style.getPropertyValue('--accent').trim(),
                pointBorderWidth: 2,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: style.getPropertyValue('--text').trim() } } },
            scales: {
                x: { ticks: { color: style.getPropertyValue('--text-muted').trim() }, grid: { color: style.getPropertyValue('--border').trim() } },
                y: { ticks: { color: style.getPropertyValue('--text-muted').trim() }, grid: { color: style.getPropertyValue('--border').trim() } }
            }
        }
    });
}

function updateStats() {
    if (products.length === 0) return;
    const goodBuys = products.filter(p => p.history.length > 1 && p.current_price < (p.history.reduce((s, h) => s + h.price, 0) / p.history.length) * 0.9).length;
    document.getElementById('priceDrops').innerText = goodBuys;
    const dates = products.flatMap(p => p.history.map(h => h.date)).sort();
    document.getElementById('lastUpdate').innerText = dates[dates.length - 1] || '-';
}

function clearCompare() {
    selectedForCompare.clear();
    document.getElementById('compareCount').innerText = "0 items";
    renderProducts();
}

init();
