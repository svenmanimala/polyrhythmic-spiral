const paper = document.getElementById('paper'),
	pen = paper.getContext('2d');

const get = (selector) => document.querySelector(selector);

const toggles = {
	sound: get('#sound-toggle'),
};

const colors = Array(21).fill('#A6C48A');

const settings = {
	startTime: new Date().getTime(),
	duration: 900,
	maxCycles: Math.max(colors.length, 100),
	soundEnabled: false,
	pulseEnabled: true,
};

// Single global audio context
let audioCtx = null;

const initAudio = () => {
	if (!audioCtx) {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		audioCtx = new AudioContext();
	}
	if (audioCtx.state === 'suspended') {
		audioCtx.resume();
	}
};

const handleSoundToggle = (enabled = !settings.soundEnabled) => {
	settings.soundEnabled = enabled;
	if (toggles.sound) {
		toggles.sound.dataset.toggled = enabled;
	}
	if (enabled) {
		initAudio();
	}
};

document.onvisibilitychange = () => handleSoundToggle(false);
paper.onclick = () => handleSoundToggle();

// Pentatonic scale calculation
const getNoteFrequency = (index) => {
	const pentatonicSteps = [0, 2, 4, 7, 9];
	const octave = Math.floor(index / pentatonicSteps.length);
	const note = pentatonicSteps[index % pentatonicSteps.length];
	const semitones = octave * 12 + note;
	return 220 * Math.pow(2, semitones / 12);
};

const playKey = (index) => {
	if (!settings.soundEnabled || !audioCtx) return;

	try {
		const freq = getNoteFrequency(index);
		if (!Number.isFinite(freq) || freq <= 0) return;

		const osc = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		const now = audioCtx.currentTime;

		osc.type = 'sine';
		osc.frequency.setValueAtTime(freq, now);

		// Short bell envelope
		gain.gain.setValueAtTime(0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

		osc.connect(gain);
		gain.connect(audioCtx.destination);

		osc.start(now);
		osc.stop(now + 0.8);
	} catch (e) {
		// Prevent render loop crash
	}
};

let arcs = [];

const calculateVelocity = (index) => {
	const numberOfCycles = settings.maxCycles - index,
		distancePerCycle = 2 * Math.PI;

	return (numberOfCycles * distancePerCycle) / settings.duration;
};

const calculateNextImpactTime = (currentImpactTime, velocity) => {
	return currentImpactTime + (Math.PI / velocity) * 1000;
};

const calculateDynamicOpacity = (
	currentTime,
	lastImpactTime,
	baseOpacity,
	maxOpacity,
	duration,
) => {
	const timeSinceImpact = currentTime - lastImpactTime,
		percentage = Math.min(timeSinceImpact / duration, 1),
		opacityDelta = maxOpacity - baseOpacity;

	return maxOpacity - opacityDelta * percentage;
};

const determineOpacity = (
	currentTime,
	lastImpactTime,
	maxOpacity,
	baseOpacity,
	duration,
) => {
	if (!settings.pulseEnabled) return baseOpacity;

	return calculateDynamicOpacity(
		currentTime,
		lastImpactTime,
		baseOpacity,
		maxOpacity,
		duration,
	);
};

const calculatePositionOnArc = (center, radius, angle) => ({
	x: center.x + radius * Math.cos(angle),
	y: center.y + radius * Math.sin(angle),
});

const init = () => {
	pen.lineCap = 'round';

	arcs = colors.map((color, index) => {
		const velocity = calculateVelocity(index),
			lastImpactTime = 0,
			nextImpactTime = calculateNextImpactTime(settings.startTime, velocity);

		return {
			color,
			velocity,
			lastImpactTime,
			nextImpactTime,
		};
	});
};

const drawArc = (x, y, radius, start, end, action = 'stroke') => {
	pen.beginPath();
	pen.arc(x, y, radius, start, end);
	if (action === 'stroke') pen.stroke();
	else pen.fill();
};

const drawPointOnArc = (center, arcRadius, pointRadius, angle) => {
	const position = calculatePositionOnArc(center, arcRadius, angle);
	drawArc(position.x, position.y, pointRadius, 0, 2 * Math.PI, 'fill');
};

const draw = () => {
	paper.width = paper.clientWidth;
	paper.height = paper.clientHeight;

	const currentTime = new Date().getTime(),
		elapsedTime = (currentTime - settings.startTime) / 1000;

	const length = Math.min(paper.width, paper.height) * 0.9,
		offset = (paper.width - length) / 2;

	const start = {
		x: offset,
		y: paper.height / 2,
	};

	const end = {
		x: paper.width - offset,
		y: paper.height / 2,
	};

	const center = {
		x: paper.width / 2,
		y: paper.height / 2,
	};

	const base = {
		length: end.x - start.x,
		minAngle: 0,
		startAngle: 0,
		maxAngle: 2 * Math.PI,
	};

	base.initialRadius = base.length * 0.05;
	base.circleRadius = base.length * 0.006;
	base.clearance = base.length * 0.03;
	base.spacing =
		(base.length - base.initialRadius - base.clearance) / 2 / colors.length;

	arcs.forEach((arc, index) => {
		const radius = base.initialRadius + base.spacing * index;

		// Draw arcs
		pen.globalAlpha = determineOpacity(
			currentTime,
			arc.lastImpactTime,
			0.15,
			0.65,
			1000,
		);
		pen.lineWidth = base.length * 0.002;
		pen.strokeStyle = arc.color;

		const arcOffset = (base.circleRadius * (5 / 3)) / radius;
		drawArc(
			center.x,
			center.y,
			radius,
			Math.PI + arcOffset,
			2 * Math.PI - arcOffset,
		);
		drawArc(center.x, center.y, radius, arcOffset, Math.PI - arcOffset);

		// Draw impact points
		pen.globalAlpha = determineOpacity(
			currentTime,
			arc.lastImpactTime,
			0.15,
			0.85,
			1000,
		);
		pen.fillStyle = arc.color;
		drawPointOnArc(center, radius, base.circleRadius * 0.75, Math.PI);
		drawPointOnArc(center, radius, base.circleRadius * 0.75, 2 * Math.PI);

		// Draw moving circles
		pen.globalAlpha = 1;
		pen.fillStyle = arc.color;

		if (currentTime >= arc.nextImpactTime) {
			if (settings.soundEnabled) {
				playKey(index);
				arc.lastImpactTime = arc.nextImpactTime;
			}

			arc.nextImpactTime = calculateNextImpactTime(
				arc.nextImpactTime,
				arc.velocity,
			);
		}

		const distance = elapsedTime >= 0 ? elapsedTime * arc.velocity : 0,
			angle = (Math.PI + distance) % base.maxAngle;

		drawPointOnArc(center, radius, base.circleRadius, angle);
	});

	requestAnimationFrame(draw);
};

init();
draw();
