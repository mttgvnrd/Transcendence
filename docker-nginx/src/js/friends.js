/**
 * Module for managing friend functionality including friend requests, friend list, and user search.
 * @module friends
 */

/**
 * Initializes the friends functionality by setting up event listeners and loading necessary data.
 * This function checks authentication, sets up WebSocket connections, and loads friend-related data.
 * @async
 * @function initializeFriends
 * @returns {Promise<void>}
 */
async function initializeFriends() {
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
	// Assicurati che la connessione WebSocket per lo stato utente sia attiva
	ensureUserStatusConnection();
	
	// Aggiungi listener per gli eventi di stato utente
	setupUserStatusListeners();
	
	// Initialize search functionality
	initializeSearch();
	
	// Load friends list
	loadFriendsList();
	
	// Load friend requests
	loadFriendRequests();
	
	// Richiedi esplicitamente un aggiornamento dello stato degli utenti online
	setTimeout(() => {
		if (window.requestOnlineUsers) {
			console.log('[FRIENDS] Richiesta aggiornamento utenti online...');
			window.requestOnlineUsers();
		}
	}, 1000);
}

/**
 * Ensures that the WebSocket connection for user status updates is active.
 * If the connection is not active, it will attempt to establish one.
 * @function ensureUserStatusConnection
 * @returns {void}
 */
function ensureUserStatusConnection() {
	if (window.connectUserStatusSocket) {
		// Se lo script user_status.js è già caricato, usa la funzione
		// Il controllo su WebSocket.OPEN è già fatto dentro connectUserStatusSocket()
		window.connectUserStatusSocket();
	} else {
		// Altrimenti carica lo script
		loadUserStatusScript().then(() => {
			if (window.connectUserStatusSocket) {
				window.connectUserStatusSocket();
			}
		});
	}
}

/**
 * Loads the user_status.js script if it hasn't been loaded already.
 * @function loadUserStatusScript
 * @returns {Promise<void>} A promise that resolves when the script is loaded
 */
function loadUserStatusScript() {
	return new Promise((resolve, reject) => {
		if (window.connectUserStatusSocket) {
			resolve();
			return;
		}
		
		const script = document.createElement('script');
		script.src = '/js/user_status.js';
		script.onload = () => {
			console.log("Script user_status.js caricato con successo");
			resolve();
		};
		script.onerror = (error) => {
			console.error("Errore nel caricamento dello script user_status.js:", error);
			reject(error);
		};
		document.body.appendChild(script);
	});
}

/**
 * Sets up event listeners for user status changes and online users updates.
 * @function setupUserStatusListeners
 * @returns {void}
 */
function setupUserStatusListeners() {
	// Ascolta gli eventi di aggiornamento dello stato utente
	document.addEventListener('userStatusChanged', (e) => {
		const { userId, username, status } = e.detail;
		updateFriendStatus(userId, status);
	});
	
	// Ascolta gli eventi di aggiornamento della lista degli utenti online
	document.addEventListener('onlineUsersUpdated', (e) => {
		refreshFriendsList();
	});
}

/**
 * Updates the status display of a friend in the friends list.
 * @function updateFriendStatus
 * @param {number} userId - The ID of the user whose status needs to be updated
 * @param {string} status - The new status ('online' or 'offline')
 * @returns {void}
 * @fires {CustomEvent} friendStatusChanged - Emitted when a friend's status is updated
 */
function updateFriendStatus(userId, status) {
	// Trova tutti gli elementi amico con questo ID utente
	const friendElements = document.querySelectorAll(`#friends-list [data-user-id="${userId}"]`);
	
	if (friendElements.length === 0) {
		// Se l'amico non è presente nella lista, non fare nulla
		return;
	}
	
	
	friendElements.forEach(element => {
		// Trova il badge di stato
		const statusBadge = element.querySelector('.badge');
		if (statusBadge) {
			// Aggiorna il testo e le classi CSS
			statusBadge.textContent = status === 'online' ? 'Online' : 'Offline';
			statusBadge.className = 'badge ' + (status === 'online' ? 'bg-success' : 'bg-secondary');
			
			// Aggiungiamo anche un attributo data per lo stato corrente
			element.setAttribute('data-status', status);
		}
	});
	
	// Emettiamo un evento personalizzato per l'aggiornamento dello stato di un amico
	document.dispatchEvent(new CustomEvent('friendStatusChanged', {
		detail: { userId, status }
	}));
}

/**
 * Refreshes the friends list by fetching the latest data from the server.
 * @function refreshFriendsList
 * @returns {void}
 */
function refreshFriendsList() {
	// Fai una richiesta API per ottenere la lista aggiornata degli amici
	api.get('/api/friend/list/')
		.then(data => {
			if (data.friends && data.friends.length > 0) {
				// Aggiorna la classe e il testo per ogni amico
				data.friends.forEach(friend => {
					// Aggiorna direttamente lo stato dell'amico nella UI
					const status = friend.is_online ? 'online' : 'offline';
					updateFriendStatus(friend.id, status);
				});
			}
		})
		.catch(error => {
			console.error('Error refreshing friends list:', error);
		});
}

/**
 * Initializes the user search functionality by setting up event listeners and search handlers.
 * @function initializeSearch
 * @returns {void}
 */
function initializeSearch() {
	const searchInput = document.getElementById('search-input');
	const searchButton = document.getElementById('search-button');
	const searchResults = document.getElementById('search-results');
	
	// Check if elements exist
	if (!searchInput || !searchButton || !searchResults) {
		console.error('One or more search elements not found');
		return;
	}
	
	// Search when button is clicked
	searchButton.addEventListener('click', function() {
		searchUsers(searchInput.value);
	});
	
	// Search when Enter key is pressed
	searchInput.addEventListener('keypress', function(e) {
		if (e.key === 'Enter') {
			searchUsers(searchInput.value);
		}
	});
	
	/**
	 * Performs a search for users based on the provided query.
	 * @function searchUsers
	 * @param {string} query - The search query to find users
	 * @returns {void}
	 */
	function searchUsers(query) {
		if (!query.trim()) {
			searchResults.innerHTML = '<div class="col-12 text-center"><p>Please enter a username to search</p></div>';
			return;
		}
		
		// Show loading indicator
		searchResults.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
		
		// Make API request to search users
		api.get(`/api/friend/search/?search=${encodeURIComponent(query)}`)
			.then(data => {
				displaySearchResults(data.users);
			})
			.catch(error => {
				console.error('Error searching users:', error);
				searchResults.innerHTML = '<div class="col-12 text-center"><p class="text-danger">Error searching users. Please try again.</p></div>';
			});
	}
	
	/**
	 * Displays the search results in the UI.
	 * @function displaySearchResults
	 * @param {Array<Object>} users - Array of user objects to display
	 * @param {number} users[].id - The user's ID
	 * @param {string} users[].username - The user's username
	 * @param {boolean} users[].has_pending_request - Whether there's a pending friend request
	 * @returns {void}
	 */
	function displaySearchResults(users) {
		if (!users || users.length === 0) {
			searchResults.innerHTML = '<div class="col-12 text-center"><p>No users found matching your search</p></div>';
			return;
		}
		
		let html = '';
		users.forEach(user => {
			const buttonHtml = user.has_pending_request
				? `<button class="btn btn-secondary btn-sm" disabled>
					<i class="fas fa-clock"></i> Pending
				   </button>`
				: `<button class="btn btn-primary btn-sm send-friend-request" data-user-id="${user.id}">
					<i class="fas fa-user-plus"></i> Add Friend
				   </button>`;
				
			html += `
				<div class="col-md-6 col-lg-4 mb-3">
					<div class="card h-100">
						<div class="card-body text-center">
							<i class="fas fa-user-circle fa-3x mb-3 text-primary"></i>
							<h5 class="card-title">${user.username}</h5>
							${buttonHtml}
						</div>
					</div>
				</div>
			`;
		});
		
		searchResults.innerHTML = html;
		
		// Add event listeners to friend request buttons
		document.querySelectorAll('.send-friend-request').forEach(button => {
			button.addEventListener('click', function() {
				const userId = this.getAttribute('data-user-id');
				sendFriendRequest(userId, this);
			});
		});
	}
	
	/**
	 * Sends a friend request to a specific user.
	 * @function sendFriendRequest
	 * @param {number} userId - The ID of the user to send the request to
	 * @param {HTMLElement} button - The button element that triggered the request
	 * @returns {void}
	 */
	function sendFriendRequest(userId, button) {
		button.disabled = true;
		button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
		
		api.post(`/api/friend/request/send/${userId}/`, {})
			.then(response => {
				button.classList.remove('btn-primary');
				button.classList.add('btn-success');
				button.innerHTML = '<i class="fas fa-check"></i> Request Sent';
			})
			.catch(error => {
				console.error('Error sending friend request:', error);
				button.classList.remove('btn-primary');
				button.classList.add('btn-danger');
				button.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
				
				// Mostra il messaggio di errore specifico dal server
				let errorMessage = 'Si è verificato un errore durante l\'invio della richiesta di amicizia.';
				if (error.data && error.data.detail) {
					errorMessage = error.data.detail;
				}
				
				setTimeout(() => {
					button.classList.remove('btn-danger');
					button.classList.add('btn-primary');
					button.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
					button.disabled = false;
				}, 3000);
			});
	}
}

/**
 * Removes a friend from the user's friend list.
 * @function removeFriend
 * @param {number} friendId - The ID of the friend to remove
 * @param {HTMLElement} button - The button element that triggered the removal
 * @returns {void}
 */
function removeFriend(friendId, button) {
	// Trova il nome dell'amico dalla card
	const friendName = button.closest('.card').querySelector('.card-title').textContent;
	
	// Aggiorna il modal con il nome dell'amico
	document.getElementById('friendToRemoveName').textContent = friendName;
	
	// Ottieni il riferimento al modal
	const modal = new bootstrap.Modal(document.getElementById('removeFriendModal'));
	
	// Configura il listener per il pulsante di conferma
	const confirmButton = document.getElementById('confirmRemoveFriend');
	const handleConfirm = () => {
		// Rimuovi il listener dopo l'uso
		confirmButton.removeEventListener('click', handleConfirm);
		
		// Nascondi il modal
		modal.hide();
		
		// Disabilita il pulsante e mostra lo spinner
		button.disabled = true;
		button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
		
		// Fai la richiesta API
		api.post(`/api/friend/remove/${friendId}/`, {})
			.then(response => {
				// Rimuovi la card dell'amico dalla UI
				const friendCard = button.closest('.col-md-6');
				if (friendCard) {
					friendCard.remove();
				}
				
				// Se non ci sono più amici, mostra il messaggio
				const friendsList = document.getElementById('friends-list');
				const noFriendsMessage = document.getElementById('no-friends-message');
				if (friendsList.children.length === 0 && noFriendsMessage) {
					noFriendsMessage.style.display = 'block';
					friendsList.innerHTML = '<div class="col-12 text-center"><p>Non hai ancora amici nella tua lista.</p></div>';
				}
			})
			.catch(error => {
				console.error('Error removing friend:', error);
				button.disabled = false;
				button.innerHTML = '<i class="fas fa-user-times"></i> Rimuovi';
				alert('Si è verificato un errore durante la rimozione dell\'amico. Riprova più tardi.');
			});
	};
	
	// Aggiungi il listener al pulsante di conferma
	confirmButton.addEventListener('click', handleConfirm);
	
	// Mostra il modal
	modal.show();
}

/**
 * Loads and displays the user's friends list.
 * @function loadFriendsList
 * @returns {void}
 */
function loadFriendsList() {
	const friendsList = document.getElementById('friends-list');
	const noFriendsMessage = document.getElementById('no-friends-message');
	
	// Show loading indicator
	if (friendsList) {
		friendsList.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
	} else {
		console.error('friends-list element not found');
		return;
	}
	
	// Make API request to get friends
	api.get('/api/friend/list/')
		.then(data => {
			if (data.friends && data.friends.length > 0) {
				if (noFriendsMessage) {
					noFriendsMessage.style.display = 'none';
				}
				
				let html = '';
				data.friends.forEach(friend => {
					html += `
						<div class="col-md-6 col-lg-4 mb-3" data-user-id="${friend.id}">
							<div class="card h-100">
								<div class="card-body text-center">
									<i class="fas fa-user-circle fa-3x mb-3 text-primary"></i>
									<h5 class="card-title">${friend.username}</h5>
									<p class="card-text">
										<span class="badge ${friend.is_online ? 'bg-success' : 'bg-secondary'}">
											${friend.is_online ? 'Online' : 'Offline'}
										</span>
									</p>
									<button class="btn btn-danger btn-sm remove-friend" data-friend-id="${friend.id}">
										<i class="fas fa-user-times"></i> Rimuovi
									</button>
								</div>
							</div>
						</div>
					`;
				});
				friendsList.innerHTML = html;

				// Add event listeners to remove friend buttons
				document.querySelectorAll('.remove-friend').forEach(button => {
					button.addEventListener('click', function() {
						const friendId = this.getAttribute('data-friend-id');
						removeFriend(friendId, this);
					});
				});
			} else {
				if (noFriendsMessage) {
					noFriendsMessage.style.display = 'block';
				}
				friendsList.innerHTML = '<div class="col-12 text-center"><p>Non hai ancora amici nella tua lista.</p></div>';
			}
		})
		.catch(error => {
			console.error('Error loading friends list:', error);
			friendsList.innerHTML = '<div class="col-12 text-center"><p class="text-danger">Error loading friends list. Please try again.</p></div>';
		});
}

/**
 * Loads and displays the user's pending friend requests.
 * @function loadFriendRequests
 * @returns {void}
 */
function loadFriendRequests() {
	const requestsList = document.getElementById('friend-requests-list');
	const noRequestsMessage = document.getElementById('no-requests-message');
	
	// Show loading indicator
	if (requestsList) {
		requestsList.innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
	} else {
		console.error('friend-requests-list element not found');
		return;
	}
	
	// Make API request to get friend requests
	api.get('/api/friend/requests/')
		.then(data => {
			if (data.requests && data.requests.length > 0) {
				if (noRequestsMessage) {
					noRequestsMessage.style.display = 'none';
				}
				
				let html = '';
				data.requests.forEach(request => {
					html += `
						<div class="col-md-6 col-lg-4 mb-3">
							<div class="card h-100">
								<div class="card-body text-center">
									<i class="fas fa-user-circle fa-3x mb-3 text-primary"></i>
									<h5 class="card-title">${request.sender}</h5>
									<div class="btn-group mt-3" role="group">
										<button class="btn btn-sm btn-success accept-request" data-request-id="${request.id}">
											<i class="fas fa-check"></i> Accept
										</button>
										<button class="btn btn-sm btn-danger reject-request" data-request-id="${request.id}">
											<i class="fas fa-times"></i> Reject
										</button>
									</div>
								</div>
							</div>
						</div>
					`;
				});
				
				requestsList.innerHTML = html;
				
				// Add event listeners to accept/reject buttons
				document.querySelectorAll('.accept-request').forEach(button => {
					button.addEventListener('click', function() {
						const requestId = this.getAttribute('data-request-id');
						handleFriendRequest(requestId, 'accept');
					});
				});
				
				document.querySelectorAll('.reject-request').forEach(button => {
					button.addEventListener('click', function() {
						const requestId = this.getAttribute('data-request-id');
						handleFriendRequest(requestId, 'reject');
					});
				});
			} else {
				if (noRequestsMessage) {
					noRequestsMessage.style.display = 'block';
				}
				requestsList.innerHTML = '<div class="col-12 text-center"><p>No friend requests found</p></div>';
			}
		})
		.catch(error => {
			console.error('Error loading friend requests:', error);
			requestsList.innerHTML = '<div class="col-12 text-center"><p class="text-danger">Error loading friend requests. Please try again.</p></div>';
		});
}

/**
 * Handles accepting or rejecting a friend request.
 * @function handleFriendRequest
 * @param {number} requestId - The ID of the friend request to handle
 * @param {('accept'|'reject')} action - The action to take on the request
 * @returns {void}
 */
function handleFriendRequest(requestId, action) {
	const url = action === 'accept' 
		? `/api/friend/request/accept/${requestId}/` 
		: `/api/friend/request/reject/${requestId}/`;
	
	api.post(url, {})
		.then(response => {
			// Reload friend requests and friends list
			loadFriendRequests();
			if (action === 'accept') {
				loadFriendsList();
			}
		})
		.catch(error => {
			console.error(`Error ${action}ing friend request:`, error);
			alert(`Error ${action}ing friend request. Please try again.`);
		});
}

// Export the initialization function to the window object
window.initializeFriends = initializeFriends;