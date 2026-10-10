import { test, expect } from '@playwright/test';
import path from 'path';

const artifactsDir = '/home/krishna/.gemini/antigravity-ide/brain/1a519faf-ea24-4214-be17-44bb6a95b9d1';

test.describe('Viewer Features Group A: Live Video Player & Stream Experience', () => {
  test('Verifies live playback controls, latency modes, live edge, StreamInfoBar, share, report modals', async ({ page }) => {
    page.on('console', (msg) => console.log('[PAGE CONSOLE]', msg.text()));
    // 1. Visit Home Page & enter room
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

    const usernameInput = page.locator('input[placeholder*="username" i], input[type="text"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10000 });
    await usernameInput.fill('LiveViewerPro');

    const createBtn = page.getByRole('button', { name: /create|start/i }).first();
    await createBtn.click();

    // Expect navigation to room URL
    await expect(page).toHaveURL(/\/[A-Z0-9]{4,10}/i, { timeout: 15000 });
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });

    const searchBtn = page.locator('.video-empty-actions-row button').filter({ hasText: /YouTube Search/i }).first();
    await expect(searchBtn).toBeVisible({ timeout: 10000 });
    await searchBtn.click();

    await expect(page.locator('.yt-search-modal-card')).toBeVisible({ timeout: 10000 });
    // Click first preset tag to populate results
    const presetPill = page.locator('.yt-preset-pill').first();
    await expect(presetPill).toBeVisible();
    await presetPill.click();

    // Click Play button on the first result
    const playBtn = page.locator('.yt-search-item .btn-primary').first();
    await expect(playBtn).toBeVisible({ timeout: 10000 });
    await playBtn.click();

    // Wait for video player and controls to be rendered
    await page.waitForTimeout(1000);

    // 3. Verify StreamInfoBar underneath stage
    const infoBar = page.locator('.stream-info-card');
    await expect(infoBar).toBeVisible({ timeout: 10000 });

    // Check Live status badge, Viewers count, Uptime ticker
    await expect(infoBar.locator('.live-status-pill')).toBeVisible();
    await expect(infoBar.locator('.viewers-pill')).toBeVisible();
    await expect(infoBar.locator('.uptime-pill')).toBeVisible();

    // Check Channel Host, Avatar, Verified Badge, and Subscribe Button
    await expect(infoBar.locator('.channel-username')).toBeVisible();
    await expect(infoBar.locator('.channel-verified-badge')).toBeVisible();
    const subscribeBtn = infoBar.locator('.channel-subscribe-btn');
    await expect(subscribeBtn).toBeVisible();
    await subscribeBtn.click();
    await expect(subscribeBtn).toHaveClass(/is-subscribed/);

    // Check Like Button
    const likeBtn = infoBar.locator('.like-btn');
    await expect(likeBtn).toBeVisible();
    await likeBtn.click();
    await expect(likeBtn).toHaveClass(/has-liked/);

    // Check Category selector
    const categoryBtn = infoBar.locator('.stream-category-pill');
    await expect(categoryBtn).toBeVisible();
    await categoryBtn.click();
    const gamingCat = page.locator('.cat-dropdown-item').filter({ hasText: /Gaming/i });
    if (await gamingCat.isVisible()) {
      await gamingCat.click();
    }

    // Check Description accordion
    const descHeader = infoBar.locator('.stream-desc-header');
    await descHeader.click();
    await expect(infoBar.locator('.stream-desc-body')).toBeVisible();

    // Screenshot stage & stream info bar
    const stageAndInfoBarScreenshot = path.join(artifactsDir, 'live_player_stage_and_info_bar.png');
    await page.screenshot({ path: stageAndInfoBarScreenshot });
    console.log('[Test] Captured Live Stage and StreamInfoBar screenshot:', stageAndInfoBarScreenshot);

    // 4. Verify Playback Controls (Live Edge, Volume Slider, Latency, PiP, Theater)
    const stageCard = page.locator('.stage-card');
    await stageCard.hover();

    // Check Live-Edge pill button
    const liveEdgeBtn = page.locator('.live-edge-badge-btn').first();
    await expect(liveEdgeBtn).toBeVisible({ timeout: 5000 });

    // Check Volume cluster and slider
    const volumeCluster = page.locator('.volume-cluster').first();
    await expect(volumeCluster).toBeVisible();
    await volumeCluster.hover();
    await expect(page.locator('.volume-range-slider').first()).toBeVisible();

    // Check Picture-in-Picture & Theater buttons
    const pipBtn = page.locator('.pip-btn').first();
    await expect(pipBtn).toBeVisible();

    const theaterBtn = page.locator('.theater-btn').first();
    await expect(theaterBtn).toBeVisible({ timeout: 5000 });
    await theaterBtn.click();
    await expect(page.locator('.room-page-root')).toHaveClass(/theater-dimmed/, { timeout: 5000 });
    await theaterBtn.click(); // toggle back
    await expect(page.locator('.room-page-root')).not.toHaveClass(/theater-dimmed/, { timeout: 5000 });

    // Check Video Settings Popover (Latency Mode, Quality, Speed, Captions)
    // Find settings button by aria-label
    const videoSettingsBtn = page.locator('button[aria-label="Video Settings"]').first();
    await expect(videoSettingsBtn).toBeVisible();
    await videoSettingsBtn.click();

    await expect(page.locator('.local-video-settings')).toBeVisible();
    // Expand Latency Mode
    const latencyToggle = page.locator('.local-latency-toggle');
    await expect(latencyToggle).toBeVisible();
    await latencyToggle.click();

    await expect(page.locator('.local-latency-options')).toBeVisible();
    const ultraLowOption = page.locator('.latency-option-item').filter({ hasText: /Ultra-Low/i });
    await expect(ultraLowOption).toBeVisible();
    await ultraLowOption.click();

    const settingsScreenshot = path.join(artifactsDir, 'live_player_settings_latency.png');
    await page.screenshot({ path: settingsScreenshot });
    console.log('[Test] Captured Player Settings with Latency Mode screenshot:', settingsScreenshot);

    // 5. Verify Share Stream Modal
    const shareActionBtn = infoBar.locator('.stream-action-btn').filter({ hasText: /Share/i });
    await shareActionBtn.click();

    await expect(page.locator('.share-stream-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.share-url-input')).toBeVisible();
    await expect(page.locator('.share-social-grid')).toBeVisible();

    // Toggle QR code
    const qrToggle = page.locator('.share-qr-toggle');
    await expect(qrToggle).toBeVisible();
    await qrToggle.click();
    await expect(page.locator('.share-qr-img')).toBeVisible();

    const shareModalScreenshot = path.join(artifactsDir, 'live_stream_share_modal.png');
    await page.screenshot({ path: shareModalScreenshot });
    console.log('[Test] Captured Share Stream Modal screenshot:', shareModalScreenshot);

    // Close share modal
    await page.locator('.share-stream-modal .modal-close-btn').click();
    await expect(page.locator('.share-stream-modal')).not.toBeVisible();

    // 6. Verify Report Stream Modal
    const reportActionBtn = infoBar.locator('.report-btn');
    await reportActionBtn.click();

    await expect(page.locator('.report-stream-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.report-reasons-list')).toBeVisible();

    // Select a reason and submit
    const copyrightReason = page.locator('input[value="copyright"]');
    await copyrightReason.check();

    const reportModalScreenshot = path.join(artifactsDir, 'live_stream_report_modal.png');
    await page.screenshot({ path: reportModalScreenshot });
    console.log('[Test] Captured Report Stream Modal screenshot:', reportModalScreenshot);

    await page.locator('.report-submit-btn').click();
    await expect(page.locator('.report-success-state')).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(page.locator('.report-stream-modal')).not.toBeVisible();

    console.log('[Test] Group A Live Video Player & Stream Experience features successfully verified!');
  });
});
