// ==UserScript==
// @name         Steam Badges - Filter Drops Remaining
// @namespace    local.steam-badges-drop-filter
// @version      1.1
// @description  Adds a toggle on the Steam badges page to hide games with no card drops remaining
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
    const DROPS_REGEX = /(\d+)\s*card drops?\s*remaining/i;
    function getRows() {
        return document.querySelectorAll('.badge_row');
    }
    // A row only counts as "has drops" if it explicitly states a positive
    // number. A maxed (Level 5) badge shows no drops line at all, and an
    // exhausted one says "No card drops remaining" - both should be hidden,
    // so we check for a positive match rather than the absence of "No...".
    function hasDropsRemaining(row) {
        const match = row.textContent.match(DROPS_REGEX);
        return match ? parseInt(match[1], 10) > 0 : false;
    }
    function applyFilter(enabled) {
        getRows().forEach((row) => {
            row.style.display = enabled && !hasDropsRemaining(row) ? 'none' : '';
        });
    }
    function insertControl() {
        const rows = getRows();
        if (!rows.length) return false;
        const bar = document.createElement('div');
        bar.style.cssText = 'margin:10px 0; text-align:right; font-size:14px;';
        bar.innerHTML = `
            <label style="cursor:pointer; user-select:none;">
                <input type="checkbox" id="drop-filter-toggle" autocomplete="off" style="vertical-align:middle;">
                Only show games with drops remaining
            </label>
    `;
        rows[0].parentElement.insertBefore(bar, rows[0]);
        const checkbox = bar.querySelector('#drop-filter-toggle');
        checkbox.addEventListener('change', () => {
            applyFilter(checkbox.checked);
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
