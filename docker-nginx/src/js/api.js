/**
 * @fileoverview API utility functions for making authenticated requests to the Django backend.
 * Provides a wrapper around fetch with authentication, CSRF protection, and automatic token refresh.
 * @module api
 * @requires login
 */

/**
 * Makes an authenticated API request to the Django backend.
 * Handles authentication, CSRF tokens, and automatic token refresh on 401 errors.
 * 
 * @async
 * @function authenticatedFetch
 * @param {string} url - The API endpoint URL
 * @param {Object} [options={}] - Fetch options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.headers] - Request headers
 * @param {string} [options.body] - Request body
 * @param {string} [options.credentials='include'] - Credentials mode
 * @returns {Promise<Object|null>} The response data, or null for 204 responses
 * @throws {Error} If the request fails or authentication is required
 * 
 * @example
 * // Making a simple GET request
 * const data = await authenticatedFetch('/api/endpoint/');
 * 
 * @example
 * // Making a POST request with data
 * const response = await authenticatedFetch('/api/endpoint/', {
 *   method: 'POST',
 *   body: JSON.stringify({ key: 'value' })
 * });
 */
async function authenticatedFetch(url, options = {}) {
	// Default options
	const defaultOptions = {
		method: 'GET',
		credentials: 'include', // Always include cookies for authentication
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		}
	};

	// Merge options
	const fetchOptions = {
		...defaultOptions,
		...options,
		headers: {
			...defaultOptions.headers,
			...(options.headers || {})
		}
	};

	// Add CSRF token if available
	try {
		if (window.fetchCsrfToken) {
			await window.fetchCsrfToken();
			if (window.getCsrfToken) {
				const csrfToken = window.getCsrfToken();
				if (csrfToken) {
					fetchOptions.headers['X-CSRFToken'] = csrfToken;
				}
			}
		}
	} catch (csrfError) {
		console.warn("Could not obtain CSRF token:", csrfError);
	}

	// Authentication is handled via HTTP-only cookies
	// which are automatically sent due to credentials: 'include'

	let retryCount = 0;
	const MAX_RETRIES = 1;
	
	while (retryCount <= MAX_RETRIES) {
		try {
			const response = await fetch(url, fetchOptions);
			
			// Handle authentication errors with retry
			if (response.status === 401 && retryCount < MAX_RETRIES) {
				console.log("Received 401 error, attempting token refresh...");
				retryCount++;
				
				// Try to refresh the token
				if (window.refreshToken) {
					const refreshed = await window.refreshToken();
					
					if (refreshed) {
						console.log("Token refreshed, retrying request");
						continue;
					}
				}
				
				// If refresh failed or is not available, redirect to login
				if (window.location.pathname !== '/login') {
					console.log("Redirecting to login page");
					window.location.href = '/login';
				}
				throw new Error('Authentication required');
			}
	
			// For other errors, return the response for handling by the caller
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const error = new Error(`API error: ${response.status}`);
				error.status = response.status;
				error.data = errorData;
				throw error;
			}
	
			// Parse JSON response if content exists
			if (response.status !== 204) { // No Content
				return await response.json();
			}
			
			return null;
		} catch (error) {
			if (retryCount >= MAX_RETRIES || error.message !== 'Authentication required') {
				console.error("Fetch error:", error);
				throw error;
			}
		}
	}
}

/**
 * Helper methods for common HTTP verbs.
 * Each method wraps authenticatedFetch with appropriate options.
 * @namespace
 */
const api = {
	/**
	 * Makes a GET request.
	 * @async
	 * @function get
	 * @param {string} url - The API endpoint URL
	 * @param {Object} [options={}] - Additional fetch options
	 * @returns {Promise<Object>} The response data
	 * @throws {Error} If the request fails
	 */
	get: (url, options = {}) => authenticatedFetch(url, { ...options, method: 'GET' }),
	
	/**
	 * Makes a POST request.
	 * @async
	 * @function post
	 * @param {string} url - The API endpoint URL
	 * @param {Object} data - The data to send in the request body
	 * @param {Object} [options={}] - Additional fetch options
	 * @returns {Promise<Object>} The response data
	 * @throws {Error} If the request fails
	 */
	post: (url, data, options = {}) => authenticatedFetch(url, {
		...options,
		method: 'POST',
		body: JSON.stringify(data)
	}),
	
	/**
	 * Makes a PUT request.
	 * @async
	 * @function put
	 * @param {string} url - The API endpoint URL
	 * @param {Object} data - The data to send in the request body
	 * @param {Object} [options={}] - Additional fetch options
	 * @returns {Promise<Object>} The response data
	 * @throws {Error} If the request fails
	 */
	put: (url, data, options = {}) => authenticatedFetch(url, {
		...options,
		method: 'PUT',
		body: JSON.stringify(data)
	}),
	
	/**
	 * Makes a PATCH request.
	 * @async
	 * @function patch
	 * @param {string} url - The API endpoint URL
	 * @param {Object} data - The data to send in the request body
	 * @param {Object} [options={}] - Additional fetch options
	 * @returns {Promise<Object>} The response data
	 * @throws {Error} If the request fails
	 */
	patch: (url, data, options = {}) => authenticatedFetch(url, {
		...options,
		method: 'PATCH',
		body: JSON.stringify(data)
	}),
	
	/**
	 * Makes a DELETE request.
	 * @async
	 * @function delete
	 * @param {string} url - The API endpoint URL
	 * @param {Object} [options={}] - Additional fetch options
	 * @returns {Promise<Object>} The response data
	 * @throws {Error} If the request fails
	 */
	delete: (url, options = {}) => authenticatedFetch(url, { 
		...options, 
		method: 'DELETE' 
	}),
	
	/**
	 * Uploads a file or FormData object.
	 * Automatically handles content type and boundaries for multipart/form-data.
	 * @async
	 * @function upload
	 * @param {string} url - The API endpoint URL
	 * @param {FormData} formData - The FormData object containing files/data to upload
	 * @param {Object} [options={}] - Additional fetch options
	 * @param {string} [options.method='POST'] - HTTP method to use
	 * @returns {Promise<Object>} The response data
	 * @throws {Error} If the upload fails
	 * 
	 * @example
	 * const formData = new FormData();
	 * formData.append('file', fileInput.files[0]);
	 * const response = await api.upload('/api/upload/', formData);
	 */
	upload: async (url, formData, options = {}) => {
		// For file uploads, we don't want to set Content-Type as it will be set automatically with boundary
		const uploadOptions = {
			...options,
			method: options.method || 'POST',
			body: formData,
			headers: {
				'Accept': 'application/json',
				...(options.headers || {})
			}
		};
		
		// Remove Content-Type so browser can set it with proper boundary
		delete uploadOptions.headers['Content-Type'];
		
		return authenticatedFetch(url, uploadOptions);
	}
};

// Export the API utilities
window.authenticatedFetch = authenticatedFetch;
window.api = api; 