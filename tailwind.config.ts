import type { Config } from 'tailwindcss';
import motion from 'tailwindcss-motion';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {}
	},

	plugins: [motion]
} satisfies Config;
