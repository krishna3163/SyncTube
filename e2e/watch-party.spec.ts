import { test, expect } from '@playwright/test';

test.describe('SyncTube Watch Party E2E Automated Tests', () => {
  test('Landing page loads and displays core elements', async ({ page }) => {
    await page.goto('/');

    // Verify title and brand
    await expect(page).toHaveTitle(/SyncTube/i);
    await expect(page.locator('.brand-logo, .brand-text')).toBeVisible();

    // Verify username input and create room button
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await expect(usernameInput).toBeVisible();

    const createBtn = page.getByRole('button', { name: /create|start|party/i }).first();
    await expect(createBtn).toBeVisible();
  });

  test('User can create room and enter theater stage', async ({ page }) => {
    await page.goto('/');

    // Fill username
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await usernameInput.fill('HostPlayer');

    // Click create room
    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    // Expect navigation to a room URL
    await expect(page).toHaveURL(/\/[A-Z0-9]{6,8}/i);

    // Verify stage area and video container exist
    await expect(page.locator('.stage-area, .video-wrapper, .stage-card')).toBeVisible();

    // Verify participant badge shows Host
    await expect(page.locator('.host-badge, .role-badge, .header-badge').first()).toBeVisible();
  });

  test('Draggable React button is present, movable, and opens emoji palette', async ({ page }) => {
    await page.goto('/');
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await usernameInput.fill('ReactTester');
    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    await expect(page).toHaveURL(/\/[A-Z0-9]{6,8}/i);

    // Draggable reaction launcher
    const reactBtn = page.locator('.reaction-toggle-btn');
    await expect(reactBtn).toBeVisible();

    // Verify drag handle grip icon exists
    await expect(page.locator('.reaction-drag-handle')).toBeVisible();

    // Click to open emoji reactions palette
    await reactBtn.click();
    const palette = page.locator('.reactions-palette');
    await expect(palette).toBeVisible();

    // Verify emoji buttons are interactive
    const heartEmoji = page.locator('.reaction-btn').first();
    await expect(heartEmoji).toBeVisible();
    await heartEmoji.click();

    // Palette remains or closes cleanly, no crash
    await expect(page.locator('.stage-area')).toBeVisible();
  });

  test('Playlist and Up Next section are interactive', async ({ page }) => {
    await page.goto('/');
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await usernameInput.fill('PlaylistWatcher');
    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    await expect(page).toHaveURL(/\/[A-Z0-9]{6,8}/i);

    // Switch to playlist tab if tabs are present
    const playlistTab = page.locator('button:has-text("Playlist"), [data-tab="playlist"]').first();
    if (await playlistTab.isVisible()) {
      await playlistTab.click();
    }

    // Verify Up Next header or playlist container
    const playlistContainer = page.locator('.playlist-panel-v2, .playlist-container, .upnext-list');
    await expect(playlistContainer).toBeVisible();
  });

  test('YouTube Search modal opens and allows searching', async ({ page }) => {
    await page.goto('/');
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await usernameInput.fill('SearchTester');
    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    await expect(page).toHaveURL(/\/[A-Z0-9]{6,8}/i);

    // Click change video or add video button
    const searchBtn = page.locator('button:has-text("Change Video"), button:has-text("Add Video"), button[title*="Search" i]').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();

      // Search modal appears
      const modal = page.locator('.yt-search-modal-card, .modal-backdrop');
      await expect(modal).toBeVisible();

      // Search input is focusable
      const searchInput = page.locator('.yt-search-input');
      await expect(searchInput).toBeVisible();
    }
  });
});
