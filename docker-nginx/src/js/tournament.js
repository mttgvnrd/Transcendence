/**
 * @fileoverview Module for managing tournament functionality including creation, registration, and match handling.
 * @module tournament
 */

/**
 * Initializes the tournament page and loads all tournament data.
 * @async
 * @function initializeTournament
 * @returns {Promise<void>}
 */
async function initializeTournament() {
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
		const tournaments = await window.api.get('/api/tournaments/');
		console.log('Tournament response data:', tournaments);
		document.getElementById('prova').style.display = '';
		const registrationTournaments = tournaments.filter(t => t.status === 'registration_open');
		const ongoingTournaments = tournaments.filter(t => t.status === 'in_progress');
		const completedTournaments = tournaments.filter(t => t.status === 'completed');
		await renderRegistrationTournaments(registrationTournaments);
		await renderOngoingTournaments(ongoingTournaments);
		renderCompletedTournaments(completedTournaments);
		await initializePageElements();
	}
	catch (error) {
		showErrorToast("Si è verificato un errore durante il caricamento dei tornei. Riprova più tardi.");
	}
}

/**
 * Initializes page elements including forms, CSRF tokens, and tooltips.
 * @async
 * @function initializePageElements
 * @returns {Promise<void>}
 */
async function initializePageElements() {
	const tournamentForm = document.getElementById('tournament-form');
	
	// Set CSRF token in the form if available
	if (window.getCsrfToken) {
		const csrfToken = window.getCsrfToken();
		const csrfInput = document.getElementById('csrftoken');
		if (csrfInput && csrfToken) {
			csrfInput.value = csrfToken;
		}
	}
	// Setup form submission
	if (tournamentForm) {
		tournamentForm.addEventListener('submit', handleFormSubmit);
	}
	
	// Enable Bootstrap tooltips if tooltips are used
	const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
	if (tooltipTriggerList.length > 0) {
		tooltipTriggerList.map(function (tooltipTriggerEl) {
			return new bootstrap.Tooltip(tooltipTriggerEl);
		});
	}
}

/**
 * Displays an error message to the user in a dismissible alert.
 * @function showErrorMessage
 * @param {string} message - The error message to display
 * @returns {void}
 */
function showErrorMessage(message) {
	// Check if error container exists, if not create one
	let errorContainer = document.getElementById('error-message-container');
	if (!errorContainer) {
		errorContainer = document.createElement('div');
		errorContainer.id = 'error-message-container';
		errorContainer.className = 'alert alert-danger alert-dismissible fade show';
		errorContainer.style.position = 'fixed';
		errorContainer.style.top = '20px';
		errorContainer.style.right = '20px';
		errorContainer.style.zIndex = '9999';
		
		const closeButton = document.createElement('button');
		closeButton.type = 'button';
		closeButton.className = 'btn-close';
		closeButton.setAttribute('data-bs-dismiss', 'alert');
		closeButton.setAttribute('aria-label', 'Close');
		
		errorContainer.appendChild(closeButton);
		document.body.appendChild(errorContainer);
	}
	
	// Set message and show
	errorContainer.innerHTML = `<strong>Errore:</strong> ${message} 
		<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
	
	// Auto hide after 5 seconds
	setTimeout(() => {
		if (errorContainer.parentNode) {
			errorContainer.parentNode.removeChild(errorContainer);
		}
	}, 5000);
}

/**
 * Checks if a tournament with the given name already exists.
 * @async
 * @function checkTournamentNameExists
 * @param {string} name - The tournament name to check
 * @returns {Promise<boolean>} True if a tournament with the name exists, false otherwise
 */
async function checkTournamentNameExists(name) {
	try {
		const tournaments = await window.api.get('/api/tournaments/');
		return tournaments.some(tournament => 
			tournament.name.toLowerCase() === name.toLowerCase()
		);
	} catch (error) {
		console.error('Errore durante la verifica del nome del torneo:', error);
		return false;
	}
}

/**
 * Handles the tournament creation form submission.
 * @async
 * @function handleFormSubmit
 * @param {Event} event - The form submission event
 * @returns {Promise<void>}
 */
async function handleFormSubmit(event) {
	event.preventDefault();
	
	const form = event.target;
	const formData = new FormData(form);
	
	// Ottieni il nome del torneo
	const tournamentName = formData.get('name');
	
	// Verifica campi obbligatori
	if (!tournamentName || tournamentName.trim() === '') {
		showErrorToast('Il nome del torneo è obbligatorio.');
		return;
	}
	
	// Verifica se esiste già un torneo con lo stesso nome
	const nameExists = await checkTournamentNameExists(tournamentName);
	if (nameExists) {
		showErrorToast('Esiste già un torneo con questo nome. Scegli un nome diverso.');
		const nameField = document.querySelector('input[name="name"]');
		if (nameField) {
			nameField.classList.add('is-invalid');
			nameField.addEventListener('input', function() {
				this.classList.remove('is-invalid');
			}, { once: true });
		}
		return;
	}    
	try {
		const response = await window.api.post('/api/tournaments/', Object.fromEntries(formData));
		showSuccessToast('Torneo creato con successo');
		history.replaceState(null, null, '/tournaments');
		handleRouting();
	} catch (error) {
		console.error('Errore nella creazione del torneo:', error);
		showErrorToast('Si è verificato un errore durante la creazione del torneo. Riprova più tardi.');
	}
}

/**
 * Renders the list of tournaments in registration phase.
 * @async
 * @function renderRegistrationTournaments
 * @param {Array<Object>} tournaments - Array of tournament objects in registration phase
 * @returns {Promise<void>}
 */
async function renderRegistrationTournaments(tournaments) {
	const container = document.getElementById('registration-tournaments-list');
	const emptyMessage = document.getElementById('no-registration-tournaments-message');
	
	if (!container) return;
	
	// Clear existing tournaments except the empty message
	const oldItems = container.querySelectorAll('.tournament-card');
	oldItems.forEach(item => container.removeChild(item));
	
	// Show/hide empty message
	if (tournaments.length === 0) {
		if (emptyMessage) emptyMessage.style.display = 'block';
		return;
	} else {
		if (emptyMessage) emptyMessage.style.display = 'none';
	}
	
	// Add tournament cards - now using await since createRegistrationTournamentHtml is async
	for (const tournament of tournaments) {
		const tournamentCard = await createRegistrationTournamentHtml(tournament);
		container.appendChild(tournamentCard);
	}
}

/**
 * Creates HTML markup for a tournament in registration phase.
 * @async
 * @function createRegistrationTournamentHtml
 * @param {Object} tournament - Tournament object to render
 * @param {string} tournament.name - Tournament name
 * @param {string} tournament.start_date - Tournament start date
 * @param {number} tournament.max_participants - Maximum number of participants
 * @param {Array<Object>} tournament.participants - Array of participant objects
 * @returns {Promise<HTMLElement>} The created tournament card element
 */
async function createRegistrationTournamentHtml(tournament) {
	const card = document.createElement('div');
	card.className = 'tournament-container mb-4';
	
	// Get current registration status
	const currentParticipants = tournament.participants ? tournament.participants.length : 0;
	const registrationFull = currentParticipants >= tournament.max_participants;
	
	// Determine if user is already registered - with await to ensure it's set before rendering
	let userIsRegistered = false;
	let userNickname = '';
	
	// Get current user nickname - using await to make sure we have it
	if (window.getCurrentUsername) {
		try {
			const response = await window.api.get('/api/account/');
			userNickname = response.display_name;
			if (tournament.participants) {
				userIsRegistered = tournament.participants.some(p => p.nickname === userNickname);
			}
		} catch (error) {
			console.error('Error getting current username:', error);
		}
	}
	
	card.innerHTML = `
		<div class="card tournament-item h-100 p-0">
			<div class="card-body">
				<div class="d-flex justify-content-between align-items-start mb-3">
					<div>
						<h3 class="h5 mb-2">
							<i class="fas fa-trophy text-warning me-2"></i>${tournament.name}
						</h3>
						<p class="text-muted mb-2">
							<i class="far fa-clock me-1"></i>${new Date(tournament.start_date).toLocaleString()}
						</p>
						<p class="mb-3">
							<i class="fas fa-users me-1"></i>${currentParticipants} / ${tournament.max_participants} participants
						</p>
						<div class="progress" style="height: 8px; border-radius: 4px;">
							<div class="progress-bar ${registrationFull ? 'bg-success' : 'bg-primary'}" 
								role="progressbar" 
								style="width: ${(currentParticipants / tournament.max_participants) * 100}%"
								aria-valuenow="${currentParticipants}" 
								aria-valuemin="0" 
								aria-valuemax="${tournament.max_participants}">
							</div>
						</div>
					</div>
					<div class="join-button-container">
						${userIsRegistered ? `
							<button class="btn btn-danger btn-hover-effect leave-tournament-btn" data-tournament-id="${tournament.id}">
								<i class="fas fa-sign-out-alt me-1"></i>Unregister
							</button>
						` : `
							<button class="btn ${registrationFull ? 'btn-secondary disabled' : 'btn-primary'} btn-hover-effect join-tournament-btn" 
									data-tournament-id="${tournament.id}"
									${registrationFull ? 'disabled' : ''}>
								<i class="fas ${registrationFull ? 'fa-users-slash' : 'fa-sign-in-alt'} me-1"></i>
								${registrationFull ? 'Full' : 'Join'}
							</button>
						`}
					</div>
				</div>
				
				<div class="mt-4">
					<h4 class="h6 mb-3">Participants</h4>
					<div class="list-group participant-list">
						${tournament.participants ? tournament.participants.map(p => `
							<div class="list-group-item d-flex justify-content-between align-items-center">
								<span>
									<i class="fas fa-user me-2 text-primary"></i>${p.nickname}
								</span>
								${tournament.creator && p.nickname === tournament.creator.username ? 
									'<span class="badge bg-warning text-dark"><i class="fas fa-crown me-1"></i>Creator</span>' : ''}
							</div>
						`).join('') : ''}
					</div>
				</div>
			</div>
		</div>
	`;
	
	// Add event listener to join button
	const joinButton = card.querySelector('.join-tournament-btn');
	if (joinButton && !joinButton.disabled) {
		joinButton.addEventListener('click', async function() {
			const tournamentId = this.getAttribute('data-tournament-id');
			try {
				await joinTournament(tournamentId);
				// Reload the page to see updated tournament
				history.replaceState(null, null, '/tournaments');
				handleRouting();
			} catch (error) {
				console.error('Error joining tournament:', error);
				showErrorMessage('Failed to join tournament. Please try again.');
			}
		});
	}
	
	// Add event listener to leave button
	const leaveButton = card.querySelector('.leave-tournament-btn');
	if (leaveButton) {
		leaveButton.addEventListener('click', async function() {
			const tournamentId = this.getAttribute('data-tournament-id');
			
			// Ask for confirmation
			if (confirm('Are you sure you want to unregister from this tournament?')) {
				try {
					await leaveTournament(tournamentId);
					// Reload the page to see updated tournament
				} catch (error) {
					console.error('Error leaving tournament:', error);
					showErrorMessage('Failed to leave tournament. Please try again.');
				}
			}
		});
	}
	
	return card;
}

/**
 * Handles joining a tournament.
 * @async
 * @function joinTournament
 * @param {number} tournamentId - ID of the tournament to join
 * @returns {Promise<Object>} Response from the server
 * @throws {Error} If joining fails
 */
async function joinTournament(tournamentId) {
	try {
		const response = await window.api.post(`/api/tournaments/${tournamentId}/join/`, {});
		showSuccessToast('Iscrizione al torneo completata con successo');
		return response;
	} catch (error) {
		console.error('Error joining tournament:', error);
		throw error;
	}
}

/**
 * Handles leaving a tournament.
 * @async
 * @function leaveTournament
 * @param {number} tournamentId - ID of the tournament to leave
 * @returns {Promise<Object>} Response from the server
 * @throws {Error} If leaving fails
 */
async function leaveTournament(tournamentId) {
	try {
		const response = await window.api.post(`/api/tournaments/${tournamentId}/leave/`, {});
		showSuccessToast('Iscrizione al torneo completata con successo');
		history.replaceState(null, null, '/tournaments');
		handleRouting();
		return response;
	} catch (error) {
		console.error('Error leaving tournament:', error);
		throw error;
	}
}

/**
 * Renders the list of ongoing tournaments.
 * @async
 * @function renderOngoingTournaments
 * @param {Array<Object>} tournaments - Array of tournament objects in progress
 * @returns {Promise<void>}
 */
async function renderOngoingTournaments(tournaments) {
	const container = document.getElementById('ongoing-tournaments-list');
	const emptyMessage = document.getElementById('no-ongoing-tournaments-message');
	
	if (!container) return;
	
	// Clear existing tournaments except the empty message
	const oldItems = container.querySelectorAll('.tournament-card');
	oldItems.forEach(item => container.removeChild(item));
	
	// Show/hide empty message
	if (tournaments.length === 0) {
		if (emptyMessage) emptyMessage.style.display = 'block';
		return;
	} else {
		if (emptyMessage) emptyMessage.style.display = 'none';
	}
	
	// Add tournament cards - using await since createOngoingTournamentHtml is now async
	for (const tournament of tournaments) {
		const tournamentCard = await createOngoingTournamentHtml(tournament);
		container.appendChild(tournamentCard);
	}
}

/**
 * Creates HTML markup for an ongoing tournament.
 * @async
 * @function createOngoingTournamentHtml
 * @param {Object} tournament - Tournament object to render
 * @param {Array<Object>} tournament.matches - Array of match objects
 * @param {Array<Object>} tournament.participants - Array of participant objects
 * @returns {Promise<HTMLElement>} The created tournament card element
 */
async function createOngoingTournamentHtml(tournament) {
	const card = document.createElement('div');
	card.className = 'tournament-container mb-4';
	
	// Get current match data
	const matches = tournament.matches || [];
	
	// Get userNickname to check if user is participating - AWAIT this now
	let userNickname = '';
	let userIsParticipating = false;
	
	// Get current user nickname synchronously if possible
	if (window.getCurrentUsername) {
		try {
			const response = await window.api.get('/api/account/');
			userNickname = response.display_name;
			console.log("Current user nickname:", userNickname);
			if (tournament.participants) {
				userIsParticipating = tournament.participants.some(p => p.nickname === userNickname);
			}
		} catch(error) {
			console.error("Error getting current username:", error);
		}
	}
	
	// Find user's current match if any
	let userCurrentMatch = null;
	if (userNickname && matches.length > 0) {
		userCurrentMatch = matches.find(match => 
			(match.player_1.nickname === userNickname || match.player_2.nickname === userNickname) && 
			!match.winner
		);
	}
	
	// Sort matches by round and then by ID to ensure consistent order
	const sortedMatches = [...matches].sort((a, b) => {
		if (a.round !== b.round) {
			return a.round - b.round;
		}
		return a.id - b.id;
	});

	// Verificare quali match possono essere giocati
	// Un match può essere giocato solo se tutti i match precedenti dello stesso round sono stati completati
	const playableMatches = new Set();
	
	// Raggruppa i match per round
	const matchesByRound = {};
	sortedMatches.forEach(match => {
		if (!matchesByRound[match.round]) {
			matchesByRound[match.round] = [];
		}
		matchesByRound[match.round].push(match);
	});
	
	// Per ogni round, determina quali match possono essere giocati
	Object.keys(matchesByRound).forEach(round => {
		const roundMatches = matchesByRound[round];
		
		// Per ogni match nel round corrente
		roundMatches.forEach((match, index) => {
			// Il match può essere giocato se:
			// 1. È il primo match del round, oppure
			// 2. Tutti i match precedenti del round hanno un vincitore
			if (index === 0 || roundMatches.slice(0, index).every(m => m.winner !== null)) {
				playableMatches.add(match.id);
			}
		});
	});
	
	card.innerHTML = `
		<div class="card tournament-item h-100 p-0">
			<div class="card-body">
				<div class="d-flex justify-content-between align-items-start mb-3">
					<div>
						<h3 class="h5 mb-2">
							<i class="fas fa-play-circle text-primary me-2"></i>${tournament.name}
						</h3>
						<p class="text-muted mb-2">
							<i class="far fa-clock me-1"></i>Started: ${new Date(tournament.start_date).toLocaleString()}
						</p>
						<p class="mb-0">
							<i class="fas fa-users me-1"></i>${tournament.participants ? tournament.participants.length : '0'} participants
						</p>
					</div>
					<div>
						<a href="/tournament/${tournament.id}/" class="btn btn-outline-primary btn-hover-effect">
							<i class="fas fa-eye me-1"></i>View Bracket
						</a>
						${userCurrentMatch && playableMatches.has(userCurrentMatch.id) ? `
						<button class="btn btn-success ms-2 btn-hover-effect play-match-btn" 
								data-tournament-id="${tournament.id}"
								data-match-id="${userCurrentMatch.id}">
							<i class="fas fa-gamepad me-1"></i>Play Match
						</button>
						` : ''}
					</div>
				</div>
				
				<div class="mt-4">
					<h4 class="h6 mb-3">
						<i class="fas fa-list-ol me-1"></i>Ordine di Gioco
					</h4>
					<div class="list-group">
						${sortedMatches.length > 0 ? 
							sortedMatches.map(match => {
								const isUserPlayer1 = match.player_1.nickname === userNickname;
								const isUserPlayer2 = match.player_2.nickname === userNickname;
								const isUserInMatch = isUserPlayer1 || isUserPlayer2;
								const isPlayable = playableMatches.has(match.id);
								
								return `
								<div class="list-group-item ${isUserInMatch ? 'bg-light' : ''} mb-2 rounded">
									<div class="d-flex justify-content-between align-items-center">
										<div>
											<span class="badge bg-secondary me-2">Round ${match.round}</span>
											<span class="badge ${isUserPlayer1 ? 'bg-primary' : 'bg-secondary'} me-2">
												${match.player_1.nickname}
											</span>
											<i class="fas fa-vs mx-1"></i>
											<span class="badge ${isUserPlayer2 ? 'bg-primary' : 'bg-secondary'} ms-2">
												${match.player_2.nickname}
											</span>
										</div>
										<div>
											${match.winner ? 
												`<span class="badge bg-success">Completed</span>` 
												: isUserInMatch ?
													isPlayable ?
														`<button class="btn btn-sm btn-success btn-hover-effect play-match-btn"
															data-tournament-id="${tournament.id}"
															data-match-id="${match.id}">
															<i class="fas fa-gamepad me-1"></i>Play
														</button>`
														:
														`<span class="badge bg-warning text-dark">Waiting for previous matches</span>`
													: `<span class="badge bg-warning text-dark">In attesa</span>`
											}
										</div>
									</div>
									${match.winner ? `
									<div class="mt-2 text-center">
										<span class="badge bg-light text-dark">
											${match.score_player_1} - ${match.score_player_2}
										</span>
										<span class="ms-2">
											Winner: <span class="fw-bold">${match.winner === match.player_1.id ? match.player_1.nickname : match.player_2.nickname}</span>
										</span>
									</div>
									` : ''}
								</div>`;
							}).join('') 
							: '<div class="list-group-item text-center text-muted rounded">Nessun match trovato</div>'
						}
					</div>
				</div>
				
				${userIsParticipating ? `
				<div class="mt-4">
					<h4 class="h6 mb-3">Your Matches</h4>
					<div class="list-group">
						${matches.filter(match => 
							match.player_1.nickname === userNickname || 
							match.player_2.nickname === userNickname
						).map(match => {
							const isPlayable = playableMatches.has(match.id);
							return `
							<div class="list-group-item mb-2 rounded">
								<div class="d-flex justify-content-between align-items-center">
									<div>
										<span class="badge ${match.player_1.nickname === userNickname ? 'bg-primary' : 'bg-secondary'} me-2">
											${match.player_1.nickname}
										</span>
										<i class="fas fa-vs mx-2"></i>
										<span class="badge ${match.player_2.nickname === userNickname ? 'bg-primary' : 'bg-secondary'} ms-2">
											${match.player_2.nickname}
										</span>
									</div>
									<div>
										${match.winner ? 
											`<span class="badge bg-success">Completed</span>` : 
											isPlayable ?
												`<button class="btn btn-sm btn-success btn-hover-effect play-match-btn"
													data-tournament-id="${tournament.id}"
													data-match-id="${match.id}">
													<i class="fas fa-gamepad me-1"></i>Play
												</button>`
												:
												`<span class="badge bg-warning text-dark">Waiting for previous matches</span>`
										}
									</div>
								</div>
								${match.winner ? `
								<div class="mt-2 text-center">
									<span class="badge bg-light text-dark">
										${match.score_player_1} - ${match.score_player_2}
									</span>
									<span class="ms-2">
										Winner: <span class="fw-bold">${match.winner === match.player_1.id ? match.player_1.nickname : match.player_2.nickname}</span>
									</span>
								</div>
								` : ''}
							</div>
						`}).join('') || '<div class="list-group-item text-center text-muted rounded">No matches found</div>'}
					</div>
				</div>
				` : ''}
			</div>
		</div>
	`;
	
	// Add event listeners for play match buttons
	const playButtons = card.querySelectorAll('.play-match-btn');
	playButtons.forEach(button => {
		button.addEventListener('click', async function() {
			const tournamentId = this.getAttribute('data-tournament-id');
			const matchId = this.getAttribute('data-match-id');
			try {
				await playTournamentMatch(tournamentId, matchId);
			} catch (error) {
				console.error('Error creating match game session:', error);
				showErrorMessage('Failed to create game session. Please try again.');
			}
		});
	});
	
	return card;
}

/**
 * Initiates a tournament match game session.
 * @async
 * @function playTournamentMatch
 * @param {number} tournamentId - ID of the tournament
 * @param {number} matchId - ID of the match to play
 * @returns {Promise<void>}
 * @throws {Error} If creating game session fails
 */
async function playTournamentMatch(tournamentId, matchId) {
	try {
		// Create a game session for this match
		const response = await window.api.post(`/api/tournaments/${tournamentId}/matches/${matchId}/`, {});
		console.log('Game session created:', response);
		
		// Attendi un momento per mostrare il messaggio prima del redirect
		setTimeout(() => {
			// Redirect direttamente a game-remote con il game_id
			window.location.replace(`/game-remote?game_id=${response.game_id}&tournament_id=${tournamentId}&match_id=${matchId}`);
		}, 1500);
	} catch (error) {
		// Rimuovi il messaggio di attesa in caso di errore
		const loadingMessage = document.querySelector('.alert.alert-info');
		if (loadingMessage) {
			loadingMessage.remove();
		}
		
		console.error('Error creating game session:', error);
		
		// Mostra un messaggio di errore più dettagliato se disponibile
		let errorMessage = 'Si è verificato un errore nella creazione della partita. Riprova più tardi.';
		
		if (error.response && error.response.data && error.response.data.detail) {
			errorMessage = error.response.data.detail;
		}
		
		showErrorMessage(errorMessage);
		throw error;
	}
}

/**
 * Renders the list of completed tournaments.
 * @function renderCompletedTournaments
 * @param {Array<Object>} completedTournaments - Array of completed tournament objects
 * @returns {void}
 */
function renderCompletedTournaments(completedTournaments) {
	const container = document.getElementById('completed-tournaments-list');
	const emptyMessage = document.getElementById('no-completed-tournaments-message');
	
	if (!container) return;
	
	// Clear existing tournaments except the empty message
	const oldItems = container.querySelectorAll('.tournament-card');
	oldItems.forEach(item => container.removeChild(item));
	
	// Show/hide empty message
	if (completedTournaments.length === 0) {
		if (emptyMessage) emptyMessage.style.display = 'block';
		return;
	} else {
		if (emptyMessage) emptyMessage.style.display = 'none';
	}
	
	// Add tournament cards
	completedTournaments.forEach(tournament => {
		const tournamentCard = createCompletedTournamentHtml(tournament);
		container.appendChild(tournamentCard);
	});
}

/**
 * Creates HTML markup for a completed tournament.
 * @function createCompletedTournamentHtml
 * @param {Object} tournament - Tournament object to render
 * @param {string} tournament.name - Tournament name
 * @param {string} tournament.end_date - Tournament end date
 * @param {string} tournament.winner_nickname - Nickname of the tournament winner
 * @returns {HTMLElement} The created tournament card element
 */
function createCompletedTournamentHtml(tournament) {
	const card = document.createElement('div');
	card.className = 'tournament-container mb-4';
	
	card.innerHTML = `
		<div class="card tournament-item h-100 p-0">
			<div class="card-body">
				<div class="d-flex justify-content-between align-items-start mb-3">
					<div>
						<h3 class="h5 mb-2">
							<i class="fas fa-trophy text-warning me-2"></i>${tournament.name}
						</h3>
						<p class="text-muted mb-2">
							<i class="far fa-clock me-1"></i>Ended: ${tournament.end_date ? new Date(tournament.end_date).toLocaleString() : 'N/A'}
						</p>
						<div class="winner-info">
							<i class="fas fa-crown text-warning me-2"></i>
							Winner: <span class="fw-bold ms-1">${tournament.winner_nickname || 'Not available'}</span>
						</div>
					</div>
					<div>
						<a href="/tournament/${tournament.id}/" class="btn btn-outline-primary btn-hover-effect">
							<i class="fas fa-eye me-1"></i>View Results
						</a>
					</div>
				</div>
			</div>
		</div>
	`;
	
	return card;
}

/**
 * Checks if the current user is authenticated.
 * @async
 * @function checkAuthentication
 * @returns {Promise<boolean>} True if user is authenticated, false otherwise
 */
async function checkAuthentication() {
	try {
		// Usa la funzione api.get invece di fetch manuale
		const data = await window.api.get('/api/auth/status/');
		
		console.log("Authentication status:", data);
		
		if (!data.isAuthenticated) {
			console.log("User is not authenticated, redirecting to login");
			window.location.href = '/login';
			return false;
		}
		
		return true;
	} catch (error) {
		console.error("Error checking authentication:", error);
		return false;
	}
}

/**
 * Event listener for DOMContentLoaded.
 * Checks authentication and initializes tournament page if user is authenticated.
 * @listens DOMContentLoaded
 */

document.addEventListener('DOMContentLoaded', async () => {
	const isAuthenticated = await checkAuthentication();
	if (isAuthenticated) {
		initializeTournament();
	}
});

// Export functions to window object
window.initializeTournament = initializeTournament;
