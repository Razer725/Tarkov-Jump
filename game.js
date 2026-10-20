(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const ui = {
    hud: document.getElementById("hud"),
    start: document.getElementById("startScreen"),
    pause: document.getElementById("pauseScreen"),
    over: document.getElementById("gameOverScreen"),
    score: document.getElementById("scoreValue"),
    best: document.getElementById("bestValue"),
    time: document.getElementById("raidTime"),
    health: document.getElementById("healthValue"),
    healthBar: document.getElementById("healthBar"),
    ammo: document.getElementById("ammoValue"),
    ammoPips: document.getElementById("ammoPips"),
    weapon: document.getElementById("weaponName"),
    armor: document.getElementById("armorStatus"),
    helmet: document.getElementById("helmetStatus"),
    finalScore: document.getElementById("finalScore"),
    finalKills: document.getElementById("finalKills"),
    finalLoot: document.getElementById("finalLoot"),
    endTitle: document.getElementById("endTitle"),
    endText: document.getElementById("endText"),
    toast: document.getElementById("toast"),
    sound: document.getElementById("soundButton"),
    enemyInvincibility: document.getElementById("enemyInvincibility")
  };

  const { W, H, WORLD_GOAL, WEAPONS, EQUIPMENT } = TarkovModel;
  const storage = TarkovStorage.create(() => window.localStorage);
  const storedBest = Number(storage.get("tarkovJumpBest", "0"));
  let best = Number.isFinite(storedBest) && storedBest >= 0 ? storedBest : 0;
  let soundOn = storage.get("tarkovJumpSound", "on") !== "off";
  let enemyInvincibility = storage.get("tarkovJumpEnemyInvincibility", "off") === "on";
  let audioCtx = null;
  let lastTime = 0;
  let toastTimer = 0;
  const game = TarkovModel.create({ beep, showToast, onEnd, enemyInvincibility });
  const keys = game.keys;
  ui.best.textContent = best;
  ui.sound.textContent = `ЗВУК: ${soundOn ? "ВКЛ" : "ВЫКЛ"}`;
  ui.enemyInvincibility.checked = enemyInvincibility;

  function startGame() {
    initAudio();
    game.startGame();
    hideScreens();
    ui.hud.classList.add("active");
    lastTime = performance.now();
    updateUI(game.snapshot);
  }

  function hideScreens() {
    ui.start.classList.remove("screen--visible");
    ui.pause.classList.remove("screen--visible");
    ui.over.classList.remove("screen--visible");
  }

  function togglePause() {
    game.togglePause();
    ui.pause.classList.toggle("screen--visible", game.state === "paused");
    lastTime = performance.now();
  }

  function onEnd({ score, kills, loot, extracted }) {
    if (score > best) {
      best = score;
      storage.set("tarkovJumpBest", String(best));
    }
    ui.best.textContent = best;
    ui.finalScore.textContent = `${score} M`;
    ui.finalKills.textContent = kills;
    ui.finalLoot.textContent = loot;
    ui.endTitle.textContent = extracted ? "ЭВАКУАЦИЯ" : "БОЕЦ ПОТЕРЯН";
    ui.endText.textContent = extracted ? "Груз принят. Рейд завершён успешно." : "Снаряжение осталось в промзоне.";
    ui.over.classList.add("screen--visible");
    ui.hud.classList.remove("active");
  }

  function draw(snapshot) {
    const { player, platforms, enemies, bullets, particles, pickups, backgroundBits, score, gameTime, cameraY, shake, flash } = snapshot;
    render();

    function render() {
      ctx.save();
      if (shake > .2) ctx.translate(rand(-shake, shake), rand(-shake, shake));
      drawBackground();
      drawPlatforms();
      drawPickups();
      drawEnemies();
      drawBullets();
      drawPlayer();
      drawParticles();
      if (score > WORLD_GOAL - 700) drawExtractionSignal();
      if (flash > 0) {
        ctx.fillStyle = `rgba(${player && player.invuln > 0 ? "130,25,18" : "230,215,160"},${flash * .14})`;
        ctx.fillRect(-20, -20, W + 40, H + 40);
      }
      ctx.restore();
    }

    function drawBackground() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, score > 3700 ? "#25291e" : "#1c211c");
      g.addColorStop(.55, "#151a16");
      g.addColorStop(1, "#0d110e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(4,7,5,.52)";
      const parallax = (cameraY * .08) % 130;
      for (let i = -1; i < 6; i++) {
        const x = i * 105 - 25;
        const height = 155 + ((i * 47) % 105);
        ctx.fillRect(x, H - height + parallax, 82, height + 50);
        ctx.fillRect(x + 13, H - height - 20 + parallax, 8, 20);
        for (let wy = H - height + 25 + parallax; wy < H; wy += 38) {
          ctx.fillStyle = "rgba(119,124,88,.055)";
          ctx.fillRect(x + 13, wy, 13, 8);
          ctx.fillRect(x + 47, wy, 13, 8);
          ctx.fillStyle = "rgba(4,7,5,.52)";
        }
      }
      ctx.strokeStyle = "rgba(119,124,91,.075)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const y = ((i * 117 + cameraY * .15) % (H + 120)) - 60;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - 35); ctx.stroke();
      }
      for (const b of backgroundBits) {
        ctx.fillStyle = `rgba(194,197,166,${b.a})`;
        ctx.fillRect(b.x, b.y, b.s, b.s);
      }
      const fog = ctx.createRadialGradient(W * .52, H * .35, 20, W * .52, H * .35, 330);
      fog.addColorStop(0, "rgba(101,110,81,.075)");
      fog.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H);
    }

    function drawPlatforms() {
      for (const p of platforms) {
        if (p.y < -30 || p.y > H + 30) continue;
        ctx.save();
        if (p.broken) ctx.rotate(.05);
        ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
        ctx.fillStyle = p.type === "fragile" ? "#51483b" : p.type === "supply" ? "#555840" : "#3f4438";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = p.type === "supply" ? "#a29d6c" : "#7c806b";
        ctx.fillRect(p.x + 2, p.y, p.w - 4, 3);
        ctx.fillStyle = "#262b24";
        ctx.fillRect(p.x + 8, p.y + p.h, 6, 8);
        ctx.fillRect(p.x + p.w - 14, p.y + p.h, 6, 8);
        ctx.strokeStyle = "rgba(12,14,12,.55)";
        ctx.beginPath();
        if (p.type === "fragile") {
          ctx.moveTo(p.x + p.w * .3, p.y); ctx.lineTo(p.x + p.w * .47, p.y + p.h);
          ctx.moveTo(p.x + p.w * .72, p.y); ctx.lineTo(p.x + p.w * .58, p.y + p.h);
        } else {
          for (let x = p.x + 20; x < p.x + p.w; x += 24) { ctx.moveTo(x, p.y + 3); ctx.lineTo(x - 4, p.y + p.h); }
        }
        ctx.stroke();
        if (p.type === "moving") {
          ctx.fillStyle = "#b58c45"; ctx.fillRect(p.x + 6, p.y + 5, 14, 3); ctx.fillRect(p.x + p.w - 20, p.y + 5, 14, 3);
        }
        ctx.restore();
      }
    }

    function drawPlayer() {
      if (!player) return;
      const p = player;
      if (p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0) ctx.globalAlpha = .48;
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.scale(p.facing, 1);
      if (p.landed) ctx.scale(1.08, .92);
      ctx.translate(-p.w / 2, -p.h / 2);
      ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(17, 53, 21, 5, 0, 0, Math.PI * 2); ctx.fill();

      // Чёрный спортивный костюм с контрастными лампасами.
      ctx.fillStyle = "#111412"; ctx.fillRect(5, 21, 27, 26);
      ctx.fillStyle = "#252b25"; ctx.fillRect(8, 20, 22, 25);
      ctx.fillStyle = "#111411"; ctx.fillRect(1, 22, 9, 22);
      ctx.fillStyle = "#c5c6b8"; ctx.fillRect(3, 23, 2, 18);
      ctx.fillRect(6, 23, 2, 18);
      ctx.fillStyle = "#141714"; ctx.fillRect(8, 43, 9, 8); ctx.fillRect(22, 43, 9, 8);
      ctx.fillStyle = "#b9baad"; ctx.fillRect(9, 43, 2, 7); ctx.fillRect(23, 43, 2, 7);

      // Без экипировки персонаж остаётся в спортивном костюме. Каждый тир
      // расширяет силуэт: от лёгкой плитоноски до тяжёлой штурмовой брони.
      if (p.armorTier > 0) {
        const tier = p.armorTier;
        const inset = tier === 1 ? 10 : tier === 2 ? 7 : 3;
        const width = tier === 1 ? 20 : tier === 2 ? 26 : 34;
        const top = tier === 1 ? 25 : 22;
        const height = tier === 1 ? 16 : tier === 2 ? 21 : 25;
        ctx.fillStyle = tier === 1 ? "#535d48" : tier === 2 ? "#464b3e" : "#343832";
        ctx.fillRect(inset, top, width, height);
        ctx.fillStyle = tier === 3 ? "#20241f" : "#2b3028";
        ctx.fillRect(inset + 3, top + 6, width / 2 - 4, height - 9);
        ctx.fillRect(20, top + 6, width / 2 - 4, height - 9);
        ctx.strokeStyle = EQUIPMENT[tier].color; ctx.lineWidth = 1; ctx.strokeRect(inset + .5, top + .5, width - 1, height - 1);
        if (tier >= 2) {
          ctx.fillStyle = "#383d34"; ctx.fillRect(2, 23, 6, tier === 3 ? 20 : 14); ctx.fillRect(31, 23, 6, tier === 3 ? 20 : 14);
        }
        if (tier === 3) {
          ctx.fillStyle = "#252923"; ctx.fillRect(5, 43, 29, 6);
          ctx.fillStyle = "#4d5144"; ctx.fillRect(16, 25, 7, 16);
        }
      }

      if (p.helmetTier === 0) {
        ctx.fillStyle = "#c39a72"; ctx.beginPath(); ctx.arc(19, 14, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#29251f"; ctx.beginPath(); ctx.arc(19, 11, 10, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#25241f"; ctx.fillRect(27, 13, 3, 5);
      } else {
        const tier = p.helmetTier;
        const radius = tier === 1 ? 11 : tier === 2 ? 13 : 15;
        const centerX = 19;
        ctx.fillStyle = tier === 1 ? "#59614f" : tier === 2 ? "#3d433a" : "#171b18";
        ctx.beginPath(); ctx.arc(centerX, 14, radius, Math.PI, Math.PI * 2);
        ctx.lineTo(centerX + radius, tier === 1 ? 18 : 22);
        ctx.lineTo(centerX - radius, tier === 1 ? 18 : 22); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = EQUIPMENT[tier].color; ctx.lineWidth = 1; ctx.stroke();
        if (tier >= 2) {
          ctx.fillStyle = "#111411"; ctx.fillRect(7, 13, 25, tier === 3 ? 10 : 6);
          ctx.fillStyle = "#667068"; ctx.fillRect(20, 14, 10, 2);
        }
        if (tier === 3) {
          ctx.fillStyle = "#202520"; ctx.fillRect(4, 18, 6, 8); ctx.fillRect(29, 18, 6, 8);
          ctx.fillStyle = "#777d74"; ctx.fillRect(6, 21, 2, 2); ctx.fillRect(31, 21, 2, 2);
        }
      }

      // Текущее оружие меняет силуэт после подбора.
      const gunLength = p.weapon === "shotgun" ? 31 : p.weapon === "machinegun" ? 29 : p.weapon === "smg" ? 18 : 22;
      ctx.fillStyle = "#252a22"; ctx.fillRect(26, 25, gunLength, p.weapon === "machinegun" ? 7 : 6);
      ctx.fillStyle = WEAPONS[p.weapon].color; ctx.fillRect(42, 26, gunLength - 12, 3);
      ctx.fillStyle = "#121512"; ctx.fillRect(30, 30, p.weapon === "machinegun" ? 10 : 7, p.weapon === "machinegun" ? 11 : 8);
      if (p.muzzle > 0) {
        ctx.fillStyle = "#e7c272"; ctx.beginPath(); ctx.moveTo(52, 23); ctx.lineTo(63, 28); ctx.lineTo(52, 33); ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawEnemies() {
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        ctx.save();
        ctx.translate(e.x, e.y);
        const face = player.x < e.x ? -1 : 1;
        ctx.translate(e.w / 2, 0); ctx.scale(face, 1); ctx.translate(-e.w / 2, 0);
        ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(15, 44, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4c4a37"; ctx.fillRect(5, 17, 22, 22);
        ctx.fillStyle = "#2b3028"; ctx.fillRect(2, 18, 8, 19);
        ctx.fillStyle = "#2b2d25"; ctx.fillRect(6, 36, 7, 8); ctx.fillRect(20, 36, 7, 8);
        ctx.fillStyle = "#5a533e"; ctx.beginPath(); ctx.arc(16, 10, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#22251f"; ctx.fillRect(7, 8, 18, 6);
        ctx.fillStyle = "#262a23"; ctx.fillRect(22, 22, 20, 5);
        ctx.fillStyle = "#696953"; ctx.fillRect(38, 23, 8, 2);
        if (e.hitFlash > 0) {
          ctx.fillStyle = "rgba(235,225,183,.55)";
          ctx.fillRect(3, 5, 27, 35);
        }
        ctx.restore();

        // Полоса здоровья всегда остаётся читаемой независимо от направления врага.
        const hpRatio = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = "rgba(4,6,4,.82)"; ctx.fillRect(e.x - 1, e.y - 8, e.w + 2, 5);
        ctx.fillStyle = hpRatio > .5 ? "#9ca77b" : hpRatio > .25 ? "#bd8a4c" : "#a5483b";
        ctx.fillRect(e.x, e.y - 7, e.w * hpRatio, 3);
      }
    }

    function drawBullets() {
      ctx.lineWidth = 2;
      for (const b of bullets) {
        ctx.strokeStyle = b.friendly ? (b.color || "rgba(246,213,129,.9)") : "rgba(218,95,66,.82)";
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * .025, b.y - b.vy * .025); ctx.stroke();
      }
    }

    function drawPickups() {
      for (const p of pickups) {
        const bob = Math.sin(gameTime * 3 + p.phase) * 3;
        ctx.save(); ctx.translate(p.x, p.y + bob);
        ctx.shadowColor = p.type === "loot" ? "rgba(213,178,85,.7)" : p.type === "weapon" ? WEAPONS[p.weaponType].color : p.type === "equipment" ? EQUIPMENT[p.tier].color : "rgba(148,160,112,.55)"; ctx.shadowBlur = 10;
        if (p.type === "med") {
          ctx.fillStyle = "#777a62"; ctx.fillRect(0, 3, 20, 15); ctx.fillStyle = "#ae5b4b"; ctx.fillRect(8, 6, 4, 9); ctx.fillRect(5, 9, 10, 3);
        } else if (p.type === "ammo") {
          ctx.fillStyle = "#67654b"; ctx.fillRect(0, 4, 20, 14); ctx.fillStyle = "#a08b55"; for (let i = 3; i < 18; i += 5) ctx.fillRect(i, 1, 2, 8);
        } else if (p.type === "weapon") {
          const weapon = WEAPONS[p.weaponType];
          ctx.fillStyle = "rgba(12,15,12,.78)"; ctx.fillRect(-3, -4, 36, 23);
          ctx.strokeStyle = weapon.color; ctx.lineWidth = 1; ctx.strokeRect(-2.5, -3.5, 35, 22);
          ctx.fillStyle = "#30362e"; ctx.fillRect(1, 5, 23, 5);
          ctx.fillStyle = weapon.color; ctx.fillRect(20, 6, p.weaponType === "shotgun" ? 12 : 8, 2);
          ctx.fillStyle = "#171a17"; ctx.fillRect(8, 10, p.weaponType === "machinegun" ? 9 : 5, 6);
          ctx.shadowColor = "transparent";
          ctx.fillStyle = weapon.color; ctx.font = "bold 7px monospace"; ctx.textAlign = "center";
          ctx.fillText(p.weaponType === "shotgun" ? "ДР" : p.weaponType === "smg" ? "ПП" : "ПЛ", 15, -7);
        } else if (p.type === "equipment") {
          const gear = EQUIPMENT[p.tier];
          ctx.fillStyle = "rgba(12,15,12,.82)"; ctx.fillRect(-4, -5, p.w + 8, p.h + 9);
          ctx.strokeStyle = gear.color; ctx.lineWidth = 1; ctx.strokeRect(-3.5, -4.5, p.w + 7, p.h + 8);
          ctx.fillStyle = gear.color;
          if (p.gearType === "armor") {
            const shoulder = p.tier * 2;
            ctx.fillRect(4 - shoulder, 3, p.w - 8 + shoulder * 2, p.h - 5);
            ctx.fillStyle = "#292e28"; ctx.fillRect(7, 7, p.w - 14, p.h - 10);
          } else {
            ctx.beginPath(); ctx.arc(p.w / 2, 10, 7 + p.tier, Math.PI, Math.PI * 2); ctx.lineTo(p.w / 2 + 7 + p.tier, 15); ctx.lineTo(p.w / 2 - 7 - p.tier, 15); ctx.closePath(); ctx.fill();
            if (p.tier >= 2) { ctx.fillStyle = "#171a17"; ctx.fillRect(4, 9, p.w - 8, p.tier === 3 ? 7 : 4); }
          }
          ctx.shadowColor = "transparent"; ctx.fillStyle = gear.color; ctx.font = "bold 7px monospace"; ctx.textAlign = "center";
          ctx.fillText(`${p.gearType === "armor" ? "Б" : "Ш"}${p.tier}`, p.w / 2, -7);
        } else {
          ctx.fillStyle = "#a98c4d"; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(16, 5); ctx.lineTo(13, 16); ctx.lineTo(3, 14); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    function drawExtractionSignal() {
      const strength = clamp((score - (WORLD_GOAL - 700)) / 700, 0, 1);
      ctx.save();
      ctx.globalAlpha = .18 + strength * .35;
      const x = W * .8;
      const g = ctx.createLinearGradient(x, 0, x, 250);
      g.addColorStop(0, "rgba(192,207,146,.65)"); g.addColorStop(1, "rgba(192,207,146,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 18, 0); ctx.lineTo(x + 18, 0); ctx.lineTo(x + 85, 300); ctx.lineTo(x - 85, 300); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d1d9ac"; ctx.fillRect(x - 2, 0, 4, 4);
      ctx.restore();
    }

  }

  let lastAmmoKey;
  const hudValues = new WeakMap();
  function setHUD(target, property, value) {
    let values = hudValues.get(target);
    if (!values) hudValues.set(target, values = new Map());
    if (values.get(property) === value) return;
    target[property] = value;
    values.set(property, value);
  }

  function updateUI({ player, score, gameTime }) {
    if (!player) return;
    setHUD(ui.score, "textContent", Math.floor(score));
    setHUD(ui.time, "textContent", formatTime(gameTime));
    setHUD(ui.health, "textContent", Math.max(0, Math.ceil(player.health)));
    setHUD(ui.healthBar.style, "width", `${Math.max(0, player.health)}%`);
    setHUD(ui.healthBar.style, "background", player.health < 35 ? "#a64b3c" : "#afb28d");
    setHUD(ui.armor, "textContent", player.armorTier ? `БРОНЯ ${player.armorTier} [${player.armorHits}/3] // -${player.armorTier * 20}%` : "БРОНЯ — НЕТ");
    setHUD(ui.helmet, "textContent", player.helmetTier ? `ШЛЕМ ${player.helmetTier} [${player.helmetHits}/3] // -${player.helmetTier * 20}%` : "ШЛЕМ — НЕТ");
    const weapon = WEAPONS[player.weapon];
    setHUD(ui.weapon, "textContent", weapon.name);
    setHUD(ui.weapon.style, "color", weapon.color);
    setHUD(ui.ammo, "textContent", player.reloadTimer > 0 ? "--" : player.ammo);
    const ammoKey = `${player.weapon}:${player.ammo}`;
    if (ammoKey === lastAmmoKey) return;
    lastAmmoKey = ammoKey;
    const pipCount = Math.min(20, weapon.ammo);
    const filledPips = Math.ceil(player.ammo / weapon.ammo * pipCount);
    setHUD(ui.ammoPips, "innerHTML", Array.from({ length: pipCount }, (_, i) => `<i class="${i >= filledPips ? "empty" : ""}" style="background:${i >= filledPips ? "" : weapon.color}"></i>`).join(""));
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    toastTimer = 2.1;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function initAudio() {
    if (!soundOn || audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  }

  function beep(freq, duration, type = "sine", volume = .03) {
    if (!soundOn) return;
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * .65), audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000 || 0, .033);
    lastTime = now;
    if (game.state === "playing") {
      game.update(dt);
      toastTimer = Math.max(0, toastTimer - dt);
      if (!toastTimer) ui.toast.classList.remove("show");
    }
    const snapshot = game.snapshot;
    updateUI(snapshot);
    draw(snapshot);
    requestAnimationFrame(loop);
  }

  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "shoot" };
  window.addEventListener("keydown", e => {
    if (e.target === ui.enemyInvincibility) return;
    if (keyMap[e.code]) { keys[keyMap[e.code]] = true; e.preventDefault(); }
    if ((e.code === "KeyW" || e.code === "ArrowUp") && !e.repeat) { game.doubleJump(); e.preventDefault(); }
    if ((e.code === "Enter" || e.code === "KeyR") && (game.state === "menu" || game.state === "gameover")) startGame();
    if ((e.code === "Escape" || e.code === "KeyP") && (game.state === "playing" || game.state === "paused")) togglePause();
  });
  window.addEventListener("keyup", e => {
    if (e.target === ui.enemyInvincibility) return;
    if (keyMap[e.code]) { keys[keyMap[e.code]] = false; e.preventDefault(); }
  });
  window.addEventListener("blur", () => { keys.left = keys.right = keys.shoot = false; if (game.state === "playing") togglePause(); });

  document.getElementById("startButton").addEventListener("click", startGame);
  document.getElementById("restartButton").addEventListener("click", startGame);
  document.getElementById("resumeButton").addEventListener("click", togglePause);
  ui.enemyInvincibility.addEventListener("change", () => {
    enemyInvincibility = ui.enemyInvincibility.checked;
    game.enemyInvincibility = enemyInvincibility;
    storage.set("tarkovJumpEnemyInvincibility", enemyInvincibility ? "on" : "off");
  });
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    storage.set("tarkovJumpSound", soundOn ? "on" : "off");
    ui.sound.textContent = `ЗВУК: ${soundOn ? "ВКЛ" : "ВЫКЛ"}`;
    if (soundOn) { initAudio(); beep(330, .08, "triangle", .025); }
  });

  document.querySelectorAll("[data-control]").forEach(btn => {
    const control = btn.dataset.control;
    const down = e => {
      e.preventDefault();
      if (control === "jump") game.doubleJump();
      else keys[control] = true;
    };
    const up = e => { e.preventDefault(); keys[control] = false; };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  });

  updateUI(game.snapshot);
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
