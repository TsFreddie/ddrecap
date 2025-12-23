export class SnowAnimation {
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private animationId: number | null = null;
	private snowflakes: Snowflake[] = [];
	private isRunning = false;
	private lastTime = 0; // Track the last frame time for delta time calculation

	constructor() {
		// Bind methods to maintain context
		this.animate = this.animate.bind(this);
		this.handleResize = this.handleResize.bind(this);
	}

	public init(canvas: HTMLCanvasElement): void {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');

		if (!this.ctx) {
			console.error('Failed to get 2D context from canvas');
			return;
		}

		// Set initial canvas size if not already set
		if (this.canvas.width === 0 || this.canvas.height === 0) {
			this.setupCanvas();
		}
	}

	public start(): void {
		if (this.isRunning || !this.canvas || !this.ctx) return;

		// Ensure canvas dimensions are set
		this.setupCanvas();

		this.isRunning = true;
		window.addEventListener('resize', this.handleResize);

		// Restart animation if it was stopped
		if (!this.animationId) {
			this.lastTime = 0; // Reset time tracking
			this.animationId = requestAnimationFrame(this.animate);
		}
	}

	public stop(): void {
		if (!this.isRunning) return;

		this.isRunning = false;
	}

	public destroy(): void {
		this.isRunning = false;

		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		window.removeEventListener('resize', this.handleResize);

		if (this.ctx && this.canvas) {
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		}

		this.snowflakes = [];
		this.canvas = null;
		this.ctx = null;
	}

	private setupCanvas(): void {
		if (!this.canvas) return;

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
	}

	private addNewSnowflake(): void {
		if (!this.canvas || !this.isRunning) return;

		const canvasWidth = this.canvas.width;
		const canvasHeight = this.canvas.height;

		// Check if canvas has valid dimensions
		if (canvasWidth <= 0 || canvasHeight <= 0) {
			console.warn('Canvas has invalid dimensions:', { width: canvasWidth, height: canvasHeight });
			return;
		}

		// Add new snowflake at the top
		this.snowflakes.push(new Snowflake(canvasWidth, canvasHeight));

		// Remove old snowflakes that have fallen off screen to prevent memory buildup
		// Keep a reasonable maximum number of snowflakes
		const maxSnowflakes = Math.floor((canvasWidth * canvasHeight) / 1000);
		if (this.snowflakes.length > maxSnowflakes) {
			// First, remove snowflakes that have fallen off screen
			this.snowflakes = this.snowflakes.filter((snowflake) => snowflake.y < canvasHeight + 50);

			// If still too many after filtering, shuffle and dissipate random ones
			if (this.snowflakes.length > maxSnowflakes) {
				// Shuffle the array to randomize which snowflakes get removed
				for (let i = this.snowflakes.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[this.snowflakes[i], this.snowflakes[j]] = [this.snowflakes[j], this.snowflakes[i]];
				}

				// Keep only the first maxSnowflakes after shuffling
				this.snowflakes = this.snowflakes.slice(0, maxSnowflakes);
			}
		}
	}

	private animate(currentTime: number): void {
		if (!this.ctx || !this.canvas) return;

		// Calculate delta time in seconds
		const deltaTime = this.lastTime === 0 ? 0 : (currentTime - this.lastTime) / 1000;
		this.lastTime = currentTime;

		const canvasWidth = this.canvas.width;
		const canvasHeight = this.canvas.height;

		// Clear canvas
		this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

		// Add new snowflakes at a consistent rate when running
		// Use time-based spawning instead of frame-based probability
		if (this.isRunning) {
			// Spawn 2-3 snowflakes per second consistently
			const spawnRate = 25; // snowflakes per second
			const spawnChance = spawnRate * deltaTime;
			const numToSpawn = Math.floor(spawnChance) + (Math.random() < spawnChance % 1 ? 1 : 0);

			for (let i = 0; i < numToSpawn; i++) {
				this.addNewSnowflake();
			}
		}

		// Update and draw all snowflakes
		for (let i = this.snowflakes.length - 1; i >= 0; i--) {
			const snowflake = this.snowflakes[i];
			snowflake.update(canvasWidth, canvasHeight, deltaTime, this.isRunning);

			// Remove snowflakes that have fallen off screen or fully dissipated
			if (snowflake.y > canvasHeight + 20 || (!this.isRunning && snowflake.opacity <= 0)) {
				this.snowflakes.splice(i, 1);
			} else {
				snowflake.draw(this.ctx);
			}
		}

		// Stop animation completely when not running and no snowflakes remain
		if (!this.isRunning && this.snowflakes.length === 0) {
			if (this.animationId) {
				cancelAnimationFrame(this.animationId);
				this.animationId = null;
			}
			return;
		}

		this.animationId = requestAnimationFrame(this.animate);
	}

	private handleResize(): void {
		if (!this.canvas || !this.ctx) return;

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
	}
}

class Snowflake {
	public x: number;
	public y: number;
	public radius: number;
	public speed: number; // pixels per second
	public wind: number; // pixels per second
	public opacity: number;
	private swayAmount: number; // pixels
	private swaySpeed: number; // radians per second
	private time: number;
	private dissipationRate: number; // opacity loss per second when stopping

	constructor(canvasWidth: number, canvasHeight: number) {
		this.x = Math.random() * canvasWidth;
		this.y = Math.random() * canvasHeight - canvasHeight;
		this.radius = Math.random() * 3 + 1;
		// Speed in pixels per second (assuming 60fps as baseline)
		this.speed = (Math.random() * 1 + 0.5) * 60;
		// Wind in pixels per second (assuming 60fps as baseline)
		this.wind = (Math.random() * 0.5 - 0.25) * 60;
		this.opacity = Math.random() * 0.5 + 0.5;
		this.swayAmount = Math.random() * 0.5 + 0.2;
		// Sway speed in radians per second (assuming 60fps as baseline)
		this.swaySpeed = (Math.random() * 0.02 + 0.01) * 60;
		this.time = Math.random() * Math.PI * 2;
		// Dissipation rate: lose this much opacity per second when stopping
		this.dissipationRate = 0.75 + Math.random() * 0.5; // 0.3 to 0.7 opacity per second
	}

	public update(
		canvasWidth: number,
		canvasHeight: number,
		deltaTime: number,
		isRunning: boolean
	): void {
		// Ensure deltaTime is reasonable to prevent large jumps
		const safeDeltaTime = Math.min(deltaTime, 0.1); // Cap at 100ms to prevent huge jumps

		// Update position based on delta time
		this.y += this.speed * safeDeltaTime;
		this.x += this.wind * safeDeltaTime;

		// Add swaying motion using sine wave
		this.time += this.swaySpeed * safeDeltaTime;
		this.x += Math.sin(this.time) * this.swayAmount;

		// Handle dissipation when stopping
		if (!isRunning) {
			this.opacity -= this.dissipationRate * safeDeltaTime;
			// Ensure opacity doesn't go below 0
			this.opacity = Math.max(0, this.opacity);
		}

		// Reset snowflake if it goes off screen (only when running)
		if (this.y > canvasHeight + 10 && isRunning) {
			this.y = -10;
			this.x = Math.random() * canvasWidth;
		}

		// Keep snowflakes within horizontal bounds with wrapping
		if (this.x > canvasWidth + 10) {
			this.x = -10;
		} else if (this.x < -10) {
			this.x = canvasWidth + 10;
		}
	}

	public draw(ctx: CanvasRenderingContext2D): void {
		ctx.save();
		ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
}
