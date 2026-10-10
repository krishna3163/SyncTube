import { test, expect } from '@playwright/test';
import path from 'path';

const artifactsDir = '/home/krishna/.gemini/antigravity-ide/brain/1a519faf-ea24-4214-be17-44bb6a95b9d1';

test.describe('Temporary Browser Room Streaming & Watch Party Integration', () => {
  test('User can stream Temporary Browser to room and choose between Cloud Browser vs Local Tab Share', async ({ page }) => {
    // 1. Visit Home Page
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

    // 2. Fill username and Create Room
    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10000 });
    await usernameInput.fill('HostTester');

    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    // Expect navigation to room URL
    await expect(page).toHaveURL(/\/[A-Z0-9]{4,10}/i, { timeout: 15000 });

    // Wait for Room Page to load
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
    console.log('[Test] Successfully entered SyncTube Watch Party Room');

    // 3. Open Browser & Cinema Hub modal
    const hubBtn = page.getByRole('button', { name: /browser hub/i }).first();
    await expect(hubBtn).toBeVisible({ timeout: 10000 });
    await hubBtn.click();

    // 4. Select Netflix platform from the hub
    const netflixCard = page.locator('.browser-platform-card').filter({ hasText: /Netflix/i }).first();
    await expect(netflixCard).toBeVisible({ timeout: 10000 });
    await netflixCard.click();

    // 5. Verify Cinema Stage shows dual options (Cloud Temporary Browser vs Local Tab Share)
    await expect(page.locator('.cinema-stage-card')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.choice-card-cloud')).toBeVisible();
    await expect(page.locator('.choice-card-local')).toBeVisible();

    const stageChoicesScreenshot = path.join(artifactsDir, 'room_stream_choices_card.png');
    await page.screenshot({ path: stageChoicesScreenshot });
    console.log('[Test] Captured Cinema Stage Choices screenshot:', stageChoicesScreenshot);

    // 6. Test Option 2: Share Local Browser Tab
    const shareTabBtn = page.getByRole('button', { name: /share local browser tab/i });
    await expect(shareTabBtn).toBeVisible();
    await shareTabBtn.click();

    // Verify Tab Player presentation stage
    await expect(page.locator('.room-tab-player-container')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Share Your Browser Tab Directly/i)).toBeVisible();

    const tabPlayerScreenshot = path.join(artifactsDir, 'room_tab_player_stage.png');
    await page.screenshot({ path: tabPlayerScreenshot });
    console.log('[Test] Captured Local Tab Player stage screenshot:', tabPlayerScreenshot);

    // 7. Test Option 1: Cloud Temporary Browser Stream
    await hubBtn.click();
    await netflixCard.click();
    await expect(page.locator('.cinema-stage-card')).toBeVisible({ timeout: 10000 });

    const launchCloudBtn = page.getByRole('button', { name: /stream via temporary browser/i });
    await expect(launchCloudBtn).toBeVisible({ timeout: 10000 });
    await launchCloudBtn.click();

    // Wait for Room Browser Player stage to mount
    await expect(page.locator('.room-browser-stage-container')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.room-browser-canvas')).toBeVisible();
    await expect(page.getByText(/LIVE BROWSER/i)).toBeVisible();
    await expect(page.getByText(/Isolated Cloud Sandbox/i)).toBeVisible();

    const browserStageScreenshot = path.join(artifactsDir, 'room_browser_live_stage.png');
    await page.screenshot({ path: browserStageScreenshot });
    console.log('[Test] Captured Live Temporary Browser Cinema Stream screenshot:', browserStageScreenshot);

    console.log('[Test] Full Temporary Browser Room Streaming & Tab Share flow verified!');
  });
});
