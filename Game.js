// PARTE 1: Webcam + PoseNet (captura e detecção corporal)
let poseNet;
let poses = [];

// Imagens de obstáculos
let knifeImage;
let bulletImage;
let heartImage;

// Debug
let debugMode = true;
let debugButtonX = 0;
let debugButtonY = 0;
let debugButtonW = 200;
let debugButtonH = 60;

// Altera o estado inicial do jogo
let gameState = "start"; // start | playing | finished
let score = 0;
let bestScore = 0;
let elapsedTime = 0; // Tempo crescente
let startTime = 0;
let lives = 3;
let gameOverTime = 0; // Para contar 5 segundos após game over

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
};

function setup() {
  createCanvas(windowWidth, windowHeight); // Fullscreen
  textFont("Trebuchet MS");

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  goodColor = color(78, 226, 143);
  badColor = color(240, 88, 88);

  // Carrega imagens de obstáculos
  knifeImage = loadImage("./Imagens/Knife.png");
  bulletImage = loadImage("./Imagens/Bullet.png");
  heartImage = loadImage("./Imagens/Heart.png");

  // Inicializa PoseNet para detecção corporal
  poseNet = ml5.poseNet(video, () => {
    console.log("PoseNet pronto!");
  });
  poseNet.on("pose", function (results) {
    poses = results;
  });
}

function draw() {
  drawMirroredVideo();

  if (gameState === "start") {
    drawStartScreen();
    // Detecção de T-Pose para iniciar o jogo automaticamente
    if (detectTPose()) {
      gameState = "playing";
      startTime = millis();
      elapsedTime = 0;
    }
    return;
  }

  updatePlayerFromBody();

  switch (gameState) {
    case "playing":
      elapsedTime = floor((millis() - startTime) / 1000);
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
      // Verifica se já passaram 5 segundos
      if (millis() - gameOverTime > 5000) {
        resetGame();
      }
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

  // Botão de Debug
  if (debugMode) {
    drawDebugButton();
  }
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

// Atualiza posição do jogador baseada na posição do corpo

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

function drawPlayer() {
  // Desenha o corpo do jogador baseado nos pontos do PoseNet
  if (poses.length > 0) {
    let pose = poses[0].pose;

    // Cabeça
    noStroke();
    fill(255, 200, 0);
    circle(width - pose.nose.x, pose.nose.y, 25);

    // Corpo (pontos principais)
    let bodyPoints = [
      pose.nose,
      pose.leftEye,
      pose.rightEye,
      pose.leftShoulder,
      pose.rightShoulder,
      pose.leftElbow,
      pose.rightElbow,
      pose.leftWrist,
      pose.rightWrist,
      pose.leftHip,
      pose.rightHip,
      pose.leftKnee,
      pose.rightKnee,
      pose.leftAnkle,
      pose.rightAnkle,
    ];

    // Desenha pontos do corpo como hitbox
    for (let point of bodyPoints) {
      fill(255, 200, 0, 150);
      circle(width - point.x, point.y, 10);
    }
  }
}

function updatePlayerFromBody() {
  if (poses.length > 0) {
    let pose = poses[0].pose;
    let nose = pose.nose;

    // Espelha a posição X (webcam está virada)
    let targetX = width - nose.x;
    let targetY = nose.y;

    player.x = lerp(player.x, targetX, 0.3);
    player.y = lerp(player.y, targetY, 0.3);
  }
}

function updateGame() {
  // Spawn de obstáculos (aumenta velocidade com o tempo)
  spawnCounter++;
  let difficulty = 1 + elapsedTime / 30; // Aumenta dificuldade
  if (spawnCounter > spawnIntervalFrames / difficulty) {
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
      this.drawKnife();
    } else {
      this.drawBullet();
    }
  }

  drawKnife() {
    push();
    translate(this.x, this.y);

    // Calcula rotação baseada na direção
    // Faca aponta naturalmente para cima, então adicionamos PI/2 para ajustar
    let angle = atan2(this.vy, this.vx) + PI / 2;
    rotate(angle);

    // Desenha imagem da faca
    imageMode(CENTER);
    image(knifeImage, 0, 0, 40, 40);

    pop();
  }

  drawBullet() {
    push();
    translate(this.x, this.y);

    // Calcula rotação baseada na direção
    // Bala aponta naturalmente para esquerda (PI), então subtraímos PI para ajustar
    let angle = atan2(this.vy, this.vx) - PI;
    rotate(angle);

    // Desenha imagem da bala
    imageMode(CENTER);
    image(bulletImage, 0, 0, 35, 35);

    pop();
  }

  collidesWith(player) {
    // Verifica colisão contra todos os pontos do corpo do jogador
    if (poses.length > 0) {
      let pose = poses[0].pose;
      let bodyPoints = [
        pose.nose,
        pose.leftEye,
        pose.rightEye,
        pose.leftShoulder,
        pose.rightShoulder,
        pose.leftElbow,
        pose.rightElbow,
        pose.leftWrist,
        pose.rightWrist,
        pose.leftHip,
        pose.rightHip,
        pose.leftKnee,
        pose.rightKnee,
        pose.leftAnkle,
        pose.rightAnkle,
      ];

      // Verifica distância em relação a cada ponto do corpo
      for (let point of bodyPoints) {
        let bodyX = width - point.x; // Espelha a posição X
        let bodyY = point.y;
        let distance = dist(this.x, this.y, bodyX, bodyY);

        // Se colidir com qualquer ponto do corpo (raio de 15 pixels)
        if (distance < 15) {
          return true;
        }
      }
    }
    return false;
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
  textSize(28);
  textAlign(LEFT);
  text("Tempo: " + elapsedTime + "s", 30, 50);

  // Desenha vidas com imagens de coração
  imageMode(CORNER);
  for (let i = 0; i < lives; i++) {
    image(heartImage, 30 + i * 45, 70, 40, 40);
  }
}

function finishGame() {
  gameState = "finished";
  gameOverTime = millis(); // Marca o tempo em que o jogo terminou
  if (elapsedTime > bestScore) {
    bestScore = elapsedTime;
  }
}

function drawFinishedScreen() {
  fill(0, 0, 0, 200);
  rect(0, 0, width, height);

  fill(255);
  textSize(48);
  textAlign(CENTER);
  text("Game Over!", width / 2, height / 2 - 100);

  textSize(32);
  text("Tempo: " + elapsedTime + "s", width / 2, height / 2);
  text("Melhor Tempo: " + bestScore + "s", width / 2, height / 2 + 60);

  // Contador para voltar ao menu
  let timeLeft = 5 - floor((millis() - gameOverTime) / 1000);
  textSize(24);
  text(
    "Voltando ao menu em " + max(0, timeLeft) + "s...",
    width / 2,
    height / 2 + 140,
  );
}

function resetGame() {
  gameState = "start";
  score = 0;
  lives = 3;
  elapsedTime = 0;
  obstacles = [];
  spawnCounter = 0;
}

// Desenha botão de Debug
function drawDebugButton() {
  // Posiciona o botão no canto inferior direito da tela
  debugButtonX = width - debugButtonW - 20;
  debugButtonY = height - debugButtonH - 20;

  // Desenha retângulo do botão
  fill(100, 150, 255);
  stroke(50, 100, 200);
  strokeWeight(2);
  rect(debugButtonX, debugButtonY, debugButtonW, debugButtonH, 10);

  // Desenha texto do botão
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(18);
  text(
    "START [DEBUG]",
    debugButtonX + debugButtonW / 2,
    debugButtonY + debugButtonH / 2,
  );
}

// Verifica clique no botão de debug
function mousePressed() {
  if (gameState === "start" && debugMode) {
    // Verifica se o clique foi dentro do botão
    if (
      mouseX > debugButtonX &&
      mouseX < debugButtonX + debugButtonW &&
      mouseY > debugButtonY &&
      mouseY < debugButtonY + debugButtonH
    ) {
      gameState = "playing";
      startTime = millis();
      elapsedTime = 0;
      return false; // Previne comportamento padrão
    }
  }
}

// Responsivo para redimensionamento de janela
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
