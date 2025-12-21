import { getPlayerDatabase } from '$lib/server/db';
import { pack } from 'msgpackr';

export const GET = async ({ request, params }) => {
	const name = params.name;
	const data = getPlayerDatabase(name);
	const packed = pack(data) as Uint8Array<ArrayBuffer>;

	// compress with gzip if supported by browser
	const encoding = request.headers.get('Accept-Encoding') || '';
	const isGzipSupported = encoding.includes('gzip') ?? false;
	if (isGzipSupported) {
		const compressionStream = new CompressionStream('gzip');
		const writer = compressionStream.writable.getWriter();
		writer.write(packed);
		writer.close();
		return new Response(compressionStream.readable, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Encoding': 'gzip',
				'Cache-Control': 'public, max-age=1209600' // two weeks
			}
		});
	}

	return new Response(packed, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'public, max-age=1209600' // two weeks
		}
	});
};
