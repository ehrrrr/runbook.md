// debug unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
	// eslint-disable-next-line no-console
	console.log({ event: 'UNHANDLED_REJECTION', promise, reason });
});
