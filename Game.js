// =============================================================
//  GET OUT OF THE WAY  -  Treino Cognitivo e Motor
//  Utiliza p5.js + ml5 PoseNet para detetar a pose
//  corporal em tempo real atraves da Webcam.
// =============================================================

// -- WEBCAM & POSE MODEL --------------------------------------
let video;
let bodypose;
let poses = []; // array de poses detetadas pelo ml5

// -- KEYPOINTS (formato 17 pontos usado pelo ml5/PoseNet) -----
// 0=nose
// 5=left_shoulder   6=right_shoulder
// 7=left_elbow      8=right_elbow
// 9=left_wrist     10=right_wrist
// 11=left_hip      12=right_hip
// 13=left_knee     14=right_knee
// 15=left_ankle    16=right_ankle

// -- ESTADO DO JOGO -------------------------------------------
let gameState = "loading"; // loading | start | playing | dead

// -- SINCRONIZACAO T-POSE (inicio sem teclado) ----------------
const TPOSE_HOLD_FRAMES = 42;
let tPoseHoldCounter = 0;

const TOP_WARNING_FRAMES = 38;
const TRACKED_POINT_HOLD = 35;
let trackedKeypoints = Array.from({ length: 17 }, () => null);

const FACE_CONTOUR_HOLD = 12;
let lastFaceContour = null;

function getScreenZones() {
  return {
    headMaxY: height / 3,
    torsoMaxY: (height / 3) * 2,
  };
}

// -- TEMPO E RECORDES -----------------------------------------
let startTime = 0;
let elapsedTime = 0;
let recordTime = 0;

// -- VIDAS ----------------------------------------------------
const MAX_LIVES = 3;
let lives = MAX_LIVES;

// -- OBSTACULOS -----------------------------------------------
let obstacles = [];
let spawnTimer = 0;
let spawnInterval = 90;
const MIN_SPAWN = 30;

// -- DIFICULDADE ----------------------------------------------
let difficultyLevel = 1;

// -- COOLDOWN DE HIT ------------------------------------------
let hitCooldown = 0;
const HIT_COOLDOWN_FRAMES = 60;

// -- CORES ----------------------------------------------------
let COL_KNIFE, COL_BULLET, COL_HIT, COL_TEXT;

// -- IMAGENS --------------------------------------------------
let imgKnife;
let imgBullet;
let imgHeart;
let imgShield;

function preload() {
  imgKnife = loadImage("Imagens/Knife.png", () => {}, () => {
    imgKnife = null;
  });

  imgBullet = loadImage("Imagens/Bullet.png", () => {}, () => {
    imgBullet = null;
  });

  imgHeart = loadImage("Imagens/Heart.png", () => {}, () => {
    imgHeart = null;
  });

  imgShield = loadImage("Imagens/escudo.png", () => {}, () => {
    imgShield = null;
  });
}

// =============================================================
//  SETUP
// =============================================================
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textFont("Trebuchet MS");

  COL_KNIFE = color(220, 210, 180);
  COL_BULLET = color(255, 215, 0);
  COL_HIT = color(240, 60, 60);
  COL_TEXT = color(240, 240, 240);

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  bodypose = ml5.poseNet(video, { flipHorizontal: true }, () => {
    gameState = "start";
  });

  bodypose.on("pose", onPoses);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (video) {
    video.size(width, height);
  }
}

// =============================================================
//  CALLBACK POSES
// =============================================================
function onPoses(results) {
  poses = (results || []).map((r) => {
    if (r && r.pose && Array.isArray(r.pose.keypoints)) {
      return {
        keypoints: r.pose.keypoints.map((k) => ({
          x: Number.isFinite(k.position ? k.position.x : k.x)
            ? (k.position ? k.position.x : k.x)
            : null,
          y: Number.isFinite(k.position ? k.position.y : k.y)
            ? (k.position ? k.position.y : k.y)
            : null,
          confidence: Number.isFinite(k.score ?? k.confidence)
            ? (k.score ?? k.confidence)
            : 0,
        })),
      };
    }

    if (r && Array.isArray(r.keypoints)) {
      return {
        keypoints: r.keypoints.map((k) => ({
          x: Number.isFinite(k.position ? k.position.x : k.x)
            ? (k.position ? k.position.x : k.x)
            : null,
          y: Number.isFinite(k.position ? k.position.y : k.y)
            ? (k.position ? k.position.y : k.y)
            : null,
          confidence: Number.isFinite(k.score ?? k.confidence)
            ? (k.score ?? k.confidence)
            : 0,
        })),
      };
    }

    return { keypoints: [] };
  });
}

// =============================================================
//  DRAW
// =============================================================
function draw() {
  drawMirroredVideo();

  if (hitCooldown > 0) hitCooldown--;

  switch (gameState) {
    case "loading":
      drawLoadingScreen();
      break;
    case "start":
      drawStartScreen();
      break;
    case "playing":
      updatePlaying();
      break;
    case "dead":
      drawDeadScreen();
      break;
  }
}

// =============================================================
//  VIDEO
// =============================================================
function drawMirroredVideo() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  fill(0, 130);
  noStroke();
  rect(0, 0, width, height);
}

// =============================================================
//  ECRA DE CARREGAMENTO
// =============================================================
function drawLoadingScreen() {
  fill(COL_TEXT);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("A carregar modelo PoseNet...", width / 2, height / 2);
  textSize(18);
  text("Por favor aguarde e permita o acesso a webcam.", width / 2, height / 2 + 50);
}

// =============================================================
//  ECRA INICIAL
// =============================================================
function drawStartScreen() {
  updateTPoseSyncStart();
  drawSkeleton();

  let topY = 78;
  let panelH = min(height * 0.66, 430);
  let leftW = min(width * 0.3, 360);
  let rightW = min(width * 0.28, 330);
  let margin = max(26, width * 0.05);

  let leftX = margin;
  let leftY = topY;
  let rightX = width - margin - rightW;
  let rightY = topY;

  fill(COL_TEXT);
  textAlign(CENTER, TOP);
  textSize(28);
  text("GET OUT OF THE WAY", width / 2, 24);

  fill(12, 22, 34, 215);
  rect(leftX, leftY, leftW, panelH, 14);

  let rowY = leftY + 24;
  let rowH = 108;
  drawRuleExampleRow(leftX + 10, rowY, leftW - 20, rowH, "knife", true, "", "");
  drawRuleExampleRow(leftX + 10, rowY + rowH + 10, leftW - 20, rowH, "bullet", false, "", "");
  drawRuleExampleRow(leftX + 10, rowY + (rowH + 10) * 2, leftW - 20, rowH, "leg-up", null, "", "");

  fill(14, 28, 42, 215);
  rect(rightX, rightY, rightW, panelH, 14);

  fill(170, 220, 245);
  textSize(18);
  text("INICIAR", rightX + 14, rightY + 10);

  fill(COL_TEXT);
  textAlign(CENTER, TOP);
  textSize(16);
  text("Faz esta pose para comecar", rightX + rightW * 0.5, rightY + 44);

  drawStartPoseIcon(
    rightX + rightW * 0.5,
    rightY + panelH * 0.52,
    min(150, rightW * 0.68)
  );

  textSize(16);
  text("T-POSE", rightX + rightW * 0.5, rightY + panelH - 78);

  textSize(14);
  fill(190, 230, 245);
  text("(ou prima ESPACO)", rightX + rightW * 0.5, rightY + panelH - 54);

  drawTPoseBar();
}

function drawRuleExampleRow(x, y, w, h, objType, shieldOk, title, resultText) {
  fill(24, 40, 58, 230);
  noStroke();
  rect(x, y, w, h, 10);

  let iconX = shieldOk === null ? x + w * 0.5 : x + w * 0.5 - 24;
  let iconY = y + h * 0.5;

  drawRuleObjectIcon(iconX, iconY, objType);

  if (shieldOk !== null) {
    drawShieldBadge(x + w * 0.5 + 24, iconY, shieldOk);
  }

  if (title || resultText) {
    fill(230, 240, 248);
    textAlign(LEFT, TOP);
    textSize(16);
    let textX = shieldOk !== null ? x + 120 : x + 88;
    text(title, textX, y + 18);

    textSize(14);
    fill(180, 220, 240);
    text(resultText, textX, y + 46);
  }
}

function drawRuleObjectIcon(cx, cy, objType) {
  push();
  translate(cx, cy);

  if (objType === "bullet") {
    if (imgBullet) {
      imageMode(CENTER);
      image(imgBullet, 0, 0, 56, 56);
    } else {
      noStroke();
      fill(255, 215, 0);
      circle(0, 0, 26);
    }
  } else if (objType === "leg-up") {
    drawLegRaiseIcon(0, 0);
  } else {
    let knifeSize = 58;
    rotate(HALF_PI + PI);

    if (imgKnife) {
      imageMode(CENTER);
      image(imgKnife, 0, 0, knifeSize, knifeSize);
    } else {
      fill(220, 210, 180);
      noStroke();
      rect(-3, -18, 6, 26, 2);
      fill(120, 70, 30);
      rect(-4, 8, 8, 12, 2);
    }
  }

  pop();
}

function drawLegRaiseIcon(cx, cy) {
  push();
  translate(cx, cy);
  stroke(180, 230, 250);
  strokeWeight(3);
  strokeCap(ROUND);
  noFill();

  circle(0, -20, 12);
  line(0, -13, 0, 14);

  line(0, -2, -16, 4);
  line(0, -2, 16, 4);

  line(0, 14, 0, 34);
  line(0, 14, 18, 4);

  stroke(255, 210, 90);
  line(18, 2, 18, -12);
  line(18, -12, 13, -7);
  line(18, -12, 23, -7);

  pop();
}

function drawStartPoseIcon(cx, cy, size) {
  push();
  translate(cx, cy);
  stroke(180, 240, 255, 230);
  strokeWeight(4);
  strokeCap(ROUND);
  noFill();

  let headR = size * 0.11;
  let torsoH = size * 0.33;
  let armLen = size * 0.34;
  let legLen = size * 0.24;

  circle(0, -torsoH * 0.86, headR * 2);
  line(0, -torsoH * 0.7, 0, torsoH * 0.2);

  line(0, -torsoH * 0.45, -armLen, -torsoH * 0.45);
  line(0, -torsoH * 0.45, armLen, -torsoH * 0.45);

  line(0, torsoH * 0.2, -legLen * 0.55, torsoH * 0.2 + legLen);
  line(0, torsoH * 0.2, legLen * 0.55, torsoH * 0.2 + legLen);

  pop();
}

function drawShieldBadge(cx, cy, isSuccess) {
  push();
  translate(cx, cy);

  if (imgShield) {
    imageMode(CENTER);
    image(imgShield, 0, 0, 42, 48);
  } else {
    noStroke();
    fill(36, 56, 78, 240);
    beginShape();
    vertex(0, -18);
    vertex(15, -10);
    vertex(12, 11);
    vertex(0, 20);
    vertex(-12, 11);
    vertex(-15, -10);
    endShape(CLOSE);
  }

  stroke(isSuccess ? color(90, 255, 150) : color(255, 90, 90));
  strokeWeight(3);
  noFill();

  if (isSuccess) {
    line(-7, 1, -2, 7);
    line(-2, 7, 8, -4);
  } else {
    line(-6, -5, 6, 7);
    line(6, -5, -6, 7);
  }

  pop();
}

function updateTPoseSyncStart() {
  if (poses.length === 0) {
    tPoseHoldCounter = max(0, tPoseHoldCounter - 2);
    return;
  }

  let kp = poses[0].keypoints;

  if (isTPose(kp)) {
    tPoseHoldCounter = min(TPOSE_HOLD_FRAMES, tPoseHoldCounter + 1);
  } else {
    tPoseHoldCounter = max(0, tPoseHoldCounter - 2);
  }

  if (tPoseHoldCounter >= TPOSE_HOLD_FRAMES) {
    startGame();
  }
}

function drawTPoseBar() {
  let w = 320;
  let h = 14;
  let x = width / 2 - w / 2;
  let y = height - 30;
  let pct = constrain(tPoseHoldCounter / TPOSE_HOLD_FRAMES, 0, 1);

  noStroke();
  fill(25, 35, 45, 180);
  rect(x, y, w, h, 8);

  fill(100, 230, 255, 210);
  rect(x, y, w * pct, h, 8);
}

// =============================================================
//  T-POSE
// =============================================================
function isTPose(kp) {
  let ls = kp[5], rs = kp[6];
  let le = kp[7], re = kp[8];
  let lw = kp[9], rw = kp[10];
  let lh = kp[11], rh = kp[12];

  if (!isVisible(ls, 0.12) || !isVisible(rs, 0.12) || !isVisible(lh, 0.12) || !isVisible(rh, 0.12)) {
    return false;
  }

  let leftArmOk = isArmInTPose(ls, le, lw, -1);
  let rightArmOk = isArmInTPose(rs, re, rw, 1);

  let shoulderMidY = (ls.y + rs.y) * 0.5;
  let hipMidY = (lh.y + rh.y) * 0.5;
  let uprightTorso = hipMidY - shoulderMidY > 30;

  return leftArmOk && rightArmOk && uprightTorso;
}

function isArmInTPose(shoulder, elbow, wrist, sideDir) {
  if (!isVisible(shoulder, 0.12) || !isVisible(wrist, 0.12)) {
    return false;
  }

  let maxYDelta = 60;
  let minReach = 35;

  let wristHorizontal = abs(wrist.y - shoulder.y) < maxYDelta;
  let wristOpen = sideDir < 0
    ? wrist.x < shoulder.x - minReach
    : wrist.x > shoulder.x + minReach;

  let elbowValid = isVisible(elbow, 0.10);

  if (elbowValid) {
    let elbowHorizontal = abs(elbow.y - shoulder.y) < maxYDelta + 6;
    let elbowBetween = sideDir < 0
      ? (elbow.x < shoulder.x && elbow.x > wrist.x - 30)
      : (elbow.x > shoulder.x && elbow.x < wrist.x + 30);

    return wristHorizontal && wristOpen && elbowHorizontal && elbowBetween;
  }

  return wristHorizontal && wristOpen;
}

// =============================================================
//  LOOP DE JOGO
// =============================================================
function updatePlaying() {
  elapsedTime = (millis() - startTime) / 1000;

  let difficultyProgress = constrain(elapsedTime / 90, 0, 1);
  difficultyLevel = 1 + floor(elapsedTime / 20);
  spawnInterval = round(lerp(130, 34, difficultyProgress));
  spawnInterval = max(MIN_SPAWN, spawnInterval);

  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
  }

  updateObstacles();
  drawSkeleton();
  drawHUD();
}

// =============================================================
//  SPAWN
// =============================================================
function spawnObstacle() {
  let isBullet = random() < 0.35;
  let fromTop = random() < 0.45;
  let zones = getScreenZones();

  let speedProgress = constrain(elapsedTime / 90, 0, 1);
  let speed = lerp(random(1.6, 2.3), random(3.8, 5.2), speedProgress);

  if (isBullet) {
    let bulletZone = random() < 0.65 ? "head" : "legs";
    obstacles.push({
      type: "bullet",
      dir: "top",
      zone: bulletZone,
      x: random(60, width - 60),
      y: -30,
      vx: 0,
      vy: speed,
      w: 14,
      h: 14,
      telegraphFrames: TOP_WARNING_FRAMES,
    });
    return;
  }

  if (fromTop) {
    obstacles.push({
      type: "knife",
      dir: "top",
      zone: "head",
      x: random(60, width - 60),
      y: -30,
      vx: 0,
      vy: speed,
      w: 10,
      h: 40,
      telegraphFrames: TOP_WARNING_FRAMES,
    });
  } else {
    let laneRoll = random();
    let zone = laneRoll < 0.25 ? "head" : laneRoll < 0.7 ? "torso" : "legs";
    let yPos;

    if (zone === "head") {
      yPos = random(40, zones.headMaxY - 30);
    } else if (zone === "torso") {
      yPos = random(zones.headMaxY + 20, zones.torsoMaxY - 20);
    } else {
      yPos = random(zones.torsoMaxY + 20, height - 30);
    }

    obstacles.push({
      type: "knife",
      dir: "right",
      zone: zone,
      x: width + 30,
      y: yPos,
      vx: -speed,
      vy: 0,
      w: 40,
      h: 10,
    });
  }
}

// =============================================================
//  OBSTACULOS
// =============================================================
function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    let ob = obstacles[i];

    if (ob.dir === "top" && ob.telegraphFrames && ob.telegraphFrames > 0) {
      drawTopWarning(ob);
      ob.telegraphFrames--;
      continue;
    }

    ob.x += ob.vx;
    ob.y += ob.vy;

    if (ob.x < -60 || ob.y > height + 60) {
      obstacles.splice(i, 1);
      continue;
    }

    if (ob.dir === "top" && ob.y < 80) {
      drawTopWarning(ob);
    }

    drawObstacle(ob);

    if (hitCooldown === 0 && checkCollision(ob)) {
      loseLife();
      obstacles.splice(i, 1);

      if (gameState === "dead") {
        return;
      }
      continue;
    }

    if (ob.dir === "right" && ob.zone === "legs" && ob.x < width - 60) {
      drawLegHint(ob);
    }
  }
}

function drawObstacle(ob) {
  push();
  translate(ob.x, ob.y);

  let moveAngle = atan2(ob.vy, ob.vx);

  if (ob.type === "bullet") {
    if (imgBullet) {
      imageMode(CENTER);
      rotate(moveAngle + PI);
      image(imgBullet, 0, 0, 52, 52);
    } else {
      noStroke();
      fill(255, 215, 0);
      ellipse(0, 0, ob.w * 2, ob.h * 2);
      fill(255, 255, 180, 160);
      ellipse(-ob.w * 0.25, -ob.h * 0.25, ob.w * 0.8, ob.h * 0.8);
    }
  } else {
    rotate(ob.dir === "right" ? HALF_PI + PI : moveAngle + HALF_PI);

    if (imgKnife) {
      imageMode(CENTER);
      image(imgKnife, 0, 0, 80, 80);
    } else {
      fill(COL_KNIFE);
      stroke(180);
      strokeWeight(1);
      rect(-4, -ob.h / 2, 8, ob.h * 0.65, 0, 0, 2, 2);
      fill(120, 70, 30);
      noStroke();
      rect(-5, ob.h * 0.15, 10, ob.h * 0.35, 3);
    }
  }

  pop();

  if (ob.type === "bullet" && ob.x < width * 0.65 && ob.x > 60) {
    noStroke();
    fill(255, 80, 80, 210);
    textAlign(CENTER, BOTTOM);
    textSize(13);
    text("DESVIA!", ob.x, ob.y - (ob.h + 14));
  }
}

function drawLegHint(ob) {
  noStroke();
  fill(255, 200, 0, 210);
  textAlign(CENTER, BOTTOM);
  textSize(14);
  text("^ LEVANTA A PERNA!", ob.x, ob.y - 22);
}

function drawTopWarning(ob) {
  let x = constrain(ob.x, 24, width - 24);
  let y = 24;
  let pulse = 0.5 + 0.5 * sin(frameCount * 0.45);
  let alpha = 120 + 120 * pulse;
  let blinkOn = frameCount % 20 < 12;

  let bgCol = ob.type === "bullet"
    ? color(255, 220, 70, alpha)
    : color(255, 110, 110, alpha);

  if (blinkOn) {
    noStroke();
    fill(bgCol);
    circle(x, y, 30);

    fill(25, 25, 25, 235);
    rectMode(CENTER);
    rect(x, y - 3, 4, 13, 2);
    circle(x, y + 8, 4);
    rectMode(CORNER);
  }
}

function drawZoneGuides() {
  let zones = getScreenZones();

  stroke(255, 255, 255, 55);
  strokeWeight(1);
  line(0, zones.headMaxY, width, zones.headMaxY);
  line(0, zones.torsoMaxY, width, zones.torsoMaxY);

  noStroke();
  textAlign(LEFT, TOP);
  textSize(13);
  fill(255, 255, 255, 130);
  text("ZONA CABECA", 10, 8);
  text("ZONA TRONCO", 10, zones.headMaxY + 8);
  text("ZONA PERNAS", 10, zones.torsoMaxY + 8);
}

// =============================================================
//  COLISOES
// =============================================================
function checkCollision(ob) {
  if (poses.length === 0) return false;

  let kp = getTrackedKeypointsForDraw(poses[0].keypoints);

  let hitPad = 14;
  let minX = ob.x - ob.w - hitPad;
  let maxX = ob.x + ob.w + hitPad;
  let minY = ob.y - ob.h - hitPad;
  let maxY = ob.y + ob.h + hitPad;

  // faca lateral pode ser bloqueada pelo antebraco
  if (ob.type === "knife" && ob.dir === "right") {
    if (doesForearmBlock(ob, kp)) return false;
  }

  // obstaculo lateral nas pernas pode ser evitado pela canela
  if (ob.dir === "right" && ob.zone === "legs") {
    if (doesShinJumpOver(ob, kp)) return false;
  }

  let bodyPoints = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

  for (let idx of bodyPoints) {
    let p = kp[idx];
    if (!isVisible(p, 0.18)) continue;

    if (pointInRect(p.x, p.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  let segments = getBodyCollisionSegments(kp);
  for (let [a, b] of segments) {
    if (lineIntersectsRect(a.x, a.y, b.x, b.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  return false;
}

function getBodyCollisionSegments(kp) {
  let pairs = [
    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
    [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [0, 5], [0, 6],
  ];

  let segments = [];

  for (let [ia, ib] of pairs) {
    let a = kp[ia], b = kp[ib];
    if (isVisible(a, 0.10) && isVisible(b, 0.10)) {
      segments.push([a, b]);
    }
  }

  // fallback braços
  if (isVisible(kp[5], 0.10) && !isVisible(kp[7], 0.10) && isVisible(kp[9], 0.10)) {
    segments.push([kp[5], kp[9]]);
  }
  if (isVisible(kp[6], 0.10) && !isVisible(kp[8], 0.10) && isVisible(kp[10], 0.10)) {
    segments.push([kp[6], kp[10]]);
  }

  // fallback pernas
  if (isVisible(kp[11], 0.10) && !isVisible(kp[13], 0.10) && isVisible(kp[15], 0.10)) {
    segments.push([kp[11], kp[15]]);
  }
  if (isVisible(kp[12], 0.10) && !isVisible(kp[14], 0.10) && isVisible(kp[16], 0.10)) {
    segments.push([kp[12], kp[16]]);
  }

  return segments;
}

function doesForearmBlock(ob, kp) {
  let minX = ob.x - ob.w - 10;
  let maxX = ob.x + ob.w + 10;
  let minY = ob.y - ob.h - 10;
  let maxY = ob.y + ob.h + 10;

  let le = kp[7], lw = kp[9];
  let re = kp[8], rw = kp[10];

  let leftForearmHits =
    isVisible(le, 0.10) &&
    isVisible(lw, 0.10) &&
    lineIntersectsRect(le.x, le.y, lw.x, lw.y, minX, minY, maxX, maxY);

  let rightForearmHits =
    isVisible(re, 0.10) &&
    isVisible(rw, 0.10) &&
    lineIntersectsRect(re.x, re.y, rw.x, rw.y, minX, minY, maxX, maxY);

  return leftForearmHits || rightForearmHits;
}

function doesShinJumpOver(ob, kp) {
  let minX = ob.x - ob.w - 10;
  let maxX = ob.x + ob.w + 10;
  let minY = ob.y - ob.h - 10;
  let maxY = ob.y + ob.h + 10;

  let lk = kp[13], la = kp[15];
  let rk = kp[14], ra = kp[16];

  let leftShinHits =
    isVisible(lk, 0.10) &&
    isVisible(la, 0.10) &&
    lineIntersectsRect(lk.x, lk.y, la.x, la.y, minX, minY, maxX, maxY);

  let rightShinHits =
    isVisible(rk, 0.10) &&
    isVisible(ra, 0.10) &&
    lineIntersectsRect(rk.x, rk.y, ra.x, ra.y, minX, minY, maxX, maxY);

  return leftShinHits || rightShinHits;
}

function pointInRect(px, py, minX, minY, maxX, maxY) {
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function lineIntersectsRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
  if (pointInRect(x1, y1, minX, minY, maxX, maxY)) return true;
  if (pointInRect(x2, y2, minX, minY, maxX, maxY)) return true;

  return (
    segmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
    segmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
    segmentsIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
    segmentsIntersect(x1, y1, x2, y2, minX, maxY, minX, minY)
  );
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  let den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (abs(den) < 1e-6) return false;

  let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  let u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// =============================================================
//  ACOES DO JOGADOR
// =============================================================
function isBlocking(kp) {
  let lw = kp[9], ls = kp[5];
  let rw = kp[10], rs = kp[6];

  let leftBlock =
    isVisible(lw, 0.18) &&
    isVisible(ls, 0.18) &&
    lw.y < ls.y - 20;

  let rightBlock =
    isVisible(rw, 0.18) &&
    isVisible(rs, 0.18) &&
    rw.y < rs.y - 20;

  return leftBlock || rightBlock;
}

function isLegRaised(kp) {
  let lk = kp[13], lh = kp[11];
  let rk = kp[14], rh = kp[12];

  let leftLeg =
    isVisible(lk, 0.18) &&
    isVisible(lh, 0.18) &&
    lk.y < lh.y - 20;

  let rightLeg =
    isVisible(rk, 0.18) &&
    isVisible(rh, 0.18) &&
    rk.y < rh.y - 20;

  return leftLeg || rightLeg;
}

// =============================================================
//  ESQUELETO
// =============================================================
function drawSkeleton() {
  if (poses.length === 0) return;

  let kp = poses[0].keypoints;
  let drawKp = getTrackedKeypointsForDraw(kp);

  stroke(120, 230, 255, 210);
  strokeWeight(5);
  strokeCap(ROUND);

  // Tronco
  drawStableSegment(drawKp[5], drawKp[6], 0.12);
  drawStableSegment(drawKp[5], drawKp[11], 0.12);
  drawStableSegment(drawKp[6], drawKp[12], 0.12);
  drawStableSegment(drawKp[11], drawKp[12], 0.12);

  // Cabeca
  drawStableSegment(drawKp[0], drawKp[5], 0.12);
  drawStableSegment(drawKp[0], drawKp[6], 0.12);

  // Bracos
  drawLimbWithFallback(drawKp[5], drawKp[7], drawKp[9], 0.10);
  drawLimbWithFallback(drawKp[6], drawKp[8], drawKp[10], 0.10);

  // Pernas
  drawLimbWithFallback(drawKp[11], drawKp[13], drawKp[15], 0.10);
  drawLimbWithFallback(drawKp[12], drawKp[14], drawKp[16], 0.10);

  // Juntas para dar mais leitura visual
  drawJoint(drawKp[5], 0.10);
  drawJoint(drawKp[6], 0.10);
  drawJoint(drawKp[7], 0.10);
  drawJoint(drawKp[8], 0.10);
  drawJoint(drawKp[9], 0.10);
  drawJoint(drawKp[10], 0.10);
  drawJoint(drawKp[11], 0.10);
  drawJoint(drawKp[12], 0.10);
  drawJoint(drawKp[13], 0.10);
  drawJoint(drawKp[14], 0.10);
  drawJoint(drawKp[15], 0.10);
  drawJoint(drawKp[16], 0.10);

  drawFaceContour(drawKp);
}

function drawStableSegment(a, b, minConfidence = 0.12) {
  if (isVisible(a, minConfidence) && isVisible(b, minConfidence)) {
    line(a.x, a.y, b.x, b.y);
  }
}

function drawLimbWithFallback(a, b, c, minConfidence = 0.10) {
  let hasA = isVisible(a, minConfidence);
  let hasB = isVisible(b, minConfidence);
  let hasC = isVisible(c, minConfidence);

  if (hasA && hasB) line(a.x, a.y, b.x, b.y);
  if (hasB && hasC) line(b.x, b.y, c.x, c.y);

  if (hasA && !hasB && hasC) {
    line(a.x, a.y, c.x, c.y);
  }
}

function drawJoint(p, minConfidence = 0.10) {
  if (!isVisible(p, minConfidence)) return;

  noStroke();
  fill(180, 245, 255, 200);
  circle(p.x, p.y, 8);

  stroke(120, 230, 255, 210);
  strokeWeight(5);
  strokeCap(ROUND);
}

function drawFaceContour(kp) {
  let nose = kp[0];
  let leftEye = kp[1], rightEye = kp[2];
  let leftEar = kp[3], rightEar = kp[4];
  let ls = kp[5], rs = kp[6];

  let hasNose = isVisible(nose, 0.12);
  let hasEyes = isVisible(leftEye, 0.10) && isVisible(rightEye, 0.10);
  let hasEars = isVisible(leftEar, 0.08) && isVisible(rightEar, 0.08);
  let hasShoulders = isVisible(ls, 0.10) && isVisible(rs, 0.10);

  if (!hasNose && !hasEyes && !hasEars) {
    if (!lastFaceContour) return;
    if (frameCount - lastFaceContour.seenAt > FACE_CONTOUR_HOLD) return;

    push();
    translate(lastFaceContour.x, lastFaceContour.y);
    rotate(lastFaceContour.angle);
    noFill();
    stroke(180, 240, 255, 230);
    strokeWeight(3);
    ellipse(0, 0, lastFaceContour.w, lastFaceContour.h);
    pop();
    return;
  }

  let shoulderDist = hasShoulders ? dist(ls.x, ls.y, rs.x, rs.y) : 0;

  let faceCenterX;
  let faceCenterY;

  if (hasNose) {
    faceCenterX = nose.x;
    faceCenterY = nose.y + max(14, shoulderDist * 0.12);
  } else if (hasEyes) {
    faceCenterX = (leftEye.x + rightEye.x) * 0.5;
    faceCenterY = (leftEye.y + rightEye.y) * 0.5 + 24;
  } else {
    faceCenterX = (leftEar.x + rightEar.x) * 0.5;
    faceCenterY = (leftEar.y + rightEar.y) * 0.5 + 22;
  }

  let angle = 0;
  if (hasEyes) {
    angle = atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  } else if (hasEars) {
    angle = atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x);
  } else if (hasShoulders) {
    angle = atan2(rs.y - ls.y, rs.x - ls.x);
  }

  let faceW;
  if (hasEars) {
    faceW = dist(leftEar.x, leftEar.y, rightEar.x, rightEar.y) * 1.25;
  } else if (hasEyes) {
    faceW = dist(leftEye.x, leftEye.y, rightEye.x, rightEye.y) * 3.0;
  } else if (hasShoulders) {
    faceW = shoulderDist * 0.62;
  } else {
    faceW = 100;
  }

  faceW = constrain(faceW, 50, 220);
  let faceH = faceW * 1.35;

  lastFaceContour = {
    x: faceCenterX,
    y: faceCenterY,
    angle: angle,
    w: faceW,
    h: faceH,
    seenAt: frameCount,
  };

  push();
  translate(lastFaceContour.x, lastFaceContour.y);
  rotate(lastFaceContour.angle);
  noFill();
  stroke(180, 240, 255, 230);
  strokeWeight(3);
  ellipse(0, 0, lastFaceContour.w, lastFaceContour.h);
  pop();
}

// =============================================================
//  VISIBILIDADE / TRACKING
// =============================================================
function isVisible(p, minConfidence = 0.2) {
  return (
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.confidence) &&
    p.confidence > minConfidence
  );
}

function getTrackedKeypointsForDraw(kp) {
  let result = Array.from({ length: 17 }, (_, i) => (kp && kp[i]) ? kp[i] : null);

  for (let i = 0; i < result.length; i++) {
    let p = result[i];

    if (isVisible(p, 0.10)) {
      trackedKeypoints[i] = {
        x: p.x,
        y: p.y,
        confidence: p.confidence,
        seenAt: frameCount,
      };
      continue;
    }

    let last = trackedKeypoints[i];
    if (last && frameCount - last.seenAt <= TRACKED_POINT_HOLD) {
      result[i] = {
        x: last.x,
        y: last.y,
        confidence: max(0.12, last.confidence * 0.9),
      };
    }
  }

  return result;
}

// =============================================================
//  HUD
// =============================================================
function drawHUD() {
  fill(0, 0, 0, 170);
  noStroke();
  rect(10, 10, 280, 70, 10);

  fill(COL_TEXT);
  textAlign(LEFT, TOP);
  textSize(20);
  text("Tempo: " + nf(elapsedTime, 1, 1) + "s", 22, 20);
  text("Recorde: " + nf(recordTime, 1, 1) + "s", 22, 46);

  for (let i = 0; i < MAX_LIVES; i++) {
    let x = width - 30 - i * 38;
    let y = 30;

    if (imgHeart) {
      push();
      imageMode(CENTER);
      tint(255, i < lives ? 255 : 70);
      image(imgHeart, x, y, 28, 28);
      pop();
    } else {
      fill(i < lives ? color(220, 50, 50) : color(80, 80, 80));
      noStroke();
      circle(x, y, 26);
    }
  }

  if (hitCooldown > 0 && hitCooldown % 10 < 5) {
    fill(220, 0, 0, 60);
    noStroke();
    rect(0, 0, width, height);
  }
}

// =============================================================
//  ECRA DE MORTE
// =============================================================
function drawDeadScreen() {
  updateTPoseSyncStart();
  drawSkeleton();

  fill(0, 0, 0, 210);
  noStroke();
  rect(0, 0, width, height);

  fill(COL_HIT);
  textAlign(CENTER, CENTER);
  textSize(52);
  text("GAME OVER", width / 2, height / 2 - 100);

  fill(COL_TEXT);
  textSize(28);
  text("Tempo desta tentativa: " + nf(elapsedTime, 1, 1) + "s", width / 2, height / 2 - 30);
  text("Recorde:               " + nf(recordTime, 1, 1) + "s", width / 2, height / 2 + 20);

  if (elapsedTime > 0 && elapsedTime >= recordTime) {
    fill(255, 220, 50);
    textSize(22);
    text("Novo Recorde! Parabens!", width / 2, height / 2 + 70);
  }

  textSize(22);
  if (frameCount % 60 < 40) {
    fill(255, 230, 80);
    text("Prima ESPACO para tentar de novo", width / 2, height / 2 + 120);
  }

  fill(130, 230, 255);
  textSize(20);
  text("Ou faz T-POSE para reiniciar", width / 2, height / 2 + 150);

  drawTPoseBar();

  fill(COL_TEXT);
  textSize(18);
  text("Prima I para voltar ao ecra inicial", width / 2, height / 2 + 185);
}

// =============================================================
//  INICIO / FIM
// =============================================================
function startGame() {
  gameState = "playing";
  tPoseHoldCounter = 0;
  lives = MAX_LIVES;
  obstacles = [];
  spawnTimer = 0;
  hitCooldown = 0;
  difficultyLevel = 1;
  startTime = millis();
  elapsedTime = 0;
}

function endGame() {
  gameState = "dead";
  if (elapsedTime > recordTime) {
    recordTime = elapsedTime;
  }
}

function loseLife() {
  lives = max(0, lives - 1);
  hitCooldown = HIT_COOLDOWN_FRAMES;

  if (lives <= 0) {
    endGame();
  }
}

// =============================================================
//  INPUT
// =============================================================
function keyPressed() {
  if (key === " ") {
    if (gameState === "start" || gameState === "dead") {
      startGame();
    }
  }

  if ((key === "i" || key === "I") && gameState === "dead") {
    gameState = "start";
    tPoseHoldCounter = 0;
  }
}