/**
 * @fileoverview Module for handling real-time user status updates via WebSocket connection.
 * @module user_status
 */

/**
 * @type {WebSocket|null}
 * @description WebSocket connection instance for user status updates
 */
let statusSocket = null;

/**
 * @type {number|null}
 * @description Interval ID for periodic status refresh
 */
let statusRefreshInterval = null;

/**
 * @type {number}
 * @description Timestamp of the last refresh request
 */
let lastRefreshRequest = 0;

/**
 * @constant {number}
 * @description Minimum time (in milliseconds) between refresh requests
 */
const MIN_REFRESH_INTERVAL = 5000; // 5 seconds between requests

/**
 * Establishes a WebSocket connection for user status updates.
 * If a connection already exists, it will be reused or reconnected if in a problematic state.
 * @function connectUserStatusSocket
 * @returns {WebSocket} The WebSocket connection instance
 */
function connectUserStatusSocket() {
	// Se la connessione è già attiva, non fare nulla
	if (statusSocket && statusSocket.readyState === WebSocket.OPEN) {
		return statusSocket;
	}
	
	// Se la connessione è in fase di apertura, aspetta
	if (statusSocket && statusSocket.readyState === WebSocket.CONNECTING) {
		return statusSocket;
	}
	
	// Chiudi eventuali connessioni esistenti che sono in uno stato problematico
	if (statusSocket) {
		statusSocket.close();
	}

	// Crea il WebSocket URL basato sul protocollo corrente (wss per HTTPS, ws per HTTP)
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const socketUrl = `${protocol}//${window.location.host}/ws/status/`;

	// Crea il socket
	statusSocket = new WebSocket(socketUrl);

	// Gestisci l'apertura della connessione
	statusSocket.onopen = (event) => {
		// Richiedi la lista completa degli utenti online
		requestOnlineUsers();
		
		// Imposta un intervallo per richiedere aggiornamenti periodici
		clearInterval(statusRefreshInterval);
		statusRefreshInterval = setInterval(() => {
			if (statusSocket && statusSocket.readyState === WebSocket.OPEN) {
				requestOnlineUsers();
			}
		}, 60000); // Richiedi aggiornamenti ogni 60 secondi (aumentato da 30 secondi)
	};

	// Gestisci i messaggi in arrivo
	statusSocket.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			
			if (data.type === 'status_update') {
				// Aggiorna l'interfaccia utente per riflettere lo stato online/offline
				updateUserStatusUI(data.user_id, data.username, data.status);
			} else if (data.type === 'online_users') {
				// Aggiorna la lista di utenti online
				updateOnlineUsersUI(data.users);
			}
		} catch (error) {
			console.error('[USER STATUS] Errore nella gestione del messaggio:', error);
		}
	};

	// Gestisci gli errori
	statusSocket.onerror = (error) => {
		console.error('[USER STATUS] Errore WebSocket:', error);
	};

	// Gestisci la chiusura della connessione
	statusSocket.onclose = (event) => {
		// Pulisci l'intervallo di aggiornamento quando si chiude la connessione
		clearInterval(statusRefreshInterval);
		
		if (!event.wasClean) {
			console.error('[USER STATUS] Connessione interrotta');
			// Prova a riconnettersi dopo un breve ritardo se l'utente è autenticato
			setTimeout(() => {
				if (window.isAuthenticated && window.isAuthenticated()) {
					connectUserStatusSocket();
				}
			}, 5000);
		}
	};

	return statusSocket;
}

/**
 * Requests the current list of online users from the server.
 * Implements rate limiting to prevent too frequent requests.
 * @function requestOnlineUsers
 * @returns {void}
 */
function requestOnlineUsers() {
	// Evita richieste troppo frequenti
	const now = Date.now();
	if (now - lastRefreshRequest < MIN_REFRESH_INTERVAL) {
		return;
	}
	
	lastRefreshRequest = now;
	
	if (statusSocket && statusSocket.readyState === WebSocket.OPEN) {
		statusSocket.send(JSON.stringify({
			type: 'request_online_users'
		}));
	}
}

/**
 * Checks if the current user is authenticated.
 * Uses the main.js isAuthenticated function if available, otherwise checks for access token.
 * @function isUserAuthenticated
 * @returns {Promise<boolean>|boolean} True if user is authenticated, false otherwise
 */
function isUserAuthenticated() {
	// Utilizzare la funzione isAuthenticated dal main.js se disponibile
	if (window.isAuthenticated) {
		return window.isAuthenticated();
	}
	
	// Altrimenti controllare i cookie o altri indicatori di autenticazione
	return document.cookie.includes('access_token=');
}

/**
 * Updates the UI to reflect a user's online/offline status.
 * @function updateUserStatusUI
 * @param {number} userId - The ID of the user whose status needs to be updated
 * @param {string} username - The username of the user
 * @param {('online'|'offline')} status - The new status of the user
 * @fires {CustomEvent} userStatusChanged - Emitted when a user's status changes
 * @returns {void}
 */
function updateUserStatusUI(userId, username, status) {
	// Seleziona tutti gli elementi dell'interfaccia che mostrano lo stato dell'utente
	const userElements = document.querySelectorAll(`[data-user-id="${userId}"]`);
	
	// Evita aggiornamenti ripetuti non necessari
	// Se l'elemento ha già lo stato corretto, non fare nulla
	let updated = false;
	
	userElements.forEach(element => {
		// Controlla lo stato attuale
		const currentStatus = element.getAttribute('data-status');
		
		// Se lo stato è già corretto, non fare nulla
		if (currentStatus === status) {
			return;
		}
		
		// Altrimenti aggiorna le classi CSS
		if (status === 'online') {
			element.classList.add('user-online');
			element.classList.remove('user-offline');
		} else {
			element.classList.add('user-offline');
			element.classList.remove('user-online');
		}
		
		// Aggiorna eventuali badge o indicatori di stato
		const statusIndicator = element.querySelector('.status-indicator');
		if (statusIndicator) {
			statusIndicator.textContent = status === 'online' ? 'Online' : 'Offline';
			statusIndicator.className = 'status-indicator ' + (status === 'online' ? 'status-online' : 'status-offline');
		}
		
		// Aggiorna il badge nella lista amici
		const statusBadge = element.querySelector('.badge');
		if (statusBadge) {
			statusBadge.textContent = status === 'online' ? 'Online' : 'Offline';
			statusBadge.className = 'badge ' + (status === 'online' ? 'bg-success' : 'bg-secondary');
		}
		
		// Salva lo stato corrente nell'elemento
		element.setAttribute('data-status', status);
		updated = true;
	});
	
	// Emetti un evento personalizzato solo se qualcosa è cambiato
	if (updated) {
		document.dispatchEvent(new CustomEvent('userStatusChanged', {
			detail: { userId, username, status }
		}));
	}
}

/**
 * Updates the UI with the current list of online users.
 * @function updateOnlineUsersUI
 * @param {Array<Object>} users - Array of online user objects
 * @param {number} users[].id - The user's ID
 * @param {string} users[].display_name - The user's display name
 * @fires {CustomEvent} onlineUsersUpdated - Emitted when the online users list is updated
 * @returns {void}
 */
function updateOnlineUsersUI(users) {
	// Mappa degli ID utente online per un accesso rapido
	const onlineUserIds = new Set(users.map(user => user.id));
	
	// Seleziona l'elemento che contiene la lista di utenti online
	const onlineUsersList = document.querySelector('.online-users-list');
	if (onlineUsersList) {
		// Svuota la lista
		onlineUsersList.innerHTML = '';
		
		// Aggiungi ogni utente online alla lista
		users.forEach(user => {
			const userElement = document.createElement('div');
			userElement.className = 'online-user';
			userElement.setAttribute('data-user-id', user.id);
			
			userElement.innerHTML = `
				<span class="username">${user.display_name}</span>
				<span class="status-indicator status-online">Online</span>
			`;
			
			onlineUsersList.appendChild(userElement);
		});
		
		// Aggiorna il conteggio degli utenti online
		const onlineUsersCount = document.querySelector('.online-users-count');
		if (onlineUsersCount) {
			onlineUsersCount.textContent = users.length;
		}
	}
	
	// Aggiorna lo stato di tutti gli elementi utente nella pagina
	document.querySelectorAll('[data-user-id]').forEach(element => {
		const userId = parseInt(element.getAttribute('data-user-id'), 10);
		if (!isNaN(userId)) {
			const isOnline = onlineUserIds.has(userId);
			
			// Utilizziamo la funzione updateUserStatusUI per aggiornare questo elemento
			updateUserStatusUI(userId, '', isOnline ? 'online' : 'offline');
		}
	});
	
	// Emetti un evento personalizzato con la lista completa degli utenti online
	document.dispatchEvent(new CustomEvent('onlineUsersUpdated', {
		detail: { users, onlineUserIds: Array.from(onlineUserIds) }
	}));
}

/**
 * Closes the WebSocket connection and cleans up associated resources.
 * @function disconnectUserStatusSocket
 * @returns {void}
 */
function disconnectUserStatusSocket() {
	// Pulisci l'intervallo di aggiornamento
	if (statusRefreshInterval) {
		clearInterval(statusRefreshInterval);
		statusRefreshInterval = null;
	}
	
	if (statusSocket && statusSocket.readyState === WebSocket.OPEN) {
		statusSocket.close();
		statusSocket = null;
	}
}

// Export functions to window object
window.connectUserStatusSocket = connectUserStatusSocket;
window.disconnectUserStatusSocket = disconnectUserStatusSocket;
window.requestOnlineUsers = requestOnlineUsers;

/**
 * Event listener for page load.
 * Automatically connects to WebSocket if user is authenticated.
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', () => {
	// Usa direttamente isAuthenticated da main.js se disponibile
	if (window.isAuthenticated) {
		window.isAuthenticated().then(authenticated => {
			if (authenticated) {
				connectUserStatusSocket();
			}
		});
	}
});

/**
 * Event listener for page unload.
 * Ensures WebSocket connection is properly closed when leaving the page.
 * @listens beforeunload
 */
window.addEventListener('beforeunload', () => {
	// Questo evento si attiva SOLO quando si chiude la scheda o il browser,
	// NON quando si naviga tra le pagine della SPA
	disconnectUserStatusSocket();
}); 