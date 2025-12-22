import { AsyncQueue } from './async-queue';

let queueIndex = 0;
const queuePools = [new AsyncQueue(), new AsyncQueue(), new AsyncQueue(), new AsyncQueue()];

export function queue() {
	const queue = queuePools[queueIndex];
	queueIndex = (queueIndex + 1) % queuePools.length;
	return queue;
}
