import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

interface MessageFormat {
	[key: string]: string | object;
}

interface MatcherEntry {
	declarations: string[];
	match: Record<string, string>;
	selectors: string[];
}

// Function to load and parse a JSON file
function loadJsonFile(filePath: string): MessageFormat {
	try {
		const content = readFileSync(filePath, 'utf8');
		return JSON.parse(content);
	} catch (error) {
		console.error(`Error loading ${filePath}:`, error);
		return {};
	}
}

// Function to get all top-level message keys (ignoring nested structure of message formats)
function getMessageKeys(obj: MessageFormat): string[] {
	let keys: string[] = [];

	for (const key in obj) {
		if (key === '$schema') continue; // Skip the schema property

		// Only add top-level keys, not nested properties of message formats
		keys.push(key);
	}

	return keys;
}

// Function to check if a message is properly translated (not empty or placeholder)
function isMessageTranslated(key: string, value: any): boolean {
	if (value === null || value === undefined) return false;

	// Format keys are intentionally empty in English, so they're not considered untranslated
	if (key.startsWith('format_')) return true;

	if (typeof value === 'string') {
		// Check if it's not empty and not a placeholder
		return value.trim() !== '' && !value.includes('TODO') && !value.includes('FIXME');
	}

	if (Array.isArray(value)) {
		// For message format arrays, check if they have meaningful content
		return value.length > 0;
	}

	if (typeof value === 'object') {
		// For objects, check if they have meaningful content
		return Object.keys(value).length > 0;
	}

	return true;
}

// Function to check if a matcher format has identical results across all match cases
function hasIdenticalMatcherResults(matcher: MatcherEntry): boolean {
	const matchValues = Object.values(matcher.match);
	if (matchValues.length === 0) return false;

	const firstValue = matchValues[0];
	return matchValues.every((value) => value === firstValue);
}

// Function to find matcher formats with identical results
function findIdenticalMatcherFormats(
	messages: MessageFormat
): Array<{ key: string; matcher: MatcherEntry }> {
	const identicalMatchers: Array<{ key: string; matcher: MatcherEntry }> = [];

	for (const key in messages) {
		if (key === '$schema') continue;

		const value = messages[key];

		// Check if this is a matcher format (array with match object)
		if (Array.isArray(value) && value.length > 0) {
			const firstItem = value[0];
			if (typeof firstItem === 'object' && firstItem !== null && 'match' in firstItem) {
				const matcher = firstItem as MatcherEntry;
				if (hasIdenticalMatcherResults(matcher)) {
					identicalMatchers.push({ key, matcher });
				}
			}
		}
	}

	return identicalMatchers;
}

// Function to optimize messages by replacing identical matcher formats with single strings
function optimizeMessages(
	messages: MessageFormat,
	identicalMatchers: Array<{ key: string; matcher: MatcherEntry }>
): MessageFormat {
	const optimized = { ...messages };

	for (const { key, matcher } of identicalMatchers) {
		// Replace the matcher format with the single string value
		optimized[key] = Object.values(matcher.match)[0] as string;
	}

	return optimized;
}

// Function to write optimized messages back to JSON file
function writeOptimizedMessages(filePath: string, messages: MessageFormat): void {
	try {
		const content = JSON.stringify(messages, null, '\t');
		writeFileSync(filePath, content, 'utf8');
		console.log(`✓ Optimized ${filePath}`);
	} catch (error) {
		console.error(`Error writing ${filePath}:`, error);
	}
}

// Main function to check for untranslated messages
function checkTranslations(writeChanges: boolean = false) {
	const messagesDir = './messages';
	const baseLanguage = 'en';

	// Load the base language file (English)
	const baseFilePath = join(messagesDir, `${baseLanguage}.json`);
	const baseMessages = loadJsonFile(baseFilePath);
	const baseKeys = getMessageKeys(baseMessages);

	console.log(`Base language (${baseLanguage}) has ${baseKeys.length} messages\n`);

	// Get all language files
	const languageFiles = readdirSync(messagesDir).filter(
		(file) => file.endsWith('.json') && file !== `${baseLanguage}.json`
	);

	// Check each language file
	for (const file of languageFiles) {
		const langCode = file.replace('.json', '');
		const filePath = join(messagesDir, file);
		const messages = loadJsonFile(filePath);
		const keys = getMessageKeys(messages);

		// Find missing keys
		const missingKeys = baseKeys.filter((key) => !keys.includes(key));

		// Find extra keys (keys that don't exist in base language)
		const extraKeys = keys.filter((key) => !baseKeys.includes(key));

		// Find untranslated or empty messages
		const untranslatedKeys: string[] = [];
		for (const key of keys) {
			if (baseKeys.includes(key)) {
				const value = messages[key];
				if (!isMessageTranslated(key, value)) {
					untranslatedKeys.push(key);
				}
			}
		}

		console.log(`Language: ${langCode}`);
		console.log(`  Total messages: ${keys.length}`);
		console.log(`  Missing translations: ${missingKeys.length}`);
		console.log(`  Untranslated/empty messages: ${untranslatedKeys.length}`);
		console.log(`  Extra keys: ${extraKeys.length}`);

		if (missingKeys.length > 0) {
			console.log(`  Missing keys:`);
			missingKeys.forEach((key) => {
				console.log(`    - ${key}`);
			});
		}

		if (untranslatedKeys.length > 0) {
			console.log(`  Untranslated/empty messages:`);
			untranslatedKeys.forEach((key) => {
				console.log(`    - ${key}`);
			});
		}

		if (extraKeys.length > 0) {
			console.log(`  Extra keys (not in base language):`);
			extraKeys.forEach((key) => {
				console.log(`    - ${key}`);
			});
		}

		console.log('');
	}

	// Check for matcher formats with identical results
	console.log('\n=== MATCHER FORMATS WITH IDENTICAL RESULTS ===\n');

	let totalIdenticalMatchers = 0;
	const allIdenticalMatchers: Record<string, Array<{ key: string; matcher: MatcherEntry }>> = {};

	// Check base language (English)
	const baseIdenticalMatchers = findIdenticalMatcherFormats(baseMessages);
	if (baseIdenticalMatchers.length > 0) {
		console.log(`Base language (${baseLanguage}):`);
		baseIdenticalMatchers.forEach(({ key, matcher }) => {
			const matchValues = Object.entries(matcher.match);
			console.log(`  - ${key}`);
			matchValues.forEach(([matchKey, value]) => {
				console.log(`    ${matchKey}: "${value}"`);
			});
			console.log(`    → Can be optimized to: "${Object.values(matcher.match)[0]}"`);
			totalIdenticalMatchers++;
		});
		console.log('');
	}

	// Check all other languages and collect identical matchers
	for (const file of languageFiles) {
		const langCode = file.replace('.json', '');
		const filePath = join(messagesDir, file);
		const messages = loadJsonFile(filePath);
		const identicalMatchers = findIdenticalMatcherFormats(messages);

		if (identicalMatchers.length > 0) {
			console.log(`Language: ${langCode}`);
			identicalMatchers.forEach(({ key, matcher }) => {
				const matchValues = Object.entries(matcher.match);
				console.log(`  - ${key}`);
				matchValues.forEach(([matchKey, value]) => {
					console.log(`    ${matchKey}: "${value}"`);
				});
				console.log(`    → Can be optimized to: "${Object.values(matcher.match)[0]}"`);
				totalIdenticalMatchers++;
			});
			console.log('');

			// Store identical matchers for potential write operation
			allIdenticalMatchers[langCode] = identicalMatchers;
		}
	}

	// Print summary
	console.log('\n=== SUMMARY ===');
	if (totalIdenticalMatchers === 0) {
		console.log('All languages have the same number of messages as the base language (English).');
		console.log('No missing translations or untranslated messages found.');
		console.log('All translation files are properly synchronized.');
		console.log('No matcher formats with identical results found.');
	} else {
		console.log(
			`Found ${totalIdenticalMatchers} matcher format(s) with identical results across all languages.`
		);
		console.log('These can be optimized by replacing the matcher format with a single string.');

		if (writeChanges) {
			console.log('\n=== OPTIMIZING FILES ===\n');

			// Optimize base language if needed
			if (baseIdenticalMatchers.length > 0) {
				const optimizedBaseMessages = optimizeMessages(baseMessages, baseIdenticalMatchers);
				writeOptimizedMessages(baseFilePath, optimizedBaseMessages);
			}

			// Optimize other languages
			for (const file of languageFiles) {
				const langCode = file.replace('.json', '');
				const filePath = join(messagesDir, file);

				if (allIdenticalMatchers[langCode] && allIdenticalMatchers[langCode].length > 0) {
					const messages = loadJsonFile(filePath);
					const optimizedMessages = optimizeMessages(messages, allIdenticalMatchers[langCode]);
					writeOptimizedMessages(filePath, optimizedMessages);
				}
			}

			console.log(
				`\n✓ Successfully optimized ${totalIdenticalMatchers} matcher format(s) across all language files.`
			);
		} else {
			console.log('\nRun with --write flag to automatically optimize these files.');
		}
	}
}

// Check for --write flag
const writeChanges = process.argv.includes('--write');

// Run the check
checkTranslations(writeChanges);
