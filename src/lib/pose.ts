import type { TeePose } from './components/TeeRender.svelte';

// Simple string to integer hash function (FNV-1a algorithm)
export const stringHash = (str: string): number => {
	let hash = 0x811c9dc5; // FNV offset basis
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193); // FNV prime
	}
	return hash >>> 0; // Convert to unsigned 32-bit integer
};

// Simple seeded PRNG (mulberry32)
export const createRng = (seed: number) => {
	let t = seed + 0x6d2b79f5;
	return () => {
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

// Reference poses for horizontal interpolation (left/right)
const tee0 = {
	bodyRotation: 15,
	eyesRotation: -8,
	frontFootRotation: 25,
	backFootRotation: 50,
	eyesPosition: [-4, 0],
	frontFootPosition: [-17, 8],
	backFootPosition: [-7, -4]
};

const tee180 = {
	bodyRotation: -17,
	eyesRotation: 3,
	frontFootRotation: -35,
	backFootRotation: -62,
	eyesPosition: [-56, -2],
	frontFootPosition: [0, -11],
	backFootPosition: [13, 12]
};

const tee240 = {
	bodyRotation: -5,
	eyesRotation: 5,
	frontFootRotation: -120,
	backFootRotation: -150,
	eyesPosition: [-50, 35],
	frontFootPosition: [15, -50],
	backFootPosition: [30, -80]
};

const tee270 = {
	bodyRotation: -5,
	eyesRotation: 0,
	frontFootRotation: 170,
	backFootRotation: 165,
	eyesPosition: [-10, 35],
	frontFootPosition: [0, -80],
	backFootPosition: [10, -90]
};

const tee300 = {
	bodyRotation: -5,
	eyesRotation: -6.5,
	frontFootRotation: 140,
	backFootRotation: 125,
	eyesPosition: [-10, 35],
	frontFootPosition: [-30, -75],
	backFootPosition: [5, -80]
};

const tee90 = {
	bodyRotation: -5,
	eyesRotation: 0,
	frontFootRotation: -25,
	backFootRotation: -25,
	eyesPosition: [-30, -15],
	frontFootPosition: [-2.5, 8],
	backFootPosition: [12.5, 10]
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Lerp angle using shortest path
const lerpAngle = (a: number, b: number, t: number): number => {
	let diff = b - a;
	// Normalize to -180 to 180
	while (diff > 180) diff -= 360;
	while (diff < -180) diff += 360;
	return a + diff * t;
};

// Foot base positions from CSS: front (11%, 47%), back (-12%, 47%)
const FRONT_FOOT_ORIGIN = [11, 47];
const BACK_FOOT_ORIGIN = [-12, 47];
const BODY_CENTER = [0, 50]; // Approximate body center

// Spherical lerp for foot positions - arcs outward to avoid passing through body
const slerpPos = (
	a: [number, number],
	b: [number, number],
	t: number,
	footOrigin: number[],
	outwardBias: number = 0
): [number, number] => {
	// Linear interpolation
	const linearX = lerp(a[0], b[0], t);
	const linearY = lerp(a[1], b[1], t);

	// Calculate perpendicular offset for arc (peaks at t=0.5)
	const arcFactor = Math.sin(t * Math.PI) * outwardBias;

	// Direction from body center to foot origin (outward direction)
	const outX = footOrigin[0] - BODY_CENTER[0];
	const outY = footOrigin[1] - BODY_CENTER[1];
	const len = Math.sqrt(outX * outX + outY * outY) || 1;

	// Normalized outward vector (negated to curve inward away from body)
	const normX = -outX / len;
	const normY = -outY / len;

	return [linearX + normX * arcFactor, linearY + normY * arcFactor];
};

const lerpPose = (a: typeof tee0, b: typeof tee0, t: number): typeof tee0 => ({
	bodyRotation: lerpAngle(a.bodyRotation, b.bodyRotation, t),
	eyesRotation: lerpAngle(a.eyesRotation, b.eyesRotation, t),
	frontFootRotation: lerpAngle(a.frontFootRotation, b.frontFootRotation, t),
	backFootRotation: lerpAngle(a.backFootRotation, b.backFootRotation, t),
	eyesPosition: [
		lerp(a.eyesPosition[0], b.eyesPosition[0], t),
		lerp(a.eyesPosition[1], b.eyesPosition[1], t)
	],
	frontFootPosition: slerpPos(
		a.frontFootPosition as [number, number],
		b.frontFootPosition as [number, number],
		t,
		FRONT_FOOT_ORIGIN
	),
	backFootPosition: slerpPos(
		a.backFootPosition as [number, number],
		b.backFootPosition as [number, number],
		t,
		BACK_FOOT_ORIGIN
	)
});

export const genPose = (angle: number, seed: number): TeePose => {
	// Create seeded RNG from seed value
	const seedInt = Math.floor(seed * 0x7fffffff);
	const rng = createRng(seedInt);

	// Generate random values for variance
	const frontFootRotVar = (rng() - 0.5) * 40;
	const backFootRotVar = (rng() - 0.5) * 40;
	const frontFootPosXVar = (rng() - 0.5) * 10;
	const frontFootPosYVar = (rng() - 0.5) * 10;
	const backFootPosXVar = (rng() - 0.5) * 10;
	const backFootPosYVar = (rng() - 0.5) * 10;
	const eyesRotVar = (rng() - 0.5) * 20;
	const eyesPosXVar = (rng() - 0.5) * 4;
	const eyesPosYVar = (rng() - 0.5) * 4;

	// Normalize angle to 0-360
	const normAngle = ((angle % 360) + 360) % 360;

	// Determine which quadrant and interpolate between adjacent poses
	// 0° = right, 90° = up, 180° = left, 270° = down
	let finalPose: typeof tee0;

	if (normAngle < 90) {
		finalPose = lerpPose(tee0, tee90, normAngle / 90);
	} else if (normAngle < 180) {
		finalPose = lerpPose(tee90, tee180, (normAngle - 90) / 90);
	} else if (normAngle < 240) {
		finalPose = lerpPose(tee180, tee240, (normAngle - 180) / 60);
	} else if (normAngle < 270) {
		finalPose = lerpPose(tee240, tee270, (normAngle - 240) / 30);
	} else if (normAngle < 300) {
		finalPose = lerpPose(tee270, tee300, (normAngle - 270) / 30);
	} else {
		finalPose = lerpPose(tee300, tee0, (normAngle - 300) / 60);
	}

	return {
		bodyRotation: finalPose.bodyRotation,
		eyesRotation: finalPose.eyesRotation + eyesRotVar,
		frontFootRotation: finalPose.frontFootRotation + frontFootRotVar,
		backFootRotation: finalPose.backFootRotation + backFootRotVar,
		eyesPosition: `${finalPose.eyesPosition[0] + eyesPosXVar}%, ${finalPose.eyesPosition[1] + eyesPosYVar}%`,
		frontFootPosition: `${finalPose.frontFootPosition[0] + frontFootPosXVar}%, ${finalPose.frontFootPosition[1] + frontFootPosYVar}%`,
		backFootPosition: `${finalPose.backFootPosition[0] + backFootPosXVar}%, ${finalPose.backFootPosition[1] + backFootPosYVar}%`
	};
};
