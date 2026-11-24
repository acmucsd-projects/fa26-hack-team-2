const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { buildDataset } = require('./buildWebDataset');
const { CACHE_DIR, ORIGIN, NUTRITION_PATH, nutritionUrl, cacheKey, hashHtml, readCachedNutrition } = require('./nutritionParser');

const USER_AGENT = 'UCSD-HDH-StudentDataset/1.0 (manual public nutrition collection; one request at a time)';
const TERMS_URL = 'https://ucsd.edu/about/terms-of-use.html';
const ACCESS_REASON = 'Bulk collection requires documented site permission. Published terms do not clearly authorize project reuse; robots.txt absence is not permission.';
function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
function writeNutritionCache(dataDir, url, html) {
  const base = path.join(dataDir, CACHE_DIR, cacheKey(url));
  const metadata = { url: nutritionUrl(url), retrieved_at: new Date().toISOString(), sha256: hashHtml(html), user_agent: USER_AGENT };
  fs.mkdirSync(path.dirname(base), { recursive: true });
  // Prepare both files before replacing either committed file. The reader can
  // recover a checksum-verified pair if the process stops between the renames.
  fs.writeFileSync(base + '.html.tmp', html);
  fs.writeFileSync(base + '.json.tmp', JSON.stringify(metadata, null, 2) + '\n');
  fs.renameSync(base + '.html.tmp', base + '.html');
  fs.renameSync(base + '.json.tmp', base + '.json');
  return metadata;
}
function discoverNutritionUrls(dataset) {
  const pages = new Map(), unsupported = [];
  for (const location of dataset.locations) for (const menu of location.menus) for (const station of menu.stations) for (const food of station.items) {
    try {
      const url = nutritionUrl(food.nutrition_url);
      if (!pages.has(url)) pages.set(url, { url, used_by: [] });
      pages.get(url).used_by.push({ restaurant: location.id, date: menu.menu_date, station: station.name, name: food.name, source_url: food.nutrition_url });
    } catch (error) { unsupported.push({ source_url: food.nutrition_url, error: error.message }); }
  }
  return { pages: [...pages.values()], unsupported };
}
async function request(url, { fetchImpl = globalThis.fetch, timeoutMs = 20000, maxBytes = 5 * 1024 * 1024 } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Request timed out')); }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal, credentials: 'omit', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9' } });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return { status: response.status, headers: response.headers, text: '', redirect: true };
      }
      const reader = response.body?.getReader();
      const chunks = [];
      let length = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maxBytes) { await reader.cancel(); throw new Error('Response exceeds size limit'); }
          chunks.push(Buffer.from(value));
        }
      }
      const charset = (response.headers.get('content-type') || '').match(/charset\s*=\s*"?([^;"\s]+)/i)?.[1] || 'utf-8';
      const text = new TextDecoder(charset, { fatal: true }).decode(Buffer.concat(chunks));
      return { status: response.status, headers: response.headers, text, redirect: false };
    })()]);
  } finally { clearTimeout(timer); }
}
function robotsRules(text, url) {
  if (/<html|<!doctype/i.test(text) || (text.trim() && !/^user-agent\s*:/im.test(text) && text.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith('#')))) throw new Error('Unrecognized robots.txt format');
  const groups = [];
  let group = null;
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(/#.*$/, '').trim();
    const match = cleaned.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (!group || group.rules.length || group.delay !== null) { group = { agents: [], rules: [], delay: null }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow'].includes(key) && value) group.rules.push({ allow: key === 'allow', pattern: value });
    else if (group && key === 'crawl-delay') {
      if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Unrecognized crawl-delay');
      group.delay = Number(value) * 1000;
    }
  }
  const agent = USER_AGENT.split('/')[0].toLowerCase();
  const specificity = g => Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : agent.includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  const selected = groups.filter(g => specificity(g) === best && best >= 0);
  const pathname = new URL(url).pathname + new URL(url).search;
  let winner = null;
  for (const rule of selected.flatMap(g => g.rules)) {
    const expression = rule.pattern.split('*').map(p => p.replace(/[.+?^{}()|[\]\\]/g, '\\$&')).join('.*');
    const anchored = expression.endsWith('$');
    const regex = new RegExp('^' + (anchored ? expression.slice(0, -1) + '$' : expression));
    if (!regex.test(pathname)) continue;
    const length = rule.pattern.replace(/\*/g, '').length;
    if (!winner || length > winner.length || (length === winner.length && rule.allow)) winner = { ...rule, length };
  }
  return { allowed: winner?.allow ?? true, delayMs: Math.max(2000, ...selected.map(g => g.delay || 0)) };
}
function retryAfter(value, now = Date.now()) {
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}
function loadAuthorization(dataDir) {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(dataDir, CACHE_DIR, 'access.json'), 'utf8'));
    if (a.bulk_download_allowed !== true || a.origin !== ORIGIN || a.path !== NUTRITION_PATH ||
        typeof a.permission_reference !== 'string' || a.permission_reference.trim().length < 8 || !Number.isFinite(Date.parse(a.reviewed_at))) return null;
    if (a.minimum_delay_ms !== undefined && (!Number.isFinite(a.minimum_delay_ms) || a.minimum_delay_ms < 2000)) return null;
    if (a.one_time_collection && !/^[a-f0-9]{64}$/.test(a.approved_url_set_sha256 || '')) return null;
    return a;
  } catch { return null; }
}
async function downloadNutrition(dataDir = path.join(__dirname, '../../data/web'), options = {}) {
  const source = buildDataset(dataDir, { write: false, enrich: false });
  if (source.validation.summary.errors) throw new Error('Menu validation failed; fix saved inputs before downloading');
  const discovered = discoverNutritionUrls(source.dataset);
  const knownUrls = new Set(discovered.pages.map(page => page.url));
  const refreshUrls = new Set((options.refreshUrls || []).map(nutritionUrl));
  for (const url of refreshUrls) if (!knownUrls.has(url)) throw new Error('Refresh URL was not discovered in the saved menus');
  const statePath = path.join(dataDir, CACHE_DIR, 'download-state.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { /* first run */ }
  const state = {
    access: { status: 'permission_required', reason: ACCESS_REASON, terms_url: TERMS_URL },
    pages: {}, unsupported: discovered.unsupported,
    summary: { unique_urls: discovered.pages.length, downloaded: 0, refreshed: 0, already_cached: 0, invalid_cached: 0, failed: 0, not_attempted: 0 }
  };
  const pending = [];
  for (const page of discovered.pages) {
    // Parser behavior must never decide whether to repeat a successful request.
    const saved = readCachedNutrition(dataDir, page.url, { parse: false });
    const refresh = options.refresh === true || refreshUrls.has(page.url);
    const old = previous.pages?.[page.url];
    if (saved && !saved.error && !refresh) {
      state.pages[page.url] = { status: 'cached', retrieved_at: saved.metadata.retrieved_at };
      state.summary.already_cached++;
    } else if (!refresh && (saved?.error || (!saved && ['downloaded', 'cached'].includes(old?.status)))) {
      state.pages[page.url] = { status: 'invalid_cache', error: (saved?.error || 'Previously completed cache is missing') + '; use an explicit refresh to replace this cache' };
      state.summary.invalid_cached++;
    } else {
      state.pages[page.url] = old && !['cached', 'downloaded'].includes(old.status) ? old : { status: 'not_attempted', error: saved?.error || 'No request attempted' };
      pending.push({ ...page, wasCached: Boolean(saved || ['downloaded', 'cached'].includes(old?.status)) });
    }
  }
  const persist = () => {
    state.summary.failed = Object.values(state.pages).filter(p => !['cached', 'downloaded', 'not_attempted'].includes(p.status)).length;
    state.summary.not_attempted = Object.values(state.pages).filter(p => p.status === 'not_attempted').length;
    atomicJson(statePath, state);
  };
  if (!pending.length) { state.access = { status: 'cache_only', reason: 'No missing pages or explicit refreshes; no requests made. Invalid caches need explicit refresh.' }; persist(); return state; }
  const futureRetries = pending.map(p => state.pages[p.url].next_attempt_at).filter(t => t && Date.parse(t) > Date.now());
  if (futureRetries.length) {
    state.access = { status: 'paused_retry_after', reason: 'Retry-After has not expired; no requests, including policy requests, were made.', next_attempt_at: futureRetries.sort().at(-1) };
    persist(); return state;
  }
  const authorization = loadAuthorization(dataDir);
  if (!authorization) { persist(); return state; }
  const urlSetHash = hashHtml(discovered.pages.map(page => page.url).sort().join('\n'));
  if ((authorization.approved_url_set_sha256 && authorization.approved_url_set_sha256 !== urlSetHash) ||
      (authorization.allow_refresh === false && (options.refresh || refreshUrls.size))) {
    state.access = { status: 'blocked_permission_scope', reason: 'The recorded one-time approval does not cover changed URL sets or refreshing existing pages.' };
    persist(); return state;
  }

  const fetchOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const wait = options.sleep || sleep;
  let delayMs = Math.max(2000, authorization.minimum_delay_ms || 0);
  const stopOnIssue = authorization.stop_on_technical_issues === true;
  try {
    const robots = await request(ORIGIN + '/robots.txt', fetchOptions);
    if (robots.redirect || ![200, 404].includes(robots.status)) throw new Error(`Cannot establish robots rules: HTTP ${robots.status}`);
    for (const page of pending) {
      const rules = robots.status === 404 ? { allowed: true, delayMs: 2000 } : robotsRules(robots.text, page.url);
      if (!rules.allowed) throw new Error('robots.txt disallows a discovered nutrition URL');
      delayMs = Math.max(delayMs, rules.delayMs);
    }
    await wait(delayMs);
    const terms = await request(TERMS_URL, fetchOptions);
    if (terms.redirect || terms.status !== 200 || !/terms of use/i.test(terms.text)) throw new Error('Applicable terms could not be checked');
    state.access = { status: 'authorized', checked_at: new Date().toISOString(), permission_reference: authorization.permission_reference,
      terms_url: TERMS_URL, terms_sha256: hashHtml(terms.text), robots_status: robots.status, delay_ms: delayMs };
    state.access.one_time_collection = authorization.one_time_collection === true;
    state.access.approved_url_set_sha256 = authorization.approved_url_set_sha256 || null;
    state.access.public_redistribution_allowed = authorization.public_redistribution_allowed ?? null;
  } catch (error) {
    state.access = { status: 'blocked_policy', reason: error.message, terms_url: TERMS_URL };
    persist(); return state;
  }

  let paused = false;
  let rateLimits = 0;
  persist();
  for (const page of pending) {
    if (paused) break;
    const prior = state.pages[page.url];
    if (prior.next_attempt_at && Date.parse(prior.next_attempt_at) > Date.now()) { paused = true; break; }
    for (let attempt = 0; attempt <= 2; attempt++) {
      await wait(delayMs);
      let response;
      try { response = await request(page.url, fetchOptions); }
      catch (error) {
        state.pages[page.url] = { status: 'failed', error: error.message, attempted_at: new Date().toISOString() };
        persist();
        if (stopOnIssue) { paused = true; break; }
        if (attempt < 2) { await wait(2000 * (attempt + 1)); continue; }
        break;
      }
      const entry = { http_status: response.status, attempted_at: new Date().toISOString() };
      if (response.redirect) {
        state.pages[page.url] = { ...entry, status: 'blocked_redirect', error: 'Unexpected redirect rejected; no redirect target requested' };
        paused = true;
      } else if (response.status === 403) {
        state.pages[page.url] = { ...entry, status: 'blocked', error: 'HTTP 403: collection stopped' };
        paused = true;
      } else if (response.status === 429 || response.status >= 500) {
        const backoff = Math.max(2000 * (attempt + 1), retryAfter(response.headers.get('retry-after')));
        state.pages[page.url] = { ...entry, status: response.status === 429 ? 'rate_limited' : 'failed', error: `HTTP ${response.status}`, next_attempt_at: new Date(Date.now() + backoff).toISOString() };
        if (response.status === 429 && ++rateLimits >= 2) paused = true;
        if (stopOnIssue) paused = true;
        if (backoff > 60000) paused = true;
        persist();
        if (!paused && attempt < 2) { await wait(backoff); continue; }
      } else if (response.status !== 200) {
        state.pages[page.url] = { ...entry, status: response.status === 404 ? 'not_found' : 'failed', error: `HTTP ${response.status}` };
        if (stopOnIssue) paused = true;
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (/<(?:title|h[1-6])[^>]*>[^<]*(?:captcha|access denied|verify.*human|sign in|log in)/i.test(response.text) || /<input[^>]*type=["']?password/i.test(response.text)) {
          state.pages[page.url] = { ...entry, status: 'blocked', error: 'Access challenge detected; collection stopped without attempting to bypass it' };
          paused = true;
        } else if (!/(?:text\/html|application\/xhtml\+xml)/i.test(contentType) || !response.text.trim() || /<(?:title|h[1-6])[^>]*>[^<]*(?:server error|internal server error|not found)/i.test(response.text)) {
          state.pages[page.url] = { ...entry, status: 'invalid_response', error: 'Response is not usable HTML; not cached' };
          if (stopOnIssue) paused = true;
        } else {
          const { retrieved_at } = writeNutritionCache(dataDir, page.url, response.text);
          state.pages[page.url] = { ...entry, status: 'downloaded', retrieved_at };
          state.summary.downloaded++;
          if (page.wasCached) state.summary.refreshed++;
        }
      }
      persist();
      break;
    }
  }
  if (paused) state.access.pause_reason = 'Stopped for access/rate limits, redirect, or a future Retry-After. Rerun only after the restriction clears.';
  persist();
  return state;
}
function parseArgs(args) {
  const options = { refresh: false, refreshUrls: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--refresh') options.refresh = true;
    else if (args[i] === '--refresh-url' && args[i + 1]) options.refreshUrls.push(nutritionUrl(args[++i]));
    else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  if (options.refresh && options.refreshUrls.length) throw new Error('Choose --refresh or --refresh-url, not both');
  return options;
}
if (require.main === module) {
  Promise.resolve().then(() => parseArgs(process.argv.slice(2))).then(options => downloadNutrition(undefined, options)).then(state => {
    console.log(JSON.stringify({ access: state.access, ...state.summary, unsupported: state.unsupported.length }, null, 2));
    if (!['authorized', 'cache_only'].includes(state.access.status) || state.summary.failed || state.summary.not_attempted) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { USER_AGENT, TERMS_URL, ACCESS_REASON, discoverNutritionUrls, request, robotsRules, retryAfter, writeNutritionCache, parseArgs, downloadNutrition };
