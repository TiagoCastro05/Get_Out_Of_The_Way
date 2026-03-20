// =============================================================
//  GET OUT OF THE WAY  -  Treino Cognitivo e Motor
//  Utiliza p5.js + ml5 BodyPose (MoveNet) para detetar a pose
//  corporal em tempo real atraves da Webcam.
// =============================================================

// -- WEBCAM & POSE MODEL --------------------------------------
let video;
let bodypose;
let poses = [];         // array de poses detetadas pelo ml5
let playerKeypoints = null; // keypoints da pessoa atualmente bloqueada
let trackedCenter = null;
let trackedMissFrames = 0;
const TRACK_LOST_FRAMES = 45;
let modelLoadError = "";
let modelReady = false;
let modelInitInProgress = false;
let autoRetryCount = 0;
let retryAtMs = 0;
const MAX_AUTO_RETRY = 3;

// -- KEYPOINTS (indices MoveNet) ------------------------------
// 5=left_shoulder  6=right_shoulder
// 7=left_elbow     8=right_elbow
// 9=left_wrist    10=right_wrist
// 11=left_hip     12=right_hip
// 13=left_knee    14=right_knee
// 15=left_ankle   16=right_ankle
// 0=nose

// Pares de conexoes do esqueleto (usados para desenho e colisao)
const SKELETON_CONNECTIONS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 5], [0, 6],
];

// -- ESTADO DO JOGO -------------------------------------------
let gameState = "loading"; // loading | start | playing | dead

// -- TEMPO E RECORDES -----------------------------------------
let startTime = 0;
let elapsedTime = 0;    // segundos desde o inicio da tentativa
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

// Se a largura de ombros ocupar grande parte do ecra, assume "camara muito proxima".
function getCameraProximity(kp) {
  let ls = kp[5], rs = kp[6];
  if (!ls || !rs || ls.confidence < 0.2 || rs.confidence < 0.2) return 0;

  let shoulderW = abs(rs.x - ls.x);
  let ratio = shoulderW / max(width, 1);
  return constrain(map(ratio, 0.22, 0.5, 0, 1), 0, 1);
}

// -- CORES ----------------------------------------------------
let COL_KNIFE, COL_BULLET, COL_HIT, COL_TEXT;

// -- IMAGENS --------------------------------------------------
let imgKnife;
let imgBullet;
let imgHeart;

function preload() {
  // Carrega sprites da pasta Imagens; se falhar, o jogo usa fallback desenhado.
  imgKnife = loadImage("Imagens/Knife.png", () => {}, () => {
    imgKnife = null;
  });
  imgBullet = loadImage("Imagens/Bullet.png", () => {}, () => {
    imgBullet = null;
  });
  imgHeart = loadImage("Imagens/Heart.png", () => {}, () => {
    imgHeart = null;
  });
}

// =============================================================
//  SETUP
// =============================================================
function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Trebuchet MS");

  COL_KNIFE  = color(220, 210, 180);
  COL_BULLET = color(255, 215, 0);
  COL_HIT    = color(240, 60, 60);
  COL_TEXT   = color(240, 240, 240);

  // Inicia a webcam
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  // Captura falhas assíncronas internas do ml5/tfjs para recuperar sem crash.
  window.addEventListener("unhandledrejection", handleUnhandledModelError);

  initBodyPoseModel();
}

function initBodyPoseModel() {
  if (modelInitInProgress) return;

  modelInitInProgress = true;
  modelReady = false;
  poses = [];
  playerKeypoints = null;
  trackedCenter = null;
  trackedMissFrames = 0;
  modelLoadError = "";
  gameState = "loading";

  try {
    if (bodypose && typeof bodypose.detectStop === "function") {
      bodypose.detectStop();
    }

    // Inicializa o modelo BodyPose MoveNet (flipped espelha as coords)
    bodypose = ml5.bodyPose("MoveNet", { flipped: true }, () => {
      // So comecamos a deteccao quando o modelo estiver pronto
      try {
        bodypose.detectStart(video, onPoses);
        modelReady = true;
        modelInitInProgress = false;
        autoRetryCount = 0;
        retryAtMs = 0;
        gameState = "start";
      } catch (err) {
        modelLoadError = "Falha ao iniciar a deteccao de pose.";
        modelInitInProgress = false;
        modelReady = false;
        gameState = "loading";
        console.error("BodyPose detectStart falhou:", err);
      }
    });
  } catch (err) {
    modelLoadError = "Falha ao carregar o modelo MoveNet.";
    modelInitInProgress = false;
    modelReady = false;
    gameState = "loading";
    console.error("BodyPose load falhou:", err);
  }
}

function handleUnhandledModelError(event) {
  const message = String((event && event.reason && event.reason.message) || (event && event.reason) || "");
  const isModelError = message.includes("estimatePoses") || message.includes("Failed to fetch");

  if (!isModelError) return;

  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  console.error("Erro de modelo capturado:", message);
  scheduleModelRetry("Ligacao ao modelo perdida durante o jogo.");
}

function scheduleModelRetry(reason) {
  modelReady = false;
  poses = [];
  playerKeypoints = null;
  trackedCenter = null;
  trackedMissFrames = 0;
  gameState = "loading";

  if (autoRetryCount < MAX_AUTO_RETRY) {
    autoRetryCount++;
    const waitMs = 1200 + autoRetryCount * 600;
    retryAtMs = millis() + waitMs;
    modelLoadError = reason + " A tentar novamente... (" + autoRetryCount + "/" + MAX_AUTO_RETRY + ")";
  } else {
    retryAtMs = 0;
    modelLoadError = reason + " Falhou apos varias tentativas. Prima R para tentar novamente.";
  }
}

// Callback ml5 - actualiza o array de poses a cada frame
function onPoses(results) {
  poses = Array.isArray(results) ? results : [];
  updateTrackedPlayer();
}

function getPoseAnchor(kp) {
  if (!kp) return null;
  let pts = [];
  let idx = [0, 5, 6, 11, 12];
  for (let i of idx) {
    let p = kp[i];
    if (p && p.confidence > 0.2) pts.push(p);
  }
  if (pts.length === 0) return null;

  let sx = 0, sy = 0;
  for (let p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

function getPoseScore(kp) {
  if (!kp) return 0;
  let idx = [0, 5, 6, 11, 12, 9, 10, 13, 14];
  let score = 0;
  for (let i of idx) {
    let p = kp[i];
    if (p) score += p.confidence || 0;
  }
  return score;
}

function updateTrackedPlayer() {
  if (poses.length === 0) {
    trackedMissFrames++;
    if (trackedMissFrames > TRACK_LOST_FRAMES) {
      playerKeypoints = null;
      trackedCenter = null;
    }
    return;
  }

  let bestPose = null;
  let bestCenter = null;

  if (trackedCenter) {
    let maxDist = max(width, height) * 0.32;
    let bestDist = Infinity;
    for (let pose of poses) {
      let kp = pose && pose.keypoints;
      let c = getPoseAnchor(kp);
      if (!c) continue;
      let d = dist(c.x, c.y, trackedCenter.x, trackedCenter.y);
      if (d < bestDist && d <= maxDist) {
        bestDist = d;
        bestPose = pose;
        bestCenter = c;
      }
    }
  }

  // Sem lock anterior (ou lock perdido): escolhe a pose mais confiavel.
  if (!bestPose) {
    let bestScore = -1;
    for (let pose of poses) {
      let kp = pose && pose.keypoints;
      let c = getPoseAnchor(kp);
      if (!c) continue;
      let score = getPoseScore(kp);
      if (score > bestScore) {
        bestScore = score;
        bestPose = pose;
        bestCenter = c;
      }
    }
  }

  if (bestPose && bestPose.keypoints) {
    playerKeypoints = bestPose.keypoints;
    trackedCenter = bestCenter;
    trackedMissFrames = 0;
  } else {
    trackedMissFrames++;
    if (trackedMissFrames > TRACK_LOST_FRAMES) {
      playerKeypoints = null;
      trackedCenter = null;
    }
  }
}

function getPlayerKeypoints() {
  return playerKeypoints;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (video) {
    video.size(width, height);
  }
}

// =============================================================
//  DRAW  (loop principal a 60fps)
// =============================================================
function draw() {
  // Fundo: espelho da webcam sempre visivel
  drawMirroredVideo();

  if (retryAtMs > 0 && millis() >= retryAtMs) {
    retryAtMs = 0;
    initBodyPoseModel();
  }

  if (hitCooldown > 0) hitCooldown--;

  // Detetar T-Pose no ecra inicial e no de morte
  if ((gameState === "start" || gameState === "dead") && modelReady) {
    if (isTpose()) {
      tposeTimer++;
      if (tposeTimer >= TPOSE_HOLD_FRAMES) {
        tposeTimer = 0;
        startGame();
      }
    } else {
      tposeTimer = max(0, tposeTimer - 2);
    }
  } else {
    tposeTimer = 0;
  }

  switch (gameState) {
    case "loading":  drawLoadingScreen();  break;
    case "start":    drawStartScreen();    break;
    case "playing":  updatePlaying();      break;
    case "dead":     drawDeadScreen();     break;
  }
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
  if (modelLoadError) {
    fill(COL_HIT);
    text("Erro ao carregar BodyPose", width / 2, height / 2 - 20);
    fill(COL_TEXT);
    textSize(18);
    text(modelLoadError, width / 2, height / 2 + 20);
    text("Verifica internet/firewall. Podes premir R para forcar nova tentativa.", width / 2, height / 2 + 50);
  } else {
    text("A carregar modelo BodyPose...", width / 2, height / 2);
    textSize(18);
    text("Por favor aguarde e permita o acesso a webcam.", width / 2, height / 2 + 50);
  }
}

function drawStartScreen() {
  drawSkeleton();

  // --- Titulo no topo ---
  fill(0, 0, 0, 180);
  noStroke();
  rect(width / 2 - 260, 10, 520, 52, 10);
  fill(COL_TEXT);
  textAlign(CENTER, CENTER);
  textSize(30);
  text("Get out of the Way", width / 2, 36);

  // ============  PAINEL ESQUERDO: Regras  ============
  let pW = 390, pH = 380;
  let px = 28, py = 74;
  fill(0, 0, 0, 190);
  noStroke();
  rect(px, py, pW, pH, 14);

  fill(COL_TEXT);
  textAlign(LEFT, TOP);
  textSize(17);
  text("Regras:", px + 18, py + 14);

  textSize(14);
  let lx = px + 18, ly = py + 50, ls = 32;
  text("Desvia-te dos obstaculos!",                   lx, ly);
  text("Aguenta o maximo possivel!",                  lx, ly + ls);
  text("Facas = Desviar / Bloqueio (Dobrar braco)",   lx, ly + ls * 2 + 4);
  text("Balas = Desviar (nao podes bloquear)",        lx, ly + ls * 3 + 4);
  text("Saltar = Levantar Perna",                     lx, ly + ls * 4 + 4);
  text("Vidas: " + MAX_LIVES + "  -  Cada colisao remove 1 vida", lx, ly + ls * 5 + 12);

  // ============  PAINEL DIREITO: Como iniciar  ============
  let rW = 370, rH = 380;
  let rpx = width - 28 - rW, rpy = 74;
  fill(0, 0, 0, 190);
  noStroke();
  rect(rpx, rpy, rW, rH, 14);

  fill(COL_TEXT);
  textAlign(LEFT, TOP);
  textSize(17);
  text("Como iniciar o jogo:", rpx + 18, rpy + 14);

  textSize(14);
  text("Levanta os bracos (T-Pose)!", rpx + 18, rpy + 50);

  // Boneco T-Pose ilustrativo
  drawTposeFigure(rpx + rW / 2, rpy + 210, 80);

  // Barra de progresso T-Pose
  drawTposeProgressBar(width / 2, 488);
}

// Boneco simples em T-Pose
function drawTposeFigure(cx, cy, sz) {
  noFill();
  stroke(COL_TEXT);
  strokeWeight(3);

  // cabeca
  noStroke();
  fill(COL_TEXT);
  circle(cx, cy - sz * 0.85, sz * 0.28);

  // corpo
  stroke(COL_TEXT);
  noFill();
  strokeWeight(3);
  line(cx, cy - sz * 0.7, cx, cy + sz * 0.2);

  // bracos horizontais (T-Pose)
  line(cx - sz * 0.75, cy - sz * 0.42, cx + sz * 0.75, cy - sz * 0.42);

  // pernas
  line(cx, cy + sz * 0.2, cx - sz * 0.28, cy + sz * 0.85);
  line(cx, cy + sz * 0.2, cx + sz * 0.28, cy + sz * 0.85);

  strokeWeight(1);
}

// Barra de progresso da T-Pose
function drawTposeProgressBar(cx, cy) {
  let progress   = tposeTimer / TPOSE_HOLD_FRAMES;
  let barW = 310, barH = 20;
  let detected   = isTpose();

  // Fundo do painel
  fill(0, 0, 0, 180);
  noStroke();
  rect(cx - barW / 2 - 12, cy - 36, barW + 24, 68, 10);

  // Label
  fill(detected ? color(80, 220, 80) : COL_TEXT);
  textAlign(CENTER, CENTER);
  textSize(14);
  text(detected ? "T-Pose detetada! Aguenta..." : "Faz T-Pose para comecar", cx, cy - 18);

  // Trilho da barra
  fill(60, 60, 60);
  noStroke();
  rect(cx - barW / 2, cy + 4, barW, barH, barH / 2);

  // Preenchimento
  if (progress > 0) {
    fill(detected ? color(50, 200, 50) : color(180, 180, 50));
    rect(cx - barW / 2, cy + 4, barW * min(progress, 1), barH, barH / 2);
  }
}

// =============================================================
//  LOOP DE JOGO  (estado "playing")
// =============================================================
function updatePlaying() {
  elapsedTime = (millis() - startTime) / 1000;

  // Progressao mais lenta para facilitar os primeiros segundos.
  difficultyLevel = 1 + floor(elapsedTime / 20);
  spawnInterval = max(MIN_SPAWN, 130 - difficultyLevel * 9);

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
//  SPAWN DE OBSTACULOS  (aleatoriedade controlada)
// =============================================================
function spawnObstacle() {
  let isBullet = random() < 0.35;
  let r = random();
  let fromDir = r < 0.34 ? "top" : (r < 0.67 ? "right" : "left");
  let speed = random(2.2, 3.4) + difficultyLevel * 0.22;
  let upperZoneMaxY = max(70, height / 3 - 20);

  if (fromDir === "top") {
    obstacles.push({
      type: isBullet ? "bullet" : "knife",
      dir: "top",
      x: random(60, width - 60),
      y: -30,
      vx: 0,
      vy: speed,
      w: isBullet ? 14 : 10,
      h: isBullet ? 14 : 40,
      warningFrames: TOP_WARNING_FRAMES,
    });
  } else if (fromDir === "right") {
    // Obstaculo vem da direita e move-se para a esquerda
    let yPos = isBullet ? random(50, upperZoneMaxY) : random(80, height - 80);
    obstacles.push({
      type: isBullet ? "bullet" : "knife",
      dir: "right",
      x: width + 30,
      y: yPos,
      vx: -speed,
      vy: 0,
      w: isBullet ? 14 : 40,
      h: isBullet ? 14 : 10,
      lastThird: yPos > (height * 2) / 3,
    });
  } else {
    // Obstaculo vem da esquerda e move-se para a direita
    let yPos = isBullet ? random(50, upperZoneMaxY) : random(80, height - 80);
    obstacles.push({
      type: isBullet ? "bullet" : "knife",
      dir: "left",
      x: -30,
      y: yPos,
      vx: speed,
      vy: 0,
      w: isBullet ? 14 : 40,
      h: isBullet ? 14 : 10,
      lastThird: yPos > (height * 2) / 3,
    });
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

function isArmBlockHit(ob, kp) {
  if (ob.type !== "knife") return false;

  // Bloqueio por MAO: area circular a volta de cada pulso.
  let lw = kp[9], rw = kp[10];
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
  if (getZoneForObstacle(ob) !== "bottom") return false;
  if (!isLegRaised(kp)) return false;

  let nearCamera = getCameraProximity(kp);
  let jumpPad = lerp(26, 14, nearCamera);
  let legSegments = [
    [13, 15], // joelho -> pe esquerdo
    [14, 16], // joelho -> pe direito
  ];

  for (let [a, b] of legSegments) {
    let pa = kp[a], pb = kp[b];
    if (!pa || !pb || pa.confidence < 0.18 || pb.confidence < 0.18) continue;
    if (segmentHitsObstacle(pa, pb, ob, jumpPad)) {
      return true;
    }
  }

  return false;
}

// =============================================================
//  DETECAO DE COLISAO COM A POSE DO JOGADOR
// =============================================================
function checkCollision(ob) {
  let kp = getPlayerKeypoints();
  if (!kp) return false;
  let nearCamera = getCameraProximity(kp);

  // Regras por altura no ecra:
  // topo -> desviar; meio -> bloquear; baixo -> saltar
  let zone = getZoneForObstacle(ob);
  // No topo nao ha gesto de defesa, o jogador precisa desviar.

  // Colisao por linhas do esqueleto (segmentos entre keypoints)
  for (let [a, b] of SKELETON_CONNECTIONS) {
    let pa = kp[a], pb = kp[b];
    if (!pa || !pb || pa.confidence < 0.2 || pb.confidence < 0.2) continue;
    let collisionPad = lerp(12, 4, nearCamera);
    if (segmentHitsObstacle(pa, pb, ob, collisionPad)) {
      return true;
    }
  }

  return false;
}

function segmentHitsObstacle(a, b, ob, pad) {
  // Aproxima o obstaculo a um circulo e testa distancia minima ao segmento.
  let radius = max(ob.w, ob.h) + pad;

  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let lenSq = dx * dx + dy * dy;

  if (lenSq <= 0.0001) {
    return dist(a.x, a.y, ob.x, ob.y) <= radius;
  }

  let t = ((ob.x - a.x) * dx + (ob.y - a.y) * dy) / lenSq;
  t = constrain(t, 0, 1);

  let closestX = a.x + t * dx;
  let closestY = a.y + t * dy;
  return dist(closestX, closestY, ob.x, ob.y) <= radius;
}

// -- BAIXAR: nariz e ombros descem em relacao ao tronco -------
function isDucking(kp) {
  let nose = kp[0];
  let ls = kp[5], rs = kp[6];   // shoulders
  let lh = kp[11], rh = kp[12]; // hips

  if (!nose || !ls || !rs || !lh || !rh) return false;
  if (nose.confidence < 0.2 || ls.confidence < 0.2 || rs.confidence < 0.2 || lh.confidence < 0.2 || rh.confidence < 0.2) {
    return false;
  }

  let shoulderY = (ls.y + rs.y) * 0.5;
  let hipY = (lh.y + rh.y) * 0.5;
  let torso = max(hipY - shoulderY, 80);
  let nearCamera = getCameraProximity(kp);

  // Nariz relativamente baixo e ombros mais descidos indicam agachar/baixar.
  // Ajustado para ficar mais permissivo em fullscreen e diferentes distancias.
  let noseFactor = DUCK_NOSE_FACTOR + nearCamera * 0.10;
  let shoulderFactor = DUCK_SHOULDER_FACTOR + nearCamera * 0.10;
  let noseLow = nose.y > shoulderY - torso * noseFactor;
  let shoulderLow = shoulderY > hipY - torso * shoulderFactor;

  return noseLow && shoulderLow;
}

// -- BLOQUEIO: punho (wrist) acima do ombro (shoulder) --------
function isBlocking(kp) {
  let lw = kp[9],  ls = kp[5], le = kp[7];  // left wrist/shoulder/elbow
  let rw = kp[10], rs = kp[6], re = kp[8];  // right wrist/shoulder/elbow
  let nearCamera = getCameraProximity(kp);
  let blockThreshold = lerp(10, 2, nearCamera);

  let leftWristBlock  = lw && ls && lw.confidence > 0.2 && ls.confidence > 0.2 && lw.y < ls.y - blockThreshold;
  let rightWristBlock = rw && rs && rw.confidence > 0.2 && rs.confidence > 0.2 && rw.y < rs.y - blockThreshold;
  let leftElbowBlock  = le && ls && le.confidence > 0.2 && ls.confidence > 0.2 && le.y < ls.y - blockThreshold * 0.5;
  let rightElbowBlock = re && rs && re.confidence > 0.2 && rs.confidence > 0.2 && re.y < rs.y - blockThreshold * 0.5;

  let leftBlock = leftWristBlock || leftElbowBlock;
  let rightBlock = rightWristBlock || rightElbowBlock;
  return leftBlock || rightBlock;
}

// -- PERNA LEVANTADA: joelho (knee) acima da anca (hip) -------
function isLegRaised(kp) {
  let ls = kp[5], rs = kp[6];   // shoulders
  let lh = kp[11], rh = kp[12]; // hips
  let lk = kp[13], rk = kp[14]; // knees
  let la = kp[15], ra = kp[16]; // ankles

  // Escala do corpo para threshold robusto em fullscreen/distancias diferentes.
  let torsoLeft = ls && lh && ls.confidence > 0.2 && lh.confidence > 0.2 ? abs(lh.y - ls.y) : 0;
  let torsoRight = rs && rh && rs.confidence > 0.2 && rh.confidence > 0.2 ? abs(rh.y - rs.y) : 0;
  let torso = max(torsoLeft, torsoRight, 80);
  let nearCamera = getCameraProximity(kp);
  let liftThreshold = max(7, torso * lerp(0.12, 0.07, nearCamera));

  let leftKneeUp = lk && lh && lk.confidence > 0.18 && lh.confidence > 0.18 && lk.y < lh.y - liftThreshold;
  let rightKneeUp = rk && rh && rk.confidence > 0.18 && rh.confidence > 0.18 && rk.y < rh.y - liftThreshold;
  let leftAnkleUp = la && lh && la.confidence > 0.18 && lh.confidence > 0.18 && la.y < lh.y - liftThreshold * 0.25;
  let rightAnkleUp = ra && rh && ra.confidence > 0.18 && rh.confidence > 0.18 && ra.y < rh.y - liftThreshold * 0.25;

  // Critério adicional: um pe claramente mais alto que o outro tambem conta como salto.
  let oneFootUp = la && ra && la.confidence > 0.18 && ra.confidence > 0.18 && abs(la.y - ra.y) > max(10, torso * 0.12);

  return leftKneeUp || rightKneeUp || leftAnkleUp || rightAnkleUp || oneFootUp;
}

// =============================================================
//  ESQUELETO / KEYPOINTS VISUAIS
// =============================================================
function drawSkeleton() {
  let kp = getPlayerKeypoints();
  if (!kp) return;

  stroke(255, 255, 255, 100);
  strokeWeight(2);
  for (let [a, b] of SKELETON_CONNECTIONS) {
    let pa = kp[a], pb = kp[b];
    if (pa && pb && pa.confidence > 0.2 && pb.confidence > 0.2) {
      line(pa.x, pa.y, pb.x, pb.y);
    }
  }

  // Contorno da area da cara (nariz/olhos/orelhas), sem preenchimento.
  let nose = kp[0], le = kp[1], re = kp[2], lear = kp[3], rear = kp[4], ls = kp[5], rs = kp[6];
  if (nose && ls && rs && nose.confidence > 0.2 && ls.confidence > 0.2 && rs.confidence > 0.2) {
    let shoulderW = abs(rs.x - ls.x);
    let nearCamera = getCameraProximity(kp);

    let eyeSpan = 0;
    if (le && re && le.confidence > 0.2 && re.confidence > 0.2) {
      eyeSpan = abs(re.x - le.x);
    }

    let earSpan = 0;
    if (lear && rear && lear.confidence > 0.2 && rear.confidence > 0.2) {
      earSpan = abs(rear.x - lear.x);
    }

    // Combina varias referencias e aumenta o limite maximo quando a camara esta perto.
    let faceW = max(earSpan * 0.95, eyeSpan * 2.6, shoulderW * 0.36);
    let maxFaceW = lerp(120, 220, nearCamera);
    faceW = constrain(faceW, 42, maxFaceW);
    let faceH = faceW * 1.22;

    let cx = nose.x;
    if (le && re && le.confidence > 0.2 && re.confidence > 0.2) {
      cx = (nose.x + le.x + re.x) / 3;
    }
    let cy = nose.y + faceH * 0.12;

    noFill();
    stroke(100, 220, 255, 210);
    strokeWeight(3);
    ellipse(cx, cy, faceW, faceH);
    strokeWeight(2);
  }

  // Pontos dos keypoints
  noStroke();
  for (let i = 0; i < kp.length; i++) {
    let p = kp[i];
    if (i <= 4) continue; // keypoints da face substituidos pelo oval
    if (p.confidence > 0.2) {
      fill(100, 220, 255, 200);
      circle(p.x, p.y, 8);
    }
  }

  // Pontos extra nas maos (sinteticos) para ficar mais visivel.
  drawExtraHandPoints(kp[9]);
  drawExtraHandPoints(kp[10]);
}

function drawExtraHandPoints(wrist) {
  if (!wrist || wrist.confidence < 0.2) return;

  fill(100, 220, 255, 210);
  noStroke();

  // Cruz + diagonais ao redor do pulso.
  let offsets = [
    [0, 0],
    [10, 0],
    [-10, 0],
    [0, 10],
    [0, -10],
    [7, 7],
    [-7, 7],
    [7, -7],
    [-7, -7],
  ];

  for (let [ox, oy] of offsets) {
    circle(wrist.x + ox, wrist.y + oy, 6);
  }
}

// =============================================================
//  HUD  (tempo atual + vidas)
// =============================================================
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

// =============================================================
//  ECRA DE MORTE
// =============================================================
function drawDeadScreen() {
  drawSkeleton();

  fill(0, 0, 0, 210);
  noStroke();
  rect(0, 0, width, height);

  // Titulo
  fill(COL_HIT);
  textAlign(CENTER, CENTER);
  textSize(52);
  text("GAME OVER", width / 2, height / 2 - 100);

  // Tempos
  fill(COL_TEXT);
  textSize(28);
  text("Tempo desta tentativa: " + nf(elapsedTime, 1, 1) + "s", width / 2, height / 2 - 30);
  text("Recorde:               " + nf(recordTime, 1, 1) + "s", width / 2, height / 2 + 20);

  // Destaque se foi novo recorde
  if (elapsedTime > 0 && elapsedTime >= recordTime) {
    fill(255, 220, 50);
    textSize(22);
    text("Novo Recorde! Parabens!", width / 2, height / 2 + 70);
  }

  // Instrucoes de repeticao
  // Barra T-Pose para reiniciar
  drawTposeProgressBar(width / 2, height / 2 + 118);

  fill(COL_TEXT);
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Prima ESPACO para reiniciar  |  I para voltar ao inicio", width / 2, height / 2 + 176);
}

// =============================================================
//  INICIO / FIM DE JOGO
// =============================================================
function startGame() {
  if (!modelReady) {
    gameState = "loading";
    modelLoadError = "Modelo ainda nao esta pronto. Aguarda ou prima R para tentar novamente.";
    return;
  }

  gameState       = "playing";
  lives           = MAX_LIVES;
  obstacles       = [];
  spawnTimer      = 0;
  hitCooldown     = 0;
  difficultyLevel = 1;
  startTime       = millis();
  elapsedTime     = 0;
}

function endGame() {
  gameState = "dead";
  // Guarda recorde se esta tentativa foi a melhor
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
//  INPUT DE TECLADO
// =============================================================
function keyPressed() {
  if ((key === "r" || key === "R") && gameState === "loading") {
    initBodyPoseModel();
    return;
  }

  if (key === " ") {
    if (gameState === "dead" || gameState === "start") {
      tposeTimer = 0;
      startGame();
    }
  }
  if ((key === "i" || key === "I") && gameState === "dead") {
    tposeTimer = 0;
    gameState = "start";
  }
}

// =============================================================
//  DETECAO DE T-POSE
// =============================================================
function isTpose() {
  let kp = getPlayerKeypoints();
  if (!kp) return false;
  let ls = kp[5], rs = kp[6];   // ombros
  let lw = kp[9], rw = kp[10];  // pulsos

  if (!ls || !rs || !lw || !rw) return false;
  if (ls.confidence < 0.3 || rs.confidence < 0.3) return false;
  if (lw.confidence < 0.3 || rw.confidence < 0.3) return false;

  let shoulderW = abs(rs.x - ls.x);
  if (shoulderW < 50) return false;

  // Pulsos esticados para fora dos ombros (pelo menos 25% da largura dos ombros)
  let leftExtended  = lw.x < ls.x - shoulderW * 0.25;
  let rightExtended = rw.x > rs.x + shoulderW * 0.25;

  // Pulsos aproximadamente ao nivel dos ombros (tolerancia 80px)
  let leftLevel  = abs(lw.y - ls.y) < 80;
  let rightLevel = abs(rw.y - rs.y) < 80;

  return leftExtended && rightExtended && leftLevel && rightLevel;
}
