import { spawn, spawnSync } from 'node:child_process';
import { copyFile, link, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(root, 'data/recordings/signal-flow');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = Number(process.env.PORT || 4173);
const appUrl = 'http://127.0.0.1:' + port;
const fps = 12;
const frameInterval = 1000 / fps;
const viewport = { width: 1600, height: 900 };
const narrationVoice = process.env.DEMO_VOICE || 'Daniel';
const demoIdea = 'Build a browser workflow agent that watches a user complete a repetitive browser task once, turns the recording into a reusable automation, and runs it with checkpoints, approvals, and handoff notes.';

const scenes = [
  ['Start a mission', 'Signal is a software factory. It starts with the outcome the team wants to deliver, then turns that instruction into scoped work, a tested change, and a pull request for review. Draft mission brief creates a local preview; it does not call RocketRide.', 16],
  ['Describe the mission', 'The user describes the outcome in their own words. Here, the goal is a reusable browser automation learned from one successful human run, with approval and safety checks.', 13],
  ['Draft the local brief', 'The brief captures the user outcome, expected user flow, system shape, and main risks. It gives the team a concrete starting point before they run the RocketRide scope workflow.', 14],
  ['Add context only when useful', 'The plus button adds optional mission context: customer calls, product documents, tickets, data, or technical notes. Open completed report is different: it loads an earlier RocketRide result and does not add files.', 15],
  ['Hand the brief to RocketRide', 'When the brief is ready, Signal sends it, plus any optional files, to RocketRide. RocketRide is the workflow engine that runs the configured scope review; it is not a specialist role itself.', 15],
  ['Three specialist roles, four workflow steps', 'Only the Customer Advocate, Skeptic, and Product Strategist are specialist roles. RocketRide reads the sources, runs those roles, synthesizes their outputs, checks commitments, and links proof back to the report.', 18],
  ['Review the structured scope', 'The result is a structured decision: a recommended bet, evidence for and against it, the key risk, and the smallest test to run next. The team reviews this before implementation begins.', 15],
  ['Promise Theory checks commitments', 'Promise Theory is the accountability layer, not another agent. Each specialist makes a narrow commitment, such as grounding a claim in evidence or challenging weak reasoning, and the ledger records whether it kept that commitment.', 16],
  ['Semantic Spacetime follows the trace', 'Semantic Spacetime is the decision trace, not another agent. It shows the declared path from source evidence, through a specialist finding, to the final recommendation. Lines mean support or challenge, never visual causality.', 18],
  ['Create the build mission', 'After the team accepts the decision, Signal packages the brief, scoped work, acceptance checks, and verification gates into one bounded build mission. A configured trusted repository receives it in an isolated worktree, where the coding runner writes the change.', 17],
  ['Code, test, and pull request', 'Signal then runs the repository test and build gates. Only a changed, passing worktree is committed, pushed to its own branch, and opened as a pull request for human review. Execution stays disabled until a team explicitly names a trusted local repository.', 18]
].map(([title, narration, minimumSeconds]) => ({ title, narration, minimumSeconds }));

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const pad = (value, size = 2) => String(value).padStart(size, '0');

function commandExists(command) {
  return spawnSync('which', [command], { encoding: 'utf8' }).status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error((command + ' failed.\n' + (result.stderr || result.stdout || '')).trim());
  return result.stdout.trim();
}

function duration(file) {
  return Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
}

async function reachable() {
  try {
    return (await fetch(appUrl, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
}

async function startAppIfNeeded() {
  if (await reachable()) return null;
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await reachable()) return child;
    if (child.exitCode !== null) throw new Error('Dev server exited early.\n' + output);
    await sleep(250);
  }
  child.kill('SIGTERM');
  throw new Error('Dev server did not start at ' + appUrl + '.\n' + output);
}

async function waitForChrome(debugPort) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch('http://127.0.0.1:' + debugPort + '/json/version')).ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome did not expose its debugging endpoint.');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
  };
  return new Promise((resolveConnect, rejectConnect) => {
    ws.onerror = rejectConnect;
    ws.onopen = () => resolveConnect({
      send(method, params = {}) {
        const requestId = ++id;
        ws.send(JSON.stringify({ id: requestId, method, params }));
        return new Promise((resolveCall, reject) => pending.set(requestId, { resolve: resolveCall, reject }));
      },
      close() { ws.close(); }
    });
  });
}

async function generateNarration(tempDir) {
  const audioDir = join(tempDir, 'audio');
  await mkdir(audioDir, { recursive: true });
  return scenes.map((scene, index) => {
    const file = join(audioDir, 'scene-' + pad(index + 1) + '.aiff');
    run('say', ['-v', narrationVoice, '-r', '172', '-o', file, scene.narration]);
    return { file, seconds: duration(file) };
  });
}

function overlayScript() {
  const css = [
    '#recording-caption{position:fixed;z-index:2147483646;left:50%;bottom:24px;width:min(780px,calc(100vw - 96px));transform:translateX(-50%);padding:15px 22px;color:#eff6ff;border:1px solid rgba(147,197,253,.55);border-radius:9px;background:rgba(15,23,42,.92);box-shadow:0 18px 45px rgba(15,23,42,.32);font:600 18px/1.35 system-ui,sans-serif;text-align:center}',
    '#recording-caption b{color:#93c5fd}',
    '#recording-finish{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;opacity:0;pointer-events:none;background:rgba(248,251,255,.96);transition:opacity 1.2s ease}#recording-finish.show{opacity:1}#recording-finish div{text-align:center}#recording-finish span{display:block;margin-bottom:14px;color:#2563eb;font:600 13px/1.2 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}#recording-finish h1{max-width:720px;margin:0;color:#0f172a;font:700 46px/1.08 system-ui,sans-serif;letter-spacing:0}#recording-finish p{margin:18px 0 0;color:#52657a;font:500 18px/1.5 system-ui,sans-serif}',
    '.recording-target{position:relative!important;z-index:10!important;outline:3px solid #2563eb!important;outline-offset:5px!important;animation:recording-focus 1.3s ease-in-out infinite!important}',
    '.pipeline-strip.recording-pipeline-focus{padding:28px!important;border:2px solid #2563eb!important;background:#f8fbff!important;box-shadow:0 0 0 7px rgba(37,99,235,.1),0 22px 45px rgba(15,23,42,.12)!important}',
    '.recording-pipeline-focus .pipeline{gap:14px!important}',
    '.recording-pipeline-focus .pipeline-node .node-box{min-height:52px!important;padding:11px 8px!important;font-size:11px!important}',
    '.recording-pipeline-focus .pipeline-node span{font-size:9px!important}',
    '@keyframes recording-focus{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,.12)}50%{box-shadow:0 0 0 12px rgba(37,99,235,.18)}}'
  ].join('');
  return [
    'document.head.insertAdjacentHTML("beforeend", "<style id=\\"recording-overlay-style\\">" + ',
    JSON.stringify(css),
    ' + "</style>");',
    'document.body.insertAdjacentHTML("beforeend", "<div id=\\"recording-caption\\" aria-live=\\"off\\"></div><div id=\\"recording-finish\\"><div><span>Signal</span><h1>Decision complete.<br>Build mission ready.</h1><p>Source-linked plan. Bounded agent work. Human-approved release.</p></div></div>");',
    'window.__recordingOverlay={',
    'setCaption:value=>{document.querySelector("#recording-caption").innerHTML=value},',
    'focus:(selector,enabled)=>document.querySelector(selector)?.classList.toggle("recording-target",enabled)',
    ',focusPipeline:enabled=>document.querySelector(".pipeline-strip")?.classList.toggle("recording-pipeline-focus",enabled)',
    ',finish:()=>{document.querySelector("#recording-caption").style.opacity="0";document.querySelector("#recording-finish").classList.add("show")}',
    '};'
  ].join('');
}

async function recordBrowser(tempDir, narration) {
  const framesDir = join(tempDir, 'frames');
  await mkdir(framesDir, { recursive: true });
  const debugPort = 9231;
  const chromeProc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + join(tempDir, 'chrome-profile'),
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp;
  let captureActive = true;
  let captureFinished;
  let frameCount = 0;
  const captureTimes = [];

  try {
    await waitForChrome(debugPort);
    const target = await fetch('http://127.0.0.1:' + debugPort + '/json/new?' + appUrl, { method: 'PUT' }).then(response => response.json());
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: appUrl });
    await sleep(1800);

    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed.');
      return result.result.value;
    };
    await evaluate(overlayScript());

    const recordingStartedAt = Date.now();
    const captureLoop = async () => {
      while (captureActive) {
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg', quality: 84, captureBeyondViewport: false, fromSurface: true
        });
        frameCount += 1;
        await writeFile(join(framesDir, 'frame-' + pad(frameCount, 6) + '.jpg'), Buffer.from(screenshot.data, 'base64'));
        captureTimes.push(Date.now() - recordingStartedAt);
        await sleep(Math.max(0, frameInterval));
      }
    };
    captureFinished = captureLoop();

    async function waitForVisible(selector) {
      const literal = JSON.stringify(selector);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const visible = await evaluate('(()=>{const el=document.querySelector(' + literal + ');return Boolean(el&&!el.hidden&&getComputedStyle(el).display!=="none")})()');
        if (visible) return;
        await sleep(100);
      }
      throw new Error('Timed out waiting for ' + selector + '.');
    }

    async function clickElement(selector) {
      const literal = JSON.stringify(selector);
      await evaluate('document.querySelector(' + literal + ')?.scrollIntoView({behavior:"smooth",block:"center"})');
      await sleep(850);
      const rect = await evaluate('(()=>{const el=document.querySelector(' + literal + ');if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()');
      if (!rect) throw new Error('Could not find ' + selector + '.');
      await evaluate('window.__recordingOverlay.focus(' + literal + ',true)');
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
      await sleep(650);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await sleep(110);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await sleep(700);
      await evaluate('window.__recordingOverlay.focus(' + literal + ',false)');
    }

    async function typeIdea() {
      await clickElement('#factoryIdeaInput');
      for (let index = 0; index < demoIdea.length; index += 18) {
        await cdp.send('Input.insertText', { text: demoIdea.slice(index, index + 18) });
        await sleep(45);
      }
    }

    const sceneTimings = [];
    async function runScene(index, prepare, action = async () => {}) {
      const scene = scenes[index];
      await prepare();
      await sleep(450);
      const startedAt = Date.now();
      const start = (startedAt - recordingStartedAt) / 1000;
      await evaluate('window.__recordingOverlay.setCaption(' + JSON.stringify('<b>Step ' + pad(index + 1) + '</b> &nbsp; ' + scene.title) + ')');
      await action();
      const minDuration = Math.max(scene.minimumSeconds, narration[index].seconds + .6) * 1000;
      while (Date.now() - startedAt < minDuration) await sleep(100);
      sceneTimings.push({ ...scene, start, end: (Date.now() - recordingStartedAt) / 1000 });
    }

    await runScene(0, async () => {
      await evaluate('window.scrollTo({top:0,behavior:"smooth"})');
      await sleep(850);
    }, async () => {
      await evaluate('window.__recordingOverlay.focus("#primaryAnalyzeButton",true)');
      await sleep(3000);
      await evaluate('window.__recordingOverlay.focus("#primaryAnalyzeButton",false)');
    });
    await runScene(1, async () => {
      await evaluate('document.querySelector(".factory-console")?.scrollIntoView({behavior:"smooth",block:"center"})');
      await sleep(900);
    }, async () => {
      await typeIdea();
      await sleep(1200);
    });
    await runScene(2, async () => {
      await evaluate('document.querySelector(".factory-console")?.scrollIntoView({behavior:"smooth",block:"center"})');
      await sleep(900);
    }, async () => {
      await evaluate('window.__recordingOverlay.focus("#factoryGenerateButton",true)');
      await sleep(900);
      await evaluate('document.querySelector("#factoryGenerateButton")?.click()');
      await sleep(3200);
      await evaluate('window.__recordingOverlay.focus("#factoryGenerateButton",false)');
    });
    await runScene(3, async () => {
      await evaluate('window.scrollTo({top:0,behavior:"smooth"})');
      await sleep(1700);
    }, async () => {
      await evaluate('window.__recordingOverlay.focus("#uploadTrigger",true)');
      await sleep(2400);
      await evaluate('window.__recordingOverlay.focus("#uploadTrigger",false);window.__recordingOverlay.focus("#importButton",true)');
      await sleep(2200);
      await evaluate('window.__recordingOverlay.focus("#importButton",false)');
      await clickElement('.source-item');
      await sleep(1500);
      await clickElement('#closeSource');
      await sleep(900);
    });
    await runScene(4, async () => {
      await evaluate('document.querySelector(".factory-output")?.scrollIntoView({behavior:"smooth",block:"center"})');
      await sleep(1000);
    }, async () => {
      await evaluate('window.__recordingOverlay.focus("#scopeWithRocketRide",true)');
      await sleep(3600);
      await evaluate('window.__recordingOverlay.focus("#scopeWithRocketRide",false)');
    });
    await runScene(5, async () => {
      await evaluate('document.querySelector("#reviewWorkspace")?.scrollIntoView({behavior:"smooth",block:"start"})');
      await waitForVisible('#loadLiveButton');
      await sleep(1800);
      await clickElement('#loadLiveButton');
      await evaluate('document.querySelector(".pipeline-strip")?.scrollIntoView({behavior:"smooth",block:"center"});window.__recordingOverlay.focusPipeline(true)');
      await sleep(1600);
    }, async () => {
      await evaluate('document.querySelector(".pipeline-strip")?.scrollIntoView({behavior:"smooth",block:"center"});window.__recordingOverlay.focusPipeline(true)');
      await sleep(3500);
    });
    await runScene(6, async () => {
      await evaluate('window.__recordingOverlay.focusPipeline(false)');
      await clickElement('[data-view="decisionView"]');
      await sleep(1200);
    }, async () => {
      await evaluate('document.querySelector(".recommendation-card")?.scrollIntoView({behavior:"smooth",block:"center"})');
      await sleep(3800);
    });
    await runScene(7, async () => {
      await clickElement('[data-view="promiseView"]');
      await sleep(1000);
    }, async () => {
      await clickElement('#replayPromises');
      await sleep(2500);
    });
    await runScene(8, async () => {
      await clickElement('[data-view="semanticView"]');
      await sleep(1300);
    }, async () => {
      await clickElement('.semantic-node');
      await sleep(2800);
    });
    await runScene(9, async () => {
      await clickElement('[data-view="decisionView"]');
      await sleep(1000);
    }, async () => {
      await evaluate('window.__recordingOverlay.focus("#createMissionReviewButton",true)');
      await sleep(900);
      await evaluate('document.querySelector("#createMissionReviewButton")?.click()');
      await sleep(3000);
      await evaluate('window.__recordingOverlay.focus("#createMissionReviewButton",false)');
    });
    await runScene(10, async () => {
      await evaluate('document.querySelector("#buildMission")?.scrollIntoView({behavior:"smooth",block:"center"})');
      await sleep(1000);
    }, async () => {
      await evaluate('window.__recordingOverlay.focus(".execution-panel",true)');
      await sleep(6500);
      await evaluate('window.__recordingOverlay.focus(".execution-panel",false)');
      await sleep(1200);
      await evaluate('window.__recordingOverlay.finish()');
      await sleep(7000);
    });

    captureActive = false;
    await captureFinished;
    return { framesDir, frameCount, duration: (Date.now() - recordingStartedAt) / 1000, sceneTimings, captureTimes };
  } finally {
    captureActive = false;
    if (captureFinished) await captureFinished.catch(() => {});
    cdp?.close();
    chromeProc.kill('SIGTERM');
  }
}

function srtTime(seconds) {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  return pad(hours) + ':' + pad(minutes) + ':' + pad(secs) + ',' + pad(millis % 1000, 3);
}

async function writeCaptions(sceneTimings) {
  const contents = sceneTimings.map((scene, index) => [
    index + 1,
    srtTime(scene.start) + ' --> ' + srtTime(scene.end),
    'Step ' + pad(index + 1) + ': ' + scene.title
  ].join('\n')).join('\n\n');
  await writeFile(join(outDir, 'captions.srt'), contents + '\n', 'utf8');
}

async function renderVideo(recording, narration, tempDir) {
  const silent = join(outDir, 'signal-flow.silent.mp4');
  const output = join(outDir, 'signal-flow.mp4');
  // Expand real browser screenshots onto a fixed timeline. Screenshot capture itself is
  // slower than the desired frame rate; repeating the most recent frame preserves time.
  const timedFramesDir = join(tempDir, 'timed-frames');
  await mkdir(timedFramesDir, { recursive: true });
  let sourceIndex = 0;
  const timelineFrames = Math.ceil(recording.duration * fps);
  for (let index = 0; index < timelineFrames; index += 1) {
    const timestamp = (index * 1000) / fps;
    while (sourceIndex + 1 < recording.frameCount && recording.captureTimes[sourceIndex + 1] <= timestamp) sourceIndex += 1;
    const source = join(recording.framesDir, 'frame-' + pad(sourceIndex + 1, 6) + '.jpg');
    const target = join(timedFramesDir, 'frame-' + pad(index + 1, 6) + '.jpg');
    try {
      await link(source, target);
    } catch {
      await copyFile(source, target);
    }
  }
  const framePattern = join(timedFramesDir, 'frame-%06d.jpg');
  run('ffmpeg', [
    '-y', '-framerate', String(fps), '-i', framePattern,
    '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-r', '24', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-movflags', '+faststart', silent
  ]);

  const audioDir = join(tempDir, 'padded-audio');
  await mkdir(audioDir, { recursive: true });
  const pieces = [];
  let audioCursor = 0;
  for (const [index, scene] of recording.sceneTimings.entries()) {
    const gap = Math.max(0, scene.start - audioCursor);
    if (gap > .02) {
      const silence = join(audioDir, 'silence-' + pad(index + 1) + '.wav');
      run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', gap.toFixed(3), '-c:a', 'pcm_s16le', silence]);
      pieces.push(silence);
    }
    const file = join(audioDir, 'scene-' + pad(index + 1) + '.wav');
    run('ffmpeg', ['-y', '-i', narration[index].file, '-af', 'asetpts=N/SR/TB', '-ac', '2', '-ar', '48000', file]);
    pieces.push(file);
    audioCursor = scene.start + narration[index].seconds;
  }
  const tail = Math.max(0, recording.duration - audioCursor);
  if (tail > .02) {
    const silence = join(audioDir, 'silence-tail.wav');
    run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', tail.toFixed(3), '-c:a', 'pcm_s16le', silence]);
    pieces.push(silence);
  }
  const list = join(audioDir, 'concat.txt');
  await writeFile(list, pieces.map(file => "file '" + file.replaceAll("'", "'\\''") + "'").join('\n'), 'utf8');
  const narrationFile = join(tempDir, 'narration.wav');
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', narrationFile]);
  run('ffmpeg', [
    '-y', '-i', silent, '-i', narrationFile, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-shortest', '-movflags', '+faststart', output
  ]);
  await writeFile(join(outDir, 'README.md'), '# Signal Demo\n\nGenerated with npm run demo:record.\n\nThis is a continuous browser capture, not a sequence of staged screenshots. Each recorded action stays on screen until its result is visible, and narration is padded to the captured scene duration instead of being cut short.\n', 'utf8');
}

let appProcess;
let tempDir;
try {
  if (!commandExists('ffmpeg') || !commandExists('ffprobe')) throw new Error('FFmpeg and ffprobe are required to record the demo.');
  if (!commandExists('say')) throw new Error('macOS say is required to generate the synced narration track.');
  if (spawnSync('test', ['-x', chrome]).status !== 0) throw new Error('Chrome was not found at ' + chrome + '.');
  await mkdir(outDir, { recursive: true });
  tempDir = await mkdtemp(join(tmpdir(), 'signal-recording-'));
  appProcess = await startAppIfNeeded();
  const narration = await generateNarration(tempDir);
  const recording = await recordBrowser(tempDir, narration);
  await writeCaptions(recording.sceneTimings);
  await renderVideo(recording, narration, tempDir);
  console.log('Rendered ' + relative(root, join(outDir, 'signal-flow.mp4')) + ' (' + recording.duration.toFixed(1) + ' seconds).');
} finally {
  if (appProcess) appProcess.kill('SIGTERM');
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
}
