(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = 480;
  const H = 720;
  const WORLD_GOAL = 5000;
  const WEAPONS = {
    rifle: { name: "АВТОМАТ", ammo: 12, reload: 1.1, cooldown: .15, pellets: 1, speed: 540, climb: -210, recoil: 15, color: "#a6a98c" },
    shotgun: { name: "ДРОБОВИК", ammo: 6, reload: 1.35, cooldown: .62, pellets: 7, speed: 470, climb: -185, spread: 155, recoil: 38, color: "#bd9459" },
    smg: { name: "ПИСТОЛЕТ-ПУЛЕМЁТ", ammo: 24, reload: 1.05, cooldown: .075, burst: 3, burstPause: .32, pellets: 1, speed: 570, climb: -190, recoil: 9, color: "#86a6a0" },
    machinegun: { name: "ПУЛЕМЁТ", ammo: 40, reload: 1.55, cooldown: .065, pellets: 1, speed: 610, climb: -170, recoil: 7, color: "#a2a873" }
  };

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
    finalScore: document.getElementById("finalScore"),
    finalKills: document.getElementById("finalKills"),
    finalLoot: document.getElementById("finalLoot"),
    endTitle: document.getElementById("endTitle"),
    endText: document.getElementById("endText"),
    toast: document.getElementById("toast"),
    sound: document.getElementById("soundButton")
  };

  const keys = { left: false, right: false, shoot: false };
  let state = "menu";
  let lastTime = 0;
  let gameTime = 0;
  let score = 0;
  let best = Number(localStorage.getItem("tarkovJumpBest") || 0);
  let kills = 0;
  let loot = 0;
  let cameraY = 0;
  let shake = 0;
  let flash = 0;
  let soundOn = localStorage.getItem("tarkovJumpSound") !== "off";
  let audioCtx = null;
  let nextPlatformY = 0;
  let toastTimer = 0;
  let extractionSpawned = false;
  let weaponDropIndex = 0;
  let nextWeaponDrop = 1350;

  let player;
  let platforms = [];
  let enemies = [];
  let bullets = [];
  let particles = [];
  let pickups = [];
  let backgroundBits = [];

  ui.best.textContent = best;
  ui.sound.textContent = `ЗВУК: ${soundOn ? "ВКЛ" : "ВЫКЛ"}`;

  function createPlayer() {
    return {
      x: W / 2 - 17, y: H - 115, w: 34, h: 51,
      vx: 0, vy: -720, health: 100, weapon: "rifle", ammo: WEAPONS.rifle.ammo,
      facing: 1, grounded: false, shootCooldown: 0,
      reloadTimer: 0, invuln: 0, muzzle: 0, landed: 0,
      doubleJumpReady: true, burstRemaining: 0
    };
  }

  function resetGame() {
    player = createPlayer();
    platforms = [];
    enemies = [];
    bullets = [];
    particles = [];
    pickups = [];
    backgroundBits = [];
    score = 0;
    kills = 0;
    loot = 0;
    gameTime = 0;
    cameraY = 0;
    shake = 0;
    flash = 0;
    extractionSpawned = false;
    weaponDropIndex = 0;
    nextWeaponDrop = 1350;
    nextPlatformY = H - 60;

    platforms.push({ x: W / 2 - 65, y: H - 55, w: 130, h: 15, type: "start", broken: false, seed: 1 });
    let y = H - 150;
    let previousX = W / 2;
    while (y > -H) {
      previousX = spawnPlatform(y, previousX);
      y -= rand(68, 100);
    }
    nextPlatformY = y;
    for (let i = 0; i < 24; i++) {
      backgroundBits.push({ x: rand(0, W), y: rand(-H, H), s: rand(1, 3), a: rand(.08, .28) });
    }
    updateUI();
  }

  function spawnPlatform(y, previousX) {
    const progress = Math.max(0, -y + cameraY);
    const width = rand(72, 118);
    const maxStep = progress > 1800 ? 175 : 145;
    let center = clamp(previousX + rand(-maxStep, maxStep), width / 2 + 12, W - width / 2 - 12);
    let type = "normal";
    const roll = Math.random();
    if (progress > 500 && roll < .13) type = "moving";
    else if (progress > 850 && roll < .25) type = "fragile";
    else if (roll > .93) type = "supply";

    const platform = {
      x: center - width / 2, baseX: center - width / 2, y, w: width, h: 13,
      type, broken: false, seed: Math.random() * 1000, phase: Math.random() * Math.PI * 2,
      range: rand(25, 60), speed: rand(.7, 1.4), used: false
    };
    platforms.push(platform);

    if (progress > 700 && Math.random() < Math.min(.09 + progress / 25000, .24) && type !== "fragile") {
      const enemyHp = progress > 3200 ? 2 : 1;
      enemies.push({
        x: platform.x + platform.w / 2 - 15, y: y - 43, w: 30, h: 43,
        hp: enemyHp, maxHp: enemyHp, hitFlash: 0,
        cooldown: rand(.8, 2.2), phase: Math.random() * 8, platform
      });
    }
    if (progress >= nextWeaponDrop) {
      spawnWeaponPickup(center, y);
      nextWeaponDrop += 3450;
    } else if (type === "supply") {
      if (Math.random() < .14) spawnWeaponPickup(center, y);
      else pickups.push({ x: center - 10, y: y - 24, w: 20, h: 20, type: Math.random() < .55 ? "ammo" : "med", taken: false, phase: Math.random() * 6 });
    } else if (progress > 350 && Math.random() < .0133) {
      spawnWeaponPickup(center, y);
    } else if (Math.random() < .075) {
      pickups.push({ x: center - 8, y: y - 19, w: 16, h: 16, type: "loot", taken: false, phase: Math.random() * 6 });
    }
    return center;
  }

  function spawnWeaponPickup(center, y) {
    const weaponTypes = ["shotgun", "smg", "machinegun"];
    const weaponType = weaponTypes[weaponDropIndex % weaponTypes.length];
    weaponDropIndex++;
    pickups.push({ x: center - 15, y: y - 25, w: 30, h: 16, type: "weapon", weaponType, taken: false, phase: Math.random() * 6 });
  }

  function startGame() {
    initAudio();
    resetGame();
    state = "playing";
    hideScreens();
    ui.hud.classList.add("active");
    lastTime = performance.now();
    beep(130, .06, "sawtooth", .035);
    showToast("РЕЙД НАЧАТ // ВЫХОД: КРЫША");
  }

  function hideScreens() {
    ui.start.classList.remove("screen--visible");
    ui.pause.classList.remove("screen--visible");
    ui.over.classList.remove("screen--visible");
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      ui.pause.classList.add("screen--visible");
    } else if (state === "paused") {
      state = "playing";
      ui.pause.classList.remove("screen--visible");
      lastTime = performance.now();
    }
  }

  function endGame(extracted = false) {
    if (state === "gameover") return;
    state = "gameover";
    const rounded = Math.floor(score);
    if (rounded > best) {
      best = rounded;
      localStorage.setItem("tarkovJumpBest", String(best));
    }
    ui.best.textContent = best;
    ui.finalScore.textContent = `${rounded} M`;
    ui.finalKills.textContent = kills;
    ui.finalLoot.textContent = loot;
    ui.endTitle.textContent = extracted ? "ЭВАКУАЦИЯ" : "БОЕЦ ПОТЕРЯН";
    ui.endText.textContent = extracted ? "Груз принят. Рейд завершён успешно." : "Снаряжение осталось в промзоне.";
    ui.over.classList.add("screen--visible");
    ui.hud.classList.remove("active");
    beep(extracted ? 520 : 70, extracted ? .25 : .5, "sawtooth", .06);
  }

  function update(dt) {
    gameTime += dt;
    toastTimer = Math.max(0, toastTimer - dt);
    if (!toastTimer) ui.toast.classList.remove("show");
    player.invuln = Math.max(0, player.invuln - dt);
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    player.muzzle = Math.max(0, player.muzzle - dt);
    player.landed = Math.max(0, player.landed - dt);
    shake *= Math.pow(.03, dt);
    flash = Math.max(0, flash - dt * 2.7);

    const accel = 1550;
    if (keys.left) { player.vx -= accel * dt; player.facing = -1; }
    if (keys.right) { player.vx += accel * dt; player.facing = 1; }
    player.vx *= Math.pow(.035, dt);
    player.vx = clamp(player.vx, -285, 285);
    player.vy += 1850 * dt;
    const oldY = player.y;
    player.previousY = oldY;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.x > W + 12) player.x = -player.w - 12;
    if (player.x + player.w < -12) player.x = W + 12;

    for (const p of platforms) {
      if (p.type === "moving") p.x = p.baseX + Math.sin(gameTime * p.speed + p.phase) * p.range;
      if (p.broken) { p.y += 370 * dt; continue; }
      const oldBottom = oldY + player.h;
      const newBottom = player.y + player.h;
      if (player.vy > 0 && oldBottom <= p.y + 4 && newBottom >= p.y &&
          player.x + player.w - 7 > p.x && player.x + 7 < p.x + p.w) {
        player.y = p.y - player.h;
        player.vy = -760;
        player.grounded = true;
        player.landed = .12;
        player.doubleJumpReady = true;
        dust(player.x + player.w / 2, p.y, 7, "#999b80");
        beep(86, .035, "triangle", .018);
        if (p.type === "fragile") {
          p.broken = true;
          shake = Math.max(shake, 3);
          beep(55, .1, "square", .022);
        }
      }
    }

    if ((keys.shoot || player.burstRemaining > 0) && player.reloadTimer <= 0) shoot();
    if (player.ammo <= 0 && player.reloadTimer <= 0) {
      player.reloadTimer = WEAPONS[player.weapon].reload;
      player.burstRemaining = 0;
      showToast("ПЕРЕЗАРЯДКА");
      beep(160, .04, "square", .018);
    }
    if (player.reloadTimer > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) { player.ammo = WEAPONS[player.weapon].ammo; beep(260, .05, "square", .022); }
    }

    const cameraLine = H * .39;
    if (player.y < cameraLine) {
      const shift = cameraLine - player.y;
      player.y = cameraLine;
      cameraY += shift;
      player.previousY += shift;
      score = Math.max(score, cameraY * .82);
      for (const p of platforms) p.y += shift;
      for (const e of enemies) e.y += shift;
      for (const b of bullets) b.y += shift;
      for (const q of pickups) q.y += shift;
      for (const p of particles) p.y += shift;
      for (const bit of backgroundBits) {
        bit.y += shift * .18;
        if (bit.y > H) bit.y -= H * 1.8;
      }
      nextPlatformY += shift;
      while (nextPlatformY > -110) {
        const top = platforms.filter(p => !p.broken).sort((a, b) => a.y - b.y)[0];
        const prevCenter = top ? top.x + top.w / 2 : W / 2;
        nextPlatformY -= rand(score > 2500 ? 78 : 68, score > 2500 ? 112 : 100);
        spawnPlatform(nextPlatformY, prevCenter);
      }
    }

    updateBullets(dt);
    updateEnemies(dt);
    updatePickups();
    updateParticles(dt);

    platforms = platforms.filter(p => p.y < H + 100);
    enemies = enemies.filter(e => e.y < H + 100 && e.hp > 0);
    bullets = bullets.filter(b => b.y > -40 && b.y < H + 50 && b.life > 0);
    pickups = pickups.filter(p => p.y < H + 80 && !p.taken);

    if (score >= WORLD_GOAL && !extractionSpawned) {
      extractionSpawned = true;
      showToast("ТОЧКА ЭВАКУАЦИИ ДОСТИГНУТА");
    }
    if (score >= WORLD_GOAL + 180) endGame(true);
    else if (player.y > H + 90 || player.health <= 0) endGame(false);

    updateUI();
  }

  function shoot() {
    if (player.shootCooldown > 0 || player.ammo <= 0 || player.reloadTimer > 0) return;
    const weapon = WEAPONS[player.weapon];
    if (weapon.burst && player.burstRemaining <= 0) player.burstRemaining = weapon.burst;
    player.burstRemaining = Math.max(0, player.burstRemaining - 1);
    player.shootCooldown = weapon.cooldown + (player.burstRemaining === 0 && weapon.burst ? weapon.burstPause : 0);
    player.ammo--;
    player.muzzle = .05;
    for (let i = 0; i < weapon.pellets; i++) {
      const spread = weapon.pellets > 1 ? rand(-weapon.spread, weapon.spread) : rand(-12, 12);
      bullets.push({
        x: player.x + player.w / 2 + player.facing * 12, y: player.y + 16,
        w: weapon.pellets > 1 ? 3 : 4, h: weapon.pellets > 1 ? 3 : 4,
        vx: player.facing * (weapon.speed + rand(-25, 25)), vy: weapon.climb + spread,
        friendly: true, life: weapon.pellets > 1 ? .62 : 1.15, color: weapon.color
      });
    }
    player.vx -= player.facing * weapon.recoil;
    shake = Math.max(shake, weapon.pellets > 1 ? 5.5 : player.weapon === "machinegun" ? 2.4 : 2.2);
    flash = .12;
    const tone = player.weapon === "shotgun" ? 72 : player.weapon === "smg" ? 145 : player.weapon === "machinegun" ? 92 : 115;
    beep(tone, player.weapon === "shotgun" ? .085 : .045, "sawtooth", player.weapon === "shotgun" ? .055 : .035);
  }

  function doubleJump() {
    if (state !== "playing" || !player.doubleJumpReady) return;
    player.doubleJumpReady = false;
    player.vy = -735;
    player.grounded = false;
    player.landed = .08;
    shake = Math.max(shake, 3.5);
    dust(player.x + player.w / 2, player.y + player.h, 11, "#c4c6af");
    showToast("ДВОЙНОЙ ПРЫЖОК");
    beep(215, .09, "triangle", .035);
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      const oldX = b.x;
      const oldY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      // След между прошлой и новой позицией не даёт быстрой пуле пролететь сквозь цель.
      const hitbox = {
        x: Math.min(oldX, b.x) - b.w / 2,
        y: Math.min(oldY, b.y) - b.h / 2,
        w: Math.abs(b.x - oldX) + b.w,
        h: Math.abs(b.y - oldY) + b.h
      };
      if (b.friendly) {
        for (const e of enemies) {
          if (e.hp > 0 && overlaps(hitbox, e)) {
            e.hp--;
            e.hitFlash = .12;
            b.life = 0;
            sparks(b.x, b.y, "#c6a56c");
            if (e.hp <= 0) {
              kills++;
              loot++;
              shake = Math.max(shake, 5);
              showToast("ДИКИЙ УСТРАНЁН // +ЛУТ");
              beep(65, .12, "square", .03);
            }
            break;
          }
        }
      } else if (player.invuln <= 0 && overlaps(hitbox, player)) {
        b.life = 0;
        damagePlayer(18);
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.platform && !e.platform.broken) {
        e.x = e.platform.x + e.platform.w / 2 - e.w / 2 + Math.sin(gameTime * 1.4 + e.phase) * Math.min(12, e.platform.w / 5);
        e.y = e.platform.y - e.h;
      }

      const previousBottom = player.previousY + player.h;
      const playerBottom = player.y + player.h;
      const aboveEnemy = previousBottom <= e.y + 10;
      const crossesHead = playerBottom >= e.y;
      const horizontalHit = player.x + player.w - 6 > e.x && player.x + 6 < e.x + e.w;
      if (player.vy > 0 && aboveEnemy && crossesHead && horizontalHit) {
        e.hp = 0;
        player.y = e.y - player.h - 1;
        player.vy = -720;
        player.doubleJumpReady = true;
        kills++;
        loot++;
        shake = Math.max(shake, 6);
        dust(e.x + e.w / 2, e.y + 4, 12, "#a9aa8d");
        showToast("ВРАГ РАЗДАВЛЕН // +ЛУТ");
        beep(62, .14, "square", .035);
        continue;
      }

      e.cooldown -= dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      if (e.cooldown <= 0 && Math.abs(dx) < 290 && Math.abs(dy) < 350) {
        const len = Math.hypot(dx, dy) || 1;
        bullets.push({ x: e.x + e.w / 2, y: e.y + 18, w: 4, h: 4, vx: dx / len * 250, vy: dy / len * 250, friendly: false, life: 2 });
        e.cooldown = rand(1.45, 2.5);
        beep(75, .055, "sawtooth", .02);
      }
      if (player.invuln <= 0 && overlaps(player, e)) damagePlayer(24);
    }
  }

  function updatePickups() {
    for (const p of pickups) {
      if (!p.taken && overlaps(player, p)) {
        p.taken = true;
        if (p.type === "med") { player.health = Math.min(100, player.health + 35); showToast("АПТЕЧКА // +35 HP"); }
        if (p.type === "ammo") { player.ammo = WEAPONS[player.weapon].ammo; player.reloadTimer = 0; showToast("БОЕКОМПЛЕКТ ПОПОЛНЕН"); }
        if (p.type === "loot") { loot++; score += 45; showToast("ЦЕННЫЙ ЛУТ // +45 M"); }
        if (p.type === "weapon") {
          player.weapon = p.weaponType;
          player.ammo = WEAPONS[p.weaponType].ammo;
          player.reloadTimer = 0;
          player.burstRemaining = 0;
          showToast(`${WEAPONS[p.weaponType].name} ПОДОБРАН`);
        }
        beep(460, .08, "triangle", .035);
      }
    }
  }

  function damagePlayer(amount) {
    player.health -= amount;
    player.invuln = .75;
    player.vx *= -1.4;
    player.vy = Math.min(player.vy, -260);
    shake = 11;
    flash = .55;
    dust(player.x + player.w / 2, player.y + player.h / 2, 9, "#8d3d32");
    beep(48, .22, "sawtooth", .055);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity || 0) * dt;
      p.life -= dt;
      p.size *= Math.pow(.2, dt);
    }
    particles = particles.filter(p => p.life > 0);
  }

  function draw() {
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

    // Бронежилет и разгрузка.
    ctx.fillStyle = "#41473c"; ctx.fillRect(10, 24, 20, 18);
    ctx.fillStyle = "#292e28"; ctx.fillRect(12, 29, 7, 10); ctx.fillRect(21, 29, 7, 10);
    ctx.strokeStyle = "#626758"; ctx.lineWidth = 1; ctx.strokeRect(10.5, 24.5, 19, 17);

    // Чёрный «Алтын»: глубокий купол и массивное бронезабрало.
    const helmetGradient = ctx.createLinearGradient(6, 2, 31, 21);
    helmetGradient.addColorStop(0, "#343936");
    helmetGradient.addColorStop(.45, "#161a18");
    helmetGradient.addColorStop(1, "#050706");
    ctx.fillStyle = helmetGradient;
    ctx.beginPath();
    ctx.arc(19, 13, 14, Math.PI, Math.PI * 2);
    ctx.lineTo(33, 20); ctx.lineTo(29, 24); ctx.lineTo(8, 24); ctx.lineTo(5, 19);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#464c47"; ctx.lineWidth = 1;
    ctx.stroke();

    // Три фирменные параллельные полосы строго по центру купола.
    ctx.fillStyle = "#e5e5db";
    ctx.fillRect(14, 2, 2.5, 9);
    ctx.fillRect(18, 1, 2.5, 10);
    ctx.fillRect(22, 2, 2.5, 9);

    // Забрало, смотровая щель и боковые крепления «Алтына».
    ctx.fillStyle = "#090b0a"; ctx.fillRect(7, 11, 25, 12);
    ctx.fillStyle = "#030504"; ctx.fillRect(9, 13, 23, 7);
    ctx.fillStyle = "#59625c"; ctx.fillRect(19, 14, 12, 3);
    ctx.fillStyle = "rgba(193,207,196,.3)"; ctx.fillRect(21, 14, 8, 1);
    ctx.fillStyle = "#1a1e1b"; ctx.fillRect(5, 18, 5, 7); ctx.fillRect(29, 18, 5, 7);
    ctx.fillStyle = "#777d74"; ctx.fillRect(7, 20, 2, 2); ctx.fillRect(30, 20, 2, 2);

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
      ctx.shadowColor = p.type === "loot" ? "rgba(213,178,85,.7)" : p.type === "weapon" ? WEAPONS[p.weaponType].color : "rgba(148,160,112,.55)"; ctx.shadowBlur = 10;
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

  function dust(x, y, count, color) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-80, 80), vy: rand(-70, -15), gravity: 150, size: rand(2, 5), life: rand(.25, .55), maxLife: .55, color });
  }

  function sparks(x, y, color) {
    for (let i = 0; i < 8; i++) particles.push({ x, y, vx: rand(-190, 190), vy: rand(-150, 150), gravity: 260, size: rand(1, 3), life: rand(.12, .35), maxLife: .35, color });
  }

  function updateUI() {
    if (!player) return;
    ui.score.textContent = Math.floor(score);
    ui.time.textContent = formatTime(gameTime);
    ui.health.textContent = Math.max(0, Math.ceil(player.health));
    ui.healthBar.style.width = `${Math.max(0, player.health)}%`;
    ui.healthBar.style.background = player.health < 35 ? "#a64b3c" : "#afb28d";
    const weapon = WEAPONS[player.weapon];
    ui.weapon.textContent = weapon.name;
    ui.weapon.style.color = weapon.color;
    ui.ammo.textContent = player.reloadTimer > 0 ? "--" : player.ammo;
    const pipCount = Math.min(20, weapon.ammo);
    const filledPips = Math.ceil(player.ammo / weapon.ammo * pipCount);
    ui.ammoPips.innerHTML = Array.from({ length: pipCount }, (_, i) => `<i class="${i >= filledPips ? "empty" : ""}" style="background:${i >= filledPips ? "" : weapon.color}"></i>`).join("");
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

  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000 || 0, .033);
    lastTime = now;
    if (state === "playing") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "shoot" };
  window.addEventListener("keydown", e => {
    if (keyMap[e.code]) { keys[keyMap[e.code]] = true; e.preventDefault(); }
    if ((e.code === "KeyW" || e.code === "ArrowUp") && !e.repeat) { doubleJump(); e.preventDefault(); }
    if ((e.code === "Enter" || e.code === "KeyR") && (state === "menu" || state === "gameover")) startGame();
    if ((e.code === "Escape" || e.code === "KeyP") && (state === "playing" || state === "paused")) togglePause();
  });
  window.addEventListener("keyup", e => { if (keyMap[e.code]) { keys[keyMap[e.code]] = false; e.preventDefault(); } });
  window.addEventListener("blur", () => { keys.left = keys.right = keys.shoot = false; if (state === "playing") togglePause(); });

  document.getElementById("startButton").addEventListener("click", startGame);
  document.getElementById("restartButton").addEventListener("click", startGame);
  document.getElementById("resumeButton").addEventListener("click", togglePause);
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem("tarkovJumpSound", soundOn ? "on" : "off");
    ui.sound.textContent = `ЗВУК: ${soundOn ? "ВКЛ" : "ВЫКЛ"}`;
    if (soundOn) { initAudio(); beep(330, .08, "triangle", .025); }
  });

  document.querySelectorAll("[data-control]").forEach(btn => {
    const control = btn.dataset.control;
    const down = e => {
      e.preventDefault();
      if (control === "jump") doubleJump();
      else keys[control] = true;
    };
    const up = e => { e.preventDefault(); keys[control] = false; };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
    btn.addEventListener("pointerleave", up);
  });

  resetGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
