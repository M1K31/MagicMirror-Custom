/**
 * Secure Storage Module
 *
 * Provides encrypted storage for sensitive data like OAuth tokens,
 * API keys, and session credentials.
 *
 * Uses AES-256-GCM encryption with machine-specific key derivation.
 *
 * @module shared/secure-storage
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Get a machine-specific identifier for key derivation
 * @returns {string} Machine identifier
 */
function getMachineId() {
	// Use multiple factors for machine identification
	const factors = [
		os.hostname(),
		os.platform(),
		os.arch(),
		os.cpus()[0]?.model || "unknown"
	];

	// Create a hash of the factors
	return crypto.createHash("sha256")
		.update(factors.join("|"))
		.digest("hex");
}

/**
 * Secure Storage class for encrypting sensitive data
 */
class SecureStorage {
	/**
	 * Create a SecureStorage instance
	 * @param {string} [encryptionKey] - Optional custom encryption key
	 * @param {string} [salt] - Optional custom salt
	 */
	constructor(encryptionKey, salt) {
		// Use provided key or derive from machine ID
		const baseKey = encryptionKey || getMachineId();
		const baseSalt = salt || "magicmirror-secure-storage-v1";

		// Derive a 256-bit key using scrypt
		this.key = crypto.scryptSync(baseKey, baseSalt, 32);
		this.algorithm = "aes-256-gcm";
	}

	/**
	 * Encrypt data
	 * @param {*} data - Data to encrypt (will be JSON serialized)
	 * @returns {object} Encrypted data object with iv, data, and tag
	 */
	encrypt(data) {
		// Generate random IV for each encryption
		const iv = crypto.randomBytes(16);

		// Create cipher
		const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

		// Encrypt the data
		const jsonData = JSON.stringify(data);
		let encrypted = cipher.update(jsonData, "utf8", "hex");
		encrypted += cipher.final("hex");

		// Get authentication tag
		const authTag = cipher.getAuthTag();

		return {
			version: 1,
			algorithm: this.algorithm,
			iv: iv.toString("hex"),
			data: encrypted,
			tag: authTag.toString("hex"),
			timestamp: Date.now()
		};
	}

	/**
	 * Decrypt data
	 * @param {object} encryptedData - Encrypted data object
	 * @returns {*} Decrypted data
	 * @throws {Error} If decryption fails
	 */
	decrypt(encryptedData) {
		if (!encryptedData || !encryptedData.iv || !encryptedData.data || !encryptedData.tag) {
			throw new Error("Invalid encrypted data format");
		}

		// Parse components
		const iv = Buffer.from(encryptedData.iv, "hex");
		const tag = Buffer.from(encryptedData.tag, "hex");

		// Create decipher
		const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
		decipher.setAuthTag(tag);

		// Decrypt
		try {
			let decrypted = decipher.update(encryptedData.data, "hex", "utf8");
			decrypted += decipher.final("utf8");
			return JSON.parse(decrypted);
		} catch (error) {
			throw new Error("Decryption failed - data may be corrupted or key mismatch");
		}
	}

	/**
	 * Save data securely to a file
	 * @param {string} filePath - Path to save the encrypted file
	 * @param {*} data - Data to encrypt and save
	 * @param {object} [options] - Options
	 * @param {boolean} [options.backup] - Create backup of existing file
	 */
	saveSecure(filePath, data, options = {}) {
		const encrypted = this.encrypt(data);

		// Create backup if requested and file exists
		if (options.backup && fs.existsSync(filePath)) {
			const backupPath = `${filePath}.backup`;
			fs.copyFileSync(filePath, backupPath);
			fs.chmodSync(backupPath, 0o600);
		}

		// Ensure directory exists
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		}

		// Write with restricted permissions (owner read/write only)
		fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), {
			mode: 0o600,
			encoding: "utf8"
		});
	}

	/**
	 * Load and decrypt data from a file
	 * @param {string} filePath - Path to the encrypted file
	 * @returns {*} Decrypted data or null if file doesn't exist
	 * @throws {Error} If decryption fails
	 */
	loadSecure(filePath) {
		if (!fs.existsSync(filePath)) {
			return null;
		}

		try {
			const content = fs.readFileSync(filePath, "utf8");
			const encrypted = JSON.parse(content);
			return this.decrypt(encrypted);
		} catch (error) {
			console.error(`Failed to load secure file ${filePath}:`, error.message);
			throw error;
		}
	}

	/**
	 * Check if a secure file exists and is valid
	 * @param {string} filePath - Path to check
	 * @returns {boolean} True if file exists and can be decrypted
	 */
	exists(filePath) {
		try {
			if (!fs.existsSync(filePath)) {
				return false;
			}
			// Try to load and verify
			this.loadSecure(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Delete a secure file
	 * @param {string} filePath - Path to delete
	 * @param {object} [options] - Options
	 * @param {boolean} [options.secureDelete] - Overwrite before delete
	 */
	delete(filePath, options = {}) {
		if (!fs.existsSync(filePath)) {
			return;
		}

		if (options.secureDelete) {
			// Overwrite with random data before deleting
			const stats = fs.statSync(filePath);
			const randomData = crypto.randomBytes(stats.size);
			fs.writeFileSync(filePath, randomData);
		}

		fs.unlinkSync(filePath);

		// Also delete backup if exists
		const backupPath = `${filePath}.backup`;
		if (fs.existsSync(backupPath)) {
			if (options.secureDelete) {
				const stats = fs.statSync(backupPath);
				const randomData = crypto.randomBytes(stats.size);
				fs.writeFileSync(backupPath, randomData);
			}
			fs.unlinkSync(backupPath);
		}
	}

	/**
	 * Rotate encryption key
	 * Re-encrypts all data with a new key
	 * @param {string} filePath - Path to the file to rotate
	 * @param {SecureStorage} newStorage - New SecureStorage instance with new key
	 */
	rotateKey(filePath, newStorage) {
		const data = this.loadSecure(filePath);
		if (data) {
			newStorage.saveSecure(filePath, data, { backup: true });
		}
	}
}

/**
 * Create a SecureStorage instance with default settings
 * @returns {SecureStorage} Default secure storage instance
 */
function createDefaultStorage() {
	return new SecureStorage();
}

/**
 * Create a SecureStorage instance with a custom password
 * @param {string} password - User-provided password
 * @returns {SecureStorage} Password-protected storage instance
 */
function createPasswordStorage(password) {
	if (!password || password.length < 8) {
		throw new Error("Password must be at least 8 characters");
	}
	return new SecureStorage(password);
}

module.exports = {
	SecureStorage,
	createDefaultStorage,
	createPasswordStorage
};
