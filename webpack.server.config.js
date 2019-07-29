const path = require('path');
/* eslint-disable import/no-extraneous-dependencies */
const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');

const sls = {
	entry: slsw.lib.entries,
	target: 'node',
	mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
	output: {
		libraryTarget: 'commonjs2',
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
	},
	devtool: slsw.lib.webpack.isLocal ? 'cheap-eval-source-map' : 'source-map',
	stats: 'minimal',
	externals: [nodeExternals()],
	performance: {
		hints: false,
	},
	resolve: {
		extensions: ['.js', '.jsx'],
	},
	module: {
		rules: [
			{
				test: /\.jsx?$/,
				exclude: [/node_modules/],
				use: {
					loader: 'babel-loader',
					options: {
						babelrc: false,
						comments: false,
						presets: [
							[
								'@babel/preset-env',
								{
									targets: {
										node: true,
									},
									modules: 'commonjs',
								},
							],
						],
						plugins: [
							'source-map-support',
							[
								'@babel/plugin-transform-react-jsx',
								{
									pragma: 'h', // default pragma is React.createElement
									pragmaFrag: 'Fragment', // default is React.Fragment
									throwIfNamespace: false, // defaults to true
								},
							],
						],
					},
				},
			},
			{
				test: /\.md$/i,
				use: 'raw-loader',
			},
		],
	},
};

module.exports = sls;
