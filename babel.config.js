'use strict';

// server/test config
module.exports = api => {
	const isTest = api.env('test');

	return {
		presets: [
			[
				'@babel/preset-env',
				{
					targets: {
						node: 'current',
					},
					modules: 'commonjs',
				},
			],
		],
		plugins: [
			!isTest && 'source-map-support',
			[
				'@babel/plugin-transform-react-jsx',
				{
					pragma: 'h', // default pragma is React.createElement
					pragmaFrag: 'Fragment', // default is React.Fragment
					throwIfNamespace: false, // defaults to true
				},
			],
		].filter(Boolean),
	};
};
