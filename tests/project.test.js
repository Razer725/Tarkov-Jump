"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../game-model");
const storage = require("../storage");
const handleRequest = require("../server");
const root = path.join(__dirname, "..");

test("storage survives denied access, failed reads and failed writes", () => {
  for (const getStorage of [
    () => { throw new Error("Denied"); },
    () => ({ getItem() { throw new Error("Denied"); }, setItem() { throw new Error("Full"); } })
  ]) {
    const settings = storage.create(getStorage);
    assert.equal(settings.get("sound", "on"), "on");
    settings.set("sound", "off");
    assert.equal(settings.get("sound"), "off");
  }
  const data = new Map();
  const getStorage = () => ({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  storage.create(getStorage).set("best", 45);
  assert.equal(storage.create(getStorage).get("best"), "45");
});

test("model runs without browser APIs, pauses, jumps, shoots and resets", () => {
  const game = model.create();
  game.update(.02);
  assert.equal(game.snapshot.gameTime, 0);
  game.startGame();
  game.doubleJump();
  assert.equal(game.snapshot.player.doubleJumpReady, false);
  assert.equal(game.snapshot.player.vy, -735);
  game.keys.shoot = true;
  game.update(.02);
  assert.equal(game.snapshot.player.ammo, 11);
  assert.equal(game.snapshot.bullets.length, 1);
  game.togglePause();
  const before = { ...game.snapshot.player };
  const time = game.snapshot.gameTime;
  game.update(.02);
  assert.deepEqual(game.snapshot.player, before);
  assert.equal(game.snapshot.gameTime, time);
  game.togglePause();
  assert.equal(game.state, "playing");
  game.startGame();
  assert.equal(game.snapshot.player.ammo, 12);
  assert.equal(game.snapshot.player.doubleJumpReady, true);
  assert.equal(game.snapshot.gameTime, 0);
});

test("equipment protection, degradation and enemy invincibility are preserved", () => {
  const game = model.create();
  game.startGame();
  const { player } = game.snapshot;
  player.armorTier = 1;
  const hit = () => {
    player.invuln = 0;
    game.snapshot.bullets.push({ x: player.x + 10, y: player.y + 35, w: 4, h: 4, vx: 0, vy: 0, life: 2, friendly: false });
    game.update(0);
  };
  hit();
  assert.equal(player.health, 85.6);
  assert.equal(player.armorHits, 1);
  hit();
  hit();
  assert.equal(player.armorTier, 0);
  const health = player.health;
  game.enemyInvincibility = true;
  hit();
  assert.equal(player.health, health);
});

test("falling ends the raid once even with invincibility; restart clears the result", () => {
  const results = [];
  const game = model.create({ enemyInvincibility: true, onEnd: result => results.push(result) });
  game.startGame();
  game.snapshot.player.y = model.H + 200;
  game.update(0);
  game.update(.02);
  assert.equal(game.state, "gameover");
  assert.equal(results.length, 1);
  assert.equal(results[0].extracted, false);
  game.startGame();
  assert.equal(game.state, "playing");
  assert.equal(game.snapshot.score, 0);
});

function request(url) {
  return new Promise(resolve => {
    const result = {};
    handleRequest({ url }, {
      writeHead(status, headers) { Object.assign(result, { status, headers }); },
      end(body) { resolve({ ...result, body: String(body) }); }
    });
  });
}

test("server serves only public assets and handles malformed URLs", async () => {
  for (const [url, type] of [["/", "text/html"], ["/index.html", "text/html"], ["/styles.css", "text/css"], ["/game.js?v=1", "text/javascript"], ["/game-model.js", "text/javascript"], ["/storage.js", "text/javascript"]]) {
    const response = await request(url);
    assert.equal(response.status, 200, url);
    assert.ok(response.headers["Content-Type"].startsWith(type));
    assert.ok(response.body.length > 0);
  }
  for (const url of ["/.git/config", "/server.js", "/README.md", "/tests/project.test.js", "/../index.html", "/%2e%2e/index.html", "/__proto__", "/constructor", "/game.js/extra"]) {
    assert.equal((await request(url)).status, 403, url);
  }
  assert.equal((await request("/%E0%A4%A")).status, 400);
  assert.equal((await request("/")).status, 200);
});

test("browser integration boots with blocked storage, updates HUD only on change and restarts", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const nodes = new Map();
  const writes = new Map();
  const windowEvents = {};
  let frame;
  let game;
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: noop });
      return noop;
    }
  });
  function node(id) {
    const classes = new Set();
    const events = {};
    return new Proxy({
      events, style: {}, dataset: {},
      classList: { add: name => classes.add(name), remove: name => classes.delete(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
      getContext: () => ctx,
      addEventListener: (name, fn) => { events[name] = fn; }
    }, {
      set(target, key, value) {
        const prop = `${id}.${String(key)}`;
        writes.set(prop, (writes.get(prop) || 0) + 1);
        target[key] = value;
        return true;
      }
    });
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, node(id));
  const window = { addEventListener: (name, fn) => { windowEvents[name] = fn; } };
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Denied"); } });
  const sandbox = vm.createContext({
    window, document: { getElementById: id => { assert.ok(nodes.has(id), id); return nodes.get(id); }, querySelectorAll: () => [] },
    performance: { now: () => 0 }, requestAnimationFrame: fn => { frame = fn; },
    capture: value => { game = value; }
  });
  for (const [, script] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    vm.runInContext(fs.readFileSync(path.join(root, script), "utf8"), sandbox, { filename: script });
    if (script === "game-model.js") vm.runInContext("const originalCreate = TarkovModel.create; TarkovModel.create = options => { const game = originalCreate(options); capture(game); return game; };", sandbox);
  }
  const initialWrites = writes.get("ammoPips.innerHTML");
  frame(16);
  frame(32);
  assert.equal(writes.get("ammoPips.innerHTML"), initialWrites);
  nodes.get("startButton").events.click();
  assert.equal(game.state, "playing");
  game.keys.shoot = true;
  frame(48);
  assert.equal(nodes.get("ammoValue").textContent, 11);
  assert.equal(writes.get("ammoPips.innerHTML"), initialWrites + 1);
  game.keys.shoot = false;
  frame(64);
  assert.equal(writes.get("ammoPips.innerHTML"), initialWrites + 1);
  windowEvents.blur();
  assert.equal(game.state, "paused");
  nodes.get("resumeButton").events.click();
  assert.equal(game.state, "playing");
  nodes.get("enemyInvincibility").checked = true;
  nodes.get("enemyInvincibility").events.change();
  nodes.get("soundButton").events.click();
  game.snapshot.player.y = model.H + 200;
  frame(80);
  assert.ok(nodes.get("gameOverScreen").classList.contains("screen--visible"));
  nodes.get("restartButton").events.click();
  assert.equal(game.state, "playing");
  assert.equal(nodes.get("ammoValue").textContent, 12);
});
