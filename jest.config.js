module.exports = {
	roots: ['./lambdas', './libraries'],
	testPathIgnorePatterns: ['/bower_components/', '/node_modules/'],
	setupFiles: ['<rootDir>/common/test/setup.js'],
	moduleNameMapper: {
		'(.*)get-configured-schema': '<rootDir>/common/test/biz-ops-schema.js',
		'@financial-times/lambda-logger':
			'<rootDir>/common/test/lambda-logger.js',
	},
};
