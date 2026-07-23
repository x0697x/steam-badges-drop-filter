// ==UserScript==
// @name         Steam Badges - Filter Drops Remaining
// @namespace    local.steam-badges-drop-filter
// @version      1.4.1
// @description  Adds a toggle on the Steam badges page to show only games with card drops remaining, checked across every page, independent of interface language, styled with Steam's own button component
// @author       x0697x
// @match        https://steamcommunity.com/id/*/badges*
// @match        https://steamcommunity.com/profiles/*/badges*
// @grant        none
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+CjxyZWN0IHg9IjMiIHk9IjciIHdpZHRoPSIxNyIgaGVpZ2h0PSIyMyIgcng9IjMiIGZpbGw9IiMxYjI4MzgiIHN0cm9rZT0iIzY2YzBmNCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHRyYW5zZm9ybT0icm90YXRlKC0xMCAxMS41IDE4LjUpIi8+CjxyZWN0IHg9IjExIiB5PSIzIiB3aWR0aD0iMTciIGhlaWdodD0iMjMiIHJ4PSIzIiBmaWxsPSIjMmE0NzVlIiBzdHJva2U9IiM2NmMwZjQiIHN0cm9rZS13aWR0aD0iMS41Ii8+CjxjaXJjbGUgY3g9IjE5LjUiIGN5PSIxNC41IiByPSIzIiBmaWxsPSIjNjZjMGY0Ii8+Cjwvc3ZnPgo=
// @updateURL    https://raw.githubusercontent.com/x0697x/steam-badges-drop-filter/main/steam-badges-drop-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/x0697x/steam-badges-drop-filter/main/steam-badges-drop-filter.user.js
// @homepageURL  https://github.com/x0697x/steam-badges-drop-filter
// ==/UserScript==

(function () {
    'use strict';

    // English-only fallback. Only used if the structural markers below
    // stop matching (e.g. after a Steam markup change). Not the primary
    // detection path, so it does not need one entry per language.
    const DROPS_REGEX_FALLBACK = /(\d+)\s*card drops?\s*remaining/i;

    function getRows(root = document) {
        return [...root.querySelectorAll('.badge_row')];
    }

    function hasDropsRemaining(row) {
        if (row.querySelector('.badge_title_playgame, .badge_title_stats_playgame')) {
            return true;
        }
        if (row.querySelector('.badge_title_stats_completed')) {
            return false;
        }
        // Ambiguous row (neither marker found) - fall back to text rather
        // than assume "no drops".
        return DROPS_REGEX_FALLBACK.test(row.textContent);
    }

    // Per-row identity that doesn't depend on text or language: the appid
    // embedded in the badge's own "gamecards" link.
    function getRowKey(row) {
        const link = row.querySelector('a[href*="/gamecards/"]');
        const match = link && link.href.match(/\/gamecards\/(\d+)/);
        return match ? match[1] : row.textContent.trim();
    }

    function getCurrentPageNumber() {
        return parseInt(new URL(location.href).searchParams.get('p') || '1', 10);
    }

    function buildPageUrl(pageNum) {
        const url = new URL(location.href);
        url.searchParams.set('p', pageNum);
        return url.toString();
    }

    async function fetchPageRows(pageNum) {
        const res = await fetch(buildPageUrl(pageNum), { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return getRows(doc);
    }

    const MAX_PAGES = 200; // safety cap, not an expected page count

    function insertControl() {
        const rows = getRows();
        if (!rows.length) return false;

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; align-items:center; justify-content:flex-end; gap:10px; margin:10px 0;';

        const status = document.createElement('span');
        status.id = 'drop-filter-status';
        status.style.cssText = 'color:#8f98a0; font-size:12px;';

        const toggle = document.createElement('div');
        toggle.id = 'drop-filter-toggle';
        toggle.className = 'btnv6_blue_hoverfade btn_small';
        toggle.style.cssText = 'cursor:pointer; user-select:none;';
        toggle.setAttribute('role', 'button');
        toggle.tabIndex = 0;
        toggle.innerHTML = '<span>Show only drops remaining</span>';

        bar.appendChild(status);
        bar.appendChild(toggle);

        const container = rows[0].parentElement;
        container.insertBefore(bar, rows[0]);

        let active = false;
        let busy = false;
        let extraRows = [];

        function setBusy(isBusy) {
            busy = isBusy;
            toggle.style.pointerEvents = isBusy ? 'none' : '';
            toggle.style.opacity = isBusy ? '0.6' : '';
        }

        function setActiveStyle(isActive) {
            toggle.style.boxShadow = isActive ? 'inset 0 0 0 1px #67c1f1' : '';
        }

        async function runFilter() {
            // Immediate feedback: filter what's already on this page.
            getRows().forEach((row) => {
                row.style.display = hasDropsRemaining(row) ? '' : 'none';
            });

            const currentPage = getCurrentPageNumber();
            const seenKeys = new Set(getRows().map(getRowKey));
            setBusy(true);

            let page = 1;
            let consecutiveEmpty = 0;

            while (page <= MAX_PAGES && active) {
                if (page === currentPage) { page += 1; continue; }

                status.textContent = `Loading page ${page}...`;
                let rows;
                try {
                    rows = await fetchPageRows(page);
                } catch (err) {
                    console.error('Steam Badges filter: failed loading page', page, err);
                    page += 1;
                    continue;
                }

                if (rows.length === 0) {
                    consecutiveEmpty += 1;
                    if (consecutiveEmpty >= 2) break; // two empty pages in a row = past the end
                    page += 1;
                    continue;
                }
                consecutiveEmpty = 0;

                const newRows = rows.filter((row) => {
                    const key = getRowKey(row);
                    if (seenKeys.has(key)) return false;
                    seenKeys.add(key);
                    return true;
                });

                if (newRows.length === 0) {
                    // Every row on this page was already seen - Steam has
                    // looped back (e.g. an out-of-range page number got
                    // clamped to the last real page).
                    break;
                }

                newRows.filter(hasDropsRemaining).forEach((row) => {
                    const clone = row.cloneNode(true);
                    container.appendChild(clone);
                    extraRows.push(clone);
                });

                page += 1;
            }

            const visibleCount = getRows().filter((r) => r.style.display !== 'none').length;
            status.textContent = `Showing ${visibleCount} games with drops remaining across all pages.`;
            setBusy(false);
        }

        async function onToggle() {
            if (busy) return;
            active = !active;
            setActiveStyle(active);

            if (!active) {
                getRows().forEach((row) => { row.style.display = ''; });
                extraRows.forEach((row) => row.remove());
                extraRows = [];
                status.textContent = '';
                return;
            }

            await runFilter();
        }

        toggle.addEventListener('click', onToggle);
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle();
            }
        });

        return true;
    }

    // The badges list can render slightly after DOMContentLoaded, so retry briefly.
    let attempts = 0;
    const interval = setInterval(() => {
        attempts += 1;
        if (insertControl() || attempts > 20) {
            clearInterval(interval);
        }
    }, 250);
})();
