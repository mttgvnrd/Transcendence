/**
 * @fileoverview Module for handling user authentication including login and 2FA verification.
 * @module login
 * @requires toast
 * @requires api
 * @requires user_status
 */

/**
 * Initializes the login functionality including form handlers and 2FA support.
 * @function initializeLogin
 * @returns {void}
 * 
 * @fires {Event} submit - When the login form is submitted
 * @listens {Event} submit - Handles the login form submission
 * 
 * @example
 * // The function expects the following HTML structure:
 * // <form id="loginForm">
 * //   <input id="username" type="text">
 * //   <input id="password" type="password">
 * //   <div id="errorMessage"></div>
 * // </form>
 * // <div id="twoFactorContainer">
 * //   <form id="twoFactorForm">
 * //     <input id="twoFactorCode" type="text">
 * //     <div id="twoFactorError"></div>
 * //   </form>
 * // </div>
 */
function initializeLogin() {
	const loginForm = document.getElementById('loginForm');
	if (loginForm) {
		loginForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const username = document.getElementById('username').value;
			const password = document.getElementById('password').value;
			const errorMessage = document.getElementById('errorMessage');
			if (errorMessage)
				errorMessage.textContent = "";
			try {
				// Richiedi un nuovo token CSRF prima di procedere con il login
				await fetchCsrfToken();
				
				const csrfToken = getCsrfToken();
				if (!csrfToken) {
					console.error("Token CSRF non trovato");
					if (errorMessage) {
						errorMessage.textContent = "Errore di sicurezza: token CSRF non disponibile";
					}
					return;
				}
				
				// Utilizzo di api.post invece della fetch diretta
				try {
					const data = await api.post('/api/auth/login/', {
						username,
						password
					});                    
					if (data.requires_2fa) {                        
						showTwoFactorForm(data.user);
						return;
					}
					
					showSuccessToast("Login effettuato con successo");
					if (window.updateNavbarAuth)
						window.updateNavbarAuth();
					
					if (window.connectUserStatusSocket)
						window.connectUserStatusSocket();
					else {
						await loadUserStatusScript();
						if (window.connectUserStatusSocket)
							window.connectUserStatusSocket();
					}
					
					history.replaceState(null, null, '/home');
					handleRouting();
					return;
				} catch (error) {
					console.error('Errore:', error);
					if (error.data && error.data.detail) {
						if (errorMessage) {
							errorMessage.textContent = error.data.detail;
						} else {
							alert(error.data.detail);
						}
					} else {
						if (errorMessage) {
							errorMessage.textContent = "Errore durante il login";
						} else {
							alert("Errore durante il login");
						}
					}
				}
			} catch (error) {
				console.error('Errore:', error);
				if (errorMessage) {
					errorMessage.textContent = "Errore di connessione al server";
				} else {
					alert("Errore di connessione al server");
				}
			}
		});
	} else {
		console.error("Form di login non trovato nella pagina!");
	}
	
	// Gestione del form 2FA se presente
	const twoFactorForm = document.getElementById('twoFactorForm');
	if (twoFactorForm) {
		twoFactorForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			await verifyTwoFactorCode();
		});
	}
	
	// Gestione del pulsante per tornare al login
	const backToLoginBtn = document.getElementById('backToLogin');
	if (backToLoginBtn) {
		backToLoginBtn.addEventListener('click', (e) => {
			e.preventDefault();
			showLoginForm();
		});
	}
}

/**
 * Displays the 2FA verification form and hides the login form.
 * @function showTwoFactorForm
 * @param {Object} user - User object containing authentication details
 * @param {string} user.username - Username of the authenticating user
 * @returns {void}
 */
function showTwoFactorForm(user) {
	const loginContainer = document.getElementById('loginContainer');
	const twoFactorContainer = document.getElementById('twoFactorContainer');
	
	if (loginContainer && twoFactorContainer) {
		// Nascondi il form di login
		loginContainer.style.display = 'none';
		
		// Mostra il form 2FA
		twoFactorContainer.style.display = 'block';
		
		// Imposta il nome utente nel form 2FA
		const usernameDisplay = document.getElementById('twoFactorUsername');
		if (usernameDisplay && user && user.username) {
			usernameDisplay.textContent = user.username;
		}
		
		// Focus sul campo del codice
		const codeInput = document.getElementById('twoFactorCode');
		if (codeInput) {
			codeInput.focus();
		}
	} else {
		// Fallback se gli elementi non esistono
		alert("Autenticazione a due fattori richiesta. Inserisci il codice dalla tua app authenticator.");
	}
}

/**
 * Shows the login form and hides the 2FA form.
 * @function showLoginForm
 * @returns {void}
 */
function showLoginForm() {
	const loginContainer = document.getElementById('loginContainer');
	const twoFactorContainer = document.getElementById('twoFactorContainer');
	
	if (loginContainer && twoFactorContainer) {
		// Mostra il form di login
		loginContainer.style.display = 'block';
		
		// Nascondi il form 2FA
		twoFactorContainer.style.display = 'none';
	}
}

/**
 * Verifies the 2FA code entered by the user.
 * @async
 * @function verifyTwoFactorCode
 * @returns {Promise<void>}
 * @throws {Error} If the verification fails or server connection error occurs
 */
async function verifyTwoFactorCode() {
	const code = document.getElementById('twoFactorCode').value;
	const errorMessage = document.getElementById('twoFactorError');
	
	if (!code) {
		if (errorMessage) {
			errorMessage.textContent = "Inserisci il codice di verifica";
			errorMessage.style.display = 'block';
		}
		return;
	}
	
	if (errorMessage) {
		errorMessage.textContent = "";
		errorMessage.style.display = 'none';
	}
	
	try {
		// Utilizzo di api.post invece della fetch diretta
		const data = await api.post('/api/auth/2fa/login/verify/', {
			token: code
		});
		
		if (data.success) {
			console.log("Verifica 2FA completata con successo");
			showSuccessToast("Login effettuato con successo");
			// Aggiorna la navbar per riflettere lo stato di autenticazione
			if (window.updateNavbarAuth) {
				window.updateNavbarAuth();
			}
			
			// Reindirizza alla home
			navigateTo('/home');
		} else {
			if (errorMessage) {
				errorMessage.textContent = data.error || "Codice non valido. Riprova.";
				errorMessage.style.display = 'block';
			} else {
				alert(data.error || "Codice non valido. Riprova.");
			}
		}
	} catch (error) {
		console.error('Errore durante la verifica 2FA:', error);
		if (errorMessage) {
			errorMessage.textContent = error.data?.error || "Errore di connessione al server";
			errorMessage.style.display = 'block';
		} else {
			alert("Errore di connessione al server");
		}
	}
}

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
 * Refreshes the authentication token.
 * @async
 * @function refreshToken
 * @returns {Promise<boolean>} True if token was successfully refreshed, false otherwise
 * @throws {Error} If token refresh fails
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
			window.location.href = '/login';
			return false;
		}
	} catch (error) {
		console.error('Errore durante il refresh del token:', error);
		return false;
	}
}

/**
 * Loads the user_status.js script if not already loaded.
 * @async
 * @function loadUserStatusScript
 * @returns {Promise<void>} Resolves when script is loaded
 * @throws {Error} If script loading fails
 */
async function loadUserStatusScript() {
	return new Promise((resolve, reject) => {
		// Controlla se lo script è già caricato
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

// Export functions to window object
window.initializeLogin = initializeLogin;
window.refreshToken = refreshToken;
window.getCsrfToken = getCsrfToken;
window.fetchCsrfToken = fetchCsrfToken;

/**
 * Event listener for DOMContentLoaded.
 * Fetches CSRF token and initializes login functionality when the page loads.
 * @listens {Event} DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', () => {
	fetchCsrfToken().then(() => {
		initializeLogin();
	});
});