// ==UserScript==
// @name         [BETA] Steam Badges - Filter Drops Remaining
// @namespace    local.steam-badges-drop-filter
// @version      1.5.0
// @description  Adds a toggle on the Steam badges page to show only games with card drops remaining, checked across every page, independent of interface language, styled with Steam's own button component
// @author       x0697x
// @license      MIT
// @match        https://steamcommunity.com/id/*/badges*
// @match        https://steamcommunity.com/profiles/*/badges*
// @grant        none
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB4PSIzIiB5PSI3IiB3aWR0aD0iMTciIGhlaWdodD0iMjMiIHJ4PSIzIiBmaWxsPSIjMWIyODM4IiBzdHJva2U9IiM2NmMwZjQiIHN0cm9rZS13aWR0aD0iMS41IiB0cmFuc2Zvcm09InJvdGF0ZSgtMTAgMTEuNSAxOC41KSIvPgo8cmVjdCB4PSIxMSIgeT0iMyIgd2lkdGg9IjE3IiBoZWlnaHQ9IjIzIiByeD0iMyIgZmlsbD0iIzJhNDc1ZSIgc3Ryb2tlPSIjNjZjMGY0IiBzdHJva2Utd2lkdGg9IjEuNSIvPgo8Y2lyY2xlIGN4PSIxOS41IiBjeT0iMTQuNSIgcj0iMyIgZmlsbD0iIzY2YzBmNCIvPgo8L3N2Zz4K
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

    // Language-independent detection: Steam only renders the "Play Game"
    // control inside a badge's stats block when that badge still has card
    // drops remaining. That's a CSS class name, not translated text, so it
    // holds regardless of interface language.
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

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Structural, exact page count instead of guessing from empty or
    // repeated fetch results: Steam's own pagination links point to this
    // same URL with a different "p" value, so the highest one present is
    // the real last page. Returns null if no such links are found.
    function getMaxPageFromPagination() {
        const here = new URL(location.href);

        const values = [...document.querySelectorAll('a[href*="p="]')]
            .map((a) => {
                try {
                    const url = new URL(a.href, location.href);

                    if (url.pathname !== here.pathname) {
                        return NaN;
                    }

                    return parseInt(url.searchParams.get('p'), 10);
                } catch {
                    return NaN;
                }
            })
            .filter((n) => Number.isFinite(n) && n > 0);

        return values.length ? Math.max(...values) : null;
    }

    const MAX_PAGES = 200; // absolute safety cap, not an expected page count

    function insertControl() {
        const rows = getRows();

        if (!rows.length) {
            return false;
        }

        // Bar layout only; the toggle itself reuses Steam's own button
        // component.
        const bar = document.createElement('div');

        bar.style.cssText =
            'display:flex; align-items:center; justify-content:flex-end; gap:10px; margin:10px 0;';

        const status = document.createElement('span');

        status.id = 'drop-filter-status';

        status.style.cssText =
            'color:#8f98a0; font-size:12px;';

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

        // Steam's own button classes don't include a distinct "pressed"
        // look, so the on-state is layered on top with an inset border.
        function setActiveStyle(isActive) {
            toggle.style.boxShadow =
                isActive ? 'inset 0 0 0 1px #67c1f1' : '';
        }

        async function runFilter() {
            // Immediately filter what's already on the current page.
            getRows().forEach((row) => {
                row.style.display = hasDropsRemaining(row) ? '' : 'none';
            });

            const currentPage = getCurrentPageNumber();

            setBusy(true);

            // Read the real page count up front rather than stopping the
            // loop when a fetch happens to come back empty or repeated.
            const maxPage = Math.min(
                getMaxPageFromPagination() || currentPage,
                MAX_PAGES
            );

            for (let page = 1; page <= maxPage && active; page += 1) {
                if (page === currentPage) {
                    continue;
                }

                status.textContent =
                    `Loading page ${page} of ${maxPage}...`;

                let rows = null;

                for (let attempt = 0; attempt < 2 && rows === null; attempt += 1) {
                    try {
                        rows = await fetchPageRows(page);
                    } catch (err) {
                        console.error(
                            'Steam Badges filter: failed loading page',
                            page,
                            err
                        );

                        if (attempt === 0) {
                            await sleep(500);
                        }
                    }
                }

                if (rows === null) {
                    continue;
                }

                // IMPORTANT:
                // Do NOT deduplicate rows by appid.
                //
                // Steam can have separate normal and foil badge rows for
                // the same game. Both rows link to the same
                // /gamecards/{appid}/ URL, but they are separate badge
                // states. A completed normal badge must not cause a foil
                // badge with remaining drops to be discarded.
                rows
                    .filter(hasDropsRemaining)
                    .forEach((row) => {
                        const clone = row.cloneNode(true);

                        container.appendChild(clone);
                        extraRows.push(clone);
                    });

                await sleep(200);
            }

            const visibleCount = getRows()
                .filter((r) => r.style.display !== 'none')
                .length;

            status.textContent =
                `Showing ${visibleCount} games with drops remaining across all pages.`;

            setBusy(false);
        }

        async function onToggle() {
            if (busy) {
                return;
            }

            active = !active;

            setActiveStyle(active);

            if (!active) {
                getRows().forEach((row) => {
                    row.style.display = '';
                });

                extraRows.forEach((row) => {
                    row.remove();
                });

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

    // The badges list can render slightly after DOMContentLoaded,
    // so retry briefly.
    let attempts = 0;

    const interval = setInterval(() => {
        attempts += 1;

        if (insertControl() || attempts > 20) {
            clearInterval(interval);
        }
    }, 250);
})();
