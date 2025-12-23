// WebGL shader sources
const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec3 a_particleData; // x: type, y: size, z: phase
attribute vec4 a_color; // rgba
attribute vec2 a_velocity; // movement vector
attribute float a_life; // life/opacity
attribute float a_initialLife; // initial life value for calculations

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_deltaTime;
uniform float u_isRunning; // 0.0 or 1.0

varying vec4 v_color;
varying float v_life;
varying float v_particleType;
varying float v_phase;

void main() {
    vec2 position = a_position;
    float particleType = a_particleData.x;
    float size = a_particleData.y;
    float phase = a_particleData.z;
    float currentLife = a_life;
    
    // Snowflake: falling with sway
    float deltaTime = u_deltaTime;
    position.y += a_velocity.y * deltaTime * 60.0; // Fall speed
    position.x += a_velocity.x * deltaTime * 60.0; // Wind
    position.x += sin(u_time * 2.0 + phase) * 20.0 * deltaTime; // Sway
    
    // Handle dissipation when stopping
    if (u_isRunning < 0.5) {
        float modifiedSize = a_particleData.y * max(0.0, currentLife - 0.75 * deltaTime);
        gl_PointSize = modifiedSize;
    } else {
        gl_PointSize = size;
    }
    
    // Convert to clip space
    vec2 clipSpace = ((position / u_resolution) * 2.0 - 1.0) * vec2(1, -1);
    gl_Position = vec4(clipSpace, 0, 1);
    
    v_color = a_color;
    v_life = currentLife;
    v_particleType = particleType;
    v_phase = phase;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec4 v_color;
varying float v_life;
varying float v_particleType;
varying float v_phase; // Add phase varying for rotation

void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distance = length(coord);
    
    if (distance > 0.5) {
        discard;
    }
    
    // Apply random rotation using particle phase
    float rotation = v_phase * 6.28318; // Convert phase to radians (0 to 2π)
    float cosR = cos(rotation);
    float sinR = sin(rotation);
    vec2 rotatedCoord = vec2(
        coord.x * cosR - coord.y * sinR,
        coord.x * sinR + coord.y * cosR
    );
    
    // Create simple snowflake patterns based on particle phase
    float pattern = fract(v_color.a * 4.0); // Use alpha to determine pattern type (4 patterns now)
    float alpha = 0.0;
    
    if (pattern < 0.25) {
        // Simple 5-pointed star - much thicker arms
        float angle = atan(rotatedCoord.y, rotatedCoord.x);
        float segment = mod(angle + 3.14159, 3.14159 * 2.0 / 5.0);
        
        // Main arms - much wider for visibility
        float arm = 1.0 - smoothstep(0.0, 0.35, abs(segment - 3.14159 / 5.0));
        
        // Center - larger
        float center = 1.0 - smoothstep(0.0, 0.4, distance * 2.0);
        
        alpha = max(center, arm);
    } else if (pattern < 0.5) {
        // Simple 6-pointed star - much thicker arms
        float angle = atan(rotatedCoord.y, rotatedCoord.x);
        float segment = mod(angle + 3.14159, 3.14159 / 3.0);
        
        // Main arms - much wider for visibility
        float arm = 1.0 - smoothstep(0.0, 0.35, abs(segment - 3.14159 / 6.0));
        
        // Center - larger
        float center = 1.0 - smoothstep(0.0, 0.4, distance * 2.0);
        
        alpha = max(center, arm);
    } else if (pattern < 0.75) {
        // Simple 7-pointed star - much thicker arms
        float angle = atan(rotatedCoord.y, rotatedCoord.x);
        float segment = mod(angle + 3.14159, 3.14159 * 2.0 / 7.0);
        
        // Main arms - much wider for visibility
        float arm = 1.0 - smoothstep(0.0, 0.35, abs(segment - 3.14159 / 7.0));
        
        // Center - larger
        float center = 1.0 - smoothstep(0.0, 0.4, distance * 2.0);
        
        alpha = max(center, arm);
    } else {
        // Ring pattern - much bigger ring
        float ring = 1.0 - smoothstep(0.05, 0.35, distance); // Much bigger ring
        ring *= smoothstep(0.01, 0.05, distance);
        
        // Center - larger
        float center = 1.0 - smoothstep(0.0, 0.2, distance * 2.0);
        
        alpha = max(center, ring);
    }
    
    // Apply smooth edge falloff
    alpha *= (1.0 - smoothstep(0.4, 0.5, distance));
    alpha *= v_life;
    
    // Snowflake: soft white with slight blue tint
    vec3 snowColor = vec3(0.95, 0.98, 1.0);
    gl_FragColor = vec4(snowColor, v_color.a * alpha);
}
`;

export interface Particle {
	x: number;
	y: number;
	type: number; // 0: snowflake
	size: number;
	color: [number, number, number, number];
	vx: number;
	vy: number;
	life: number;
	initialLife: number; // Store initial life value for shader calculations
	phase: number; // For animation variation
}

export class SnowWebGL {
	private canvas: HTMLCanvasElement | null = null;
	private gl: WebGLRenderingContext | null = null;
	private program: WebGLProgram | null = null;
	private particles: Particle[] = [];
	private isRunning = false;
	private lastTime = 0;
	private animationId: number | null = null;

	// WebGL resources
	private positionBuffer: WebGLBuffer | null = null;
	private particleDataBuffer: WebGLBuffer | null = null;
	private colorBuffer: WebGLBuffer | null = null;
	private velocityBuffer: WebGLBuffer | null = null;
	private lifeBuffer: WebGLBuffer | null = null;
	private initialLifeBuffer: WebGLBuffer | null = null;

	// Uniform locations
	private resolutionLocation: WebGLUniformLocation | null = null;
	private timeLocation: WebGLUniformLocation | null = null;
	private deltaTimeLocation: WebGLUniformLocation | null = null;
	private isRunningLocation: WebGLUniformLocation | null = null;

	// Attribute locations
	private positionLocation: number | null = null;
	private particleDataLocation: number | null = null;
	private colorLocation: number | null = null;
	private velocityLocation: number | null = null;
	private lifeLocation: number | null = null;
	private initialLifeLocation: number | null = null;

	constructor() {
		this.animate = this.animate.bind(this);
		this.handleResize = this.handleResize.bind(this);
	}

	public init(canvas: HTMLCanvasElement): void {
		this.canvas = canvas;
		this.gl =
			(canvas.getContext('webgl') as WebGLRenderingContext) ||
			(canvas.getContext('experimental-webgl') as WebGLRenderingContext);

		if (!this.gl) {
			console.error('WebGL not supported');
			return;
		}

		this.setupWebGL();
		this.setupCanvas();
	}

	private setupWebGL(): void {
		if (!this.gl) return;

		// Create shaders
		const vertexShader = this.createShader(this.gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
		const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

		if (!vertexShader || !fragmentShader) return;

		// Create program
		this.program = this.gl.createProgram();
		if (!this.program) return;

		this.gl.attachShader(this.program, vertexShader);
		this.gl.attachShader(this.program, fragmentShader);
		this.gl.linkProgram(this.program);

		if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
			console.error(
				'Unable to initialize shader program:',
				this.gl.getProgramInfoLog(this.program)
			);
			return;
		}

		// Get attribute and uniform locations
		this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
		this.particleDataLocation = this.gl.getAttribLocation(this.program, 'a_particleData');
		this.colorLocation = this.gl.getAttribLocation(this.program, 'a_color');
		this.velocityLocation = this.gl.getAttribLocation(this.program, 'a_velocity');
		this.lifeLocation = this.gl.getAttribLocation(this.program, 'a_life');
		this.initialLifeLocation = this.gl.getAttribLocation(this.program, 'a_initialLife');

		this.resolutionLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
		this.timeLocation = this.gl.getUniformLocation(this.program, 'u_time');
		this.deltaTimeLocation = this.gl.getUniformLocation(this.program, 'u_deltaTime');
		this.isRunningLocation = this.gl.getUniformLocation(this.program, 'u_isRunning');

		// Create buffers
		this.positionBuffer = this.gl.createBuffer();
		this.particleDataBuffer = this.gl.createBuffer();
		this.colorBuffer = this.gl.createBuffer();
		this.velocityBuffer = this.gl.createBuffer();
		this.lifeBuffer = this.gl.createBuffer();
		this.initialLifeBuffer = this.gl.createBuffer();

		// Enable blending for transparency
		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
	}

	private createShader(type: number, source: string): WebGLShader | null {
		if (!this.gl) return null;

		const shader = this.gl.createShader(type);
		if (!shader) return null;

		this.gl.shaderSource(shader, source);
		this.gl.compileShader(shader);

		if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
			console.error('Error compiling shader:', this.gl.getShaderInfoLog(shader));
			this.gl.deleteShader(shader);
			return null;
		}

		return shader;
	}

	private setupCanvas(): void {
		if (!this.canvas) return;

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
	}

	public start(): void {
		if (this.isRunning || !this.gl || !this.canvas) return;

		this.isRunning = true;
		window.addEventListener('resize', this.handleResize);

		if (!this.animationId) {
			this.lastTime = 0;
			this.animationId = requestAnimationFrame(this.animate);
		}
	}

	public stop(): void {
		this.isRunning = false;
	}

	public destroy(): void {
		this.isRunning = false;

		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		window.removeEventListener('resize', this.handleResize);

		// Clean up WebGL resources
		if (this.gl && this.program) {
			this.gl.deleteProgram(this.program);
			this.gl.deleteBuffer(this.positionBuffer);
			this.gl.deleteBuffer(this.particleDataBuffer);
			this.gl.deleteBuffer(this.colorBuffer);
			this.gl.deleteBuffer(this.velocityBuffer);
			this.gl.deleteBuffer(this.lifeBuffer);
			this.gl.deleteBuffer(this.initialLifeBuffer);
		}

		this.particles = [];
		this.canvas = null;
		this.gl = null;
		this.program = null;
	}

	private addSnowflake(): void {
		if (!this.canvas) return;

		const canvasWidth = this.canvas.width;
		const canvasHeight = this.canvas.height;

		this.particles.push({
			x: Math.random() * canvasWidth,
			y: -10,
			type: 0, // Snowflake
			size: Math.random() * 8 + 3,
			color: [1, 1, 1, Math.random()],
			vx: (Math.random() - 0.5) * 0.5,
			vy: Math.random() * 1 + 0.5,
			life: 1.0,
			initialLife: 1.0,
			phase: Math.random() * Math.PI * 2
		});

		// Limit particle count
		const maxParticles = Math.floor((canvasWidth * canvasHeight) / 2000);
		if (this.particles.length > maxParticles) {
			this.particles = this.particles.filter((p) => p.y < canvasHeight + 50);
			if (this.particles.length > maxParticles) {
				this.particles = this.particles.slice(0, maxParticles);
			}
		}
	}

	private updateParticles(deltaTime: number): void {
		if (!this.canvas) return;

		const canvasWidth = this.canvas.width;
		const canvasHeight = this.canvas.height;

		// Update existing particles
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const particle = this.particles[i];

			// Snowflake
			particle.y += particle.vy * deltaTime * 60;
			particle.x += particle.vx * deltaTime * 60;

			// Fade out particles when not running
			if (!this.isRunning) {
				particle.life -= 0.8 * deltaTime; // Fade out speed
				if (particle.life <= 0) {
					this.particles.splice(i, 1);
					continue;
				}
			}

			if (particle.y > canvasHeight + 20) {
				if (this.isRunning) {
					particle.y = -10;
					particle.x = Math.random() * canvasWidth;
				} else {
					this.particles.splice(i, 1);
				}
			}
		}

		// Add new particles
		if (this.isRunning) {
			// Add snowflakes
			const spawnRate = 25;
			const spawnChance = spawnRate * deltaTime;
			const numToSpawn = Math.floor(spawnChance) + (Math.random() < spawnChance % 1 ? 1 : 0);

			for (let i = 0; i < numToSpawn; i++) {
				this.addSnowflake();
			}
		}
	}

	private render(deltaTime: number): void {
		if (!this.gl || !this.program || !this.canvas) return;

		// Clear canvas
		this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);

		if (this.particles.length === 0) return;

		// Use shader program
		this.gl.useProgram(this.program);

		// Set uniforms
		this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
		this.gl.uniform1f(this.timeLocation, performance.now() / 1000);
		this.gl.uniform1f(this.deltaTimeLocation, deltaTime);
		this.gl.uniform1f(this.isRunningLocation, this.isRunning ? 1.0 : 0.0);

		// Prepare particle data
		const positions: number[] = [];
		const particleData: number[] = [];
		const colors: number[] = [];
		const velocities: number[] = [];
		const lives: number[] = [];
		const initialLives: number[] = [];

		for (const particle of this.particles) {
			positions.push(particle.x, particle.y);
			particleData.push(particle.type, particle.size, particle.phase);
			colors.push(...particle.color);
			velocities.push(particle.vx, particle.vy);
			lives.push(particle.life);
			initialLives.push(particle.initialLife);
		}

		// Set up attributes
		this.setAttribute(this.positionLocation, this.positionBuffer, positions, 2);
		this.setAttribute(this.particleDataLocation, this.particleDataBuffer, particleData, 3);
		this.setAttribute(this.colorLocation, this.colorBuffer, colors, 4);
		this.setAttribute(this.velocityLocation, this.velocityBuffer, velocities, 2);
		this.setAttribute(this.lifeLocation, this.lifeBuffer, lives, 1);
		this.setAttribute(this.initialLifeLocation, this.initialLifeBuffer, initialLives, 1);

		// Draw particles
		this.gl.drawArrays(this.gl.POINTS, 0, this.particles.length);
	}

	private setAttribute(
		location: number | null,
		buffer: WebGLBuffer | null,
		data: number[],
		size: number
	): void {
		if (!this.gl || !buffer || location === null) return;

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.DYNAMIC_DRAW);
		this.gl.enableVertexAttribArray(location);
		this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, 0, 0);
	}

	private animate(currentTime: number): void {
		if (!this.gl || !this.canvas) return;

		const deltaTime = this.lastTime === 0 ? 0 : (currentTime - this.lastTime) / 1000;
		this.lastTime = currentTime;

		this.updateParticles(deltaTime);
		this.render(deltaTime);

		// Stop animation when not running and no particles remain
		if (!this.isRunning && this.particles.length === 0) {
			if (this.animationId) {
				cancelAnimationFrame(this.animationId);
				this.animationId = null;
			}
			return;
		}

		this.animationId = requestAnimationFrame(this.animate);
	}

	private handleResize(): void {
		if (!this.canvas || !this.gl) return;

		this.canvas.width = window.innerWidth;
		this.canvas.height = window.innerHeight;
		this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
	}
}
