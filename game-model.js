"use strict";

const TarkovModel = (() => {
  const W = 480;
  const H = 720;
  const WORLD_GOAL = 5000;
  const WEAPONS = {
    rifle: { name: "АВТОМАТ", ammo: 12, reload: 1.1, cooldown: .15, pellets: 1, speed: 540, climb: -210, recoil: 15, color: "#a6a98c" },
    shotgun: { name: "ДРОБОВИК", ammo: 6, reload: 1.35, cooldown: .62, pellets: 7, speed: 470, climb: -185, spread: 155, recoil: 38, color: "#bd9459" },
    smg: { name: "ПИСТОЛЕТ-ПУЛЕМЁТ", ammo: 24, reload: 1.05, cooldown: .075, burst: 3, burstPause: .32, pellets: 1, speed: 570, climb: -190, recoil: 9, color: "#86a6a0" },
    machinegun: { name: "ПУЛЕМЁТ", ammo: 40, reload: 1.55, cooldown: .065, pellets: 1, speed: 610, climb: -170, recoil: 7, color: "#a2a873" }
  };
  const EQUIPMENT = {
    1: { name: "ЛЁГКИЙ", reduction: .2, color: "#879174" },
    2: { name: "СРЕДНИЙ", reduction: .4, color: "#a18e62" },
    3: { name: "ТЯЖЁЛЫЙ", reduction: .6, color: "#9b6651" }
  };

  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }


  function create({ beep = () => {}, showToast = () => {}, onEnd = () => {}, enemyInvincibility = false } = {}) {
    const keys = { left: false, right: false, shoot: false };
    let state = "menu";
    let gameTime = 0;
    let score = 0;
    let kills = 0;
    let loot = 0;
    let cameraY = 0;
    let shake = 0;
    let flash = 0;
    let nextPlatformY = 0;
    let extractionSpawned = false;
    let weaponDropIndex = 0;
    let nextWeaponDrop = 1350;
    let equipmentDropIndex = 0;
    let nextEquipmentDrop = 520;

    let player;
    let platforms = [];
    let enemies = [];
    let bullets = [];
    let particles = [];
    let pickups = [];
    let backgroundBits = [];

    function createPlayer() {
      return {
        x: W / 2 - 17, y: H - 115, w: 34, h: 51,
        vx: 0, vy: -720, health: 100, weapon: "rifle", ammo: WEAPONS.rifle.ammo,
        facing: 1, grounded: false, shootCooldown: 0,
        reloadTimer: 0, invuln: 0, muzzle: 0, landed: 0,
        doubleJumpReady: true, burstRemaining: 0,
        armorTier: 0, helmetTier: 0, armorHits: 0, helmetHits: 0
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
      equipmentDropIndex = 0;
      nextEquipmentDrop = 520;
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
      if (progress >= nextEquipmentDrop && equipmentDropIndex < 6) {
        spawnEquipmentPickup(center, y);
        nextEquipmentDrop += 720;
      } else if (progress >= nextWeaponDrop) {
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

    function spawnEquipmentPickup(center, y) {
      const gearType = equipmentDropIndex % 2 === 0 ? "armor" : "helmet";
      const tier = Math.min(3, Math.floor(equipmentDropIndex / 2) + 1);
      equipmentDropIndex++;
      const size = gearType === "armor" ? { w: 26, h: 22 } : { w: 22, h: 19 };
      pickups.push({
        x: center - size.w / 2, y: y - size.h - 6, w: size.w, h: size.h,
        type: "equipment", gearType, tier, taken: false, phase: Math.random() * 6
      });
    }

    function startGame() {
      resetGame();
      state = "playing";
      beep(130, .06, "sawtooth", .035);
      showToast(enemyInvincibility ? "РЕЙД НАЧАТ // НЕУЯЗВИМОСТЬ ВКЛ" : "РЕЙД НАЧАТ // ВЫХОД: КРЫША");
    }

    function togglePause() {
      if (state === "playing") state = "paused";
      else if (state === "paused") state = "playing";
    }

    function endGame(extracted = false) {
      if (state === "gameover") return;
      state = "gameover";
      onEnd({ score: Math.floor(score), kills, loot, extracted });
      beep(extracted ? 520 : 70, extracted ? .25 : .5, "sawtooth", .06);
    }

    function update(dt) {
      if (state !== "playing") return;
      gameTime += dt;
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
          damagePlayer(18, b.y < player.y + 23 ? "helmet" : "armor", true);
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
          if (p.type === "equipment") equipItem(p);
          beep(460, .08, "triangle", .035);
        }
      }
    }

    function equipItem(item) {
      const key = item.gearType === "helmet" ? "helmetTier" : "armorTier";
      const label = item.gearType === "helmet" ? "ШЛЕМ" : "БРОНЯ";
      if (item.tier >= player[key]) {
        player[key] = item.tier;
        if (item.gearType === "armor") player.armorHits = 0;
        if (item.gearType === "helmet") player.helmetHits = 0;
        showToast(`${label}: ${EQUIPMENT[item.tier].name} // -${item.tier * 20}% УРОНА`);
      } else {
        showToast(`${label} ХУЖЕ ТЕКУЩЕГО // ОСТАВЛЕН`);
      }
    }

    function damagePlayer(amount, protectedZone = "armor", countsAsShot = false) {
      if (enemyInvincibility) return;
      const tier = protectedZone === "helmet" ? player.helmetTier : player.armorTier;
      const reduction = tier ? EQUIPMENT[tier].reduction : 0;
      player.health -= amount * (1 - reduction);
      if (countsAsShot && protectedZone === "armor" && player.armorTier > 0) {
        player.armorHits++;
        if (player.armorHits >= 3) {
          player.armorTier--;
          player.armorHits = 0;
          showToast(player.armorTier > 0 ? `БРОНЯ ПОВРЕЖДЕНА // ТИР ${player.armorTier}` : "БРОНЯ УНИЧТОЖЕНА");
        }
      }
      if (countsAsShot && protectedZone === "helmet" && player.helmetTier > 0) {
        player.helmetHits++;
        if (player.helmetHits >= 3) {
          player.helmetTier--;
          player.helmetHits = 0;
          showToast(player.helmetTier > 0 ? `ШЛЕМ ПОВРЕЖДЁН // ТИР ${player.helmetTier}` : "ШЛЕМ УНИЧТОЖЕН");
        }
      }
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

    function dust(x, y, count, color) {
      for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-80, 80), vy: rand(-70, -15), gravity: 150, size: rand(2, 5), life: rand(.25, .55), maxLife: .55, color });
    }

    function sparks(x, y, color) {
      for (let i = 0; i < 8; i++) particles.push({ x, y, vx: rand(-190, 190), vy: rand(-150, 150), gravity: 260, size: rand(1, 3), life: rand(.12, .35), maxLife: .35, color });
    }


    resetGame();
    return {
      keys, startGame, togglePause, doubleJump, update,
      set enemyInvincibility(value) { enemyInvincibility = Boolean(value); },
      get state() { return state; },
      get snapshot() {
        return { player, platforms, enemies, bullets, particles, pickups, backgroundBits,
          score, kills, loot, gameTime, cameraY, shake, flash };
      }
    };
  }
  return { create, W, H, WORLD_GOAL, WEAPONS, EQUIPMENT };
})();

if (typeof module !== "undefined") module.exports = TarkovModel;
