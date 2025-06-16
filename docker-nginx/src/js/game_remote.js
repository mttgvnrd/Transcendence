/**
 * @fileoverview Remote multiplayer game implementation for ft_transcendence.
 * Handles matchmaking, WebSocket communication, and game state management.
 * @module game_remote
 * @requires waiting_screen
 * @requires toast
 */

/**
 * @type {WebSocket|null}
 * @description WebSocket connection for game communication
 */
let gameSocket = null;

/**
 * @type {string|null}
 * @description Unique identifier for the current game session
 */
let gameID = null;

/**
 * @type {('player1'|'player2'|null)}
 * @description Role assigned to the current player
 */
let playerRole = null;

/**
 * @type {boolean}
 * @description Whether the game is currently active
 */
let gameActive = false;

/**
 * @type {boolean}
 * @description Whether the player has indicated they are ready to play
 */
let playerReady = false;

/**
 * @typedef {Object} GameState
 * @property {number} ballX - X coordinate of the ball
 * @property {number} ballY - Y coordinate of the ball
 * @property {number} paddle1Y - Y coordinate of player 1's paddle
 * @property {number} paddle2Y - Y coordinate of player 2's paddle
 * @property {number} player1Score - Score of player 1
 * @property {number} player2Score - Score of player 2
 */

/**
 * @type {GameState}
 * @description Current state of the game
 */
let gameState = {
	ballX: 500,
	ballY: 250,
	paddle1Y: 200,
	paddle2Y: 200,
	player1Score: 0,
	player2Score: 0
};

/**
 * @type {boolean}
 * @description Whether the WebSocket connection has been lost
 */
let connectionLost = false;

/**
 * @type {Object.<string, boolean>}
 * @description Map of currently pressed keys
 */
let keysPressed = {};

/**
 * @type {number}
 * @description Timestamp of the last game state update
 */
let lastUpdateTime = Date.now();

/**
 * @type {('player1'|'player2'|null)}
 * @description Which paddle the current player controls
 */
let myPaddleSide = null;

/**
 * Initializes the remote game functionality.
 * Loads required scripts, establishes connections, and sets up the game UI.
 * @async
 * @function initializeGameRemote
 * @returns {Promise<void>}
 */
async function initializeGameRemote() {
	// Load the waiting screen script
	await loadScript('/js/waiting_screen.js');
	
	const urlParams = new URLSearchParams(window.location.search);
	gameID = urlParams.get('game_id');
	
	if (!gameID)
		await findOrCreateGameSession();
	else
		await joinGameSession(gameID);
	connectToGameWebSocket(gameID);
	setupGameUI();
	setInterval(checkConnection, 5000);
	setupNavigationListeners();
}

/**
 * Handles the beforeunload event to manage game abandonment.
 * @function handleBeforeUnload
 * @param {BeforeUnloadEvent} e - The beforeunload event
 * @returns {string|undefined} Message to show in confirmation dialog
 */
function handleBeforeUnload(e) {
	if (gameActive && gameSocket && gameSocket.readyState === WebSocket.OPEN) {
		try {
			gameSocket.send(JSON.stringify({
				type: 'player_leave',
				reason: 'browser_close'
			}));
		} catch (err) {
			console.error('Errore nell\'invio del messaggio di abbandono:', err);
		}
		const message = 'Sei sicuro di voler abbandonare la partita? Perderai con un punteggio di 3-0.';
		e.returnValue = message;
		return message;
	} else
		window.removeEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Sets up listeners for navigation events to properly cleanup game state.
 * @function setupNavigationListeners
 * @returns {void}
 */
function setupNavigationListeners() {
	// Gestisce la navigazione via History API
	window.addEventListener('popstate', () => {
		if (gameSocket && !gameActive) {
			cleanupGame('navigation');
		}
	});

	// Intercetta i click sui link per gestire la navigazione
	document.addEventListener('click', (e) => {
		const link = e.target.closest('a');
		if (link && !gameActive) {
			// Se siamo nella waiting screen e clicchiamo un link
			if (gameSocket) {
				cleanupGame('navigation');
			}
		}
	});

	// Rimuoviamo l'override di pushState che causava la ricorsione
	window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Cleans up game resources and connections.
 * @function cleanupGame
 * @param {string} reason - Reason for cleanup
 * @returns {void}
 */
function cleanupGame(reason) {
	// Imposta prima gameActive a false per evitare ulteriori elaborazioni di messaggi
	gameActive = false;

	// Chiudi WebSocket se ancora aperta
	if (gameSocket) {
		// Rimuovi tutti gli event handler prima della chiusura
		gameSocket.onmessage = null;
		gameSocket.onclose = null;
		gameSocket.onerror = null;
		
		if (gameSocket.readyState === WebSocket.OPEN) {
			console.log(`Chiusura connessione WebSocket: ${reason}`);
			try {
				// Invia un messaggio specifico per la pulizia della waiting room
				if (!gameActive) {
					gameSocket.send(JSON.stringify({
						type: 'leave_waiting_room'
					}));
				} else {
					gameSocket.send(JSON.stringify({
						type: 'player_leave',
						reason: reason
					}));
				}
				gameSocket.close(1000, reason);
			} catch (error) {
				console.error('Errore durante la chiusura del WebSocket:', error);
			}
		} else if (gameSocket.readyState === WebSocket.CONNECTING) {
			// Se la connessione è ancora in fase di apertura, la chiudiamo immediatamente
			gameSocket.close(1000, reason);
		}
		// Rimuovi il riferimento al socket
		gameSocket = null;
	}

	// Cancella il loop di animazione
	if (window.animationFrameId) {
		cancelAnimationFrame(window.animationFrameId);
		window.animationFrameId = null;
	}

	// Rimuovi gli event listeners
	window.removeEventListener('beforeunload', handleBeforeUnload);
	document.removeEventListener('keydown', handleKeyDown);
	document.removeEventListener('keyup', handleKeyUp);

	// Pulisci gli intervalli
	if (window.pingInterval) {
		clearInterval(window.pingInterval);
		window.pingInterval = null;
	}

	// Reset delle variabili di stato
	gameState = null;
	gameID = null;
	playerRole = null;
	connectionLost = false;
	keysPressed = {};
}

function handleGameLeave() {
	cleanupGame('navigation');
	// Non chiamiamo più navigateTo qui, lasciamo che la navigazione avvenga naturalmente
}

/**
 * Finds or creates a new game session.
 * @async
 * @function findOrCreateGameSession
 * @returns {Promise<void>}
 * @throws {Error} If session creation fails
 */
async function findOrCreateGameSession() {
	try {
		// Prima pulisci eventuali sessioni precedenti
		if (gameID) {
			try {
				await window.api.post(`/api/games/sessions/${gameID}/cleanup/`, {});
			} catch (error) {
				console.log('Cleanup sessione precedente fallito:', error);
			}
		}

		// API call to find or create a game session
		const response = await window.api.post('/api/games/sessions/', {});
		gameID = response.game_id;
		playerRole = response.role; // Set player role from API response
		
		console.log(`Game session created/joined: ${gameID}, role: ${playerRole}`);
		
		// Update URL with game ID for sharing
		const newUrl = new URL(window.location);
		newUrl.searchParams.set('game_id', gameID);
		window.history.replaceState({}, '', newUrl);
	} catch (error) {
		console.error('Error finding or creating game session:', error);
		showInfoToast('Impossibile creare o unirsi alla partita. Riprova.');
	}
}

/**
 * Joins an existing game session.
 * @async
 * @function joinGameSession
 * @param {string} id - ID of the game session to join
 * @returns {Promise<void>}
 * @throws {Error} If joining session fails
 */
async function joinGameSession(id) {
	try {
		// API call to join the specific game session
		const response = await window.api.post(`/api/games/sessions/${id}/join/`, {});
		playerRole = response.role; // Should return 'player1' or 'player2'
		console.log(`Joined game session ${id} as ${playerRole}`);
	} catch (error) {
		console.error('Error joining game session:', error);
		showInfoToast('Impossibile unirsi alla partita. La sessione potrebbe essere piena o non più disponibile.');
	}
}

/**
 * Establishes WebSocket connection for game communication.
 * @function connectToGameWebSocket
 * @param {string} id - Game session ID
 * @returns {void}
 */
function connectToGameWebSocket(id) {
	// Se c'è già una connessione attiva, chiudila prima
	if (gameSocket) {
		cleanupGame('reconnecting');
	}

	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const host = window.location.host;

	gameSocket = new WebSocket(`${protocol}//${host}/ws/game/${id}/`);
	
	gameSocket.onopen = function(e) {
		connectionLost = false;
		sendPing();
		gameSocket.send(JSON.stringify({
			type: 'join'
		}));
		window.pingInterval = setInterval(sendPing, 5000);
	};
	
	gameSocket.onmessage = function(e) {
		// Non processare messaggi se il gioco non è più attivo
		if (!gameActive && document.location.pathname !== '/game-remote') {
			console.log('Ignoring WebSocket message - game not active:', e.data);
			return;
		}
		
		const data = JSON.parse(e.data);
		connectionLost = false;
		handleWebSocketMessage(data);
	};
	
	gameSocket.onclose = function(e) {
		connectionLost = true;
		
		// Se la chiusura è intenzionale (codice 1000), non fare nulla
		if (e.code === 1000) {
			console.log('WebSocket closed normally:', e.reason);
			return;
		}
		
		// Se siamo ancora nella pagina di gioco, prova a riconnetterti
		if (document.location.pathname === '/game-remote' && gameActive) {
			setTimeout(() => {
				if (connectionLost) {
					showInfoToast('Connessione di gioco persa. Tentativo di riconnessione...');
					connectToGameWebSocket(gameID);
				}
			}, 3000);
		}
	};
	
	gameSocket.onerror = function(e) {
		console.error('WebSocket error:', e);
		connectionLost = true;
	};
}

/**
 * Send ping to server to keep connection alive
 */
function sendPing() {
	if (gameSocket && gameSocket.readyState === WebSocket.OPEN) {
		gameSocket.send(JSON.stringify({
			type: 'ping'
		}));
		
		// Schedule next ping
		setTimeout(sendPing, 30000);
	}
}

/**
 * Check if connection is still active
 */
function checkConnection() {
	if (gameSocket && gameSocket.readyState !== WebSocket.OPEN) {
		connectionLost = true;
		console.log('Connection check failed, socket not open');
		
		// Try to reconnect
		connectToGameWebSocket(gameID);
	}
}

/**
 * Safely updates a DOM element's text content
 * @param {string} elementId - The ID of the element to update
 * @param {string} text - The text to set
 * @returns {boolean} - Whether the update was successful
 */
function safelyUpdateElement(elementId, text) {
	const element = document.getElementById(elementId);
	if (element) {
		element.textContent = text;
		return true;
	}
	return false;
}

/**
 * Handles incoming WebSocket messages.
 * @function handleWebSocketMessage
 * @param {Object} data - Message data from server
 * @returns {void}
 */
function handleWebSocketMessage(data) {
	// Verifica se siamo ancora nella pagina di gioco prima di processare i messaggi
	if (!document.getElementById('gameCanvas') && data.type !== 'pong') {
		console.log('WebSocket message received but no longer on game page:', data.type);
		return;
	}
	
	switch(data.type) {
		case 'game_start':
			handleGameStart(data);
			break;
		case 'game_update':
			handleGameUpdate(data);
			break;
		case 'game_end':
			handleGameEnd(data);
			break;
		case 'game_abandoned':
			handleGameAbandoned(data);
			break;
		case 'assign_role':
			handleRoleAssignment(data);
			break;
		case 'waiting_for_opponent':
			showWaitingScreen();
			break;
		case 'players_ready':
			hideWaitingScreen();
			safelyUpdateElement('player1Name', data.player1);
			safelyUpdateElement('player2Name', data.player2);
			
			// Handle ready states
			if (data.player1_ready && playerRole === 'player2') {
				handleOpponentReady();
			}
			if (data.player2_ready && playerRole === 'player1') {
				handleOpponentReady();
			}
			break;
		case 'all_players_ready':
			// Start the game immediately when both players are ready
			gameActive = true;
			break;
		case 'error':
			console.error('Game error:', data.message);
			showInfoToast(`Errore di gioco: ${data.message}`);
			break;
		case 'pong':
			console.log('Server pong received');
			break;
		default:
			console.log('Unknown message type:', data.type);
	}
}

/**
 * Handle game start event
 * @param {Object} data - The game start data
 */
function handleGameStart(data) {
	// Update player names
	safelyUpdateElement('player1Name', data.player1_name);
	safelyUpdateElement('player2Name', data.player2_name);
	
	// Reset scores
	safelyUpdateElement('player1Score', '0');
	safelyUpdateElement('player2Score', '0');
	
	// Hide ready overlay and update game container
	const readyOverlay = document.getElementById('readyOverlay');
	const gameContainer = document.querySelector('.game-container');
	
	if (readyOverlay) {
		readyOverlay.classList.add('game-started');
	}
	
	if (gameContainer) {
		gameContainer.classList.add('game-active');
	}
	
	// Start the game
	startGame();
	
	// Set game as active
	gameActive = true;
}

/**
 * Handle player joined event
 * @param {Object} data - The player joined data
 */
function handlePlayerJoined(data) {
	
	// Update player name
	if (data.role === 'player1') {
		safelyUpdateElement('player1Name', data.player_name);
	} else {
		safelyUpdateElement('player2Name', data.player_name);
	}
	
	// Show start button to player1 if both players are present
	if (playerRole === 'player1' && data.both_players_present) {
		document.getElementById('startGameButton').style.display = 'block';
	}
}

/**
 * Handle game update event (ball and paddle positions)
 * @param {Object} data - The game update data
 */
function handleGameUpdate(data) {
	// Salva lo stato per poterlo riprodurre in caso di perdita di pacchetti
	
	// Conserva i dati di interpolazione
	if (gameState) {
		// Conserva lo stato precedente per l'interpolazione
		data.prevPaddle1Y = gameState.paddle1Y;
		data.prevPaddle2Y = gameState.paddle2Y;
		data.updateTime = Date.now();
		lastUpdateTime = Date.now();
	} else {
		// Se è il primo aggiornamento, non c'è interpolazione
		data.prevPaddle1Y = data.paddle1Y;
		data.prevPaddle2Y = data.paddle2Y;
		data.updateTime = Date.now();
		lastUpdateTime = Date.now();
	}
	
	gameState = data;
	
	// Aggiorna lo stato di gioco
	if (!window.animationFrameId) {
		window.animationFrameId = requestAnimationFrame(renderGame);
	}
}

/**
 * Renders the current game state.
 * @function renderGame
 * @returns {void}
 */
function renderGame() {
	if (gameState) {
		// Disegna lo stato corrente
		updateGameState(gameState);
	}
	// Continua l'animazione
	window.animationFrameId = requestAnimationFrame(renderGame);
}

/**
 * Updates and renders the game state.
 * @function updateGameState
 * @param {GameState} data - New game state data
 * @returns {void}
 */
function updateGameState(data) {
	// Aggiorna direttamente lo stato con i dati del server
	gameState = {
		ballX: data.ballX,
		ballY: data.ballY,
		paddle1Y: data.paddle1Y,
		paddle2Y: data.paddle2Y,
		player1Score: data.player1Score,
		player2Score: data.player2Score
	};

	const canvas = document.getElementById('gameCanvas');
	if (!canvas) return;
	
	const ctx = canvas.getContext('2d');
	
	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	
	// Sfondo con gradiente blu scuro
	const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
	bgGradient.addColorStop(0, "#1a2a4a");
	bgGradient.addColorStop(1, "#0f172a");
	ctx.fillStyle = "white";
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
	
	const paddleWidth = 10;
	const paddleHeight = 100;
	
	// Paddle del giocatore 1 con colore primario
	const player1Gradient = ctx.createLinearGradient(0, 0, paddleWidth, 0);
	player1Gradient.addColorStop(0, "#0d6efd");
	player1Gradient.addColorStop(1, "#0a58ca");
	ctx.fillStyle = player1Gradient;
	ctx.fillRect(0, data.paddle1Y, paddleWidth, paddleHeight);
	
	// Paddle del giocatore 2 con colore viola
	const player2Gradient = ctx.createLinearGradient(canvas.width - paddleWidth, 0, canvas.width, 0);
	player2Gradient.addColorStop(0, "#6f42c1");
	player2Gradient.addColorStop(1, "#6610f2");
	ctx.fillStyle = player2Gradient;
	ctx.fillRect(canvas.width - paddleWidth, data.paddle2Y, paddleWidth, paddleHeight);
	
	// Palla con effetto glow
	ctx.fillStyle = "white";
	ctx.shadowColor = "#0d6efd";
	ctx.shadowBlur = 15;
	ctx.beginPath();
	ctx.arc(data.ballX, data.ballY, 10, 0, Math.PI * 2);
	ctx.closePath();
	ctx.fill();
	ctx.shadowBlur = 0; // Resetta l'effetto shadow
	
	// Update scores
	safelyUpdateElement('player1Score', data.player1Score);
	safelyUpdateElement('player2Score', data.player2Score);
}

/**
 * Invia il ruolo assegnato
 * @param {Object} data - The event data
 */
function handleRoleAssignment(data) {
	// Imposta il lato del paddle che controllo
	myPaddleSide = data.role;
	console.log(`Assegnato ruolo: ${myPaddleSide}`);
}

/**
 * Handle game end event
 * @param {Object} data - The game end data
 */
function handleGameEnd(data) {
	// Verifica se siamo ancora nella pagina di gioco
	if (!document.getElementById('gameCanvas')) {
		console.log('Game end received but no longer on game page');
		cleanupGame('page_changed');
		return;
	}

	// Update final scores safely
	safelyUpdateElement('player1Score', data.player1_score);
	safelyUpdateElement('player2Score', data.player2_score);
	
	// Get winner name safely
	const player1Element = document.getElementById('player1Name');
	const player2Element = document.getElementById('player2Name');
	const winnerName = data.winner === 'player1' ? 
		(player1Element ? player1Element.textContent : 'Player 1') : 
		(player2Element ? player2Element.textContent : 'Player 2');
	
	// Cleanup game resources
	cleanupGame('game_completed');
	
	// Show winner message
	showInfoToast(`${winnerName} ha vinto la partita!`);
	
	// Reset UI state
	const readyOverlay = document.getElementById('readyOverlay');
	const gameContainer = document.querySelector('.game-container');
	
	if (readyOverlay) {
		readyOverlay.classList.remove('game-started');
	}
	
	if (gameContainer) {
		gameContainer.classList.remove('game-active');
	}
	
	// Navigate home
	window.navigateTo('/');
}

/**
 * Handle game abandoned event
 * @param {Object} data - The game abandoned data
 */
function handleGameAbandoned(data) {
	// Verifica se siamo ancora nella pagina di gioco
	if (!document.getElementById('gameCanvas')) {
		console.log('Game abandoned received but no longer on game page');
		cleanupGame('page_changed');
		return;
	}

	// Update final scores safely
	safelyUpdateElement('player1Score', data.player1_score);
	safelyUpdateElement('player2Score', data.player2_score);
	
	// Cleanup game resources
	cleanupGame('game_abandoned');
	if (data.abandoned_by === myPaddleSide) {
		showWarningToast('Attenzione, hai perso la partita 0-3 a tavolino per abbandono');
	} else {
		showInfoToast(`L'avversario ha abbandonato la partita. Vittoria assegnata 3-0!`);
	}
	// Navigate home
	window.navigateTo('/');
}

/**
 * Sets up the game UI and input handlers.
 * @function setupGameUI
 * @returns {void}
 */
function setupGameUI() {
	// Crea messaggio di attesa se non esiste
	if (!document.getElementById('waitingMessage')) {
		const waitingDiv = document.createElement('div');
		waitingDiv.id = 'waitingMessage';
		waitingDiv.style.textAlign = 'center';
		waitingDiv.style.marginTop = '20px';
		waitingDiv.style.color = 'white';
		waitingDiv.style.fontSize = '18px';
		waitingDiv.style.display = 'none';
		waitingDiv.textContent = 'Waiting for opponent to join...';
		document.querySelector('.game-container').appendChild(waitingDiv);
	}
	
	// Set up keyboard controls
	document.addEventListener('keydown', handleKeyDown);
	document.addEventListener('keyup', handleKeyUp);
	
	// Set up ready button handler
	const readyButton = document.getElementById('readyButton');
	if (readyButton) {
		readyButton.addEventListener('click', handleReadyClick);
	}
	
	// Inizializza il canvas una sola volta
	const canvas = document.getElementById('gameCanvas');
	if (canvas) {
		canvas.width = 1000;
		canvas.height = 500;
		
		// Disegna lo sfondo iniziale
		const ctx = canvas.getContext('2d');
		
		// Sfondo con gradiente blu scuro
		const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
		bgGradient.addColorStop(0, "#1a2a4a");
		bgGradient.addColorStop(1, "#0f172a");
		ctx.fillStyle = "white";
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
	}
}

/**
 * Handles keyboard input for paddle movement.
 * @function handleKeyDown
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {void}
 */
function handleKeyDown(event) {
	if (!gameSocket || gameSocket.readyState !== WebSocket.OPEN || !gameActive) return;
	
	let direction = null;
	
	if (event.key === 'ArrowUp' || event.key === 'w') {
		direction = 'up';
		keysPressed[event.key] = true;
		event.preventDefault(); // Previene lo scroll della pagina
	} else if (event.key === 'ArrowDown' || event.key === 's') {
		direction = 'down';
		keysPressed[event.key] = true;
		event.preventDefault(); // Previene lo scroll della pagina
	}
	
	if (direction) {
		// Invia immediatamente il comando al server
		gameSocket.send(JSON.stringify({
			type: 'paddle_move',
			direction: direction,
			action: 'start'
		}));
	}
}

/**
 * Handles keyboard key release for paddle movement.
 * @function handleKeyUp
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {void}
 */
function handleKeyUp(event) {
	if (!gameSocket || gameSocket.readyState !== WebSocket.OPEN || !gameActive) return;
	
	let direction = null;
	
	if (event.key === 'ArrowUp' || event.key === 'w') {
		direction = 'up';
		keysPressed[event.key] = false;
		event.preventDefault(); // Previene eventuali comportamenti residui
	} else if (event.key === 'ArrowDown' || event.key === 's') {
		direction = 'down';
		keysPressed[event.key] = false;
		event.preventDefault(); // Previene eventuali comportamenti residui
	}
	
	if (direction) {
		// Invia immediatamente il comando al server
		gameSocket.send(JSON.stringify({
			type: 'paddle_move',
			direction: direction,
			action: 'stop'
		}));
	}
}

/**
 * Starts the game by initializing canvas and game state.
 * @function startGame
 * @returns {void}
 */
function startGame() {
	// Inizializza il canvas con dimensioni corrette
	const canvas = document.getElementById('gameCanvas');
	if (canvas) {
		canvas.width = 1000;
		canvas.height = 500;
		
		// Imposta lo sfondo trasparente
		canvas.style.backgroundColor = "white";
		const canvasContainer = document.querySelector(".canvas-container");
		if (canvasContainer) {
			canvasContainer.style.backgroundColor = "white";
		}
	}
	
	// Reset game state con valori iniziali
	gameState = {
		ballX: 500,
		ballY: 250,
		paddle1Y: 200,
		paddle2Y: 200,
		player1Score: 0,
		player2Score: 0
	};
	
	// Avvia il loop di rendering
	if (!window.animationFrameId) {
		window.animationFrameId = requestAnimationFrame(renderGame);
	}
}

/**
 * Handles player ready button click.
 * @function handleReadyClick
 * @returns {void}
 */
function handleReadyClick() {
	if (!gameSocket || gameSocket.readyState !== WebSocket.OPEN || playerReady) return;
	
	const readyButton = document.getElementById('readyButton');
	const waitingText = document.querySelector('.waiting-text');
	
	if (readyButton) {
		readyButton.classList.add('ready');
		readyButton.disabled = true;
		readyButton.innerHTML = '<i class="fas fa-check"></i> Pronto!';
	}
	
	if (waitingText) {
		waitingText.textContent = 'In attesa dell\'altro giocatore...';
	}
	
	playerReady = true;
	
	// Send ready status to server
	gameSocket.send(JSON.stringify({
		type: 'player_ready'
	}));
}

/**
 * Sends ready status for both players to server.
 * @async
 * @function send_players_ready
 * @param {Object} event - Event data containing player ready states
 * @returns {Promise<void>}
 */
async function send_players_ready(event) {
	await self.send_json({
		"type": "players_ready",
		"playersConnected": event["playersConnected"],
		"player1": event["player1"],
		"player2": event["player2"],
		"player1_ready": event["player1_ready"],
		"player2_ready": event["player2_ready"]
	});
}

/**
 * Updates UI to reflect opponent's ready status.
 * @function handleOpponentReady
 * @returns {void}
 */
function handleOpponentReady() {
	const readyButton = document.getElementById('readyButton');
	const waitingText = document.querySelector('.waiting-text');
	if (readyButton && !playerReady) {
		readyButton.innerHTML = '<i class="fas fa-check"></i> Avversario Pronto';
	}
	if (waitingText) {
		waitingText.textContent = "L'avversario è pronto!";
	}
}

// Export initialization function
window.initializeGameRemote = initializeGameRemote;