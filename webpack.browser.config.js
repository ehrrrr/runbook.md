/* eslint-disable import/no-extraneous-dependencies */
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const EncodingPlugin = require('webpack-encoding-plugin');
const postcssPresetEnv = require('postcss-preset-env');
const path = require('path');

const filenameTemplate = process.env.CI ? '[contenthash].[name]' : '[name]';
module.exports = {
	entry: ['./lambdas/ingester/src/browser/main.js'],
	resolve: {
		extensions: ['.js', '.jsx'],
	},
	output: {
		path: path.resolve(__dirname, 'dist/browser'),
		filename: `${filenameTemplate}.js`,
	},
	stats: 'minimal',
	module: {
		rules: [
			{
				test: /\.jsx?$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						// do not use the server config specified in babel.config.js
						babelrc: false,
					},
				},
			},
			{
				test: /\.s?css$/,
				// requires explicit resolve config to load sass rather than js files
				// https://github.com/webpack-contrib/sass-loader/issues/556
				resolve: {
					extensions: ['.scss', '.sass'],
				},
				// loaders are evaluated in reverse order, e.g sass -> postcss -> css -> style-loader
				use: [
					{
						loader: MiniCssExtractPlugin.loader,
						options: {
							sourceMap: true,
						},
					},
					{
						loader: require.resolve('css-loader'),
						options: {
							sourceMap: true,
							importLoaders: 2, // two loaders preceed the css-loader
						},
					},
					{
						loader: require.resolve('postcss-loader'),
						options: {
							sourceMap: true,
							ident: 'postcss',
							plugins: [postcssPresetEnv()],
						},
					},
					{
						loader: require.resolve('sass-loader'),
						options: {
							sourceMap: true,
							sassOptions: {
								includePaths: ['bower_components'],
							},
						},
					},
				],
			},
		],
	},

	devServer: {
		contentBase: './dist/browser',
		inline: false,
		publicPath: '/statics/',
		host: 'local.in.ft.com',
	},
	plugins: [
		new MiniCssExtractPlugin({
			filename: `${filenameTemplate}.css`,
		}),
		new ManifestPlugin(),
		new EncodingPlugin({
			encoding: 'utf8',
		}),
	],
};

if (process.env.CI) {
	module.exports.devtool = 'source-map';
}
