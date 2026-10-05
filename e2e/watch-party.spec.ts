import { test, expect } from '@playwright/test';

test.describe('SyncTube Watch Party E2E Automated Tests', () => {
  test('Landing page loads and displays core elements', async ({ page }) => {
    await page.goto('/');

    // Verify title and brand
    await expect(page).toHaveTitle(/SyncTube/i);
    await expect(page.locator('.brand-logo, .brand-text').first()).toBeVisible();

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
    await expect(page.locator('.stage-area, .video-wrapper, .stage-card').first()).toBeVisible();

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

    // Drag into screen corner and verify it unsticks and moves back smoothly
    const boxBefore = await reactBtn.boundingBox();
    if (boxBefore) {
      await page.mouse.move(boxBefore.x + boxBefore.width / 2, boxBefore.y + boxBefore.height / 2);
      await page.mouse.down();
      await page.mouse.move(1200, 800, { steps: 5 });
      await page.mouse.up();

      const boxInCorner = await reactBtn.boundingBox();

      // Drag back away from corner - button must immediately follow cursor and not be stuck
      await page.mouse.move(boxInCorner!.x + boxInCorner!.width / 2, boxInCorner!.y + boxInCorner!.height / 2);
      await page.mouse.down();
      await page.mouse.move(boxInCorner!.x - 200, boxInCorner!.y - 200, { steps: 5 });
      await page.mouse.up();

      const boxAfterUnstick = await reactBtn.boundingBox();
      expect(boxAfterUnstick!.x).toBeLessThan(boxInCorner!.x);
      expect(boxAfterUnstick!.y).toBeLessThan(boxInCorner!.y);
    }

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

    // Switch to playlist tab
    const playlistTab = page.getByRole('tab', { name: /playlist/i }).or(page.locator('.sidebar-tab-btn:has-text("Playlist")')).first();
    await playlistTab.click();

    // Verify Up Next header or playlist container
    const playlistContainer = page.locator('.playlist-panel-v2, .playlist-container, .upnext-list').first();
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
      const modal = page.locator('.yt-search-modal-card, .modal-backdrop').first();
      await expect(modal).toBeVisible();

      // Search input is focusable
      const searchInput = page.locator('.yt-search-input');
      await expect(searchInput).toBeVisible();
    }
  });

  test('User can switch to Chat tab and send a message', async ({ page }) => {
    await page.goto('/');
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await usernameInput.fill('ChatTester');
    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    await expect(page).toHaveURL(/\/[A-Z0-9]{6,8}/i);

    // Switch to Chat tab
    const chatTab = page.locator('button:has-text("Chat")').first();
    await expect(chatTab).toBeVisible();
    await chatTab.click();

    // Type a message
    const chatInput = page.locator('.chat-input-v2');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('Hello watch party world!');
    await chatInput.press('Enter');

    // Expect message to appear in chat
    const sentMessage = page.locator('.chat-bubble-text:has-text("Hello watch party world!")').first();
    await expect(sentMessage).toBeVisible();
  });

  test('User can toggle Cinema Theater mode and Settings modal', async ({ page }) => {
    await page.goto('/');
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await usernameInput.fill('ModalTester');
    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    await expect(page).toHaveURL(/\/[A-Z0-9]{6,8}/i);

    // Toggle Theater mode
    const theaterBtn = page.locator('button[title*="Theater" i], button:has-text("Theater")').first();
    if (await theaterBtn.isVisible()) {
      await theaterBtn.click();
      const backdrop = page.locator('.theater-dim-backdrop');
      await expect(backdrop).toBeVisible();

      // Exit theater mode by clicking the backdrop or pressing Escape
      await page.keyboard.press('Escape');
      await expect(backdrop).toHaveCount(0);
    }

    // Open Settings modal
    const settingsBtn = page.locator('button[title*="Settings" i], button:has-text("Settings")').first();
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const settingsModal = page.locator('.modal-card:has-text("User"), .modal-card:has-text("Room")').first();
    await expect(settingsModal).toBeVisible();

    // Close settings modal
    const closeBtn = page.locator('.modal-close-btn, button[title*="Close" i]').first();
    await closeBtn.click();
    await expect(settingsModal).toHaveCount(0);
  });

  test('Multi-user interaction: Host and Viewer synchronize in the same room', async ({ browser }) => {
    // Context 1: Host creates room
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await hostPage.goto('/');

    const hostInput = hostPage.locator('input[placeholder*="username" i], input[type="text"]').first();
    await hostInput.fill('SyncHost');
    const createBtn = hostPage.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    // Wait until host is in the room and stage is visible
    await expect(hostPage.locator('.stage-area').first()).toBeVisible({ timeout: 10000 });
    await expect(hostPage).toHaveURL(/\/([A-Z0-9]{6,8})$/);
    const roomUrl = hostPage.url();
    const roomCode = new URL(roomUrl).pathname.replace(/^\//, '');

    // Context 2: Viewer joins room using room URL
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(roomUrl);

    // Join room on landing page - fill username and room code
    const viewerNameInput = viewerPage.locator('.join-card input[placeholder*="Bob" i], .join-card input[type="text"]').first();
    await viewerNameInput.fill('SyncViewer');

    const codeInput = viewerPage.locator('.join-card input.code-input, .join-card input[placeholder*="ABC123" i]').first();
    await codeInput.fill(roomCode);

    const joinBtn = viewerPage.locator('.join-action-btn, button:has-text("Join Room")').first();
    await joinBtn.click();

    // Verify both see the theater stage
    await expect(hostPage.locator('.stage-area').first()).toBeVisible({ timeout: 10000 });
    await expect(viewerPage.locator('.stage-area').first()).toBeVisible({ timeout: 10000 });

    // Verify viewer list shows 2 participants on host side
    const hostViewersTab = hostPage.locator('button:has-text("Viewers")').first();
    if (await hostViewersTab.isVisible()) {
      await hostViewersTab.click();
    }
    await expect(hostPage.locator('.participant-name:has-text("SyncViewer")').first()).toBeVisible({ timeout: 10000 });

    await hostContext.close();
    await viewerContext.close();
  });
});
