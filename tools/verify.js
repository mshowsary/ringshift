'use strict';
/*
 * Automated browser verification harness for Ringshift.
 * Drives system Chrome via puppeteer-core against http://localhost:8080.
 *
 * Mode 1 (standalone): real network, real SDK script — what GitHub Pages
 * visitors get. Checks: clean console, menu appears, gameplay runs.
 *
 * Mode 2 (fake env): intercepts the game_api request and injects a fake
 * `ytgame` that records every SDK call — the same thing Google's Playables
 * Test Suite shows in its SDK events window. Asserts lifecycle order,
 * save/score behavior, pause freeze, resume, and localization.
 *
 * Usage: node tools/verify.js [screenshotDir]
 */

const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.VERIFY_BASE || 'http://localhost:8080';
const SHOT_DIR = process.argv[2] || null;

const FAKE_YTGAME = `
window.__ytlog = [];
window.__savedData = [];
window.__scores = [];
window.__pauseCb = null;
window.__resumeCb = null;
window.__audioCb = null;
window.ytgame = {
  IN_PLAYABLES_ENV: true,
  SDK_VERSION: 'fake-1',
  game: {
    firstFrameReady: () => window.__ytlog.push('firstFrameReady'),
    gameReady: () => window.__ytlog.push('gameReady'),
    loadData: () => {
      window.__ytlog.push('loadData');
      return Promise.resolve('{"v":1,"best":123}');
    },
    saveData: (s) => {
      window.__ytlog.push('saveData');
      window.__savedData.push(s);
      return Promise.resolve();
    }
  },
  system: {
    getLanguage: () => { window.__ytlog.push('getLanguage'); return Promise.resolve('fr-CA'); },
    isAudioEnabled: () => true,
    onAudioEnabledChange: (cb) => { window.__audioCb = cb; return () => {}; },
    onPause: (cb) => { window.__pauseCb = cb; return () => {}; },
    onResume: (cb) => { window.__resumeCb = cb; return () => {}; }
  },
  engagement: {
    sendScore: (s) => { window.__ytlog.push('sendScore:' + JSON.stringify(s)); window.__scores.push(s); return Promise.resolve(); }
  },
  health: {
    logError: () => window.__ytlog.push('logError'),
    logWarning: () => window.__ytlog.push('logWarning')
  }
};
`;

let failures = 0;
function check(name, cond, extra) {
  const status = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${status}] ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function newPage(browser, { fakeEnv, width = 480, height = 850 }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });
  if (fakeEnv) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().startsWith('https://www.youtube.com/game_api')) {
        req.respond({ status: 200, contentType: 'application/javascript', body: FAKE_YTGAME });
      } else {
        req.continue();
      }
    });
  }
  return { page, errors };
}

async function visible(page, sel) {
  return page.evaluate((s) => {
    const n = document.querySelector(s);
    return !!n && !n.classList.contains('hidden');
  }, sel);
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function standaloneChecks(browser) {
  console.log('\n== Mode 1: standalone (real SDK script, shim path) ==');
  const { page, errors } = await newPage(browser, { fakeEnv: false });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);

  check('menu visible after load', await visible(page, '#screen-menu'));
  check('splash hidden after load', !(await visible(page, '#splash')));
  await shot(page, 'standalone-menu');

  await page.click('#btn-play');
  // Keep the board clear so random hazards can't kill the ship while we
  // assert on the input path and score loop.
  await page.evaluate(() => {
    window.__clear = setInterval(() => {
      const g = RS.debug.game();
      if (g) g.entities.length = 0;
    }, 100);
  });
  await sleep(1500);
  const playing = await page.evaluate(() => RS.debug.state());
  check('state is playing after Play', playing === 'playing', playing);
  const s1 = await page.evaluate(() => RS.debug.game().score);
  await sleep(1000);
  const s2 = await page.evaluate(() => RS.debug.game().score);
  check('score accrues during play', s2 > s1, `${s1} -> ${s2}`);

  // Hop via synthetic pointer input on the canvas
  const ringBefore = await page.evaluate(() => RS.debug.game().ship.ring);
  await page.mouse.click(240, 700);
  await sleep(300);
  const ringAfter = await page.evaluate(() => RS.debug.game().ship.ring);
  check('pointer tap hops rings', ringBefore !== ringAfter, `${ringBefore} -> ${ringAfter}`);
  await shot(page, 'standalone-gameplay');

  check('no console/page errors (standalone)', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function fakeEnvChecks(browser) {
  console.log('\n== Mode 2: fake Playables env (SDK lifecycle) ==');
  const { page, errors } = await newPage(browser, { fakeEnv: true });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);

  const log = await page.evaluate(() => window.__ytlog);
  check('firstFrameReady called', log.includes('firstFrameReady'));
  check('gameReady called', log.includes('gameReady'));
  check('firstFrameReady before gameReady',
    log.indexOf('firstFrameReady') < log.indexOf('gameReady'), log.join(','));
  check('loadData called before gameReady',
    log.indexOf('loadData') < log.indexOf('gameReady'), log.join(','));
  check('no saveData before loadData',
    !log.slice(0, log.indexOf('loadData')).some((x) => x === 'saveData'), log.join(','));

  check('locale applied from getLanguage (fr-CA -> fr)',
    await page.$eval('#btn-play', (n) => n.textContent) === 'Jouer');
  check('cloud best shown in menu',
    (await page.$eval('#menu-best', (n) => n.textContent)).includes('123'));

  // Play, then force a deterministic death via the debug hook
  await page.click('#btn-play');
  await sleep(700);
  await page.evaluate(() => {
    const g = RS.debug.game();
    g.entities.push({ kind: 'mine', ring: g.ship.ring, angle: g.ship.angle, age: 5, armed: true, nearMissed: false });
  });
  await sleep(1600);
  check('game over screen shown after death', await visible(page, '#screen-gameover'));
  await shot(page, 'fakeenv-gameover');

  const scores = await page.evaluate(() => window.__scores);
  check('sendScore called on game over', scores.length === 1, JSON.stringify(scores));
  const sent = scores[0] ? scores[0].value : NaN;
  check('score is a non-negative integer', Number.isInteger(sent) && sent >= 0, String(sent));

  const savedRaw = await page.evaluate(() => window.__savedData);
  check('saveData called on game over', savedRaw.length >= 1);
  const lastSave = JSON.parse(savedRaw[savedRaw.length - 1]);
  check('saved best >= sent score (consistency requirement)', lastSave.best >= sent,
    `best=${lastSave.best} sent=${sent}`);
  check('save keeps cloud best when run scored lower', lastSave.best >= 123, String(lastSave.best));
  check('save has schema fields', lastSave.v === 1 && 'gamesPlayed' in lastSave && 'tutorialSeen' in lastSave);

  // SDK pause must freeze rendering entirely; resume restarts it
  await page.click('#btn-again');
  await sleep(500);
  await page.evaluate(() => window.__pauseCb());
  await sleep(200);
  check('pause overlay shown on SDK pause', await visible(page, '#overlay-pause'));
  const f1 = await page.evaluate(() => RS.debug.frames());
  await sleep(500);
  const f2 = await page.evaluate(() => RS.debug.frames());
  check('rendering fully frozen during SDK pause', f1 === f2, `${f1} vs ${f2}`);
  const savesAtPause = await page.evaluate(() => window.__savedData.length);
  check('save flushed on SDK pause', savesAtPause >= savedRaw.length + 1);

  await page.evaluate(() => window.__resumeCb());
  await sleep(400);
  const f3 = await page.evaluate(() => RS.debug.frames());
  check('rendering restarts on SDK resume', f3 > f2, `${f2} -> ${f3}`);
  check('pause overlay STAYS until explicit user resume', await visible(page, '#overlay-pause'));
  await page.click('#btn-resume');
  await sleep(300);
  check('gameplay resumes after user taps Resume',
    (await page.evaluate(() => RS.debug.state())) === 'playing');

  // Audio toggle callback must not throw
  await page.evaluate(() => { window.__audioCb(false); window.__audioCb(true); });

  // Esc behavior: settings overlay closes, no preventDefault
  await page.evaluate(() => window.__pauseCb());
  await page.evaluate(() => window.__resumeCb());
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Esc resumes from paused overlay', !(await visible(page, '#overlay-pause')));

  check('no console/page errors (fake env)', errors.length === 0, errors.join(' | '));
  await page.close();
}

async function aspectChecks(browser) {
  console.log('\n== Mode 3: aspect-ratio sweep ==');
  const ratios = [
    ['9x32', 270, 960], ['9x16', 360, 640], ['3x4', 600, 800], ['1x1', 700, 700],
    ['4x3', 800, 600], ['16x9', 960, 540], ['21x9', 1050, 450], ['32x9', 1280, 360]
  ];
  const { page, errors } = await newPage(browser, { fakeEnv: false });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(800);
  await page.click('#btn-play');
  await page.evaluate(() => {
    window.__clear = setInterval(() => {
      const g = RS.debug.game();
      if (g) g.entities.length = 0;
    }, 100);
  });
  await sleep(400);

  for (const [name, w, h] of ratios) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await sleep(350);
    const ok = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const stillPlaying = RS.debug.state() === 'playing';
      const arena = c.width > 0 && c.height > 0;
      return stillPlaying && arena;
    });
    check(`playable at ${name} (${w}x${h}), state preserved across resize`, ok);
    await shot(page, `aspect-${name}`);
  }
  check('no console/page errors (aspect sweep)', errors.length === 0, errors.join(' | '));
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--disable-extensions', '--mute-audio']
  });
  try {
    await standaloneChecks(browser);
    await fakeEnvChecks(browser);
    await aspectChecks(browser);
  } finally {
    await browser.close();
  }
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
