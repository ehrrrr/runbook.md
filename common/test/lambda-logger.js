// stub out the lambda logger in tests
const handler = {
	get: (target, method, receiver) => {
		if (method === 'child') {
			return () => new Proxy(console, handler);
		}
		if (['log', 'debug', 'info', 'warn', 'error'].includes(method)) {
			return Reflect.get(target, method, receiver);
		}
	},
};

module.exports = new Proxy(console, handler);
