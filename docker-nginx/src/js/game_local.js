/**
 * @fileoverview Local game implementation for ft_transcendence.
 * Handles single-device multiplayer game with two players on the same keyboard.
 * @module game_local
 * @requires api
 * @requires toast
 */

/**
 * Initializes the local game functionality.
 * Sets up the game canvas, player names, and starts the game when ready.
 * @async
 * @function initializeGameLocal
 * @returns {Promise<void>}
 */
async function initializeGameLocal() {
	try {
		let isAuth = false;
		if (window.isAuthenticated) {
			isAuth = await window.isAuthenticated();
		}
		if (!isAuth) {
			history.replaceState(null, null, '/401');
			handleRouting();
			return;
		}
	} catch (error) {}
	
	const canvas = document.getElementById('gameCanvas');
	if (!canvas)
		return;

	const player1Name = document.getElementById("player1Name");
	const player2Name = document.getElementById("player2Name");

	if (player1Name) {
		const resp = await window.api.get('/api/users/me/');
		player1Name.textContent = resp.username;
	}
	if (player2Name)
		player2Name.textContent = "Guest";

	const startButton = document.getElementById("startGameButton");

	let gameStarted = false;

	if (startButton) {
		startButton.addEventListener("click", function () {
			if (!gameStarted) {
				gameStarted = true;
				startPongGame(canvas);
				
				// Nascondi l'overlay invece del pulsante
				const startOverlay = document.getElementById('startOverlay');
				if (startOverlay) {
					startOverlay.classList.add('game-started');
				}
			}
		});
	}
	

	let gameInterval = null;

	/**
	 * Starts a new Pong game on the provided canvas.
	 * @function startPongGame
	 * @param {HTMLCanvasElement} canvas - The canvas element to render the game on
	 * @returns {void}
	 */
	function startPongGame(canvas) {
		canvas.width = 1000;
		canvas.height = 500;
		const ctx = canvas.getContext('2d');
		
		/**
		 * @type {number} Ball's X coordinate
		 */
		let ballX = canvas.width / 2;
		
		/**
		 * @type {number} Ball's Y coordinate
		 */
		let ballY = canvas.height / 2;
		
		/**
		 * @type {number} Base speed for ball movement
		 */
		let ballSpeed = 5;
		
		/**
		 * @type {number} Ball's horizontal speed component
		 */
		let ballSpeedX = ballSpeed;
		
		/**
		 * @type {number} Ball's vertical speed component
		 */
		let ballSpeedY = ballSpeed;
		
		/**
		 * @type {number} Speed of paddle movement
		 */
		let paddleSpeed = 5;

		/**
		 * @type {number} Left paddle's Y coordinate
		 */
		let paddle1Y = canvas.height / 2 - 50;
		
		/**
		 * @type {number} Right paddle's Y coordinate
		 */
		let paddle2Y = canvas.height / 2 - 50;
		
		const paddleHeight = 100;
		const paddleWidth = 10;
		const ballRadius = 10;

		/**
		 * @type {number} Player 1's score
		 */
		let player1Score = 0;
		
		/**
		 * @type {number} Player 2's score
		 */
		let player2Score = 0;

		/**
		 * @type {Object.<string, boolean>} Map of currently pressed keys
		 */
		const keysPressed = {};

		document.addEventListener('keydown', event => {
			if (["ArrowUp", "ArrowDown"].includes(event.key)) {
				event.preventDefault();
			}
			keysPressed[event.key] = true;
		});
		document.addEventListener('keyup', event => {
			if (["ArrowUp", "ArrowDown"].includes(event.key)) {
				event.preventDefault();
			}
			keysPressed[event.key] = false;
		});
		
		/**
		 * Handles keyboard input for paddle movement.
		 * @function movePaddles
		 * @returns {void}
		 */
		function movePaddles() {
			if (keysPressed["w"] && paddle1Y > 0) paddle1Y -= paddleSpeed;
			if (keysPressed["s"] && paddle1Y < canvas.height - paddleHeight) paddle1Y += paddleSpeed;
			if (keysPressed["ArrowUp"] && paddle2Y > 0) paddle2Y -= paddleSpeed;
			if (keysPressed["ArrowDown"] && paddle2Y < canvas.height - paddleHeight) paddle2Y += paddleSpeed;
		}

		/**
		 * Renders the current game state on the canvas.
		 * Draws paddles, ball, scores, and visual effects.
		 * @function drawEverything
		 * @returns {void}
		 */
		function drawEverything() {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			// Sfondo con gradiente blu scuro
			const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
			bgGradient.addColorStop(0, "#1a2a4a");
			bgGradient.addColorStop(1, "#0f172a");
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			
			// Bordo con sfumatura blu/viola
			const borderGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
			borderGradient.addColorStop(0, "#667eea");
			borderGradient.addColorStop(1, "#764ba2");
			ctx.strokeStyle = borderGradient;
			ctx.lineWidth = 8;
			ctx.strokeRect(0, 0, canvas.width, canvas.height);
			
			// Linea centrale blu
			ctx.strokeStyle = "#0d6efd";
			ctx.lineWidth = 4;
			ctx.setLineDash([15, 15]); // Linea tratteggiata
			ctx.beginPath();
			ctx.moveTo(canvas.width / 2, 0);
			ctx.lineTo(canvas.width / 2, canvas.height);
			ctx.stroke();
			ctx.setLineDash([]); // Resetta lo stile della linea
			
			// Paddle del giocatore 1 con colore primario
			const player1Gradient = ctx.createLinearGradient(0, 0, paddleWidth, 0);
			player1Gradient.addColorStop(0, "#0d6efd");
			player1Gradient.addColorStop(1, "#0a58ca");
			ctx.fillStyle = player1Gradient;
			ctx.fillRect(0, paddle1Y, paddleWidth, paddleHeight);
			
			// Paddle del giocatore 2 con colore viola
			const player2Gradient = ctx.createLinearGradient(canvas.width - paddleWidth, 0, canvas.width, 0);
			player2Gradient.addColorStop(0, "#6f42c1");
			player2Gradient.addColorStop(1, "#6610f2");
			ctx.fillStyle = player2Gradient;
			ctx.fillRect(canvas.width - paddleWidth, paddle2Y, paddleWidth, paddleHeight);
			
			// Palla con effetto glow
			ctx.fillStyle = "white";
			ctx.shadowColor = "#0d6efd";
			ctx.shadowBlur = 15;
			ctx.beginPath();
			ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
			ctx.closePath();
			ctx.fill();
			ctx.shadowBlur = 0; // Resetta l'effetto shadow

			const playerScoreElem = document.getElementById("playerScore");
			if (playerScoreElem) playerScoreElem.textContent = `${player1Score}`;
			const opponentScoreElem = document.getElementById("opponentScore");
			if (opponentScoreElem) opponentScoreElem.textContent = `${player2Score}`;
		}

		/**
		 * @type {number} Current speed multiplier for ball
		 */
		let multiplier = ballSpeed;

		/**
		 * Updates ball speed and direction after paddle collision.
		 * Implements angle calculation based on hit position and speed increase.
		 * @function changeSpeed
		 * @returns {void}
		 */
		function changeSpeed(){
			
			let distanza;
			
			if (multiplier < 9.5)
				multiplier *= 1.05;
			
			if(ballSpeedX > 0){ //paddle2
				distanza = Math.abs(paddle2Y + paddleHeight / 2 - ballY);
				ballSpeedX = (1 - 0.3 * (distanza / (paddleHeight / 2)));
				ballSpeedX = -Math.min(1, Math.max(0.7 , ballSpeedX));
				ballSpeedY = Math.sqrt(2 - ballSpeedX * ballSpeedX);
				if (ballY < paddle2Y + paddleHeight / 2)
					ballSpeedY *= -1;
			}
			else if(ballSpeedX < 0){ //paddle1
				let distanza = Math.abs(paddle1Y + paddleHeight / 2 - ballY);
				ballSpeedX = (1 - 0.3 * (distanza / (paddleHeight / 2)));
				ballSpeedX = Math.min(1, Math.max(0.7 , ballSpeedX));
				ballSpeedY = Math.sqrt(2 - ballSpeedX * ballSpeedX);
				if (ballY < paddle1Y + paddleHeight / 2)
					ballSpeedY *= -1;
			}
			ballSpeedX *= multiplier;
			ballSpeedY *= multiplier;
		}

		/**
		 * Updates game object positions and handles collisions.
		 * @function moveEverything
		 * @returns {void}
		 */
		function moveEverything() {
			if (player1Score>= 5 || player2Score >= 5) {
				checkWinCondition();
				return;
			}
			ballX += ballSpeedX;
			ballY += ballSpeedY;

			if (ballY - ballRadius <= 0)
				ballSpeedY = Math.max(ballSpeedY, -ballSpeedY);
			if (ballY + ballRadius >= canvas.height)
				ballSpeedY = Math.min(ballSpeedY, -ballSpeedY);
			if (ballX - ballRadius <= paddleWidth && ballY >= paddle1Y && ballY <= paddle1Y + paddleHeight) {
				lastReactionTime = performance.now();
				changeSpeed();
			}
			if (ballX + ballRadius >= canvas.width - paddleWidth && ballY >= paddle2Y && ballY <= paddle2Y + paddleHeight)  {
				changeSpeed();
			}
			if (ballX - ballRadius <= 0) { player2Score ++; resetBall(); }
			else if (ballX + ballRadius >= canvas.width) { player1Score++; resetBall(); }
		}

		/**
		 * Resets the ball to center position with random direction.
		 * @function resetBall
		 * @returns {void}
		 */
		function resetBall() {
			let ballSpeedSign = Math.sign(ballSpeedX);
			ballSpeedX = 0;
			ballSpeedY = 0;
			ballX = canvas.width / 2;
			ballY = canvas.height / 2;
			actualTargetY = canvas.height / 2;
			multiplier = ballSpeed;
			setTimeout(() =>{
				ballSpeedX = -ballSpeedSign * ballSpeed;
				ballSpeedY = (Math.random() < 0.5 ? 1 : -1) * ballSpeed;
			}, 1000);
			lastReactionTime = performance.now();
		}

		/**
		 * Checks if a player has won and handles game end.
		 * @async
		 * @function checkWinCondition
		 * @returns {Promise<void>}
		 */
		async function checkWinCondition() {
			clearInterval(gameInterval);
			
			const winner = player1Score >= 5 ? 1 : 2;
			const winnerName = winner === 1 ? 
				document.getElementById('player1Name')?.textContent || "Giocatore 1" : 
				document.getElementById('player2Name')?.textContent || "Giocatore 2";
			showInfoToast(`${winnerName} ha vinto! Punteggio finale: ${player1Score} - ${player2Score}`);
			history.replaceState(null, null, '/home');
			handleRouting();
			return;
		}

		/**
		 * Main game loop that updates and renders the game state.
		 * @function gameLoop
		 * @returns {void}
		 */
		function gameLoop() {
			if (!document.getElementById('gameCanvas')) {
				if (gameInterval) {
					clearInterval(gameInterval);
					gameInterval = null;
				}
				return;
			}
			movePaddles();
			moveEverything();
			drawEverything();
		}

		// Start the game loop
		gameInterval = setInterval(gameLoop, 1000 / 60);
	}

	window.addEventListener('popstate', () => {
		if (gameInterval) {
			clearInterval(gameInterval);
			gameInterval = null;
		}
	});
	window.addEventListener('beforeunload', () => {
		if (gameInterval) {
			clearInterval(gameInterval);
			gameInterval = null;
		}
	});
}

// Export initialization function
window.initializeGameLocal = initializeGameLocal;
