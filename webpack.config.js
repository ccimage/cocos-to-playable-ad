const path = require("path");
const webpack = require("webpack");

const externals = getExternals();
module.exports = {
    mode: "production",
    entry: "./build/server.js",
    externals: externals,
    target: "node",
    output: {
        path: path.resolve(__dirname, "dist/"),
        filename: "cocos_playable_ads.bundle.js",
    },
    node: {
        __dirname: true,
    },
    module: {
        rules: [
            {
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: [
                            [
                                "@babel/preset-env",
                                {
                                    targets: {
                                        node: true,
                                    },
                                },
                            ],
                        ],
                    },
                },
                test: /\.js$/,
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimize: false,
    },
};

function getExternals() {
    const manifest = require("./package.json");
    const dependencies = manifest.dependencies;
    const options = {};
    // eslint-disable-next-line guard-for-in
    for (const p in dependencies) {
        options[p] = `commonjs ${p}`;
    }
    return options;
}
