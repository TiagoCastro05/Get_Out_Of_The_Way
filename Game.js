// PARTE 1: Webcam + ml5.js BodyPose (captura e detecção corporal)
let video;
let bodyPose;
let poses = [];

// Altera o estado inicial do jogo
let gameState = "start"; // start | playing | finished
let score = 0;
let bestScore = 0;
let elapsedTime = 0;
let startTime = 0;
let recordTime = 0;     // melhor tempo ja alcancado

// -- VIDAS ----------------------------------------------------
const MAX_LIVES = 3;
let lives = MAX_LIVES;

// -- OBSTACULOS -----------------------------------------------
let obstacles = [];
let spawnTimer = 0;
let spawnInterval = 90;   // frames entre spawns (diminui com o tempo)
const MIN_SPAWN = 30;

// -- DIFICULDADE ----------------------------------------------
let difficultyLevel = 1;  // sobe a cada 15 segundos

// -- COOLDOWN DE HIT (invencibilidade breve apos levar dano) --
let hitCooldown = 0;
const HIT_COOLDOWN_FRAMES = 60;
const TOP_WARNING_FRAMES = 60;

// -- CALIBRACAO T-POSE ------------------------------------------
let tposeTimer = 0;           // frames em T-Pose consecutivos
const TPOSE_HOLD_FRAMES = 60; // segurar 1 segundo para confirmar

// -- SENSIBILIDADE DE GESTOS ------------------------------------
// Valores mais altos aqui tornam o "baixar" mais facil de detetar.
const DUCK_NOSE_FACTOR = 0.24;
const DUCK_SHOULDER_FACTOR = 0.80;

// Jogador
let player = {
  x: 480,
  y: 270,
  radius: 30,
};

// -- ESTADO DO MODELO --
let modelReady = false;

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Trebuchet MS");

  COL_KNIFE = color(220, 210, 180);
  COL_BULLET = color(255, 215, 0);
  COL_HIT = color(240, 60, 60);
  COL_TEXT = color(240, 240, 240);

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  goodColor = color(78, 226, 143);
  badColor = color(240, 88, 88);

  // Initialize ml5.js BodyPose
  if (typeof ml5 !== 'undefined') {
    ml5.bodyPose("MoveNet", { flipped: true }, (model) => {
      bodyPose = model;
      modelReady = true;
      console.log("BodyPose model ready!");
      predictPose();
    });
  } else {
    console.error("ml5.js not loaded");
  }

  gameState = "start";
}

async function predictPose() {
  if (!modelReady || !bodyPose || !video || !video.canvas) {
    requestAnimationFrame(predictPose);
    return;
  }

  try {
    const predictions = await bodyPose.estimatePose(video.canvas);
    if (predictions && predictions.length > 0) {
      poses = predictions;
    }
  } catch (err) {
    // Model still loading or error, continue anyway
  }
  
  requestAnimationFrame(predictPose);
}

function draw() {
  drawMirroredVideo();

  if (gameState === "start") {
    drawStartScreen();
    if (detectTPose()) {
      gameState = "playing";
      startTime = millis();
      elapsedTime = 0;
      lives = MAX_LIVES;
      obstacles = [];
      spawnCounter = 0;
    }
    return;
  }

  if (gameState === "playing") {
    elapsedTime = floor((millis() - startTime) / 1000);
    updateGame();
    updateObstacles();
    updatePlayerFromBody();
    drawPlayer();
    drawSkeleton();
    drawHUD();
  }

  if (gameState === "dead") {
    updateObstacles();
    drawPlayer();
    drawSkeleton();
    drawHUD();
    drawDeadScreen();
    if (millis() - gameOverTime > 5000) {
      resetGame();
    }
  }
}

// Ecrã inicial com regras e instruções
function drawStartScreen() {
  fill(0);
  textSize(40);
  textAlign(CENTER);
  fill(255, 255, 255);
  text("Get out of the Way", width / 2, 80);
  
  textSize(22);
  textAlign(LEFT);
  fill(200, 200, 200);
  text("Regras:", 50, 140);
  fill(150, 150, 150);
  text("- Desvia-te dos obstáculos!", 50, 170);
  text("- Aguenta o máximo possível!", 50, 200);
  text("- Facas = Desviar/Bloquear (Dobrar braço)", 50, 230);
  text("- Balas = Desviar", 50, 260);
  text("- Saltar = Levantar Perna", 50, 290);
  
  textSize(22);
  textAlign(RIGHT);
  fill(100, 220, 255, 200);
  text("Como iniciar o jogo:", width - 50, 140);
  text("Levanta os braços (T-Pose)!", width - 50, 170);
  
  // Draw T-Pose figure guide
  drawTPoseFigure();
}

function drawTPoseFigure() {
  let cx = width - 200;
  let cy = 300;
  let scale = 1.2;

  fill(100, 220, 255, 210);
  noStroke();

  // Cabeça
  circle(cx, cy - 80 * scale, 28 * scale);

  // Corpo
  stroke(100, 220, 255, 210);
  strokeWeight(3);
  line(cx, cy - 50 * scale, cx, cy + 40 * scale);

  // Braços em T
  line(cx - 50 * scale, cy - 20 * scale, cx - 120 * scale, cy - 30 * scale);
  line(cx + 50 * scale, cy - 20 * scale, cx + 120 * scale, cy - 30 * scale);

  // Pernas
  line(cx - 20 * scale, cy + 40 * scale, cx - 30 * scale, cy + 100 * scale);
  line(cx + 20 * scale, cy + 40 * scale, cx + 30 * scale, cy + 100 * scale);

  // Articulações
  noStroke();
  fill(110, 225, 255, 220);
  circle(cx - 120 * scale, cy - 30 * scale, 8 * scale);
  circle(cx + 120 * scale, cy - 30 * scale, 8 * scale);
  circle(cx - 30 * scale, cy + 100 * scale, 8 * scale);
  circle(cx + 30 * scale, cy + 100 * scale, 8 * scale);
}

// Detecção simples de T-Pose: ambos braços levantados
function detectTPose() {
  if (poses.length > 0) {
    let pose = poses[0];
    if (!pose.nose || pose.nose.confidence < 0.3) return false;

    // Keypoints: [0]=nose, [5]=left_shoulder, [6]=right_shoulder,
    //            [7]=left_elbow, [8]=right_elbow,
    //            [9]=left_wrist, [10]=right_wrist
    let lw = pose.left_wrist;
    let rw = pose.right_wrist;
    let ls = pose.left_shoulder;
    let rs = pose.right_shoulder;

    if (!lw || !rw || !ls || !rs) return false;
    if (lw.confidence < 0.3 || rw.confidence < 0.3) return false;

    let shW = abs(rs.x - ls.x);

    // T-Pose: ambos pulsos acima dos ombros, afastados
    let leftHigh = lw.y < ls.y - shW * 0.1;
    let rightHigh = rw.y < rs.y - shW * 0.1;
    let leftFar = lw.x < ls.x - shW * 0.15;
    let rightFar = rw.x > rs.x + shW * 0.15;

    if (leftHigh && rightHigh && leftFar && rightFar) {
      tposeTimer++;
      if (tposeTimer >= TPOSE_HOLD_FRAMES) {
        tposeTimer = 0;
        return true;
      }
    } else {
      tposeTimer = 0;
    }
  }
  return false;
}

// =============================================================
//  VIDEO ESPELHADO + OVERLAY ESCURO
// =============================================================
function drawMirroredVideo() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();
  
  // overlay semi-transparente para melhor leitura dos elementos
  fill(0, 80);
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
  textAlign(CENTER);
  text(message, width / 2, height / 2);
}

function drawPlayer() {
  fill(255, 200, 0);
  circle(player.x, player.y, player.radius * 2);
}

function updatePlayerFromBody() {
  if (poses.length > 0) {
    let pose = poses[0];
    if (!pose.nose || pose.nose.confidence < 0.2) return;

    let nose = pose.nose;
    let targetX = width - nose.x;
    let targetY = nose.y;

    player.x = lerp(player.x, targetX, 0.3);
    player.y = lerp(player.y, targetY, 0.3);
  }

  player.x = constrain(player.x, player.radius, width - player.radius);
  player.y = constrain(player.y, player.radius, height - player.radius);
}

function updateGame() {
  // Spawn de obstáculos (aumenta velocidade com o tempo)
  spawnCounter++;
  let difficulty = 1 + elapsedTime / 30; // Aumenta dificuldade
  if (spawnCounter > spawnIntervalFrames / difficulty) {
    addObstacle();
    spawnCounter = 0;
  }
}

// =============================================================
//  ATUALIZA E DESENHA OBSTACULOS  +  COLISAO COM POSE
// =============================================================
function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    let ob = obstacles[i];

    // Objetos que vem de cima mostram aviso antes de entrar no ecra.
    if (ob.dir === "top" && ob.warningFrames && ob.warningFrames > 0) {
      drawTopWarning(ob);
      ob.warningFrames--;
      continue;
    }

    // Move o obstaculo
    ob.x += ob.vx;
    ob.y += ob.vy;

    // Remove se saiu do ecra
    if (ob.x < -60 || ob.x > width + 60 || ob.y > height + 60) {
      obstacles.splice(i, 1);
      continue;
    }

    // Desenha o obstaculo
    drawObstacle(ob);

    // Se o jogador bloquear com os bracos e tocar no obstaculo,
    // o obstaculo desaparece imediatamente.
    let kp = getPlayerKeypoints();
    if (kp && isArmBlockHit(ob, kp)) {
      obstacles.splice(i, 1);
      continue;
    }
    if (kp && isJumpClearHit(ob, kp)) {
      obstacles.splice(i, 1);
      continue;
    }

    // Verifica colisao (so se nao estiver em cooldown de hit)
    if (hitCooldown === 0 && checkCollision(ob)) {
      loseLife();
      obstacles.splice(i, 1);
      if (gameState === "dead") {
        return;
      }
      continue;
    }

    // Hint visual por obstaculo (sem duplicar texto)
    if (ob.x > 60 && ob.x < width - 60) {
      drawObstacleHint(ob);
    }
  }
}

// =============================================================
//  DESENHO DE OBSTACULOS
// =============================================================
function drawObstacle(ob) {
  push();
  translate(ob.x, ob.y);

  if (ob.type === "bullet") {
    if (imgBullet) {
      imageMode(CENTER);
      // Bullet.png esta orientada para a ESQUERDA por defeito:
      // somamos PI para alinhar a ponta com o vetor de movimento.
      rotate(atan2(ob.vy, ob.vx) + PI);
      image(imgBullet, 0, 0, 52, 52);
    } else {
      // Fallback: bala desenhada por codigo
      noStroke();
      fill(255, 215, 0);
      ellipse(0, 0, ob.w * 2, ob.h * 2);
      fill(255, 255, 180, 160);
      ellipse(-ob.w * 0.25, -ob.h * 0.25, ob.w * 0.8, ob.h * 0.8);
    }
  } else {
    // Knife.png esta orientada para CIMA por defeito:
    // somamos HALF_PI para alinhar com o vetor de movimento.
    rotate(atan2(ob.vy, ob.vx) + HALF_PI);

    if (imgKnife) {
      imageMode(CENTER);
      // Tamanho quadrado para manter proporcoes corretas em qualquer angulo.
      image(imgKnife, 0, 0, 80, 80);
    } else {
      // Fallback: faca desenhada por codigo
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

}

// =============================================================
//  HINT VISUAL - ACAO POR ZONA
// =============================================================
function getZoneForObstacle(ob) {
  if (ob.y < height / 3) return "top";
  if (ob.y < (height * 2) / 3) return "middle";
  return "bottom";
}

function drawActionHint(ob) {
  let zone = getZoneForObstacle(ob);
  let hintText = zone === "top" ? "DESVIA!" : (zone === "middle" ? "BLOQUEIA!" : "SALTA!");

  noStroke();
  fill(255, 200, 0, 220);
  textAlign(CENTER, BOTTOM);
  textSize(15);
  text(hintText, ob.x, ob.y - 24);
}

function drawObstacleHint(ob) {
  // Qualquer objeto que venha de cima mostra sempre DESVIA.
  if (ob.dir === "top") {
    noStroke();
    fill(255, 80, 80, 220);
    textAlign(CENTER, BOTTOM);
    textSize(15);
    text("DESVIA!", ob.x, ob.y - 24);
    return;
  }

  if (ob.type === "bullet") {
    let zone = getZoneForObstacle(ob);

    // Bala de cima (ou em zona alta): DESVIA a vermelho.
    if (ob.dir === "top" || zone === "top") {
      noStroke();
      fill(255, 80, 80, 220);
      textAlign(CENTER, BOTTOM);
      textSize(15);
      text("DESVIA!", ob.x, ob.y - 24);
      return;
    }

    // Bala na zona de baixo: SALTA a amarelo (igual aos outros).
    if (zone === "bottom") {
      noStroke();
      fill(255, 200, 0, 220);
      textAlign(CENTER, BOTTOM);
      textSize(15);
      text("SALTA!", ob.x, ob.y - 24);
    }
    return;
  }

  // Facas usam hint normal por zona.
  drawActionHint(ob);
}

function drawTopWarning(ob) {
  let pulse = 0.55 + 0.45 * sin(frameCount * 0.35);
  let alpha = 140 + pulse * 90;

  // Coluna de aviso no ponto onde o obstaculo vai cair.
  noStroke();
  fill(255, 70, 70, alpha * 0.35);
  rect(ob.x - 18, 0, 36, 70, 6);

  // Texto de alerta.
  fill(255, 90, 90, alpha);
  textAlign(CENTER, TOP);
  textSize(18);
  text("!", ob.x, 10);
}

function getPlayerKeypoints() {
  if (poses.length === 0) return null;
  let pose = poses[0];
  // Need to handle different BodyPose keypoint formats
  let kp = [];
  kp[0] = pose.nose;
  kp[1] = pose.left_eye;
  kp[2] = pose.right_eye;
  kp[3] = pose.left_ear;
  kp[4] = pose.right_ear;
  kp[5] = pose.left_shoulder;
  kp[6] = pose.right_shoulder;
  kp[7] = pose.left_elbow;
  kp[8] = pose.right_elbow;
  kp[9] = pose.left_wrist;
  kp[10] = pose.right_wrist;
  kp[11] = pose.left_hip;
  kp[12] = pose.right_hip;
  kp[13] = pose.left_knee;
  kp[14] = pose.right_knee;
  kp[15] = pose.left_ankle;
  kp[16] = pose.right_ankle;
  return kp;
}

function getCameraProximity(kp) {
  if (!kp[5] || !kp[6]) return 0.5;
  let shoulderW = abs(kp[6].x - kp[5].x);
  let minW = height * 0.22;
  let maxW = height * 0.5;
  return constrain((shoulderW - minW) / (maxW - minW), 0, 1);
}

function isArmBlockHit(ob, kp) {
  if (ob.type !== "knife") return false;

  let lw = kp[9];
  let rw = kp[10];
  let nearCamera = getCameraProximity(kp);
  let handRadius = lerp(38, 24, nearCamera);
  let obstacleRadius = max(ob.w, ob.h) + lerp(10, 4, nearCamera);

  if (lw && lw.confidence > 0.18 && dist(lw.x, lw.y, ob.x, ob.y) <= handRadius + obstacleRadius) {
    return true;
  }
  if (rw && rw.confidence > 0.18 && dist(rw.x, rw.y, ob.x, ob.y) <= handRadius + obstacleRadius) {
    return true;
  }

  return false;
}

function isJumpClearHit(ob, kp) {
  if (ob.type !== "bullet") return false;
  let zone = getZoneForObstacle(ob);
  if (zone !== "bottom") return false;

  let nearCamera = getCameraProximity(kp);
  let jumpPad = lerp(26, 14, nearCamera);

  let lk = kp[13];
  let la = kp[15];
  if (lk && la) {
    if (segmentHitsObstacle(lk, la, ob, jumpPad)) return true;
  }

  let rk = kp[14];
  let ra = kp[16];
  if (rk && ra) {
    if (segmentHitsObstacle(rk, ra, ob, jumpPad)) return true;
  }

  return false;
}

function segmentHitsObstacle(a, b, ob, pad) {
  if (!a || !b) return false;
  if (a.confidence < 0.2 || b.confidence < 0.2) return false;

  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let len2 = dx * dx + dy * dy;
  let t = max(0, min(1, ((ob.x - a.x) * dx + (ob.y - a.y) * dy) / len2));

  let closestX = a.x + t * dx;
  let closestY = a.y + t * dy;

  let d = dist(closestX, closestY, ob.x, ob.y);
  let obstacleRadius = max(ob.w, ob.h);
  return d <= obstacleRadius + pad;
}

function checkCollision(ob) {
  let distance = dist(ob.x, ob.y, player.x, player.y);
  let obstacleRadius = max(ob.w, ob.h);
  return distance < obstacleRadius + player.radius;
}

// ===================================================================
//  HUD  (tempo atual + vidas)
// ===================================================================
function drawHUD() {
  // Painel de fundo
  fill(0, 0, 0, 170);
  noStroke();
  rect(10, 10, 280, 70, 10);

  fill(COL_TEXT);
  textAlign(LEFT, TOP);
  textSize(20);
  text("Tempo: " + nf(elapsedTime, 1, 1) + "s", 22, 20);
  text("Recorde: " + nf(recordTime, 1, 1) + "s", 22, 46);

  // Vidas representadas por coracoes (ou fallback em circulo)
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

  // Flash vermelho quando o jogador leva dano
  if (hitCooldown > 0 && hitCooldown % 10 < 5) {
    fill(220, 0, 0, 60);
    noStroke();
    rect(0, 0, width, height);
  }
}

// ===================================================================
//  DANO E MORTE
// ===================================================================
function loseLife() {
  lives--;
  hitCooldown = HIT_COOLDOWN_FRAMES;

  if (lives <= 0) {
    gameState = "dead";
    gameOverTime = millis();
    if (elapsedTime > recordTime) {
      recordTime = elapsedTime;
    }
  }
}

function drawDeadScreen() {
  fill(0, 0, 0, 210);
  noStroke();
  rect(0, 0, width, height);

  fill(COL_HIT);
  textAlign(CENTER, CENTER);
  textSize(52);
  text("GAME OVER", width / 2, height / 2 - 80);

  fill(COL_TEXT);
  textSize(28);
  textAlign(LEFT);
  text("Tempo: " + elapsedTime + "s", 30, 50);
  text("Recorde: " + recordTime + "s", 30, 90);

  let timeLeft = 5 - floor((millis() - gameOverTime) / 1000);
  textSize(24);
  textAlign(CENTER);
  text("Voltando ao menu em " + max(0, timeLeft) + "s...", width / 2, height / 2 + 100);
}

function resetGame() {
  gameState = "start";
  score = 0;
  lives = MAX_LIVES;
  elapsedTime = 0;
  obstacles = [];
  spawnCounter = 0;
  tposeTimer = 0;
}

// ===================================================================
// SKELETON / PERSONAGEM
// ===================================================================
function drawSkeleton() {
  if (poses.length === 0) return;
  let pose = poses[0];
  let kp = getPlayerKeypoints();

  drawFaceOval(kp);
  drawExoskeleton(kp);
}

function drawFaceOval(kp) {
  if (!kp || !kp[0] || !kp[5] || !kp[6]) return;

  let nose = kp[0];
  if (nose.confidence < 0.2) return;

  let ls = kp[5];
  let rs = kp[6];
  if (!ls || !rs) return;

  let shoulderY = (ls.y + rs.y) / 2;
  let shoulderW = abs(rs.x - ls.x);

  let eyeSpan = 0;
  if (kp[1] && kp[2]) {
    eyeSpan = abs(kp[2].x - kp[1].x);
  }
  let earSpan = 0;
  if (kp[3] && kp[4]) {
    earSpan = abs(kp[4].x - kp[3].x);
  }

  let noseToShoulder = max(22, shoulderY - nose.y);
  let faceW = max(
    earSpan * 1.15,
    eyeSpan * 2.8,
    shoulderW * 0.52,
    noseToShoulder * 1.25
  );

  let nearCamera = getCameraProximity(kp);
  let closeBoost = lerp(1.0, 1.16, nearCamera);
  faceW = constrain(faceW * closeBoost, 64, lerp(150, 250, nearCamera));
  let faceH = faceW * 1.26;

  let cy = min(nose.y + faceH * 0.14, shoulderY - faceH * 0.08);

  stroke(100, 220, 255, 210);
  strokeWeight(3);
  fill(0, 0, 0, 0);
  ellipse(nose.x, cy, faceW, faceH);
}

function drawExoskeleton(kp) {
  if (!kp) return;
  
  let outlineIdx = [9, 7, 5, 11, 13, 15, 16, 14, 12, 6, 8, 10];
  let outline = [];

  for (let idx of outlineIdx) {
    let p = kp[idx];
    if (p && p.confidence > 0.2) {
      outline.push({ x: p.x, y: p.y });
    }
  }

  if (outline.length < 6) return;

  noFill();
  strokeJoin(ROUND);
  strokeCap(ROUND);

  let first = outline[0];
  let second = outline[1];
  let last = outline[outline.length - 1];

  // Halo
  stroke(80, 195, 235, 70);
  strokeWeight(10);
  beginShape();
  curveVertex(last.x, last.y);
  curveVertex(first.x, first.y);
  for (let p of outline) curveVertex(p.x, p.y);
  curveVertex(first.x, first.y);
  curveVertex(second.x, second.y);
  endShape();

  // Main
  stroke(110, 225, 255, 220);
  strokeWeight(4);
  beginShape();
  curveVertex(last.x, last.y);
  curveVertex(first.x, first.y);
  for (let p of outline) curveVertex(p.x, p.y);
  curveVertex(first.x, first.y);
  curveVertex(second.x, second.y);
  endShape();
}

// ===================================================================
// RESPONSIVE
// ===================================================================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function addObstacle() {
  let type = random() < 0.35 ? "bullet" : "knife";
  let directions = ["top", "left", "right"];
  let dir = random(directions);

  let ob = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    type: type,
    dir: dir,
    w: type === "bullet" ? 15 : 20,
    h: type === "bullet" ? 12 : 40,
    warningFrames: 0,
  };

  let speed = 3.5 + difficultyLevel * 0.5;

  if (dir === "top") {
    ob.x = random(100, width - 100);
    ob.y = -80;
    ob.vx = 0;
    ob.vy = speed;
    ob.warningFrames = TOP_WARNING_FRAMES;
  } else if (dir === "left") {
    ob.x = -50;
    ob.y = random(height / 3, (height * 2) / 3);
    ob.vx = speed;
    ob.vy = random(-0.5, 0.5);
  } else {
    ob.x = width + 50;
    ob.y = random(height / 3, (height * 2) / 3);
    ob.vx = -speed;
    ob.vy = random(-0.5, 0.5);
  }

  obstacles.push(ob);
}
