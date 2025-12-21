import Chart, { type ChartConfiguration, type LabelItem, type Plugin } from 'chart.js/auto';
import type { Action } from 'svelte/action';

Chart.defaults.font.size = 22;
Chart.defaults.font.family =
	'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji';
Chart.defaults.animation = {
	duration: 1000,
	easing: 'easeInOutQuart',
	delay: 700,
}

const chartAreaBackground: Plugin = {
	id: 'chartAreaBackground',
	beforeDraw: (chart, args) => {
		const { ctx, chartArea } = chart;
		ctx.save();
		ctx.fillStyle = '#0000001d';
		ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
		ctx.restore();
	}
};

const renderLabel = (ctx: CanvasRenderingContext2D, label: LabelItem) => {
	if (typeof label.label !== 'string' && typeof label.label !== 'number') return;
	if (!label.label) return;

	// setup text
	if (label.options.textAlign) ctx.textAlign = label.options.textAlign;
	if (label.options.textBaseline) ctx.textBaseline = label.options.textBaseline;
	if (label.font) ctx.font = label.font.string;

	// setup position
	let x = label.options.translation![0];
	let y = label.options.translation![1];
	y += label.textOffset;

	ctx.fillStyle = '#3f3f46E6';
	ctx.fillStyle = 'oklch(0.37 0.00354074 -0.0125085 / 0.9)';
	ctx.strokeStyle = '#71717b';
	ctx.strokeStyle = 'oklch(55.2% 0.016 285.938)';
	ctx.lineWidth = 1;
	const measure = ctx.measureText(label.label);
	const measureHeight = ctx.measureText('0');
	const paddingX = 10;
	const paddingY = 4;

	// Calculate rectangle position based on text alignment and baseline
	let rectX = x;
	let rectY = y;
	const rectWidth = measure.width + paddingX * 2;
	const textHeight = measureHeight.actualBoundingBoxAscent + measureHeight.actualBoundingBoxDescent;
	const rectHeight = textHeight + paddingY * 2;
	const cornerRadius = rectHeight / 2;

	// Adjust X position based on textAlign
	if (label.options.textAlign === 'center') {
		rectX = x - measure.width / 2 - paddingX;
	} else if (label.options.textAlign === 'right') {
		rectX = x - measure.width - paddingX;
	} else {
		// 'left' or default
		rectX = x - paddingX;
	}

	// Y position: center the box around the ascent (ignore descent for balanced look)
	rectY = y - measureHeight.actualBoundingBoxAscent - paddingY;

	// Draw rounded rectangle
	ctx.beginPath();
	ctx.moveTo(rectX + cornerRadius, rectY);
	ctx.arcTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight, cornerRadius);
	ctx.arcTo(rectX + rectWidth, rectY + rectHeight, rectX, rectY + rectHeight, cornerRadius);
	ctx.arcTo(rectX, rectY + rectHeight, rectX, rectY, cornerRadius);
	ctx.arcTo(rectX, rectY, rectX + rectWidth, rectY, cornerRadius);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();

	ctx.lineWidth = 0;
	ctx.fillStyle = '#d4d4d8';
	ctx.fillStyle = 'oklch(87.1% 0.006 286.286)';

	ctx.fillText(label.label, x, y);
};

const plugin: Plugin = {
	id: 'custom_ticks',
	beforeDraw(chart) {
		const { ctx, scales } = chart;
		ctx.save();

		for (const scale of Object.values(scales)) {
			const labels = scale.getLabelItems();
			for (const label of labels) {
				renderLabel(ctx, label);
			}

			// Handle radar chart point labels
			if (scale.type === 'radialLinear' && '_pointLabelItems' in scale && '_pointLabels' in scale) {
				const pointLabelItems = (scale as any)._pointLabelItems as {
					visible: boolean;
					x: number;
					bottom: number;
					textAlign: CanvasTextAlign;
				}[];
				const pointLabels = (scale as any)._pointLabels as string[];
				for (let i = 0; i < pointLabels.length; i++) {
					const text = pointLabels[i];
					const item = pointLabelItems[i];
					if (!text || !item || !item.visible) continue;

					const labelItem: LabelItem = {
						label: text,
						font: {
							family: Chart.defaults.font.family!,
							size: Chart.defaults.font.size!,
							weight: 'normal',
							string: `${Chart.defaults.font.size}px ${Chart.defaults.font.family}`,
							style: 'normal',
							lineHeight: 1.2
						},
						textOffset: 0,
						options: {
							translation: [item.x, item.bottom],
							textAlign: item.textAlign,
							textBaseline: 'alphabetic'
						}
					};
					renderLabel(ctx, labelItem);
				}
			}
		}

		ctx.restore();
	},
	beforeDatasetsDraw(chart) {
		// Hide original point labels for radar charts
		const { scales } = chart;
		for (const scale of Object.values(scales)) {
			if (scale.type === 'radialLinear' && scale.options) {
				(scale.options as any).pointLabels.color = 'transparent';
			}
		}
	}
};

const createChart = (node: HTMLCanvasElement, config: ChartConfiguration, locale: string) => {
	const copied = $state.snapshot(config);
	copied.options ??= {};
	copied.options.responsive = false;
	copied.options.locale = locale;
	copied.plugins ??= [];
	copied.plugins.push(plugin);
	if (copied.type === 'line') {
		copied.plugins.push(chartAreaBackground);
	}

	const chart = new Chart(node, copied as ChartConfiguration);
	chart.resize(512, 512);
	return chart;
};

export const chart: Action<
	HTMLCanvasElement,
	{ show?: boolean; config: ChartConfiguration; locale: string }
> = (node, params) => {
	let chart = params.show ? createChart(node, params.config, params.locale) : null;
	console.log(chart);
	return {
		update(params) {
			if (chart) {
				chart.clear();
				chart.destroy();
			}
			chart = params.show ? createChart(node, params.config, params.locale) : null;
		},
		destroy() {
			if (chart) chart.destroy();
		}
	};
};
