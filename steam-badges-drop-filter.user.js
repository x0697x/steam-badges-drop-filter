// ==UserScript==
// @name         Steam Badges - Filter Drops Remaining
// @namespace    local.steam-badges-drop-filter
// @version      1.2
// @description  Adds a toggle on the Steam badges page to show only games with card drops remaining, checked across every page
// @author       x0697x
// @match        https://steamcommunity.com/id/*/badges*
// @match        https://steamcommunity.com/profiles/*/badges*
// @grant        none
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+CjxyZWN0IHg9IjMiIHk9IjciIHdpZHRoPSIxNyIgaGVpZ2h0PSIyMyIgcng9IjMiIGZpbGw9IiMxYjI4MzgiIHN0cm9rZT0iIzY2YzBmNCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHRyYW5zZm9ybT0icm90YXRlKC0xMCAxMS41IDE4LjUpIi8+CjxyZWN0IHg9IjExIiB5PSIzIiB3aWR0aD0iMTciIGhlaWdodD0iMjMiIHJ4PSIzIiBmaWxsPSIjMmE0NzVlIiBzdHJva2U9IiM2NmMwZjQiIHN0cm9rZS13aWR0aD0iMS41Ii8+CjxjaXJjbGUgY3g9IjE5LjUiIGN5PSIxNC41IiByPSIzIiBmaWxsPSIjNjZjMGY0Ii8+Cjwvc3ZnPgo=
// @updateURL    https://github.com/x0697x/steam-badges-drop-filter/raw/refs/heads/main/steam-badges-drop-filter.user.js
// @downloadURL  https://github.com/x0697x/steam-badges-drop-filter/raw/refs/heads/main/steam-badges-drop-filter.user.js
// @homepageURL  https://github.com/x0697x/steam-badges-drop-filter
// ==/UserScript==

(function () {
    'use strict';

    const DROPS_REGEX = /(\d+)\s*card drops?\s*remaining/i;
    const SUMMARY_REGEX = /Showing\s+(\d+)\s*-\s*(\d+)\s+of\s+([\d,]+)\s+badges/i;

    function getRows(root = document) {
        return [...root.querySelectorAll('.badge_row')];
    }

    function hasDropsRemaining(row) {
        const match = row.textContent.match(DROPS_REGEX);
        return match ? parseInt(match[1], 10) > 0 : false;
    }

    function getPaginationInfo() {
        const match = document.body.textContent.match(SUMMARY_REGEX);
        if (!match) return null;
        const perPage = parseInt(match[2], 10) - parseInt(match[1], 10) + 1;
        const total = parseInt(match[3].replace(/,/g, ''), 10);
        return { perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
    }

    function getCurrentPageNumber() {
        return parseInt(new URL(location.href).searchParams.get('p') || '1', 10);
    }

    function buildPageUrl(pageNum) {
        const url = new URL(location.href);
        url.searchParams.set('p', pageNum);
        return url.toString();
    }

    async function fetchPageDroppedRows(pageNum) {
        const res = await fetch(buildPageUrl(pageNum), { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return getRows(doc).filter(hasDropsRemaining);
    }

    function insertControl() {
        const rows = getRows();
        if (!rows.length) return false;

        const bar = document.createElement('div');
        bar.style.cssText = 'margin:10px 0; text-align:right; font-size:14px;';
        bar.innerHTML = `
            <span id="drop-filter-status" style="margin-right:10px; color:#8f98a0;"></span>
            <label style="cursor:pointer; user-select:none;">
                <input type="checkbox" id="drop-filter-toggle" autocomplete="off" style="vertical-align:middle;">
                Only show games with drops remaining (all pages)
            </label>
        `;

        const container = rows[0].parentElement;
        container.insertBefore(bar, rows[0]);

        const checkbox = bar.querySelector('#drop-filter-toggle');
        const status = bar.querySelector('#drop-filter-status');
        let extraRows = [];

        checkbox.addEventListener('change', async () => {
            if (!checkbox.checked) {
                getRows().forEach((row) => { row.style.display = ''; });
                extraRows.forEach((row) => row.remove());
                extraRows = [];
                status.textContent = '';
                return;
            }

            // Immediate feedback: filter what's already on this page.
            getRows().forEach((row) => {
                row.style.display = hasDropsRemaining(row) ? '' : 'none';
            });

            const info = getPaginationInfo();
            if (!info) {
                status.textContent = 'Only filtered current page (could not detect page count).';
                return;
            }
            if (info.totalPages <= 1) return;

            const currentPage = getCurrentPageNumber();
            checkbox.disabled = true;

            for (let p = 1; p <= info.totalPages; p++) {
                if (p === currentPage) continue;
                if (!checkbox.checked) break; // user unchecked mid-fetch
                status.textContent = `Loading page ${p} of ${info.totalPages}...`;
                try {
                    const matches = await fetchPageDroppedRows(p);
                    matches.forEach((row) => {
                        const clone = row.cloneNode(true);
                        container.appendChild(clone);
                        extraRows.push(clone);
                    });
                } catch (err) {
                    console.error('Steam Badges filter: failed loading page', p, err);
                }
            }

            const visibleCount = getRows().filter((r) => r.style.display !== 'none').length;
            status.textContent = `Showing ${visibleCount} games with drops remaining across all pages.`;
            checkbox.disabled = false;
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
