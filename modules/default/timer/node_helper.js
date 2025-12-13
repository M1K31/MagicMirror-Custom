/**
 * Timer Module Node Helper
 *
 * Handles server-side operations for the timer module:
 * - Audio playback for timer alerts
 * - File system access for custom sounds
 */

const NodeHelper = require("node_helper");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

module.exports = NodeHelper.create({
	/**
	 * Start the node helper
	 */
	start() {
		console.log(`[${this.name}] Node helper started`);
		this.soundsPath = path.join(__dirname, "sounds");
		this.currentSound = null;
	},

	/**
	 * Handle socket notifications from the module
	 * @param {string} notification - Notification name
	 * @param {object} payload - Notification payload
	 */
	socketNotificationReceived(notification, payload) {
		switch (notification) {
			case "PLAY_SOUND":
				this.playSound(payload.sound, payload.volume, payload.duration);
				break;
			case "STOP_SOUND":
				this.stopSound();
				break;
		}
	},

	/**
	 * Play a sound file
	 * @param {string} soundName - Name of the sound (without extension)
	 * @param {number} volume - Volume level (0-1)
	 * @param {number} duration - How long to play (ms)
	 */
	playSound(soundName, volume = 0.7, duration = 5000) {
		// Look for sound file
		const extensions = [".mp3", ".wav", ".ogg"];
		let soundFile = null;

		for (const ext of extensions) {
			const filePath = path.join(this.soundsPath, soundName + ext);
			if (fs.existsSync(filePath)) {
				soundFile = filePath;
				break;
			}
		}

		if (!soundFile) {
			console.error(`[${this.name}] Sound file not found: ${soundName}`);
			this.sendSocketNotification("SOUND_ERROR", {
				sound: soundName,
				error: "File not found"
			});
			return;
		}

		// Stop any currently playing sound
		this.stopSound();

		// Determine the audio player to use based on platform
		const platform = process.platform;
		let command;

		if (platform === "linux") {
			// Try different Linux audio players
			command = this.getLinuxCommand(soundFile, volume);
		} else if (platform === "darwin") {
			// macOS
			command = `afplay -v ${volume} "${soundFile}"`;
		} else if (platform === "win32") {
			// Windows - use PowerShell
			const volumePercent = Math.round(volume * 100);
			command = `powershell -c "(New-Object Media.SoundPlayer '${soundFile}').PlaySync()"`;
		} else {
			console.error(`[${this.name}] Unsupported platform: ${platform}`);
			this.sendSocketNotification("SOUND_ERROR", {
				sound: soundName,
				error: `Unsupported platform: ${platform}`
			});
			return;
		}

		if (!command) {
			console.error(`[${this.name}] No audio player available`);
			this.sendSocketNotification("SOUND_ERROR", {
				sound: soundName,
				error: "No audio player available"
			});
			return;
		}

		console.log(`[${this.name}] Playing sound: ${soundName}`);

		// Execute the command
		this.currentSound = exec(command, (error) => {
			if (error && !error.killed) {
				console.error(`[${this.name}] Error playing sound:`, error.message);
				this.sendSocketNotification("SOUND_ERROR", {
					sound: soundName,
					error: error.message
				});
			}
		});

		// Stop after duration
		if (duration > 0) {
			setTimeout(() => {
				this.stopSound();
			}, duration);
		}

		this.sendSocketNotification("SOUND_PLAYED", { sound: soundName });
	},

	/**
	 * Get Linux audio command
	 * @param {string} soundFile - Path to sound file
	 * @param {number} volume - Volume level (0-1)
	 * @returns {string|null} Command to execute
	 */
	getLinuxCommand(soundFile, volume) {
		// Check for available audio players
		const players = [
			{
				check: "which aplay",
				cmd: (file, vol) => `aplay "${file}"`
			},
			{
				check: "which paplay",
				cmd: (file, vol) => `paplay --volume=${Math.round(vol * 65536)} "${file}"`
			},
			{
				check: "which mpg123",
				cmd: (file, vol) => `mpg123 -q -f ${Math.round(vol * 32768)} "${file}"`
			},
			{
				check: "which ffplay",
				cmd: (file, vol) => `ffplay -nodisp -autoexit -volume ${Math.round(vol * 100)} "${file}" 2>/dev/null`
			},
			{
				check: "which cvlc",
				cmd: (file, vol) => `cvlc --play-and-exit --gain=${vol} "${file}" 2>/dev/null`
			}
		];

		for (const player of players) {
			try {
				require("child_process").execSync(player.check, { stdio: "ignore" });
				return player.cmd(soundFile, volume);
			} catch (e) {
				// Player not available, try next
			}
		}

		return null;
	},

	/**
	 * Stop the currently playing sound
	 */
	stopSound() {
		if (this.currentSound) {
			this.currentSound.kill();
			this.currentSound = null;
		}
	},

	/**
	 * Stop the node helper
	 */
	stop() {
		this.stopSound();
		console.log(`[${this.name}] Node helper stopped`);
	}
});
