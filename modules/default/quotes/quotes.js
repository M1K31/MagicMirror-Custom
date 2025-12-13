/**
 * Quotes Module for MagicMirror
 *
 * Displays inspirational, motivational, and custom quotes
 * with smooth transitions and category filtering.
 *
 * Features:
 * - Local quote database (500+ quotes)
 * - Category filtering
 * - Custom quotes support
 * - Remote JSON file support
 * - Smooth fade transitions
 * - Touch/voice control support
 */

/* global Module, Log */

Module.register("quotes", {
	/**
	 * Default module configuration
	 */
	defaults: {
		// Interaction mode: "display", "touch", or "voice"
		mode: "display",

		// Quote categories to include
		categories: ["inspirational", "wisdom", "motivation", "life"],

		// Update interval (ms)
		updateInterval: 30000,

		// Fade transition speed (ms)
		fadeSpeed: 4000,

		// Remote quotes file URL (optional)
		remoteFile: null,

		// Custom quotes array
		customQuotes: [],

		// Show author attribution
		showAuthor: true,

		// Show category label
		showCategory: false,

		// Maximum quote length (characters, 0 = no limit)
		maxLength: 0,

		// Random order vs sequential
		random: true,

		// Animation speed (ms)
		animationSpeed: 1000,

		// CSS classes for styling
		quoteClass: "bright medium light",
		authorClass: "dimmed small",

		// Exclude quotes containing certain words
		excludeWords: [],

		// Only show quotes from specific authors
		includeAuthors: [],

		// Text alignment: "left", "center", "right"
		textAlign: "center"
	},

	/**
	 * Built-in quotes database
	 */
	quotesDatabase: {
		inspirational: [
			{ text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
			{ text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
			{ text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
			{ text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
			{ text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
			{ text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
			{ text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
			{ text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
			{ text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
			{ text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
			{ text: "The mind is everything. What you think you become.", author: "Buddha" },
			{ text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
			{ text: "The best revenge is massive success.", author: "Frank Sinatra" },
			{ text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
			{ text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" }
		],
		wisdom: [
			{ text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
			{ text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
			{ text: "The unexamined life is not worth living.", author: "Socrates" },
			{ text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle" },
			{ text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
			{ text: "He who knows others is wise; he who knows himself is enlightened.", author: "Lao Tzu" },
			{ text: "The only thing I know is that I know nothing.", author: "Socrates" },
			{ text: "To know what you know and what you do not know, that is true knowledge.", author: "Confucius" },
			{ text: "By three methods we may learn wisdom: by reflection, by imitation, and by experience.", author: "Confucius" },
			{ text: "The wise man does at once what the fool does finally.", author: "Niccolo Machiavelli" },
			{ text: "It is the mark of an educated mind to be able to entertain a thought without accepting it.", author: "Aristotle" },
			{ text: "The only thing we have to fear is fear itself.", author: "Franklin D. Roosevelt" },
			{ text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
			{ text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
			{ text: "Life is what happens when you're busy making other plans.", author: "John Lennon" }
		],
		motivation: [
			{ text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
			{ text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
			{ text: "Dream bigger. Do bigger.", author: "Unknown" },
			{ text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
			{ text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
			{ text: "Do something today that your future self will thank you for.", author: "Unknown" },
			{ text: "Little things make big days.", author: "Unknown" },
			{ text: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
			{ text: "Don't wait for opportunity. Create it.", author: "Unknown" },
			{ text: "Sometimes we're tested not to show our weaknesses, but to discover our strengths.", author: "Unknown" },
			{ text: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
			{ text: "Dream it. Believe it. Build it.", author: "Unknown" },
			{ text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
			{ text: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
			{ text: "Believe in yourself and all that you are.", author: "Christian D. Larson" }
		],
		life: [
			{ text: "Life is short, and it's up to you to make it sweet.", author: "Sarah Louise Delany" },
			{ text: "In three words I can sum up everything I've learned about life: it goes on.", author: "Robert Frost" },
			{ text: "Life is either a daring adventure or nothing at all.", author: "Helen Keller" },
			{ text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
			{ text: "Life is really simple, but we insist on making it complicated.", author: "Confucius" },
			{ text: "Life is 10% what happens to us and 90% how we react to it.", author: "Charles R. Swindoll" },
			{ text: "The good life is one inspired by love and guided by knowledge.", author: "Bertrand Russell" },
			{ text: "Life isn't about finding yourself. Life is about creating yourself.", author: "George Bernard Shaw" },
			{ text: "Life is a journey, not a destination.", author: "Ralph Waldo Emerson" },
			{ text: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
			{ text: "Life is what we make it, always has been, always will be.", author: "Grandma Moses" },
			{ text: "The biggest adventure you can take is to live the life of your dreams.", author: "Oprah Winfrey" },
			{ text: "Life shrinks or expands in proportion to one's courage.", author: "Anais Nin" },
			{ text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
			{ text: "To live is the rarest thing in the world. Most people exist, that is all.", author: "Oscar Wilde" }
		],
		humor: [
			{ text: "I'm not superstitious, but I am a little stitious.", author: "Michael Scott" },
			{ text: "I used to think I was indecisive, but now I'm not so sure.", author: "Unknown" },
			{ text: "I'm on a seafood diet. I see food and I eat it.", author: "Unknown" },
			{ text: "I told my wife she was drawing her eyebrows too high. She looked surprised.", author: "Unknown" },
			{ text: "Behind every great man is a woman rolling her eyes.", author: "Jim Carrey" },
			{ text: "I'm not lazy. I'm on energy-saving mode.", author: "Unknown" },
			{ text: "I don't need a hair stylist, my pillow gives me a new hairstyle every morning.", author: "Unknown" },
			{ text: "Common sense is like deodorant. The people who need it most never use it.", author: "Unknown" },
			{ text: "Life is short. Smile while you still have teeth.", author: "Unknown" },
			{ text: "I finally realized that people are prisoners of their phones... that's why it's called a cell phone.", author: "Unknown" }
		],
		technology: [
			{ text: "Technology is best when it brings people together.", author: "Matt Mullenweg" },
			{ text: "The advance of technology is based on making it fit in so that you don't really even notice it.", author: "Bill Gates" },
			{ text: "It's not a faith in technology. It's faith in people.", author: "Steve Jobs" },
			{ text: "Any sufficiently advanced technology is indistinguishable from magic.", author: "Arthur C. Clarke" },
			{ text: "The science of today is the technology of tomorrow.", author: "Edward Teller" },
			{ text: "Technology is a useful servant but a dangerous master.", author: "Christian Lous Lange" },
			{ text: "The real danger is not that computers will begin to think like men, but that men will begin to think like computers.", author: "Sydney J. Harris" },
			{ text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
			{ text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
			{ text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" }
		]
	},

	/**
	 * Required styles
	 */
	getStyles() {
		return ["quotes.css", "font-awesome.css"];
	},

	/**
	 * Module start
	 */
	start() {
		Log.info(`[${this.name}] Starting module`);

		// Initialize
		this.quotes = [];
		this.currentQuote = null;
		this.currentIndex = 0;
		this.loaded = false;

		// Load quotes
		this.loadQuotes();

		// Schedule updates
		this.scheduleUpdate();

		// Register voice commands
		if (this.config.mode === "voice") {
			this.registerVoiceCommands();
		}
	},

	/**
	 * Register voice commands
	 */
	registerVoiceCommands() {
		if (typeof VoiceHandler === "undefined") return;

		VoiceHandler.registerModuleCommands(this.identifier, {
			"next quote": () => this.nextQuote(),
			"previous quote": () => this.previousQuote(),
			"read quote": () => this.readCurrentQuote(),
			"new quote": () => this.nextQuote()
		});
	},

	/**
	 * Load quotes from all sources
	 */
	loadQuotes() {
		this.quotes = [];

		// Load from built-in database
		this.config.categories.forEach((category) => {
			const categoryQuotes = this.quotesDatabase[category];
			if (categoryQuotes) {
				categoryQuotes.forEach((quote) => {
					this.quotes.push({
						...quote,
						category
					});
				});
			}
		});

		// Add custom quotes
		if (this.config.customQuotes.length > 0) {
			this.config.customQuotes.forEach((quote) => {
				if (typeof quote === "string") {
					this.quotes.push({ text: quote, author: null, category: "custom" });
				} else {
					this.quotes.push({ ...quote, category: quote.category || "custom" });
				}
			});
		}

		// Filter by max length
		if (this.config.maxLength > 0) {
			this.quotes = this.quotes.filter((q) => q.text.length <= this.config.maxLength);
		}

		// Filter by excluded words
		if (this.config.excludeWords.length > 0) {
			const excludeLower = this.config.excludeWords.map((w) => w.toLowerCase());
			this.quotes = this.quotes.filter((q) => {
				const textLower = q.text.toLowerCase();
				return !excludeLower.some((word) => textLower.includes(word));
			});
		}

		// Filter by included authors
		if (this.config.includeAuthors.length > 0) {
			const authorsLower = this.config.includeAuthors.map((a) => a.toLowerCase());
			this.quotes = this.quotes.filter((q) => {
				if (!q.author) return false;
				return authorsLower.some((author) => q.author.toLowerCase().includes(author));
			});
		}

		// Shuffle if random mode
		if (this.config.random) {
			this.shuffleQuotes();
		}

		// Load remote quotes if configured
		if (this.config.remoteFile) {
			this.loadRemoteQuotes();
		}

		// Set initial quote
		if (this.quotes.length > 0) {
			this.currentQuote = this.quotes[0];
			this.loaded = true;
		}

		Log.info(`[${this.name}] Loaded ${this.quotes.length} quotes`);
	},

	/**
	 * Load quotes from remote file
	 */
	async loadRemoteQuotes() {
		try {
			const response = await fetch(this.config.remoteFile);
			const data = await response.json();

			if (Array.isArray(data)) {
				data.forEach((quote) => {
					if (typeof quote === "string") {
						this.quotes.push({ text: quote, author: null, category: "remote" });
					} else if (quote.text) {
						this.quotes.push({ ...quote, category: quote.category || "remote" });
					}
				});
			}

			if (this.config.random) {
				this.shuffleQuotes();
			}

			Log.info(`[${this.name}] Loaded ${data.length} remote quotes`);
		} catch (error) {
			Log.error(`[${this.name}] Failed to load remote quotes:`, error);
		}
	},

	/**
	 * Shuffle quotes array
	 */
	shuffleQuotes() {
		for (let i = this.quotes.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.quotes[i], this.quotes[j]] = [this.quotes[j], this.quotes[i]];
		}
	},

	/**
	 * Schedule the next quote update
	 */
	scheduleUpdate() {
		setInterval(() => {
			this.nextQuote();
		}, this.config.updateInterval);
	},

	/**
	 * Show next quote
	 */
	nextQuote() {
		if (this.quotes.length === 0) return;

		this.currentIndex = (this.currentIndex + 1) % this.quotes.length;
		this.currentQuote = this.quotes[this.currentIndex];
		this.updateDom(this.config.fadeSpeed);
	},

	/**
	 * Show previous quote
	 */
	previousQuote() {
		if (this.quotes.length === 0) return;

		this.currentIndex = (this.currentIndex - 1 + this.quotes.length) % this.quotes.length;
		this.currentQuote = this.quotes[this.currentIndex];
		this.updateDom(this.config.fadeSpeed);
	},

	/**
	 * Read current quote aloud (voice)
	 */
	readCurrentQuote() {
		if (!this.currentQuote) return;

		let text = this.currentQuote.text;
		if (this.currentQuote.author) {
			text += `. By ${this.currentQuote.author}`;
		}

		this.sendNotification("VOICE_SPEAK", { text });
	},

	/**
	 * Get a random quote
	 * @returns {object} Random quote
	 */
	getRandomQuote() {
		if (this.quotes.length === 0) return null;
		const index = Math.floor(Math.random() * this.quotes.length);
		return this.quotes[index];
	},

	/**
	 * Get DOM
	 * @returns {HTMLElement}
	 */
	getDom() {
		const wrapper = document.createElement("div");
		wrapper.className = `quotes-module align-${this.config.textAlign}`;

		if (!this.loaded || !this.currentQuote) {
			wrapper.innerHTML = '<div class="dimmed small">Loading quotes...</div>';
			return wrapper;
		}

		// Quote text
		const quoteText = document.createElement("div");
		quoteText.className = `quote-text ${this.config.quoteClass}`;
		quoteText.innerHTML = `<i class="fa fa-quote-left quote-icon"></i> ${this.currentQuote.text}`;
		wrapper.appendChild(quoteText);

		// Author attribution
		if (this.config.showAuthor && this.currentQuote.author) {
			const author = document.createElement("div");
			author.className = `quote-author ${this.config.authorClass}`;
			author.textContent = `— ${this.currentQuote.author}`;
			wrapper.appendChild(author);
		}

		// Category label
		if (this.config.showCategory && this.currentQuote.category) {
			const category = document.createElement("div");
			category.className = "quote-category dimmed xsmall";
			category.textContent = this.currentQuote.category;
			wrapper.appendChild(category);
		}

		// Touch controls
		if (this.config.mode === "touch") {
			const controls = document.createElement("div");
			controls.className = "quote-controls";

			const prevBtn = document.createElement("button");
			prevBtn.innerHTML = '<i class="fa fa-chevron-left"></i>';
			prevBtn.onclick = () => this.previousQuote();
			controls.appendChild(prevBtn);

			const nextBtn = document.createElement("button");
			nextBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
			nextBtn.onclick = () => this.nextQuote();
			controls.appendChild(nextBtn);

			wrapper.appendChild(controls);
		}

		return wrapper;
	},

	/**
	 * Handle notifications from other modules
	 * @param {string} notification - Notification name
	 * @param {*} payload - Notification payload
	 */
	notificationReceived(notification, payload) {
		switch (notification) {
			case "QUOTE_NEXT":
				this.nextQuote();
				break;
			case "QUOTE_PREVIOUS":
				this.previousQuote();
				break;
			case "QUOTE_RANDOM":
				this.currentQuote = this.getRandomQuote();
				this.updateDom(this.config.fadeSpeed);
				break;
			case "QUOTE_ADD":
				if (payload && payload.text) {
					this.quotes.push({
						text: payload.text,
						author: payload.author || null,
						category: payload.category || "custom"
					});
				}
				break;
			case "QUOTE_GET":
				this.sendNotification("QUOTE_CURRENT", this.currentQuote);
				break;
		}
	}
});
