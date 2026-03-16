# Relatorio do Projeto

## Unidade Curricular: Tecnologias Interativas

## Projeto: Get Out Of The Way

Autores: Tiago Castro e Tomas Amorim  
Data: 16 de marco de 2026  
Repositorio: https://github.com/TiagoCastro05/Get_Out_Of_The_Way

## 1. Objetivo e Descricao Sumaria do Exercicio Interativo

Este projeto consiste no desenvolvimento de um exercicio interativo com webcam, orientado para o tema "Treino Cognitivo - Exercicios Fisicos e Mentais". O nome do exercicio e **Get Out Of The Way**.

O utilizador deve controlar um cursor virtual circular atraves da mao (detetada por visao computacional) e interagir com objetos que aparecem em movimento no ecra:

- Objetos verdes representam alvos relevantes que devem ser recolhidos.
- Objetos vermelhos representam distratores que devem ser evitados.

A tarefa e limitada no tempo (60 segundos), com sistema de pontuacao em tempo real e possibilidade de repeticao do desafio. A mecanica proposta trabalha competencias cognitivas e motoras em simultaneo:

- atencao seletiva,
- inibicao de resposta,
- tempo de reacao,
- coordenacao olho-mao,
- controlo do movimento fino da mao.

### 1.1 Enquadramento na area da saude

No contexto da saude e bem-estar, exercicios digitais deste tipo podem ser utilizados para:

- treino cognitivo ligeiro em populacao adulta,
- estimulo psicomotor em programas de atividade assistida,
- reforco de foco atencional em tarefas simples de curta duracao,
- atividades de reabilitacao leve orientadas por objetivos.

O exercicio foi desenhado para ser simples de compreender em poucos segundos, sem menus complexos, o que facilita o uso por diferentes perfis de utilizador.

## 2. Funcionalidades Implementadas

A aplicacao foi implementada com `p5.js` (renderizacao/interacao) e `ml5.js` (deteccao de mao com HandPose), cumprindo os requisitos nucleares da proposta.

### 2.1 Captura de video em tempo real

- Captura de webcam com `createCapture(VIDEO)`.
- Visualizacao do video em tempo real diretamente no canvas.
- Aplicacao de efeito espelho para tornar o controlo mais intuitivo para o utilizador.

### 2.2 Interacao por visao computacional (ML5 HandPose)

- Carregamento do modelo `HandPose` da biblioteca ML5.
- Leitura continua de predicoes da mao.
- Utilizacao da ponta do dedo indicador (landmark 8) para mover o cursor virtual.
- Feedback visual quando a mao esta ou nao detetada.

### 2.3 Objetivo de jogo, pontuacao e tempo

- Objetivo claro e imediato: recolher objetos verdes e evitar vermelhos.
- Sistema de pontuacao em tempo real:
  - Verde recolhido: `+10`
  - Vermelho tocado: `-8`
  - Verde perdido (cai do ecra): `-2`
- Temporizador de 60 segundos por tentativa.
- Registo de melhor pontuacao (`best score`) na sessao.

### 2.4 Aleatoriedade controlada

Foi aplicado random de forma programatica e controlada:

- Spawn de objetos em intervalos temporais definidos.
- Probabilidade de tipo de objeto: 70% util / 30% distrator.
- Posicao horizontal aleatoria dentro de limites.
- Tamanho e velocidade aleatorios dentro de intervalos predefinidos.
- Limite maximo de objetos simultaneos para manter estabilidade e legibilidade.

Esta abordagem garante variedade entre tentativas sem perder previsibilidade do nivel de dificuldade.

### 2.5 Usabilidade e repeticao

- Ecra inicial com instrucoes de jogo.
- Inicio simples com tecla `ESPACO`.
- Reinicio simples com tecla `R` no fim da partida.
- Interface com HUD contendo nome do jogo, pontos, tempo e melhor resultado.
- Contraste visual melhorado para leitura sobre o video da webcam.

### 2.6 Estrutura e organizacao do codigo

O codigo foi estruturado em funcoes para facilitar leitura e manutencao:

- inicializacao (`setup`, `setupHandPose`),
- ciclo principal (`draw`),
- atualizacao de jogador e jogo (`updatePlayerFromHand`, `updateGame`),
- renderizacao (`drawHud`, `drawItems`, `drawReadyScreen`, `drawFinishedScreen`),
- utilitarios (`createRandomItem`, `isColliding`),
- controlo de estados e teclas (`startGame`, `finishGame`, `keyPressed`).

## 3. O que foi feito com ajuda humana / IA

### 3.1 Contributo humano (equipa)

- Definicao do conceito do exercicio e enquadramento tematico.
- Escolha da mecanica principal (recolher/evitar) e das regras de pontuacao.
- Decisao de UI e simplificacao da experiencia para maior intuitividade.
- Validacao do fluxo de utilizacao no browser com webcam.
- Curadoria final da documentacao para submissao.

### 3.2 Contributo com IA

- Apoio na estruturacao do codigo JavaScript em funcoes.
- Sugestoes para estados de jogo (`loading`, `ready`, `playing`, `finished`).
- Apoio na redacao inicial da documentacao (README, relatorio e diario).
- Apoio tecnico na integracao da biblioteca ML5 e na logica de spawn aleatorio.

### 3.3 Responsabilidade final

Apesar da assistencia por IA em partes do processo, as decisoes de design, validacao funcional e controlo final da implementacao foram realizadas pelos autores do projeto.

## 4. Aspetos que poderiam/deveriam ser melhorados e porquê

Embora o prototipo cumpra os objetivos definidos, existem varias oportunidades de melhoria:

### 4.1 Melhorias de calibracao e robustez

- **Calibracao inicial da area de movimento**: permitir ajustar a sensibilidade da mao ao espaco do ecra.
- **Suporte para variacoes de iluminacao**: em ambientes com pouca luz a deteccao pode degradar.
- **Suavizacao adicional de coordenadas**: reduzir jitter em movimentos rapidos.

### 4.2 Melhorias de acessibilidade

- Suporte opcional por teclado/rato para utilizadores sem webcam.
- Tamanhos de fonte e elementos configuraveis.
- Modo de alto contraste dedicado.

### 4.3 Melhorias de jogabilidade

- Niveis de dificuldade progressiva (mais velocidade, menos tempo de reacao).
- Modos de treino especificos (so atencao seletiva, so inibicao, etc.).
- Sistema de feedback sonoro com `p5.sound`.
- Estatisticas por tentativa (acertos, erros, taxa de reacao).

### 4.4 Melhorias de avaliacao do treino

- Historico local de resultados por utilizador.
- Curvas de progresso por sessao.
- Metricas mais ricas para comparacao temporal.

## 5. Diario de Desenvolvimento (Resumo)

O diario detalhado encontra-se no ficheiro `Diario de desenvolvimento.txt`. Em resumo:

- Sessao 1: definicao do conceito e planeamento.
- Sessao 2: webcam + HandPose e correcoes de espelho/coordenadas.
- Sessao 3: regras de jogo, pontuacao, tempo e aleatoriedade.
- Sessao 4: UX final, repeticao do exercicio e documentacao.

## 6. Instrucao para demonstracao em video (20-30 segundos)

Sugestao de estrutura para o video:

1. Mostrar ecran inicial e webcam ativa (3-5s).
2. Mostrar inicio com `ESPACO` e movimento do cursor com a mao (5-7s).
3. Demonstrar recolha de alvo verde e evitacao de vermelho (8-10s).
4. Mostrar pontuacao/tempo no HUD e ecran final com opcao `R` (5-8s).

## 7. Conclusao

O projeto **Get Out Of The Way** cumpre os requisitos principais propostos: interacao com webcam por ML5, objetivo claro, pontuacao, tempo, aleatoriedade controlada e repeticao. A solucao foi pensada para ser simples, perceptivel e funcional no contexto de treino cognitivo e motor.

Como evolucao futura, o prototipo pode ganhar maior valor com calibracao adaptativa, feedback multimodal e monitorizacao de progresso ao longo do tempo.
