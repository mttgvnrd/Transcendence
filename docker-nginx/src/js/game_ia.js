/**
 * @fileoverview AI opponent game implementation for ft_transcendence.
 * Handles single player game against an AI opponent with predictive movement.
 * @module game_ia
 * @requires api
 * @requires toast
 */

/**
 * Initializes the AI game functionality.
 * Sets up the game canvas, player names, and starts the game when ready.
 * @async
 * @function initializeGameIA
 * @returns {Promise<void>}
 */
async function initializeGameIA() {
	let isAuth = false;
	if (window.isAuthenticated) {
		isAuth = await window.isAuthenticated();
	}
	if (!isAuth) {
		history.replaceState(null, null, '/401');
		handleRouting();
		return;
	}
	document.getElementById('prova').style.display = '';
	console.log("Inizializzazione del gioco IA.");

	const canvas = document.getElementById('gameCanvas');
	if (!canvas) {
		console.error('Elemento canvas non trovato!');
		return;
	}
	console.log("Canvas trovato!");

	const username = await window.api.get('/api/users/me');
	const startButton = document.getElementById("startGameButton");
	let gameStarted = false;
	let gameInterval = null;

	/**
	 * Cleans up game resources when navigating away.
	 * @function cleanup
	 * @returns {void}
	 */
	function cleanup() {
		if (gameInterval) {
			clearInterval(gameInterval);
			gameInterval = null;
			console.log("Game IA cleanup: intervallo di gioco fermato");
		}
		
		// Rimuovere gli event listener
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		window.removeEventListener('beforeunload', cleanup);
		window.removeEventListener('popstate', cleanup);
		document.removeEventListener('click', handleInternalNavigation, true);
	}
	
	/**
	 * Handles internal navigation clicks
	 * @function handleInternalNavigation
	 * @param {Event} event - Click event
	 * @returns {void}
	 */
	function handleInternalNavigation(event) {
		const target = event.target.closest('a');
		if (target && target.href && target.href.startsWith(window.location.origin)) {
			cleanup();
		}
	}
	
	/**
	 * Handles page visibility changes to pause game when hidden.
	 * @function handleVisibilityChange
	 * @returns {void}
	 */
	function handleVisibilityChange() {
		if (document.hidden && gameInterval) {
			clearInterval(gameInterval);
			gameInterval = null;
			console.log("Game IA: intervallo di gioco fermato per cambio pagina");
		}
	}
	
	// Aggiungi event listener per la pulizia
	document.addEventListener('visibilitychange', handleVisibilityChange);
	window.addEventListener('beforeunload', cleanup);
	window.addEventListener('popstate', cleanup);
	document.addEventListener('click', handleInternalNavigation, true);

	if (startButton) {
		startButton.addEventListener("click", function () {
			if (!gameStarted) {
				gameStarted = true;
				const urlParams = new URLSearchParams(window.location.search);
				const gameMode = urlParams.get('mode') || 'singleplayer';
				startPongGame(canvas, username, gameMode);
				
				// Nascondi l'overlay invece del pulsante
				const startOverlay = document.getElementById('startOverlay');
				if (startOverlay) {
					startOverlay.classList.add('game-started');
				}
			}
		});
	}

	/**
	 * Starts a new Pong game against AI opponent.
	 * @function startPongGame
	 * @param {HTMLCanvasElement} canvas - The canvas element to render the game on
	 * @param {Object} username - Object containing player's username
	 * @param {string} gameMode - The selected game mode
	 * @returns {void}
	 */
	function startPongGame(canvas, username, gameMode) {
		canvas.width = 1000;
		canvas.height = 500;
		const ctx = canvas.getContext('2d');
		
		// Rimozione dello sfondo nero dal canvas
		canvas.style.backgroundColor = "transparent";
		document.querySelector(".canvas-container").style.backgroundColor = "transparent";

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
		 * @type {number} Player's paddle Y coordinate
		 */
		let paddle1Y = canvas.height / 2 - 50;
		
		/**
		 * @type {number} AI's paddle Y coordinate
		 */
		let paddle2Y = canvas.height / 2 - 50;

		const paddleHeight = 100;
		const paddleWidth = 10;
		const ballRadius = 10;

		/**
		 * @type {number} Player's score
		 */
		let playerScore = 0;
		
		/**
		 * @type {number} AI opponent's score
		 */
		let opponentScore = 0;

		/**
		 * @type {number} Timestamp of last AI reaction
		 */
		let lastReactionTime = performance.now();
		
		/**
		 * @type {number} AI reaction time in milliseconds
		 */
		const reactionTime = 1000;

		/**
		 * @type {Object.<string, boolean>} Map of currently pressed keys
		 */
		const keysPressed = {};

		/**
		 * Checks if a specific key is currently pressed.
		 * @function isKeyDown
		 * @param {string} key - The key to check
		 * @returns {boolean} Whether the key is pressed
		 */
		function isKeyDown(key) {
			return keysPressed[key];
		}

		document.addEventListener('keydown', event => {
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
				event.preventDefault();
			}
			keysPressed[event.key] = true;
		});
		document.addEventListener('keyup', event => keysPressed[event.key] = false);
		
		/**
		 * Handles player paddle movement based on keyboard input.
		 * @function movePlayerPaddle
		 * @returns {void}
		 */
		function movePlayerPaddle() {
			if (isKeyDown("ArrowUp") && paddle1Y > 0) paddle1Y -= paddleSpeed;
			if (isKeyDown("ArrowDown") && paddle1Y < canvas.height - paddleHeight) paddle1Y += paddleSpeed;
		}
		
		/**
		 * Predicts where the ball will intersect with AI's paddle plane.
		 * Uses basic physics and adds randomness for realistic behavior.
		 * @function predictBallPosition
		 * @returns {number} Predicted Y coordinate where ball will intersect
		 */
		function predictBallPosition() {
			let predictedY = ballY;
			let predictedX = ballX;
			let predictedSpeedY = ballSpeedY;
	
			
			while (predictedX < canvas.width - paddleWidth) {
				
				predictedX += ballSpeedX + (Math.random() < 0.5 ? 1 : -1) * (Math.random() * (canvas.width - ballX) / 50);
		
				if (predictedY <= 0 || predictedY >= canvas.height) {
					predictedY = Math.max(0, Math.min(canvas.height, predictedY));
					predictedSpeedY *= -1;
				}
				predictedY += predictedSpeedY + (Math.random() < 0.5 ? 1 : -1) * (Math.random() * (canvas.width - ballX) / 50);
			}
			return predictedY;
		}
	
		let cambia = false;

		/**
		 * Moves AI paddle towards a target Y position.
		 * @function reachTarget
		 * @param {number} targetY - Target Y coordinate for paddle
		 * @returns {void}
		 */
		function reachTarget(targetY){
			let casualCenter = 0;
			// if (cambia)
			// {
			//     casualCenter = (Math.random() * paddleHeight - paddleHeight / 2);
			//     cambia = false;
			// }
			const centerOfPaddle = paddle2Y + paddleHeight / 2;
			if (centerOfPaddle > targetY && paddle2Y > 0) {
				if (centerOfPaddle + casualCenter - targetY >= paddleSpeed)
					paddle2Y -= paddleSpeed;
				else
				paddle2Y -= 1;
			} else if (centerOfPaddle + casualCenter < targetY && paddle2Y < canvas.height - paddleHeight) {
				if (targetY - centerOfPaddle >= paddleSpeed)
					paddle2Y += paddleSpeed;
				else
					paddle2Y += 1;
			}
		}
	
		// Funzione per muovere il paddle dell'avversario (IA)
		let actualTargetY = canvas.height / 2;
		/**
		 * Controls AI paddle movement using prediction and reaction time.
		 * @function moveOpponentPaddle
		 * @returns {void}
		 */
		function moveOpponentPaddle() {
			if (ballSpeedX < 0){
				reachTarget(canvas.height / 2);
				actualTargetY = canvas.height / 2;
			}
			
			let targetY;
			if (ballSpeedX > 0) {
				if (performance.now() - lastReactionTime >= reactionTime) {
					targetY = predictBallPosition();
					lastReactionTime = performance.now();
					if (Math.abs(actualTargetY - targetY) + 50 - (canvas.width - ballX) / 10 > paddleHeight / 2)
						actualTargetY = targetY;
					cambia = true;
				}
				else
				{
					targetY = actualTargetY;
					reachTarget(targetY);
				}
			}
		}

		/**
		 * Renders the current game state on the canvas.
		 * Draws paddles, ball, scores, and visual effects.
		 * @function drawEverything
		 * @returns {void}
		 */
		function drawEverything() {
			// Controlla se il canvas è ancora disponibile
			if (!canvas || !canvas.parentNode) {
				// Il canvas non esiste più, fermia il gioco
				if (gameInterval) {
					clearInterval(gameInterval);
					gameInterval = null;
				}
				return;
			}
			
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			// Sfondo con gradiente blu scuro
			const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
			bgGradient.addColorStop(0, "#1a2a4a");
			bgGradient.addColorStop(1, "#0f172a");
			//ctx.fillStyle = bgGradient;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			
			// Bordo con sfumatura blu/viola
			const borderGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
			borderGradient.addColorStop(0, "#667eea");
			borderGradient.addColorStop(1, "#764ba2");
			ctx.strokeStyle = borderGradient;
			ctx.lineWidth = 8;
			ctx.strokeRect(0, 0, canvas.width, canvas.height);
			
			// Linea centrale blu
			const centerLineGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
			centerLineGradient.addColorStop(0, "#667eea");
			centerLineGradient.addColorStop(1, "#0d6efd");
			ctx.strokeStyle = centerLineGradient;
			ctx.lineWidth = 4;
			ctx.setLineDash([15, 15]); // Linea tratteggiata
			ctx.beginPath();
			ctx.moveTo(canvas.width / 2, 0);
			ctx.lineTo(canvas.width / 2, canvas.height);
			ctx.stroke();
			ctx.setLineDash([]); // Resetta lo stile della linea
			
			// Paddle del giocatore con colore primario
			const playerGradient = ctx.createLinearGradient(0, 0, paddleWidth, 0);
			playerGradient.addColorStop(0, "#0d6efd");
			playerGradient.addColorStop(1, "#0a58ca");
			ctx.fillStyle = playerGradient;
			ctx.fillRect(0, paddle1Y, paddleWidth, paddleHeight);
			
			// Paddle dell'IA con colore viola
			const aiGradient = ctx.createLinearGradient(canvas.width - paddleWidth, 0, canvas.width, 0);
			aiGradient.addColorStop(0, "#6f42c1");
			aiGradient.addColorStop(1, "#6610f2");
			ctx.fillStyle = aiGradient;
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
			
			// Aggiunta di controlli null per gli elementi punteggio
			const playerScoreElement = document.getElementById("playerScore");
			const opponentScoreElement = document.getElementById("opponentScore");
			const player1Username = document.getElementById("player1Name");
			const player2Username = document.getElementById("player2Name");
			
			if (playerScoreElement) {
				playerScoreElement.textContent = `${playerScore}`;
			}
			if (opponentScoreElement) {
				opponentScoreElement.textContent = `${opponentScore}`;
			}
			if (player1Username)
				player1Username.textContent = `${username.username}`;
			if (player2Username)
				player2Username.textContent = "IA BOT"
		}

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
			// Controlloa se il gioco è terminato o il canvas non esiste
			if (!canvas || !canvas.parentNode || playerScore >= 5 || opponentScore >= 5) {
				if (playerScore >= 5 || opponentScore >= 5) {
					checkWinCondition();
				} else if (gameInterval) {
					clearInterval(gameInterval);
					gameInterval = null;
				}
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
			if (ballX - ballRadius <= 0) { opponentScore++; resetBall(); }
			else if (ballX + ballRadius >= canvas.width) { playerScore++; resetBall(); }
		}

		/**
		 * Resets the ball to center position with random direction.
		 * @function resetBall
		 * @returns {void}
		 */
		function resetBall() {
			ballX = canvas.width / 2;
			ballY = canvas.height / 2;
			actualTargetY = canvas.height / 2;
			lastReactionTime = performance.now();
			multiplier = ballSpeed;
			ballSpeedX = (Math.random() < 0.5 ? 1 : -1) * ballSpeed;
			ballSpeedY = (Math.random() < 0.5 ? 1 : -1) * ballSpeed;
		}

		/**
		 * Checks if a player has won and handles game end.
		 * @function checkWinCondition
		 * @returns {void}
		 */
		function checkWinCondition() {
			if (gameInterval) {
				clearInterval(gameInterval);
				gameInterval = null;
			}
			
			const winner = playerScore >= 5 ? "Player" : "Opponent";
			showInfoToast(`${winner} ha vinto! Punteggio finale: ${playerScore} - ${opponentScore}`);
			//alert(`${winner} ha vinto! Punteggio finale: ${playerScore} - ${opponentScore}`);
			// Rimozione della chiamata a saveGameStats per non salvare le statistiche in modalità allenamento
			
			// Reindirizza l'utente alla home dopo la fine della partita
			navigateTo('/');
		}
		gameInterval = setInterval(gameLoop, 1000 / 60);
		/**
		 * Main game loop that updates and renders the game state.
		 * @function gameLoop
		 * @returns {void}
		 */
		function gameLoop() {
			movePlayerPaddle();
			moveOpponentPaddle();
			moveEverything();
			drawEverything();
		}
	}
}

// Export initialization function
window.initializeGameIA = initializeGameIA;

// Initialize when DOM is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
	setTimeout(initializeGameIA, 1);
} else {
	document.addEventListener("DOMContentLoaded", initializeGameIA);
}
