/**
 * @fileoverview Main application file that handles routing, authentication, and core functionality.
 * @module main
 */

/**
 * @typedef {Object.<string, string>} Routes
 * @description Mapping of URL paths to page names
 */

/**
 * @type {Routes}
 * @description Configuration object for application routes
 */
const routes = {
	'/': 'home',
	'/home': 'home',
	'/play': 'play',
	'/tournaments': 'tournaments',
	'/account': 'account',
	'/login': 'login',
	'/register': 'register',
	'/logout': 'logout',
	'/401': '401',
	'/404': '404',
	'/game_local': 'game_local',
	'/game_ia': 'game_ia',
	'/setup-fa': 'setup-fa',
	'/friends': 'friends',
	'/game-remote': 'game-remote',
	'/waiting_screen': 'waiting_screen',
	'/delete-account': 'delete-account',
	'/disable-2fa': 'disable-2fa',
};

/**
 * @typedef {Object} AppState
 * @property {string|null} currentPage - The currently active page
 * @property {string|null} previousPage - The previously active page
 * @property {string[]} navigationStack - Stack of navigation history
 * @property {number} maxStackSize - Maximum size of the navigation stack
 */

/**
 * @type {AppState}
 * @description Object maintaining the application's state
 */
const appState = {
	currentPage: null,
	previousPage: null,
	navigationStack: [],
	maxStackSize: 20
};

/**
 * Fetches a new CSRF token from the server.
 * @async
 * @function fetchCsrfToken
 * @returns {Promise<boolean>} True if token was successfully fetched, false otherwise
 */
async function fetchCsrfToken() {
	try {
		const response = await fetch('/api/csrf/', {
			method: 'GET',
			credentials: 'include' // Importante per salvare i cookie
		});
		
		if (!response.ok) {
			console.error('Errore nel recupero del token CSRF:', response.status);
			return false;
		}
		return true;
	} catch (error) {
		console.error('Errore durante la richiesta del token CSRF:', error);
		return false;
	}
}

/**
 * Retrieves the CSRF token from cookies.
 * @function getCsrfToken
 * @returns {string} The CSRF token if found, empty string otherwise
 */
function getCsrfToken() {
	return document.cookie
		.split('; ')
		.find(row => row.startsWith('csrftoken='))
		?.split('=')[1] || '';
}

/**
 * Loads HTML content into a specified element.
 * @async
 * @function loadHTML
 * @param {string} file - Path to the HTML file to load
 * @param {string} elementId - ID of the element to load the HTML into
 * @returns {Promise<void>}
 */
async function loadHTML(file, elementId) {
	try {
		const response = await fetch(file);
		if (!response.ok) throw new Error(`File ${file} non trovato`);
		document.getElementById(elementId).innerHTML = await response.text();
	} catch (error) {
		console.error(error);
	}
}

/**
 * Dynamically loads a JavaScript file.
 * @function loadScript
 * @param {string} url - URL of the script to load
 * @returns {Promise<void>} Resolves when script is loaded, rejects on error
 */
function loadScript(url) {
	return new Promise((resolve, reject) => {
		// Controlla se lo script è già caricato
		const existingScript = document.querySelector(`script[src="${url}"]`);
		if (existingScript)
			return resolve();

		const script = document.createElement('script');
		script.src = url;
		script.onload = () => {
			resolve();
		};
		script.onerror = (error) => {
			reject(error);
		};
		document.body.appendChild(script);
	});
}

/**
 * Loads a page with transition effects.
 * @async
 * @function loadPage
 * @param {string} page - Name of the page to load
 * @returns {Promise<void>}
 */
async function loadPage(page) {
	document.title = `Transcendence | ${page.charAt(0).toUpperCase() + page.slice(1)}`;
	
	// Aggiorna lo stato dell'applicazione
	appState.previousPage = appState.currentPage;
	appState.currentPage = page;
	
	// Memorizza il percorso nella cronologia di navigazione
	if (appState.currentPage !== appState.previousPage) {
		appState.navigationStack.push(window.location.pathname);
		if (appState.navigationStack.length > appState.maxStackSize) {
			appState.navigationStack.shift();
		}
	}
	
	// Avvia la transizione di uscita
	const contentEl = document.getElementById('content');
	contentEl.classList.add('page-transition-out');
	
	try {
		const response = await fetch(`/pages/${page}.html`);
		if (!response.ok) throw new Error("404 - Pagina non trovata");
		await new Promise(resolve => setTimeout(resolve, 150));
		contentEl.innerHTML = await response.text();
		contentEl.classList.remove('page-transition-out');
		contentEl.classList.add('page-transition-in');
		await initPageScripts(page);
		updateNavbarAuth();
		setTimeout(() => {
			contentEl.classList.remove('page-transition-in');
		}, 300);
	} catch (error) {
		contentEl.classList.remove('page-transition-out');
		contentEl.innerHTML = `
			<h1>Errore 404</h1>
			<p>${error.message}</p>
			<a href="/" data-route="home">Torna alla Home</a>
		`;
	}
}

/**
 * Initializes page-specific scripts based on the current page.
 * @async
 * @function initPageScripts
 * @param {string} page - Name of the page to initialize scripts for
 * @returns {Promise<void>}
 */
async function initPageScripts(page) {
	switch(page) {
		case 'register':
			try {
				await loadScript('/js/register.js');
				if (typeof window.initializeRegistration === 'function')
					window.initializeRegistration();
			} catch (error) {
				console.error("Errore nel caricamento dello script register.js:", error);
			}
			break;
		case 'login':
			try {
				await loadScript('/js/login.js');
				if (typeof window.initializeLogin === 'function')
					window.initializeLogin();
			} catch (error) {
				console.error("Errore nel caricamento dello script login.js:", error);
			}
			break;
		case 'account':
			try {
				await loadScript('/js/account.js');
				if (typeof window.initializeAccount === 'function')
					window.initializeAccount();
			} catch (error) {
				console.error("Errore nel caricamento dello script account.js:", error);
			}
			break;
		case 'game_local':
			try {
				await loadScript('/js/game_local.js');
				if (typeof window.initializeGameLocal === 'function')
					window.initializeGameLocal();
			} catch (error) {
				console.error("Errore nel caricamento dello script game_local.js:", error);
			}
			break;
		case 'tournaments':
			try {
				await loadScript('/js/tournament.js');
				if (typeof window.initializeTournament === 'function')
					window.initializeTournament();
			} catch (error) {
				console.error("Errore nel caricamento dello script tournament.js:", error);
			}
			break;
		case 'setup-fa':
			try {
				await loadScript('/js/2fa.js');
				if (typeof window.initialize2FA === 'function')
					window.initialize2FA();
			} catch (error) {
				console.error("Errore nel caricamento dello script 2fa.js:", error);
			}
			break;
		case 'friends':
			try {
				await loadScript('/js/friends.js');
				await loadScript('/js/user_status.js');
				if (typeof window.initializeFriends === 'function')
					window.initializeFriends();
			} catch (error) {
				console.error("Errore nel caricamento dello script friends.js:", error);
			}
			break;
		case 'game-remote':
			try {
				await loadScript('/js/game_remote.js');
				if (typeof window.initializeGameRemote === 'function')
					window.initializeGameRemote();
			} catch (error) {
				console.error("Errore nel caricamento dello script game_remote.js:", error);
			}
			break;
		case 'game_ia':
			try {
				await loadScript('/js/game_ia.js');
				if (typeof window.initializeGameIA === 'function')
					window.initializeGameIA();
			} catch (error) {
				console.error("Errore nel caricamento dello script game_ia.js:", error);
			}
			break;
		case 'delete-account':
			try {
				await loadScript('/js/delete-account.js');
				if (typeof window.initializeDeleteAccount === 'function')
					window.initializeDeleteAccount();
			} catch (error) {
				console.error("Errore nel caricamento dello script delete-account.js:", error);
			}
			break;
		case 'disable-2fa':
			try {
				await loadScript('/js/disable-2fa.js');
				if (typeof window.initializeDisable2FA === 'function')
					window.initializeDisable2FA();
			} catch (error) {
				console.error("Errore nel caricamento dello script disable-2fa.js:", error);
			}
			break;
	}
}

/**
 * Deletes a cookie with specified options.
 * @function deleteCookie
 * @param {string} name - Name of the cookie to delete
 * @param {Object} [options={}] - Cookie options
 * @param {string} [options.path='/'] - Cookie path
 * @param {string} [options.domain=''] - Cookie domain
 */
function deleteCookie(name, options = {}) {
	const path = options.path || '/';
	const domain = options.domain || '';
	const domainPart = domain ? `; domain=${domain}` : '';
	document.cookie = `${name}=; Path=${path}${domainPart}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax; Secure`;
	
	// Prova anche senza Secure e SameSite per essere sicuri
	document.cookie = `${name}=; Path=${path}${domainPart}; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
	
	// Prova anche con il percorso root
	if (path !== '/') {
		document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
	}
}

/**
 * Clears all authentication-related cookies.
 * @function clearAuthCookies
 */
function clearAuthCookies() {
	deleteCookie('csrftoken');
	deleteCookie('access_token');
	deleteCookie('refresh_token');
}

/**
 * Handles user logout process.
 * @async
 * @function handleLogout
 * @returns {Promise<void>}
 */
async function handleLogout() {
	try {
		if (window.disconnectUserStatusSocket)
			window.disconnectUserStatusSocket();
		
		const csrfToken = window.getCsrfToken ? window.getCsrfToken() : '';
		
		if (!csrfToken) {
			if (window.fetchCsrfToken)
				await window.fetchCsrfToken();
		}
		const response = await window.api.post('/api/auth/logout/');
		clearAuthCookies();
		if (response.ok) {
			updateNavbarAuth();
			showSuccessToast('Logout completato con successo');
			navigateTo('/');
		} else {
			updateNavbarAuth();
			navigateTo('/');
		}
	} catch (error) {
		if (window.disconnectUserStatusSocket)
			window.disconnectUserStatusSocket();
		clearAuthCookies();
		updateNavbarAuth();
		navigateTo('/');
	}
}

/**
 * Handles navigation to a specific path.
 * @function navigateTo
 * @param {string} path - Path to navigate to
 * @param {boolean} [replaceState=false] - Whether to replace current history state
 */
function navigateTo(path, replaceState = false) {
	if (replaceState)
		history.replaceState({ path }, '', path);
	else
		history.pushState({ path }, '', path);
	handleRouting();
}

/**
 * Handles routing based on current URL path.
 * @function handleRouting
 */
function handleRouting() {
	const path = window.location.pathname;
	const page = routes[path];
	if (page === '404') {
		loadPage('404');
		history.replaceState({ path: '/404' }, '', '/404');
	} else if (page === '401') {
		loadPage('401');
		history.replaceState({ path: '/401' }, '', '/401');
	} else if (!page) {
		loadPage('404');
		history.replaceState({ path: '/404' }, '', '/404');
	} else
		loadPage(page);
}

// Intercetta i click sui link
document.addEventListener('click', (e) => {
	const target = e.target.closest('[data-route]');
	if (!target) return;
	
	e.preventDefault();
	const route = target.getAttribute('data-route');
	if (route === 'logout') {
		handleLogout();
		return;
	}
	const path = target.getAttribute('href');
	navigateTo(path);
});

window.addEventListener('popstate', (event) => {
	handleRouting();
});

// Export functions to window object
window.fetchCsrfToken = fetchCsrfToken;
window.getCsrfToken = getCsrfToken;
window.updateNavbarAuth = updateNavbarAuth;
window.isAuthenticated = isAuthenticated;
window.refreshToken = refreshToken;
window.getAccessToken = getAccessToken;
window.getCurrentUsername = getCurrentUsername;
window.navigateTo = navigateTo;

/**
 * Checks if user is currently authenticated.
 * @async
 * @function isAuthenticated
 * @returns {Promise<boolean>} True if user is authenticated, false otherwise
 */
async function isAuthenticated() {
	try {
		// Usa il nuovo endpoint dedicato per verificare lo stato di autenticazione
		const response = await fetch('/api/auth/status/', {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			},
			credentials: 'include' // Importante per includere i cookie
		});
		
		if (response.ok) {
			const data = await response.json();
			return data.isAuthenticated;
		}
		
		return false;
	} catch (error) {
		console.error('Errore nella verifica dell\'autenticazione:', error);
		return false;
	}
}

/**
 * Updates the navigation bar based on authentication status.
 * @async
 * @function updateNavbarAuth
 * @returns {Promise<void>}
 */
async function updateNavbarAuth() {
	const authenticated = await isAuthenticated();
	
	// Seleziona gli elementi della navbar usando le nuove classi
	const loginButton = document.querySelector('.login-btn');
	const registerButton = document.querySelector('.register-btn');
	const logoutButton = document.querySelector('.logout-btn');
	
	if (authenticated) {
		// Utente autenticato: mostra logout, nascondi login e register
		if (loginButton) loginButton.style.display = 'none';
		if (registerButton) registerButton.style.display = 'none';
		if (logoutButton) logoutButton.style.display = 'block';
	} else {
		// Utente non autenticato: nascondi logout, mostra login e register
		if (loginButton) loginButton.style.display = 'block';
		if (registerButton) registerButton.style.display = 'block';
		if (logoutButton) logoutButton.style.display = 'none';
	}
}

/**
 * Loads and initializes the navigation bar.
 * @async
 * @function loadNavbar
 * @returns {Promise<void>}
 */
async function loadNavbar() {
	await loadHTML('navbar.html', 'navbar');
	// Dopo aver caricato la navbar, aggiorna lo stato di autenticazione
	updateNavbarAuth();
}

// Caricamento iniziale
window.addEventListener('DOMContentLoaded', () => {
	fetchCsrfToken().then(() => {
		loadNavbar().then(() => {
			handleRouting();
			
			// Inizializza la connessione WebSocket per lo stato utente se l'utente è autenticato
			isAuthenticated().then(authenticated => {
				if (authenticated && window.connectUserStatusSocket) {
					window.connectUserStatusSocket();
				} else if (authenticated) {
					// Carica lo script user_status.js se non è già caricato
					loadScript('/js/user_status.js').then(() => {
						if (window.connectUserStatusSocket) {
							window.connectUserStatusSocket();
						}
					});
				}
			});
		});
	});
});

/**
 * Refreshes the authentication token.
 * @async
 * @function refreshToken
 * @returns {Promise<boolean>} True if token was refreshed successfully, false otherwise
 */
async function refreshToken() {
	try {
		// Ottieni il token CSRF per la richiesta
		const csrfToken = getCsrfToken();
		
		const response = await fetch('/api/auth/token/refresh/', {
			method: 'POST',
			headers: {
				'X-CSRFToken': csrfToken
			},
			credentials: 'include' // Include i cookie nella richiesta
		});
		
		if (response.ok) {
			console.log('Token aggiornato con successo');
			return true;
		} else {
			console.error('Errore nel refresh del token');
			// Se il refresh fallisce, esegui il logout
			localStorage.removeItem('user');
			return false;
		}
	} catch (error) {
		console.error('Errore durante il refresh del token:', error);
		return false;
	}
}

/**
 * @type {number|null}
 * @description Timestamp of the last token refresh
 */
let lastTokenRefresh = null;

/**
 * @constant {number}
 * @description Interval in milliseconds between token refreshes (45 minutes)
 */
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minuti in millisecondi

/**
 * Gets the current access token, refreshing if necessary.
 * @async
 * @function getAccessToken
 * @returns {Promise<string|null>} The access token if available, null otherwise
 */
async function getAccessToken() {
    try {
        const now = Date.now();
        
        if (!lastTokenRefresh || (now - lastTokenRefresh >= TOKEN_REFRESH_INTERVAL)) {
            console.log("Token potenzialmente scaduto, eseguo refresh");
            await refreshToken();
            lastTokenRefresh = now;
        }
        return null;
    } catch (error) {
        console.error('Errore nell\'ottenere il token di accesso:', error);
        return null;
    }
}

/**
 * Gets the current user's username.
 * @async
 * @function getCurrentUsername
 * @returns {Promise<string|null>} The username if available, null otherwise
 */
async function getCurrentUsername() {
	try {
		const authenticated = await isAuthenticated();
		if (!authenticated) {
			return null;
		}
		
		const response = await fetch('/api/auth/status/', {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			},
			credentials: 'include'
		});
		
		if (response.ok) {
			const data = await response.json();
			return data.username || null;
		}
		
		return null;
	} catch (error) {
		console.error('Errore nell\'ottenere il nome utente:', error);
		return null;
	}
}