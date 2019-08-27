module.exports = {
	files: {
		allow: [],
		allowOverrides: []
	},
	strings: {
		deny: [],
		denyOverrides: [
			'8d4f6780-b53b-11e9-946b-49292d32f12d', // README.md:24
			'b62f4580-81f6-11e9-8f9b-7d694d159e85', // README.md:34
			'cc02e6d3-5b7d-4859-b17e-a051e8a068a5', // lambdas/ingester/test/fixtures/runbook-fixture.md:107
			'66b24830-4764-4b98-9a22-7c7696ad1dda', // lambdas/ingester/test/releaseLogHandler.test.js:187
			'8faf58eb-8049-4299-8d1e-5c7488e49403' // lambdas/ingester/test/releaseLogHandler.test.js:205
		]
	}
};
