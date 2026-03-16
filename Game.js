// =============================================================
//  GET OUT OF THE WAY  -  Treino Cognitivo e Motor
//  Utiliza p5.js + ml5 BodyPose (MoveNet) para detetar a pose
//  corporal em tempo real atraves da Webcam.
// =============================================================

// -- WEBCAM & POSE MODEL --------------------------------------
let video;
let bodypose;
let poses = [];         // array de poses detetadas pelo ml5

// -- KEYPOINTS (indices MoveNet) ------------------------------
// 5=left_shoulder  6=right_shoulder
// 7=left_elbow     8=right_elbow
// 9=left_wrist    10=right_wrist
// 11=left_hip     12=right_hip
// 13=left_knee    14=right_knee
// 15=left_ankle   16=right_ankle
// 0=nose

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
  createCanvas(960, 540);
  textFont("Trebuchet MS");

  COL_KNIFE  = color(220, 210, 180);
  COL_BULLET = color(255, 215, 0);
  COL_HIT    = color(240, 60, 60);
  COL_TEXT   = color(240, 240, 240);

  // Inicia a webcam
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  // Inicializa o modelo BodyPose MoveNet (flipped espelha as coords)
  bodypose = ml5.bodyPose("MoveNet", { flipped: true }, () => {
    gameState = "start";
  });
  bodypose.detectStart(video, onPoses);
}

// Callback ml5 - actualiza o array de poses a cada frame
function onPoses(results) {
  poses = results;
}

// =============================================================
//  DRAW  (loop principal a 60fps)
// =============================================================
function draw() {
  // Fundo: espelho da webcam sempre visivel
  drawMirroredVideo();

  if (hitCooldown > 0) hitCooldown--;

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
  text("A carregar modelo BodyPose...", width / 2, height / 2);
  textSize(18);
  text("Por favor aguarde e permita o acesso a webcam.", width / 2, height / 2 + 50);
}

// =============================================================
//  ECRA INICIAL  (regras + como iniciar)
// =============================================================
function drawStartScreen() {
  // Draws the detected skeleton in the background for visual feedback
  drawSkeleton();

  // Painell de regras
  fill(0, 0, 0, 200);
  noStroke();
  rect(width / 2 - 340, 55, 680, 425, 18);

  fill(COL_TEXT);
  textAlign(CENTER, TOP);
  textSize(30);
  text("GET OUT OF THE WAY", width / 2, 74);

  textSize(16);
  textAlign(LEFT, TOP);
  let rx = width / 2 - 310;
  let ry = 124;
  let ls = 28;

  text("OBJETIVO:", rx, ry);
  text("Desvia-te o maior tempo possivel de facas e balas.", rx + 10, ry + ls);

  ry += ls * 2 + 10;
  text("MOVIMENTOS:", rx, ry);
  text("  Lateral / vertical  ->  Move o corpo para te desviares.", rx, ry + ls);
  text("  Levantar a perna  ->  Obstaculo lateral no fundo do ecra.", rx, ry + ls * 2 + 4);
  text("  Bloquear (punho acima do ombro)  ->  Desvia uma faca.", rx, ry + ls * 3 + 8);
  text("  Bala (amarela)  ->  Tens OBRIGATORIAMENTE de te desviar!", rx, ry + ls * 4 + 12);

  ry += ls * 6 + 18;
  text("VIDAS: " + MAX_LIVES + "  |  Cada colisao remove 1 vida.", rx, ry);
  text("Sobrevive o maior tempo possivel!", rx, ry + ls);

  // Texto a piscar para indicar como comecar
  textAlign(CENTER, CENTER);
  textSize(22);
  if (frameCount % 60 < 40) {
    fill(255, 230, 80);
    text("Prima ESPACO para comecar", width / 2, 508);
  }
}

// =============================================================
//  LOOP DE JOGO  (estado "playing")
// =============================================================
function updatePlaying() {
  // Tempo decorrido em segundos
  elapsedTime = (millis() - startTime) / 1000;

  // Dificuldade sobe a cada 15 segundos de sobrevivencia
  difficultyLevel = 1 + floor(elapsedTime / 15);
  spawnInterval = max(MIN_SPAWN, 90 - difficultyLevel * 8);

  // Spawn de obstaculos com intervalo controlado
  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnObstacle();
  }

  // Atualiza obstaculos, verifica colisoes e desenha-os
  updateObstacles();

  // Desenha esqueleto e keypoints do jogador
  drawSkeleton();

  // HUD: tempo e vidas
  drawHUD();
}

// =============================================================
//  SPAWN DE OBSTACULOS  (aleatoriedade controlada)
// =============================================================
function spawnObstacle() {
  // 35% chance de ser bala (nao pode ser bloqueada), 65% faca
  let isBullet = random() < 0.35;
  // 45% chance de vir de cima, 55% da direita
  let fromTop  = random() < 0.45;

  // Velocidade base cresce com a dificuldade
  let speed = random(3.5, 5.5) + difficultyLevel * 0.4;

  if (fromTop) {
    // Obstaculo vem de cima e desce verticalmente
    obstacles.push({
      type: isBullet ? "bullet" : "knife",
      dir: "top",
      x: random(60, width - 60),
      y: -30,
      vx: 0,
      vy: speed,
      w: isBullet ? 14 : 10,
      h: isBullet ? 14 : 40,
    });
  } else {
    // Obstaculo vem da direita e move-se para a esquerda
    // Se y no ultimo terce do ecra -> exige levantar a perna
    let yPos = random(80, height - 80);
    obstacles.push({
      type: isBullet ? "bullet" : "knife",
      dir: "right",
      x: width + 30,
      y: yPos,
      vx: -speed,
      vy: 0,
      w: isBullet ? 14 : 40,
      h: isBullet ? 14 : 10,
      lastThird: yPos > (height * 2) / 3, // ultimo terce -> levantar perna
    });
  }
}

// =============================================================
//  ATUALIZA E DESENHA OBSTACULOS  +  COLISAO COM POSE
// =============================================================
function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    let ob = obstacles[i];

    // Move o obstaculo
    ob.x += ob.vx;
    ob.y += ob.vy;

    // Remove se saiu do ecra
    if (ob.x < -60 || ob.y > height + 60) {
      obstacles.splice(i, 1);
      continue;
    }

    // Desenha o obstaculo
    drawObstacle(ob);

    // Verifica colisao (so se nao estiver em cooldown de hit)
    if (hitCooldown === 0 && checkCollision(ob)) {
      loseLife();
      obstacles.splice(i, 1);
      if (gameState === "dead") {
        return;
      }
      continue;
    }

    // Hint visual: levantar perna (obstaculo lateral no ultimo terce)
    if (ob.dir === "right" && ob.lastThird && ob.x < width - 60) {
      drawLegHint(ob);
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
      // Bullet.png esta orientada para a DIREITA por defeito:
      // atan2 sem offset alinha a ponta com o vetor de movimento.
      rotate(atan2(ob.vy, ob.vx));
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

  // Aviso: bala nao pode ser bloqueada
  if (ob.type === "bullet" && ob.x < width * 0.65 && ob.x > 60) {
    noStroke();
    fill(255, 80, 80, 210);
    textAlign(CENTER, BOTTOM);
    textSize(13);
    text("DESVIA!", ob.x, ob.y - (ob.h + 14));
  }
}

// =============================================================
//  HINT VISUAL - LEVANTAR PERNA
// =============================================================
function drawLegHint(ob) {
  noStroke();
  fill(255, 200, 0, 210);
  textAlign(CENTER, BOTTOM);
  textSize(14);
  text("^ LEVANTA A PERNA!", ob.x, ob.y - 22);
}

// =============================================================
//  DETECAO DE COLISAO COM A POSE DO JOGADOR
// =============================================================
function checkCollision(ob) {
  if (poses.length === 0) return false;

  let kp = poses[0].keypoints;

  // Keypoints que representam o corpo do jogador
  let bodyPoints = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

  // Faca lateral: o jogador pode bloquear com o braco levantado
  if (ob.type === "knife" && ob.dir === "right") {
    if (isBlocking(kp)) return false; // bloqueio bem-sucedido, sem dano
  }

  // Obstaculo lateral no ultimo terce: perna levantada evita colisao
  if (ob.dir === "right" && ob.lastThird) {
    if (isLegRaised(kp)) return false; // perna levantada, sem dano
  }

  // Colisao AABB simplificada com cada keypoint do corpo
  for (let idx of bodyPoints) {
    let p = kp[idx];
    if (!p || p.confidence < 0.2) continue;

    if (
      p.x > ob.x - ob.w - 14 &&
      p.x < ob.x + ob.w + 14 &&
      p.y > ob.y - ob.h - 14 &&
      p.y < ob.y + ob.h + 14
    ) {
      return true;
    }
  }
  return false;
}

// -- BLOQUEIO: punho (wrist) acima do ombro (shoulder) --------
function isBlocking(kp) {
  let lw = kp[9],  ls = kp[5];  // left wrist / left shoulder
  let rw = kp[10], rs = kp[6];  // right wrist / right shoulder

  let leftBlock  = lw && ls && lw.confidence > 0.3 && ls.confidence > 0.3 && lw.y < ls.y - 20;
  let rightBlock = rw && rs && rw.confidence > 0.3 && rs.confidence > 0.3 && rw.y < rs.y - 20;
  return leftBlock || rightBlock;
}

// -- PERNA LEVANTADA: joelho (knee) acima da anca (hip) -------
function isLegRaised(kp) {
  let lk = kp[13], lh = kp[11]; // left knee / left hip
  let rk = kp[14], rh = kp[12]; // right knee / right hip

  let leftLeg  = lk && lh && lk.confidence > 0.3 && lh.confidence > 0.3 && lk.y < lh.y - 20;
  let rightLeg = rk && rh && rk.confidence > 0.3 && rh.confidence > 0.3 && rk.y < rh.y - 20;
  return leftLeg || rightLeg;
}

// =============================================================
//  ESQUELETO / KEYPOINTS VISUAIS
// =============================================================
function drawSkeleton() {
  if (poses.length === 0) return;

  let kp = poses[0].keypoints;

  // Pares de conexoes do esqueleto
  let connections = [
    [5, 6],  [5, 7],  [7, 9],  [6, 8],  [8, 10], // bracos
    [5, 11], [6, 12], [11, 12],                   // torso
    [11, 13],[13, 15],[12, 14],[14, 16],           // pernas
    [0, 5],  [0, 6],                               // cabeca
  ];

  stroke(255, 255, 255, 100);
  strokeWeight(2);
  for (let [a, b] of connections) {
    let pa = kp[a], pb = kp[b];
    if (pa && pb && pa.confidence > 0.2 && pb.confidence > 0.2) {
      line(pa.x, pa.y, pb.x, pb.y);
    }
  }

  // Pontos dos keypoints
  noStroke();
  for (let p of kp) {
    if (p.confidence > 0.2) {
      fill(100, 220, 255, 200);
      circle(p.x, p.y, 8);
    }
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
  textSize(22);
  if (frameCount % 60 < 40) {
    fill(255, 230, 80);
    text("Prima ESPACO para tentar de novo", width / 2, height / 2 + 120);
  }
  fill(COL_TEXT);
  textSize(20);
  text("Prima I para voltar ao ecra inicial", width / 2, height / 2 + 162);
}

// =============================================================
//  INICIO / FIM DE JOGO
// =============================================================
function startGame() {
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
  // ESPACO: iniciar ou reiniciar o jogo
  if (key === " ") {
    if (gameState === "start" || gameState === "dead") {
      startGame();
    }
  }
  // I: voltar ao ecra inicial a partir do ecra de morte
  if ((key === "i" || key === "I") && gameState === "dead") {
    gameState = "start";
  }
}
