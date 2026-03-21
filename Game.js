// =============================================================
//  GET OUT OF THE WAY  -  Treino Cognitivo e Motor
//  Utiliza p5.js + ml5 PoseNet para detetar a pose
//  corporal em tempo real atraves da Webcam.
// =============================================================

// -- WEBCAM & POSE MODEL --------------------------------------
let video;
let bodypose;
let poses = [];

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

// -- T-POSE ---------------------------------------------------
const TPOSE_HOLD_FRAMES = 42;
let tPoseHoldCounter = 0;

// -- TRACKING -------------------------------------------------
// Sistema simplificado: mantém histórico dos keypoints para interpolação
const KEYPOINT_HISTORY = 20; // frames de memória
let keypointHistory = []; // Array de poses anteriores

const FACE_CONTOUR_HOLD = 12;
let lastFaceContour = null;

// -- ALERTAS --------------------------------------------------
const TOP_WARNING_FRAMES = 38;

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
let imgBlockArmKnife;
let imgBlockLegKnife;
let imgPoseInicial;

// =============================================================
//  HELPERS GERAIS
// =============================================================
function getScreenZones() {
  return {
    headMaxY: height / 3,
    torsoMaxY: (height / 3) * 2,
  };
}

function isVisible(p, minConfidence = 0.2) {
  return (
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.confidence) &&
    p.confidence > minConfidence
  );
}

function pointInRect(px, py, minX, minY, maxX, maxY) {
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  let den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (abs(den) < 1e-6) return false;

  let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  let u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
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

// =============================================================
//  PRELOAD
// =============================================================
function preload() {
  imgKnife = loadImage(
    "Imagens/Knife.png",
    () => {},
    () => {
      imgKnife = null;
    },
  );

  imgBullet = loadImage(
    "Imagens/Bullet.png",
    () => {},
    () => {
      imgBullet = null;
    },
  );

  imgHeart = loadImage(
    "Imagens/Heart.png",
    () => {},
    () => {
      imgHeart = null;
    },
  );

  imgShield = loadImage(
    "Imagens/escudo.png",
    () => {},
    () => {
      imgShield = null;
    },
  );

  imgBlockArmKnife = loadImage(
    "Imagens/bloquear_faca_braco.png",
    () => {},
    () => {
      imgBlockArmKnife = null;
    },
  );

  imgBlockLegKnife = loadImage(
    "Imagens/bloquear_faca_perna.png",
    () => {},
    () => {
      imgBlockLegKnife = null;
    },
  );

  imgPoseInicial = loadImage(
    "Imagens/pose_inicial.png",
    () => {},
    () => {
      imgPoseInicial = null;
    },
  );
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
  // Extrair e normalizar os keypoints
  poses = (results || []).map((r) => {
    let keypoints = [];
    let source = null;

    // Encontrar a fonte dos keypoints (pode variar entre versões de ml5)
    if (r && r.pose && Array.isArray(r.pose.keypoints)) {
      source = r.pose.keypoints;
    } else if (r && Array.isArray(r.keypoints)) {
      source = r.keypoints;
    }

    if (source) {
      keypoints = source.map((k) => ({
        x: k.position?.x ?? k.x ?? null,
        y: k.position?.y ?? k.y ?? null,
        confidence: k.score ?? k.confidence ?? 0,
      }));
    }

    return { keypoints };
  });

  // Manter histórico para interpolação
  if (poses.length > 0 && poses[0].keypoints.length > 0) {
    keypointHistory.push(JSON.parse(JSON.stringify(poses[0].keypoints)));
    if (keypointHistory.length > KEYPOINT_HISTORY) {
      keypointHistory.shift();
    }
  }
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
  text(
    "Por favor aguarde e permita o acesso a webcam.",
    width / 2,
    height / 2 + 50,
  );
}

// =============================================================
//  ECRA INICIAL
// =============================================================
function drawStartScreen() {
  updateTPoseSyncStart();
  drawSkeleton();

  let topY = 78;
  let panelH = min(height * 0.66, 430);
  let leftW = min(width * 0.32, 360);
  let rightW = min(width * 0.28, 340);
  let margin = max(26, width * 0.05);

  let leftX = margin;
  let leftY = topY;
  let rightX = width - margin - rightW;
  let rightY = topY;

  noStroke();

  textAlign(CENTER, TOP);
  textSize(28);
  text("GET OUT OF THE WAY", width / 2, 24);

  // ======= PAINEL ESQUERDO: Metodos de bloqueio ========
  fill(12, 22, 34, 215);
  rect(leftX, leftY, leftW, panelH, 14);

  fill(170, 220, 245);
  textSize(25);
  textAlign(LEFT, TOP);
  text("BLOQUEAR COM:", leftX + 16, leftY + 12);

  // Bloqueio com braço
  fill(24, 40, 58, 230);
  noStroke();
  let armBoxH = 120;
  rect(leftX + 12, leftY + 40, leftW - 24, armBoxH, 8);

  fill(COL_TEXT);
  textSize(20);
  textAlign(CENTER, TOP);
  text("Braço", leftX + leftW / 2, leftY + 40);

  if (imgBlockArmKnife) {
    push();
    imageMode(CENTER);
    image(
      imgBlockArmKnife,
      leftX + leftW / 2,
      leftY + 40 + armBoxH / 2 + 4,
      130,
      90,
    );
    pop();
  }

  // Bloqueio com perna
  fill(24, 40, 58, 230);
  noStroke();
  let legBoxY = leftY + 40 + armBoxH + 5;
  rect(leftX + 12, legBoxY, leftW - 24, armBoxH, 8);

  fill(COL_TEXT);
  textSize(20);
  textAlign(CENTER, TOP);
  text("Perna", leftX + leftW / 2, legBoxY + 6);

  if (imgBlockLegKnife) {
    push();
    imageMode(CENTER);
    image(
      imgBlockLegKnife,
      leftX + leftW / 2,
      legBoxY + armBoxH / 2 + 15,
      90,
      90,
    );
    pop();
  }

  // Bala - mantém o padrão antigo
  fill(24, 40, 58, 230);
  noStroke();
  let bulletBoxY = legBoxY + armBoxH + 10;
  rect(leftX + 12, bulletBoxY, leftW - 24, armBoxH, 8);

  let iconX = leftX + leftW / 2 - 20;
  let iconY = bulletBoxY + armBoxH / 2;

  fill(COL_TEXT);
  textSize(20);
  textAlign(CENTER, TOP);
  text("Bala", leftX + leftW / 2, bulletBoxY + 6);

  // Desenha a bala (imagem ou fallback)
  if (imgBullet) {
    push();
    imageMode(CENTER);
    image(imgBullet, iconX, iconY, 42, 42);
    pop();
  } else {
    fill(255, 215, 0);
    noStroke();
    circle(iconX, iconY, 20);
  }

  // Escudo com X
  drawShieldBadge(leftX + leftW / 2 + 20, iconY, false);

  // ======= PAINEL DIREITO: Info do jogo ========
  fill(14, 28, 42, 215);
  rect(rightX, rightY, rightW, panelH, 14);

  fill(170, 220, 245);
  textSize(25);
  textAlign(LEFT, TOP);
  text("OBJETIVO", rightX + 14, rightY + 14);

  fill(COL_TEXT);
  textSize(20);
  text("Sobrevive o máximo", rightX + 14, rightY + 50);
  text("de tempo possível", rightX + 14, rightY + 70);

  // Vidas
  fill(170, 220, 245);
  textSize(20);
  text("VIDAS: 3", rightX + 14, rightY + 100);

  // Iniciar
  fill(170, 220, 245);
  textSize(20);
  textAlign(LEFT, TOP);
  text("INICIAR:", rightX + 14, rightY + 140);

  fill(COL_TEXT);
  textSize(20);
  textAlign(LEFT, TOP);
  text("1. Levanta os bra\u00e7os 30º/45º", rightX + 14, rightY + 165);
  text("2. Espera a barra encher", rightX + 14, rightY + 185);

  // Imagem pose inicial
  if (imgPoseInicial) {
    push();
    imageMode(CENTER);
    image(imgPoseInicial, rightX + rightW / 2, rightY + panelH - 150, 120, 130);
    pop();
  }

  fill(190, 230, 245);
  textSize(20);
  textAlign(CENTER, TOP);
  text("Ou prima ESPAÇO", rightX + rightW / 2, rightY + panelH - 60);

  drawTPoseBar();
}

function drawRuleExampleRow(x, y, w, h, objType, shieldOk) {
  // Função obsoleta - preservada para compatibilidade
  fill(24, 40, 58, 230);
  noStroke();
  rect(x, y, w, h, 10);

  let iconX = shieldOk === null ? x + w * 0.5 : x + w * 0.5 - 24;
  let iconY = y + h * 0.5;

  drawRuleObjectIcon(iconX, iconY, objType);

  if (shieldOk !== null) {
    drawShieldBadge(x + w * 0.5 + 24, iconY, shieldOk);
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

  // A-POSE: braços levantados em ângulo ~45º
  let armAngle = radians(45);
  let armX = armLen * sin(armAngle);
  let armY = -armLen * cos(armAngle);

  line(0, -torsoH * 0.45, -armX, -torsoH * 0.45 + armY);
  line(0, -torsoH * 0.45, armX, -torsoH * 0.45 + armY);

  line(0, torsoH * 0.2, -legLen * 0.55, torsoH * 0.2 + legLen);
  line(0, torsoH * 0.2, legLen * 0.55, torsoH * 0.2 + legLen);

  pop();
}

// Silhueta do jogador mostrando posição ideal durante o jogo
function drawPlayerSilhouette(cx, cy, size) {
  push();
  translate(cx, cy);
  stroke(180, 240, 255, 120); // Semitransparente
  strokeWeight(2.5);
  strokeCap(ROUND);
  noFill();

  let headR = size * 0.11;
  let torsoH = size * 0.33;
  let armLen = size * 0.34;
  let legLen = size * 0.24;

  // Cabeça
  circle(0, -torsoH * 0.86, headR * 2);
  // Torso
  line(0, -torsoH * 0.7, 0, torsoH * 0.2);

  // A-POSE: braços levantados em ângulo ~45º
  let armAngle = radians(45);
  let armX = armLen * sin(armAngle);
  let armY = -armLen * cos(armAngle);

  line(0, -torsoH * 0.45, -armX, -torsoH * 0.45 + armY);
  line(0, -torsoH * 0.45, armX, -torsoH * 0.45 + armY);

  // Pernas
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

// =============================================================
//  T-POSE
// =============================================================
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
  push();
  noStroke();

  let w = 320;
  let h = 14;
  let x = width / 2 - w / 2;
  let y = height - 30;
  let pct = constrain(tPoseHoldCounter / TPOSE_HOLD_FRAMES, 0, 1);

  // Fundo da barra
  fill(25, 35, 45, 220);
  rect(x, y, w, h, 8);

  // Barra de progresso
  fill(100, 230, 255, 240);
  rect(x, y, w * pct, h, 8);

  pop();
}

// =============================================================
//  T-POSE DETECTION - REFAZIDO DO ZERO
// =============================================================
// Requisitos:
// 1. Braços abertos para os lados (horizontalmente)
// 2. Mãos longe dos ombros (alcance lateral)
// 3. Corpo ereto (ombros acima das ancas)

function isTPose(kp) {
  // Verificar se temos os pontos críticos (com threshold MUITO baixo)
  let ls = kp[5],
    rs = kp[6]; // Ombros
  let lw = kp[9],
    rw = kp[10]; // Pulsos
  let lh = kp[11],
    rh = kp[12]; // Ancas

  const SHOULDER_CONF = 0.05; // MUITO baixo para funcionar com corpo longe
  const WRIST_CONF = 0.03; // MUITO baixo para pulsos (podem ter confiance basicamente 0 longe)
  const HIP_CONF = 0.05; // MUITO baixo para ancas

  if (
    !isVisible(ls, SHOULDER_CONF) ||
    !isVisible(rs, SHOULDER_CONF) ||
    !isVisible(lw, WRIST_CONF) ||
    !isVisible(rw, WRIST_CONF) ||
    !isVisible(lh, HIP_CONF) ||
    !isVisible(rh, HIP_CONF)
  ) {
    return false;
  }

  // VERIFICAÇÃO 1: Corpo ereto (ancas abaixo dos ombros)
  let shoulderMidY = (ls.y + rs.y) * 0.5;
  let hipMidY = (lh.y + rh.y) * 0.5;
  let bodyUpright = hipMidY > shoulderMidY + 30; // Reduzido de 40px para 30px

  if (!bodyUpright) return false;

  // VERIFICAÇÃO 2: Braços abertos (pulsos longe dos ombros)
  // Agora aceitamos braços menos abertos (relaxados/dobrados também contam)
  let leftWristDistance = abs(lw.x - ls.x);
  let rightWristDistance = abs(rw.x - rs.x);

  const MIN_ARM_REACH = 40; // Reduzido de 60px para 40px (aceita braços dobrados)
  let armsOpen =
    leftWristDistance > MIN_ARM_REACH && rightWristDistance > MIN_ARM_REACH;

  if (!armsOpen) return false;

  // VERIFICAÇÃO 3: Pulsos num intervalo de altura razoável
  // Aceita pulsos acima, ao lado ou ligeiramente abaixo dos ombros
  let leftWristVertical = abs(lw.y - ls.y) < 200; // Aumentado de 150px para 200px
  let rightWristVertical = abs(rw.y - rs.y) < 200; // Aceita mais variação

  return leftWristVertical && rightWristVertical;
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

    if (hitCooldown === 0) {
      let collisionResult = checkCollision(ob);

      if (collisionResult === "blocked") {
        // Obst\u00e1culo foi bloqueado com sucesso! Remove sem causar dano
        obstacles.splice(i, 1);
        continue;
      } else if (collisionResult === true) {
        // Colis\u00e3o com o corpo! Causa dano e remove
        loseLife();
        obstacles.splice(i, 1);

        if (gameState === "dead") {
          return;
        }
        continue;
      }
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

  let bgCol =
    ob.type === "bullet"
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

// =============================================================
//  COLISOES
// =============================================================
// =============================================================
//  COLLISION DETECTION - REFAZIDO DO ZERO
// =============================================================
// Lógica simples:
// 1. Braços podem bloquear facas do meio (zona torso/cabeça)
// 2. Pernas podem bloquear facas de baixo (zona pernas)
// 3. Resto do corpo sofre colisão

function checkCollision(ob) {
  if (poses.length === 0) return false;

  let kp = poses[0].keypoints;
  if (!kp || kp.length < 17) return false;

  let hitPad = 16; // Zona de detecção ao redor do obstáculo
  let minX = ob.x - ob.w - hitPad;
  let maxX = ob.x + ob.w + hitPad;
  let minY = ob.y - ob.h - hitPad;
  let maxY = ob.y + ob.h + hitPad;

  // TENTATIVA 1: Bloquear com os braços (antebraços)
  if (ob.type === "knife" && ob.dir === "right") {
    if (canArmBlock(kp, minX, maxX, minY, maxY)) {
      // Braço bloqueou com sucesso! Remove o obstáculo
      return "blocked";
    }
  }

  // TENTATIVA 2: Bloquear com as pernas
  if (ob.dir === "right" && ob.zone === "legs") {
    if (canLegBlock(kp, minX, maxX, minY, maxY)) {
      // Perna bloqueou com sucesso! Remove o obstáculo
      return "blocked";
    }
  }

  // TENTATIVA 3: Verificar colisão com o tronco (para obstáculos de lado)
  if (ob.dir === "right" && ob.zone !== "legs") {
    if (canTorsoBlock(kp, minX, maxX, minY, maxY)) {
      // Tronco foi atingido!
      return true;
    }
  }

  // TENTATIVA 4: Verificar colisão com a coxa (metade de cima das pernas)
  if (ob.dir === "right" && ob.zone !== "legs") {
    if (canUpperLegBlock(kp, minX, maxX, minY, maxY)) {
      // Coxa foi atingida!
      return true;
    }
  }

  // FALLBACK: Verificar colisão com todo o corpo
  return hasBodyCollision(kp, minX, maxX, minY, maxY);
}

// Braços podem bloquear: usa os antebraços (cotovelo->pulso)
function canArmBlock(kp, minX, maxX, minY, maxY) {
  const ARM_CONF = 0.03; // MUITO baixo para braços

  let le = kp[7],
    lw = kp[9]; // Cotovelo esq, Pulso esq
  let re = kp[8],
    rw = kp[10]; // Cotovelo dir, Pulso dir

  // Braço esquerdo: linha do cotovelo ao pulso
  if (isVisible(le, ARM_CONF) && isVisible(lw, ARM_CONF)) {
    if (lineIntersectsRect(le.x, le.y, lw.x, lw.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  // Braço direito: linha do cotovelo ao pulso
  if (isVisible(re, ARM_CONF) && isVisible(rw, ARM_CONF)) {
    if (lineIntersectsRect(re.x, re.y, rw.x, rw.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  return false;
}

// Pernas podem bloquear: usa as canelas (joelho->tornozelo)
function canLegBlock(kp, minX, maxX, minY, maxY) {
  const LEG_CONF = 0.05; // MUITO baixo para pernas

  let lk = kp[13],
    la = kp[15]; // Joelho esq, Tornozelo esq
  let rk = kp[14],
    ra = kp[16]; // Joelho dir, Tornozelo dir

  // Perna esquerda: linha do joelho ao tornozelo
  if (isVisible(lk, LEG_CONF) && isVisible(la, LEG_CONF)) {
    if (lineIntersectsRect(lk.x, lk.y, la.x, la.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  // Perna direita: linha do joelho ao tornozelo
  if (isVisible(rk, LEG_CONF) && isVisible(ra, LEG_CONF)) {
    if (lineIntersectsRect(rk.x, rk.y, ra.x, ra.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  return false;
}

// Verificar colisão com corpo todo (se não conseguiu bloquear)
// Verifica colisão com o tronco (linhas entre ombros-ancas)
function canTorsoBlock(kp, minX, maxX, minY, maxY) {
  const TORSO_CONF = 0.05;

  let ls = kp[5],
    rs = kp[6]; // Ombros
  let lh = kp[11],
    rh = kp[12]; // Ancas

  // Verifica linhas do tronco
  if (isVisible(ls, TORSO_CONF) && isVisible(lh, TORSO_CONF)) {
    if (lineIntersectsRect(ls.x, ls.y, lh.x, lh.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  if (isVisible(rs, TORSO_CONF) && isVisible(rh, TORSO_CONF)) {
    if (lineIntersectsRect(rs.x, rs.y, rh.x, rh.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  // Linha horizontal entre ombros
  if (isVisible(ls, TORSO_CONF) && isVisible(rs, TORSO_CONF)) {
    if (lineIntersectsRect(ls.x, ls.y, rs.x, rs.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  // Linha horizontal entre ancas
  if (isVisible(lh, TORSO_CONF) && isVisible(rh, TORSO_CONF)) {
    if (lineIntersectsRect(lh.x, lh.y, rh.x, rh.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  return false;
}

// Verifica colisão com a coxa (metade de cima das pernas - entre anca e joelho)
function canUpperLegBlock(kp, minX, maxX, minY, maxY) {
  const LEG_CONF = 0.05;

  let lh = kp[11],
    lk = kp[13]; // Anca esq, Joelho esq
  let rh = kp[12],
    rk = kp[14]; // Anca dir, Joelho dir

  // Coxa esquerda: linha entre anca e joelho
  if (isVisible(lh, LEG_CONF) && isVisible(lk, LEG_CONF)) {
    if (lineIntersectsRect(lh.x, lh.y, lk.x, lk.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  // Coxa direita: linha entre anca e joelho
  if (isVisible(rh, LEG_CONF) && isVisible(rk, LEG_CONF)) {
    if (lineIntersectsRect(rh.x, rh.y, rk.x, rk.y, minX, minY, maxX, maxY)) {
      return true;
    }
  }

  return false;
}

function hasBodyCollision(kp, minX, maxX, minY, maxY) {
  const BODY_CONF = 0.05; // MUITO baixo

  // Pontos principais do corpo
  let criticalPoints = [
    0, // Nariz
    5,
    6, // Ombros
    11,
    12, // Ancas
    7,
    8, // Cotovelos
    13,
    14, // Joelhos
  ];

  for (let idx of criticalPoints) {
    let p = kp[idx];
    if (isVisible(p, BODY_CONF)) {
      if (pointInRect(p.x, p.y, minX, minY, maxX, maxY)) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================
//  ESQUELETO - REFAZIDO DO ZERO
// =============================================================
// Renderiza apenas o esqueleto básico com thresholds adequados

function drawSkeleton() {
  if (poses.length === 0) return;

  let kp = poses[0].keypoints;
  if (!kp || kp.length < 17) return;

  stroke(120, 230, 255, 210);
  strokeWeight(5);
  strokeCap(ROUND);

  // Torso (pode ter confiança baixa quando corpo está longe)
  drawLimb(kp[5], kp[6], 0.05); // Ombro esq -> Ombro dir
  drawLimb(kp[5], kp[11], 0.05); // Ombro esq -> Anca esq
  drawLimb(kp[6], kp[12], 0.05); // Ombro dir -> Anca dir
  drawLimb(kp[11], kp[12], 0.05); // Anca esq -> Anca dir

  // Cabeça
  drawLimb(kp[0], kp[5], 0.05); // Nariz -> Ombro esq
  drawLimb(kp[0], kp[6], 0.05); // Nariz -> Ombro dir

  // Braços (muito baixo - podem ter confiance quase 0 longe)
  drawLimb(kp[5], kp[7], 0.02); // Ombro esq -> Cotovelo esq
  drawLimb(kp[7], kp[9], 0.02); // Cotovelo esq -> Pulso esq
  drawLimb(kp[6], kp[8], 0.02); // Ombro dir -> Cotovelo dir
  drawLimb(kp[8], kp[10], 0.02); // Cotovelo dir -> Pulso dir

  // Pernas (baixo mas um pouco mais alto que braços)
  drawLimb(kp[11], kp[13], 0.05); // Anca esq -> Joelho esq
  drawLimb(kp[13], kp[15], 0.05); // Joelho esq -> Tornozelo esq
  drawLimb(kp[12], kp[14], 0.05); // Anca dir -> Joelho dir
  drawLimb(kp[14], kp[16], 0.05); // Joelho dir -> Tornozelo dir

  // Desenhar junções (pontos)
  drawJoint(kp[0], 0.05); // Nariz
  drawJoint(kp[5], 0.05); // Ombro esq
  drawJoint(kp[6], 0.05); // Ombro dir
  drawJoint(kp[7], 0.02); // Cotovelo esq
  drawJoint(kp[8], 0.02); // Cotovelo dir
  drawJoint(kp[9], 0.02); // Pulso esq
  drawJoint(kp[10], 0.02); // Pulso dir
  drawJoint(kp[11], 0.05); // Anca esq
  drawJoint(kp[12], 0.05); // Anca dir
  drawJoint(kp[13], 0.05); // Joelho esq
  drawJoint(kp[14], 0.05); // Joelho dir
  drawJoint(kp[15], 0.05); // Tornozelo esq
  drawJoint(kp[16], 0.05); // Tornozelo dir

  // Contorno facial
  drawFaceContour(kp);
}

// Desenha linha entre dois keypoints
function drawLimb(a, b, minConf) {
  if (isVisible(a, minConf) && isVisible(b, minConf)) {
    line(a.x, a.y, b.x, b.y);
  }
}

// Desenha um ponto (junta)
function drawJoint(p, minConf) {
  if (!isVisible(p, minConf)) return;

  noStroke();
  fill(180, 245, 255, 200);
  circle(p.x, p.y, 8);

  stroke(120, 230, 255, 210);
  strokeWeight(5);
  strokeCap(ROUND);
}

function drawFaceContour(kp) {
  let nose = kp[0];
  let leftEye = kp[1],
    rightEye = kp[2];
  let leftEar = kp[3],
    rightEar = kp[4];
  let ls = kp[5],
    rs = kp[6];

  let hasNose = isVisible(nose, 0.12);
  let hasEyes = isVisible(leftEye, 0.1) && isVisible(rightEye, 0.1);
  let hasEars = isVisible(leftEar, 0.08) && isVisible(rightEar, 0.08);
  let hasShoulders = isVisible(ls, 0.1) && isVisible(rs, 0.1);

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
//  TRACKING
// =============================================================
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

  // Desenha silhueta do jogador embaixo do timer
  drawPlayerSilhouette(310, 90, 60);

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
  text(
    "Tempo desta tentativa: " + nf(elapsedTime, 1, 1) + "s",
    width / 2,
    height / 2 - 30,
  );
  text(
    "Recorde:               " + nf(recordTime, 1, 1) + "s",
    width / 2,
    height / 2 + 20,
  );

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
