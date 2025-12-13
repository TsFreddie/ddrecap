import { getPlayerDatabase } from '$lib/server/db';
import { pack } from 'msgpackr';

export const GET = async ({ params }) => {
	const name = params.name;
	const data = getPlayerDatabase(name);
	const packed = pack(data) as Uint8Array<ArrayBuffer>;
	return new Response(packed, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'public, max-age=1209600' // two weeks
		}
	});
};
