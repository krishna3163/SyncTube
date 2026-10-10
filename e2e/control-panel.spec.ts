import { test, expect } from '@playwright/test';
import path from 'node:path';
import { artifactsDir } from './artifacts.js';

test.describe('Workspaces Control Panel Comprehensive Tests', () => {
  test('User can open Control Panel and interact with all media, clipboard, printer, displays, quality, sharing, and workspaces features', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Visit Home Page
    await page.goto('/');

    // 2. Open Temporary Browser
    const browserNavBtn = page.getByRole('button', { name: /temporary browser/i }).first();
    await expect(browserNavBtn).toBeVisible();
    await browserNavBtn.click();

    // 3. Start a session with duckduckgo
    const input = page.locator('.temp-browser-start-card input');
    await input.fill('https://duckduckgo.com');

    const startBtn = page.getByRole('button', { name: /start session/i });
    await startBtn.click();

    // 4. Wait for session to start and live frame to appear
    await expect(page.locator('.browser-viewport-frame')).toBeVisible({ timeout: 25000 });
    console.log('[Test] Session active and live stream rendered.');

    // 5. Verify Control Panel button is visible and click it
    const cpBtn = page.locator('.control-panel-header-btn');
    await expect(cpBtn).toBeVisible();
    await cpBtn.click();

    // 6. Verify Control Panel drawer opened
    const drawer = page.locator('.control-panel-drawer');
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('heading', { name: /workspaces control panel/i })).toBeVisible();

    // TAB 1: MEDIA & AUDIO
    console.log('[Test] Testing Tab 1: Media & Audio');
    await expect(page.getByRole('heading', { name: 'Sound' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Microphone' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Webcam' })).toBeVisible();

    // Toggle Microphone
    const micToggle = page.locator('.control-card').filter({ hasText: 'Microphone' }).locator('.toggle-switch');
    await micToggle.click();
    await expect(page.locator('.mic-meter-bar')).toBeVisible();

    // Capture Media Tab screenshot
    const mediaScreenshot = path.join(artifactsDir, 'control_panel_tab1_media.png');
    await page.screenshot({ path: mediaScreenshot });
    console.log('[Test] Captured Media Tab screenshot:', mediaScreenshot);

    // TAB 2: CLIPBOARD & FILES & PRINTER
    console.log('[Test] Testing Tab 2: Clipboard & Files');
    await page.getByRole('button', { name: /clipboard & files/i }).click();
    await expect(page.getByRole('heading', { name: 'Clipboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Printer Redirection' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Download Files' })).toBeVisible();

    // Fill clipboard scratchpad
    const scratchpad = page.locator('.control-textarea');
    await scratchpad.fill('Testing bidirectional host to remote clipboard sync!');

    // Capture Clipboard Tab screenshot
    const clipboardScreenshot = path.join(artifactsDir, 'control_panel_tab2_clipboard.png');
    await page.screenshot({ path: clipboardScreenshot });
    console.log('[Test] Captured Clipboard Tab screenshot:', clipboardScreenshot);

    // TAB 3: DISPLAYS & QUALITY
    console.log('[Test] Testing Tab 3: Displays & Quality');
    await page.getByRole('button', { name: /displays & quality/i }).click();
    await expect(page.getByRole('heading', { name: 'Displays' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Streaming Quality' })).toBeVisible();
    await expect(page.locator('.display-canvas-preview')).toBeVisible();

    // Toggle High Quality preset
    await page.getByRole('button', { name: /high quality/i }).click();

    // Capture Displays Tab screenshot
    const displaysScreenshot = path.join(artifactsDir, 'control_panel_tab3_displays.png');
    await page.screenshot({ path: displaysScreenshot });
    console.log('[Test] Captured Displays Tab screenshot:', displaysScreenshot);

    // TAB 4: SHARE SESSION
    console.log('[Test] Testing Tab 4: Share Session');
    await page.getByRole('button', { name: /share session/i }).click();
    await expect(page.getByRole('heading', { name: /share instance \/ share session/i })).toBeVisible();
    await expect(page.locator('.share-link-input')).toBeVisible();

    // Capture Share Tab screenshot
    const shareScreenshot = path.join(artifactsDir, 'control_panel_tab4_share.png');
    await page.screenshot({ path: shareScreenshot });
    console.log('[Test] Captured Share Tab screenshot:', shareScreenshot);

    // TAB 5: ADVANCED & WORKSPACES
    console.log('[Test] Testing Tab 5: Workspaces & Advanced');
    await page.getByRole('button', { name: /workspaces/i }).click();
    await expect(page.getByRole('heading', { name: 'Advanced Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /leave session/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /delete completely/i })).toBeVisible();

    // Capture Advanced Tab screenshot
    const advancedScreenshot = path.join(artifactsDir, 'control_panel_tab5_advanced.png');
    await page.screenshot({ path: advancedScreenshot });
    console.log('[Test] Captured Advanced & Workspaces Tab screenshot:', advancedScreenshot);

    // Test "Leave this session"
    console.log('[Test] Testing "Leave this session"');
    const leaveBtn = page.getByRole('button', { name: /leave session/i });
    await leaveBtn.click();

    // Verify redirected back to home with active session banner
    await expect(page.locator('.active-tb-session-banner')).toBeVisible({ timeout: 10000 });
    console.log('[Test] Active Workspaces banner displayed on Home Page!');

    // Capture Home with Active Session Banner screenshot
    const homeBannerScreenshot = path.join(artifactsDir, 'home_active_tb_banner.png');
    await page.screenshot({ path: homeBannerScreenshot });

    // Test resuming session from banner
    await page.getByRole('button', { name: /resume session/i }).click();
    await expect(page.locator('.browser-viewport-frame')).toBeVisible({ timeout: 15000 });
    console.log('[Test] Successfully resumed session from Home banner!');

    // Clean up: delete session completely
    const closeBtn = page.getByRole('button', { name: /close & delete session/i });
    await closeBtn.click();
    await page.getByRole('button', { name: /confirm & wipe/i }).click();
    await expect(page.locator('.temp-browser-landing')).toBeVisible({ timeout: 10000 });
    console.log('[Test] Control Panel E2E Test completed 100% successfully!');
  });
});
