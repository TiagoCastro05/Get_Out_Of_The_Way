// PARTE 1: Webcam + HandPose (captura e deteccao)
let video;
let handposeModel;
let predictions = [];

// PARTE 2: Cursor controlado pela mao
let player = {
  x: 320,
  y: 240,
  radius: 30,
  hasHand: false,
};

// PARTE 3: Logica de jogo (estado, score, tempo)
let gameState = "loading"; // loading | ready | playing | finished
let score = 0;
let bestScore = 0;
let gameDuration = 60;
let startTime = 0;
let remainingTime = gameDuration;

// PARTE 4: Objetos aleatorios e colisoes
let items = [];
let spawnCounter = 0;
let spawnIntervalFrames = 22;
let maxItems = 16;

let goodColor;
let badColor;

function setup() {
  createCanvas(960, 540);
  textFont("Trebuchet MS");

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  goodColor = color(78, 226, 143);
  badColor = color(240, 88, 88);

  setupHandPose();
}

function draw() {
  drawMirroredVideo();
  updatePlayerFromHand();

  switch (gameState) {
    case "loading":
      drawOverlay("A carregar modelo HandPose...");
      break;
    case "ready":
      drawReadyScreen();
      drawPlayer();
      break;
    case "playing":
      updateGame();
      drawItems();
      drawPlayer();
      drawHud();
      break;
    case "finished":
      drawItems();
      drawPlayer();
      drawHud();
      drawFinishedScreen();
      break;
  }
}

function setupHandPose() {
  handposeModel = ml5.handpose(video, () => {
    gameState = "ready";
  });

  handposeModel.on("predict", (results) => {
    predictions = results;
  });
}

function drawMirroredVideo() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  fill(0, 110);
  noStroke();
  rect(0, 0, width, height);
}

function updatePlayerFromHand() {
  if (predictions.length > 0) {
    // Use index fingertip for direct and intuitive control.
    let indexTip = predictions[0].landmarks[8];
    let targetX = width - indexTip[0];
    let targetY = indexTip[1];

    // Smooth movement to reduce jitter from camera noise.
    player.x = lerp(player.x, targetX, 0.35);
    player.y = lerp(player.y, targetY, 0.35);
    player.hasHand = true;
  } else {
    player.hasHand = false;
  }

  player.x = constrain(player.x, player.radius, width - player.radius);
  player.y = constrain(player.y, player.radius, height - player.radius);
}

function updateGame() {
  remainingTime = max(0, gameDuration - floor((millis() - startTime) / 1000));

  if (remainingTime === 0) {
    finishGame();
    return;
  }

  spawnCounter++;
  if (spawnCounter >= spawnIntervalFrames) {
    spawnCounter = 0;
    if (items.length < maxItems) {
      items.push(createRandomItem());
    }
  }

  for (let i = items.length - 1; i >= 0; i--) {
    let item = items[i];
    item.y += item.speed;

    if (isColliding(player, item)) {
      if (item.type === "good") {
        score += 10;
      } else {
        score = max(0, score - 8);
      }
      items.splice(i, 1);
      continue;
    }

    if (item.y - item.radius > height) {
      if (item.type === "good") {
        score = max(0, score - 2);
      }
      items.splice(i, 1);
    }
  }
}

function drawItems() {
  for (let item of items) {
    noStroke();
    fill(item.type === "good" ? goodColor : badColor);
    circle(item.x, item.y, item.radius * 2);

    fill(18, 18, 18, 110);
    textAlign(CENTER, CENTER);
    textSize(14);
    text(item.type === "good" ? "+" : "!", item.x, item.y + 1);
  }
}

function drawPlayer() {
  noFill();
  strokeWeight(4);
  stroke(player.hasHand ? color(255, 240, 120) : color(200, 200, 200));
  circle(player.x, player.y, player.radius * 2);

  noStroke();
  fill(255, 245, 175, 200);
  circle(player.x, player.y, player.radius * 0.6);
}

function drawHud() {
  fill(15, 15, 15, 180);
  noStroke();
  rect(14, 14, 340, 110, 12);

  fill(255);
  textAlign(LEFT, TOP);
  textSize(22);
  text("Get Out Of The Way", 26, 24);

  textSize(18);
  text("Pontos: " + score, 26, 56);
  text("Tempo: " + remainingTime + "s", 140, 56);
  text("Melhor: " + bestScore, 248, 56);

  textSize(14);
  text(player.hasHand ? "Mao detetada" : "Aponte a mao para a webcam", 26, 88);
}

function drawReadyScreen() {
  drawOverlay("Treino Cognitivo e Motor");

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(28);
  text(
    "Use a ponta do dedo indicador para mexer o circulo.",
    width / 2,
    height / 2 - 40,
  );

  textSize(22);
  text(
    "Apanhe bolas verdes (+10) e evite bolas vermelhas (-8).",
    width / 2,
    height / 2,
  );
  text(
    "Tem 60 segundos. Prima ESPACO para comecar.",
    width / 2,
    height / 2 + 42,
  );

  textSize(18);
  text(
    "Implementacao por partes: Webcam -> Mao -> Objetos -> Pontuacao/Tempo",
    width / 2,
    height / 2 + 80,
  );
}

function drawFinishedScreen() {
  fill(0, 180);
  noStroke();
  rect(0, 0, width, height);

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(44);
  text("Tempo terminado!", width / 2, height / 2 - 80);

  textSize(30);
  text("Pontuacao final: " + score, width / 2, height / 2 - 20);
  text("Melhor pontuacao: " + bestScore, width / 2, height / 2 + 20);

  textSize(22);
  text("Prima R para repetir", width / 2, height / 2 + 80);
}

function drawOverlay(label) {
  fill(0, 160);
  noStroke();
  rect(0, 0, width, height);

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(36);
  text(label, width / 2, height / 2 - 100);
}

function createRandomItem() {
  // Controlled randomness: 70% good, 30% distractor.
  let isGood = random() < 0.7;
  return {
    type: isGood ? "good" : "bad",
    x: random(35, width - 35),
    y: -20,
    radius: random(16, 24),
    speed: random(2.1, 4.1),
  };
}

function isColliding(a, b) {
  return dist(a.x, a.y, b.x, b.y) < a.radius + b.radius;
}

function startGame() {
  gameState = "playing";
  score = 0;
  remainingTime = gameDuration;
  items = [];
  spawnCounter = 0;
  startTime = millis();
}

function finishGame() {
  gameState = "finished";
  bestScore = max(bestScore, score);
}

function keyPressed() {
  if (key === " " && gameState === "ready") {
    if (!player.hasHand) {
      return;
    }
    startGame();
  }

  if ((key === "r" || key === "R") && gameState === "finished") {
    startGame();
  }
}
