// Adiciona PoseNet para detecção corporal
let poseNet;
let poses = [];

// Altera o estado inicial do jogo
let gameState = "start"; // start | loading | ready | playing | finished
let score = 0;
let bestScore = 0;
let gameDuration = 60;
let startTime = 0;
let remainingTime = gameDuration;
let lives = 3;

// Obstáculos e colisões
let obstacles = [];
let spawnCounter = 0;
let spawnIntervalFrames = 60;

let goodColor;
let badColor;

// Jogador
let player = {
  x: 480,
  y: 270,
  radius: 30,
  hasHand: false,
};

function setup() {
  createCanvas(960, 540);
  textFont("Trebuchet MS");

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  goodColor = color(78, 226, 143);
  badColor = color(240, 88, 88);

  // Inicializa PoseNet para detecção corporal
  poseNet = ml5.poseNet(video, () => {
    console.log("PoseNet pronto!");
  });
  poseNet.on("pose", function (results) {
    poses = results;
  });

  setupHandPose();
}

function draw() {
  drawMirroredVideo();

  if (gameState === "start") {
    drawStartScreen();
    // Detecção de T-Pose para iniciar o jogo
    if (detectTPose()) {
      gameState = "loading";
    }
    return;
  }

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

// Ecrã inicial com regras e instruções
function drawStartScreen() {
  fill(0);
  textSize(40);
  textAlign(CENTER);
  text("Get out of the Way", width / 2, 80);
  textSize(22);
  textAlign(LEFT);
  text("Regras:", 50, 140);
  text("- Desvia-te dos obstáculos!", 50, 170);
  text("- Aguenta o máximo possível!", 50, 200);
  text("- Facas = Desviar/Bloquear (Dobrar braço)", 50, 230);
  text("- Balas = Desviar", 50, 260);
  text("- Saltar = Levantar Perna", 50, 290);
  textSize(22);
  textAlign(RIGHT);
  text("Como iniciar o jogo:", width - 50, 140);
  text("Levanta os braços (T-Pose)!", width - 50, 170);
}

// Detecção simples de T-Pose: ambos braços levantados
function detectTPose() {
  if (poses.length > 0) {
    let pose = poses[0].pose;
    let leftWrist = pose.leftWrist;
    let rightWrist = pose.rightWrist;
    let leftShoulder = pose.leftShoulder;
    let rightShoulder = pose.rightShoulder;
    // Verifica se ambos pulsos estão ao nível dos ombros (T-Pose)
    if (leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y) {
      return true;
    }
  }
  return false;
}

// Funções adicionais para completar o jogo
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

function drawOverlay(message) {
  fill(0);
  textSize(32);
  textAlign(CENTER);
  text(message, width / 2, height / 2);
}

function drawReadyScreen() {
  fill(0);
  textSize(32);
  textAlign(CENTER);
  text("Pronto! Clica para começar", width / 2, height / 2);
}

function drawPlayer() {
  fill(255, 200, 0);
  circle(player.x, player.y, player.radius * 2);
}

function updatePlayerFromHand() {
  if (predictions.length > 0) {
    let indexTip = predictions[0].landmarks[8];
    let targetX = width - indexTip[0];
    let targetY = indexTip[1];

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

  // Spawn de obstáculos
  spawnCounter++;
  if (spawnCounter > spawnIntervalFrames) {
    addObstacle();
    spawnCounter = 0;
  }

  // Atualiza obstáculos
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].update();
    obstacles[i].display();

    // Verifica colisão com jogador
    if (obstacles[i].collidesWith(player)) {
      lives--;
      obstacles.splice(i, 1);

      if (lives <= 0) {
        finishGame();
      }
    } else if (obstacles[i].isOffScreen()) {
      obstacles.splice(i, 1);
    }
  }
}

function addObstacle() {
  let type = random() > 0.5 ? "knife" : "bullet";
  let fromTop = random() > 0.5;
  let x, y, vx, vy;

  if (fromTop) {
    x = random(width);
    y = -30;
    vx = 0;
    vy = random(2, 5);
  } else {
    x = width + 30;
    y = random(height);
    vx = -random(2, 5);
    vy = 0;
  }

  obstacles.push(new Obstacle(x, y, vx, vy, type));
}

class Obstacle {
  constructor(x, y, vx, vy, type) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.size = 20;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
  }

  display() {
    if (this.type === "knife") {
      fill(255, 100, 100);
    } else {
      fill(255, 200, 0);
    }
    circle(this.x, this.y, this.size);
  }

  collidesWith(player) {
    let distance = dist(this.x, this.y, player.x, player.y);
    return distance < this.size / 2 + player.radius;
  }

  isOffScreen() {
    return (
      this.x < -50 ||
      this.x > width + 50 ||
      this.y < -50 ||
      this.y > height + 50
    );
  }
}

function drawItems() {
  // Já feito dentro de updateGame
}

function drawHud() {
  fill(255);
  textSize(24);
  textAlign(LEFT);
  text("Tempo: " + remainingTime + "s", 20, 30);
  text("Vidas: " + lives, 20, 60);
  text("Score: " + score, 20, 90);
}

function finishGame() {
  gameState = "finished";
  if (remainingTime > bestScore) {
    bestScore = remainingTime;
  }
}

function drawFinishedScreen() {
  fill(0, 0, 0, 200);
  rect(0, 0, width, height);

  fill(255);
  textSize(40);
  textAlign(CENTER);
  text("Game Over!", width / 2, 150);

  textSize(24);
  text("Tempo: " + remainingTime + "s", width / 2, 250);
  text("Melhor Tempo: " + bestScore + "s", width / 2, 300);
  text("Clica para voltar ao início", width / 2, 400);

  if (mouseIsPressed) {
    resetGame();
  }
}

function resetGame() {
  gameState = "start";
  score = 0;
  lives = 3;
  remainingTime = gameDuration;
  obstacles = [];
  spawnCounter = 0;
}

function mousePressed() {
  if (gameState === "ready") {
    gameState = "playing";
    startTime = millis();
    remainingTime = gameDuration;
  }
}
