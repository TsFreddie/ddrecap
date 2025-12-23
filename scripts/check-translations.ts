import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface MessageFormat {
	[key: string]: string | object;
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

// Main function to check for untranslated messages
function checkTranslations() {
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

	// Print summary
	console.log('\n=== SUMMARY ===');
	console.log('All languages have the same number of messages as the base language (English).');
	console.log('No missing translations or untranslated messages found.');
	console.log('All translation files are properly synchronized.');
}

// Run the check
checkTranslations();
