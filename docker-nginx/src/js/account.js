/**
 * @fileoverview User account management functionality for ft_transcendence.
 * Handles profile viewing, editing, image upload, 2FA management, and match history.
 * @module account
 * @requires api
 * @requires toast
 */

/**
 * Initializes the account page functionality.
 * Sets up the loading state and initializes all required components.
 * @function initializeAccount
 * @returns {void}
 */
function initializeAccount() {
	const contentContainer = document.querySelector('#content');
	if (contentContainer)
		contentContainer.classList.add('loading-profile');
	loadProfileData();
	initEventHandlers();
}

/**
 * Loads user profile data and initializes related components.
 * Verifies authentication, loads profile data, and updates the UI.
 * @async
 * @function loadProfileData
 * @returns {Promise<void>}
 * @throws {Error} If profile data loading fails
 */
async function loadProfileData() {
	try {
		let isAuth = false;
		if (window.isAuthenticated)
			isAuth = await window.isAuthenticated();
		if (!isAuth) {
			history.replaceState(null, null, '/401');
			handleRouting();
			return;
		}
		const profileData = await window.api.get('/api/account/');
		const downloadBtn = document.getElementById('downloadBackupCodesBtn');
		if (downloadBtn) {
			downloadBtn.addEventListener('click', downloadBackupCodes);
		}
		check2FAStatus(profileData);
		updateProfileUI(profileData);
		document.getElementById('prova').style.display = '';
		await loadRecentMatches();
	} catch (error) {
		showErrorToast('Non è stato possibile caricare i dati del profilo. Riprova più tardi.');
	}
}

/**
 * Updates the UI with user profile data.
 * Updates all profile-related elements with the provided data.
 * @function updateProfileUI
 * @param {Object} profileData - The user's profile data
 * @param {string} [profileData.profile_image] - URL of the user's profile image
 * @param {string} [profileData.display_name] - User's display name
 * @param {string} profileData.username - User's username
 * @param {string} [profileData.bio] - User's biography
 * @param {number} [profileData.total_games] - Total number of games played
 * @param {number} [profileData.wins] - Number of games won
 * @param {number} [profileData.losses] - Number of games lost
 * @param {number} [profileData.win_ratio] - Win percentage
 * @param {string} [profileData.email] - User's email address
 * @param {string} [profileData.date_joined] - Date user joined
 * @param {string} [profileData.last_login] - Last login date
 * @param {boolean} profileData.two_factor_enabled - Whether 2FA is enabled
 * @returns {void}
 */
function updateProfileUI(profileData) {
	const profileContainers = document.querySelectorAll('.card, .card-body, .container');
	profileContainers.forEach(container => {
		container.classList.add('profile-content');
	});
	const profileImage = document.getElementById('profileImage');
	if (profileImage) {
		if (profileData.profile_image)
			profileImage.src = profileData.profile_image;
		profileImage.classList.add('profile-content');
	}
	const displayNameEl = document.getElementById('displayName');
	const usernameEl = document.getElementById('username');
	const userBioEl = document.getElementById('userBio');
	if (displayNameEl) {
		displayNameEl.textContent = profileData.display_name || profileData.username;
		displayNameEl.classList.add('profile-content');
	}
	if (usernameEl) {
		usernameEl.textContent = `@${profileData.username}`;
		usernameEl.classList.add('profile-content');
	}
	if (userBioEl) {
		userBioEl.textContent = profileData.bio || 'Nessuna biografia disponibile';
		userBioEl.classList.add('profile-content');
	}
	const totalGamesEl = document.getElementById('totalGames');
	const winsEl = document.getElementById('wins');
	const lossesEl = document.getElementById('losses');
	const winRatioEl = document.getElementById('winRatio');
	if (totalGamesEl) {
		totalGamesEl.textContent = profileData.total_games || 0;
		totalGamesEl.classList.add('profile-content');
	}
	if (winsEl) {
		winsEl.textContent = profileData.wins || 0;
		winsEl.classList.add('profile-content');
	}
	if (lossesEl) {
		lossesEl.textContent = profileData.losses || 0;
		lossesEl.classList.add('profile-content');
	}
	if (winRatioEl) {
		winRatioEl.textContent = `${profileData.win_ratio || 0}%`;
		winRatioEl.classList.add('profile-content');
	}
	const emailEl = document.getElementById('email');
	const dateJoinedEl = document.getElementById('dateJoined');
	const lastLoginEl = document.getElementById('lastLogin');
	const twoFactorStatusEl = document.getElementById('twoFactorStatus');
	if (emailEl) {
		emailEl.textContent = profileData.email || 'Non disponibile';
		emailEl.classList.add('profile-content');
	}
	if (dateJoinedEl) {
		dateJoinedEl.textContent = formatDate(profileData.date_joined);
		dateJoinedEl.classList.add('profile-content');
	}
	if (lastLoginEl) {
		lastLoginEl.textContent = formatDate(profileData.last_login);
		lastLoginEl.classList.add('profile-content');
	}
	if (twoFactorStatusEl) {
		twoFactorStatusEl.textContent = profileData.two_factor_enabled ? 'Abilitata' : 'Disabilitata';
		twoFactorStatusEl.classList.add('profile-content');
	}
	const twoFactorBtnText = document.getElementById('twoFactorBtnText');
	const twoFactorActionBtn = document.getElementById('twoFactorActionBtn');
	if (twoFactorBtnText && twoFactorActionBtn) {
		if (profileData.two_factor_enabled) {
			twoFactorBtnText.textContent = 'Disattiva 2FA';
			twoFactorActionBtn.classList.remove('btn-primary');
			twoFactorActionBtn.classList.add('btn-outline-warning');
			twoFactorActionBtn.onclick = handleDisable2FA;
		} else {
			twoFactorBtnText.textContent = 'Configura 2FA';
			twoFactorActionBtn.classList.remove('btn-outline-warning');
			twoFactorActionBtn.classList.add('btn-primary');
			twoFactorActionBtn.onclick = handleSetup2FA;
		}
	}
	const editDisplayNameEl = document.getElementById('editDisplayName');
	const editBioEl = document.getElementById('editBio');
	if (editDisplayNameEl)
		editDisplayNameEl.value = profileData.display_name || '';
	if (editBioEl)
		editBioEl.value = profileData.bio || '';
	const buttons = document.querySelectorAll('button, .btn');
	buttons.forEach(button => {
		if (!button.classList.contains('spinner-border'))
			button.classList.add('profile-content');
	});
}

/**
 * Initializes event handlers for various UI elements.
 * Sets up listeners for profile editing, image upload, and account management.
 * @function initEventHandlers
 * @returns {void}
 */
function initEventHandlers() {
	const editProfileBtn = document.getElementById('editProfileBtn');
	if (editProfileBtn) {
		editProfileBtn.addEventListener('click', () => {
			const modal = new bootstrap.Modal(document.getElementById('editProfileModal'));
			modal.show();
		});
	}
	
	// Add event listener for modal hidden event
	const editProfileModal = document.getElementById('editProfileModal');
	if (editProfileModal) {
		editProfileModal.addEventListener('hidden.bs.modal', () => {
			const modalContent = editProfileModal.querySelector('.modal-content');
			if (modalContent) {
				modalContent.removeAttribute('aria-hidden');
			}
			const ariaHiddenElements = editProfileModal.querySelectorAll('[aria-hidden]');
			ariaHiddenElements.forEach(element => {
				element.removeAttribute('aria-hidden');
			});
		});
	}

	const saveProfileBtn = document.getElementById('saveProfileBtn');
	if (saveProfileBtn)
		saveProfileBtn.addEventListener('click', saveProfileChanges);
	
	const imageUpload = document.getElementById('imageUpload');
	if (imageUpload)
		imageUpload.addEventListener('change', uploadProfileImage);
	
	const deleteAccountBtn = document.getElementById('deleteAccountBtn');
	if (deleteAccountBtn) {
		deleteAccountBtn.addEventListener('click', handleDeleteAccount);
	}

	const twoFactorActionBtn = document.getElementById('twoFactorActionBtn');
	if (twoFactorActionBtn) {
		twoFactorActionBtn.addEventListener('click', () => {
			const btnText = document.getElementById('twoFactorBtnText');
			if (btnText && btnText.textContent === 'Disattiva 2FA') {
				handleDisable2FA();
			} else {
				handleSetup2FA();
			}
		});
	}
}

/**
 * Formats a date string into a localized format.
 * @function formatDate
 * @param {string} dateString - ISO date string to format
 * @returns {string} Formatted date string in local format
 */
function formatDate(dateString) {
	if (!dateString) return 'Non disponibile';
	const date = new Date(dateString);
	return date.toLocaleDateString('it-IT', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

function showSuccessMessage(message) {
	showSuccessToast(message);
}

function showErrorMessage(message) {
	showErrorToast(message);
}

/**
 * Saves profile changes to the server.
 * Updates display name and biography.
 * @async
 * @function saveProfileChanges
 * @returns {Promise<void>}
 * @throws {Error} If profile update fails
 */
async function saveProfileChanges() {
	try {
		if (window.refreshToken) {
			try {
				const refreshSuccess = await window.refreshToken();
				if (!refreshSuccess) {
					showErrorMessage("Sessione scaduta. Effettua nuovamente il login.");
					window.location.href = '/login';
					return;
				}
			} catch (refreshError) {
				showErrorMessage("Sessione scaduta. Effettua nuovamente il login.");
				window.location.href = '/login';
				return;
			}
		}
		const displayName = document.getElementById('editDisplayName').value;
		const bio = document.getElementById('editBio').value;
		const updatedProfile = await window.api.put('/api/account/', {
			display_name: displayName,
			bio: bio
		});
		updateProfileUI(updatedProfile);
		const modal = bootstrap.Modal.getInstance(document.getElementById('editProfileModal'));
		modal.hide();
		showSuccessMessage('Profilo aggiornato con successo!');
	} catch (error) {
		console.error('Errore durante il salvataggio del profilo:', error);
		showErrorMessage('Non è stato possibile salvare le modifiche. Riprova più tardi.');
	}
}

/**
 * Handles profile image upload and processing.
 * Compresses the image and uploads it to the server.
 * @async
 * @function uploadProfileImage
 * @param {Event} event - The file input change event
 * @returns {Promise<void>}
 * @throws {Error} If image upload or processing fails
 */
async function uploadProfileImage(event) {
	try {
		if (window.refreshToken) {
			try {
				const refreshSuccess = await window.refreshToken();
				if (!refreshSuccess) {
					showErrorMessage("Sessione scaduta. Effettua nuovamente il login.");
					window.location.href = '/login';
					return;
				}
			} catch (refreshError) {
				console.error("Errore durante il rinnovo del token:", refreshError);
				showErrorMessage("Sessione scaduta. Effettua nuovamente il login.");
				window.location.href = '/login';
				return;
			}
		}

		const file = event.target.files[0];
		if (!file) return;

		// Verifica che il file sia un'immagine
		if (!file.type.startsWith('image/')) {
			showErrorMessage('Il file selezionato non è un\'immagine valida.');
			return;
		}

		const uploadSpinner = document.createElement('div');
		uploadSpinner.id = 'uploadSpinner';
		uploadSpinner.className = 'text-center my-3';
		uploadSpinner.innerHTML = `
			<div class="spinner-border text-primary" role="status">
				<span class="visually-hidden">Caricamento immagine in corso...</span>
			</div>
			<p class="mt-2">Elaborazione dell'immagine in corso...</p>
		`;
		
		const imageUploadContainer = document.getElementById('imageUpload').parentElement;
		imageUploadContainer.appendChild(uploadSpinner);

		try {
			const compressedImage = await compressImage(file, 800, 0.7);
			if (compressedImage.size > 2 * 1024 * 1024)
				throw new Error('L\'immagine è troppo grande anche dopo la compressione. La dimensione massima è 2MB.');
			const formData = new FormData();
			formData.append('profile_image', compressedImage, 'profile_image.jpg');
			let accessToken = '';
			if (window.getAccessToken) {
				try {
					accessToken = await window.getAccessToken();
				} catch (e) {
					console.error("Errore nell'ottenere il token di accesso:", e);
				}
			}
			const response = await fetch('/api/account/upload-image/', {
				method: 'POST',
				body: formData,
				headers: {
					'Accept': 'application/json',
					...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
				},
				credentials: 'include'
			});
			
			if (!response.ok) {
				throw new Error(`Errore API: ${response.status}`);
			}
			
			const updatedProfile = await response.json();
			
			// Rimuovi lo spinner di caricamento
			const spinner = document.getElementById('uploadSpinner');
			if (spinner) spinner.remove();
			
			// Aggiorna l'interfaccia utente con i nuovi dati
			updateProfileUI(updatedProfile);
			
			// Mostra un messaggio di successo
			showSuccessMessage('Immagine del profilo aggiornata con successo!');
		} catch (error) {
			// Rimuovi lo spinner di caricamento in caso di errore
			const spinner = document.getElementById('uploadSpinner');
			if (spinner) spinner.remove();
			
			throw error;
		}
	} catch (error) {
		console.error('Errore durante il caricamento dell\'immagine:', error);
		showErrorMessage(error.message || 'Non è stato possibile caricare l\'immagine. Riprova più tardi.');
	}
}

/**
 * Compresses and resizes an image file.
 * @function compressImage
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width of the compressed image
 * @param {number} [quality=0.7] - JPEG quality (0-1)
 * @returns {Promise<File>} Compressed image file
 * @throws {Error} If compression fails
 */
function compressImage(file, maxWidth, quality = 0.7) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = function(event) {
			const img = new Image();
			img.src = event.target.result;
			
			img.onload = function() {
				// Calcola le nuove dimensioni mantenendo l'aspect ratio
				let width = img.width;
				let height = img.height;
				
				if (width > maxWidth) {
					height = Math.round((height * maxWidth) / width);
					width = maxWidth;
				}
				
				// Crea un canvas per ridimensionare l'immagine
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				
				const ctx = canvas.getContext('2d');
				ctx.drawImage(img, 0, 0, width, height);
				
				// Converti il canvas in Blob
				canvas.toBlob(
					blob => {
						if (!blob) {
							reject(new Error('Errore durante la compressione dell\'immagine'));
							return;
						}
						
						// Crea un nuovo file dall'immagine compressa
						const compressedFile = new File([blob], file.name, {
							type: 'image/jpeg',
							lastModified: Date.now()
						});
						
						resolve(compressedFile);
					},
					'image/jpeg',
					quality
				);
			};
			
			img.onerror = function() {
				reject(new Error('Errore durante il caricamento dell\'immagine'));
			};
		};
		
		reader.onerror = function() {
			reject(new Error('Errore durante la lettura del file'));
		};
	});
}

/**
 * Navigates to the 2FA disable page.
 * @function handleDisable2FA
 * @returns {void}
 */
function handleDisable2FA() {
	history.pushState(null, null, '/disable-2fa');
	handleRouting();
}

/**
 * Navigates to the account deletion page.
 * @function handleDeleteAccount
 * @returns {void}
 */
function handleDeleteAccount() {
	history.pushState(null, null, '/delete-account');
	handleRouting();
}

/**
 * Navigates to the 2FA setup page.
 * @function handleSetup2FA
 * @returns {void}
 */
function handleSetup2FA() {
	history.pushState(null, null, '/setup-fa');
	handleRouting();
}

/**
 * Loads and displays recent match history.
 * @async
 * @function loadRecentMatches
 * @returns {Promise<void>}
 * @throws {Error} If loading match history fails
 */
async function loadRecentMatches() {
	try {
		const recentMatches = await window.api.get('/api/matches/recent/');
		const tableBody = document.getElementById('recentMatchesTableBody');
		if (!tableBody)
			return;
		if (recentMatches.length === 0) {
			tableBody.innerHTML = `
				<tr class="text-center">
					<td colspan="5">
						<div class="py-4">
							<i class="fas fa-info-circle me-2"></i>
							Nessun match recente trovato
						</div>
					</td>
				</tr>
			`;
			return;
		}
		tableBody.innerHTML = '';
		recentMatches.forEach(match => {
			const row = renderMatchRow(match);
			tableBody.appendChild(row);
		});
	} catch (error) {
		console.error('Errore nel caricamento dei match recenti:', error);
		const tableBody = document.getElementById('recentMatchesTableBody');
		if (tableBody) {
			tableBody.innerHTML = `
				<tr class="text-center">
					<td colspan="5">
						<div class="py-3 text-danger">
							<i class="fas fa-exclamation-triangle me-2"></i>
							Errore nel caricamento dei match recenti
						</div>
					</td>
				</tr>
			`;
		}
	}
}

/**
 * Renders a single match row for the match history table.
 * @function renderMatchRow
 * @param {Object} match - Match data
 * @param {string} match.opponent - Opponent's username
 * @param {string} match.result - Match result ('Vittoria' or 'Sconfitta')
 * @param {string} match.score - Match score
 * @param {string} match.date - Match date
 * @param {string} match.type - Match type
 * @param {boolean} match.abandoned - Whether the match was abandoned
 * @returns {HTMLTableRowElement} The rendered table row
 */
function renderMatchRow(match) {
	const row = document.createElement('tr');
	if (match.result === 'Vittoria') {
		row.classList.add('victory-row');
	} else {
		row.classList.add('defeat-row');
	}
	let resultHTML = '';
	if (match.result === 'Vittoria') {
		resultHTML = `<span class="match-result victory-result">
						<i class="fas fa-trophy"></i> Vittoria
					  </span>`;
	} else {
		resultHTML = `<span class="match-result defeat-result">
						<i class="fas fa-times-circle"></i> Sconfitta
					  </span>`;
	}
	if (match.abandoned) {
		resultHTML += ` <span class="match-abandoned">Abbandonata</span>`;
	}
	const typeHTML = `<span class="match-type">${match.type}</span>`;
	row.innerHTML = `
		<td><strong>${match.opponent}</strong></td>
		<td>${resultHTML}</td>
		<td>${match.score}</td>
		<td>${match.date}</td>
		<td>${typeHTML}</td>
	`;
	return row;
}

/**
 * Checks 2FA status and updates UI accordingly.
 * @async
 * @function check2FAStatus
 * @param {Object} profileData - User profile data
 * @param {boolean} profileData.two_factor_enabled - Whether 2FA is enabled
 * @returns {Promise<void>}
 */
async function check2FAStatus(profileData) {
	try {
		if (profileData.two_factor_enabled) {
			const downloadBtn = document.getElementById('downloadBackupCodesBtn');
			if (downloadBtn) {
				downloadBtn.style.display = 'block';
			}
		}
	} catch (error) {
		console.error('Errore nel controllo dello stato 2FA:', error);
	}
}

/**
 * Downloads 2FA backup codes as a text file.
 * @function downloadBackupCodes
 * @returns {void}
 */
function downloadBackupCodes() {
	const backupCodes = localStorage.getItem('2fa_backup_codes');
	if (backupCodes) {
		const codes = JSON.parse(backupCodes);
		const content = "Codici di Backup per l'Autenticazione a Due Fattori\n\n" +
						"Conserva questi codici in un luogo sicuro. Ogni codice può essere utilizzato una sola volta.\n\n" +
						codes.join('\n');
		
		const blob = new Blob([content], { type: 'text/plain' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'backup_codes_2fa.txt';
		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(url);
		document.body.removeChild(a);
	}
}

// Export initialization function
window.initializeAccount = initializeAccount;
