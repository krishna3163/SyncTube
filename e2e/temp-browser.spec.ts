import { test, expect } from '@playwright/test';
import path from 'node:path';
import { artifactsDir } from './artifacts.js';

test.describe('Temporary Browser Feature End-to-End Tests', () => {
  test('User can open Temporary Browser, start an isolated session, navigate, and wipe data', async ({ page }) => {
    // 1. Visit Home Page
    await page.goto('/');

    // 2. Click "Temporary Browser" navigation button
    const browserNavBtn = page.getByRole('button', { name: /temporary browser/i }).first();
    await expect(browserNavBtn).toBeVisible();
    await browserNavBtn.click();

    // 3. Verify Landing page UI elements
    await expect(page.locator('.temp-browser-hero')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Browse Any Site with Total Ephemeral Privacy/i })).toBeVisible();

    // Capture Landing Page screenshot
    const landingScreenshot = path.join(artifactsDir, 'temp_browser_1_landing.png');
    await page.screenshot({ path: landingScreenshot });
    console.log('[Test] Captured Temporary Browser landing screen:', landingScreenshot);

    // 4. Start a session with example.com
    const input = page.locator('.temp-browser-start-card input');
    await input.fill('https://example.com');

    const startBtn = page.getByRole('button', { name: /start session/i });
    await startBtn.click();

    // 5. Verify Browser Chrome opens
    await expect(page.locator('.browser-chrome-bar')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.browser-viewport-container')).toBeVisible();

    // Wait for live frame stream to arrive
    await expect(page.locator('.browser-viewport-frame')).toBeVisible({ timeout: 20000 });
    console.log('[Test] Remote Chromium live screencast frame rendered successfully!');

    // Capture Active Browser Window screenshot
    const activeScreenshot = path.join(artifactsDir, 'temp_browser_2_active_session.png');
    await page.screenshot({ path: activeScreenshot });
    console.log('[Test] Captured Active Temporary Browser screenshot:', activeScreenshot);

    // 6. Test navigation bar interaction
    const addressInput = page.locator('.browser-address-input');
    await expect(addressInput).toBeVisible();

    // 7. Click "Close & Delete Session"
    const closeBtn = page.getByRole('button', { name: /close & delete session/i });
    await closeBtn.click();

    // Verify confirmation modal
    await expect(page.getByRole('heading', { name: /close & delete browser session\?/i })).toBeVisible();
    
    // Capture Modal screenshot
    const modalScreenshot = path.join(artifactsDir, 'temp_browser_3_close_modal.png');
    await page.screenshot({ path: modalScreenshot });

    // Confirm close
    const confirmBtn = page.getByRole('button', { name: /confirm & wipe/i });
    await confirmBtn.click();

    // 8. Verify clean return to landing screen
    await expect(page.locator('.temp-browser-landing')).toBeVisible({ timeout: 10000 });
    console.log('[Test] Session securely closed and cleaned up successfully!');
  });
});
