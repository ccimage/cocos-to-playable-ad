import * as base64js from "base64-js";
import * as cheerio from "cheerio";
import * as fflate from "fflate";
import * as fs from "fs";
import * as path from "path";
import * as uglify from "uglify-js";

import CleanCSS = require("clean-css");

const G_Root_Path = "../ActiveAds/build/web-mobile/";
const G_7z_exe = "C:\\Program Files\\7-Zip\\7z.exe";

const shell = require("shelljs");
const { resolve } = require("path");

/** 一些配置参数
 * - [注意] 路径问题.start脚本与web-mobile同层级,因此相对路径需要带上web-mobile;cocos在调用资源时没有web-mobile,需要在最后去掉
 */
const CONST = {
    BASE_PATH: `${G_Root_Path}`, // web-mobile包基础路径
    RES_PATH: `${G_Root_Path}assets`, // web-mobile包下的res路径
    SRC_PATH: `${G_Root_Path}src`, // web-mobile包下的src路径
    OUTPUT_INDEX_HTML: `${G_Root_Path}SingleBundle.html`, // 输出文件index.html的路径
    INPUT_HTML_FILE: `${G_Root_Path}index.html`,
    INPUT_CSS_FILES: [`${G_Root_Path}style*.css`],
    POLY_FILLS_JS: `${G_Root_Path}src/polyfills.bundle*.js`,
    SYSTEM_JS: `${G_Root_Path}src/system.bundle*.js`,
};

/**
 * 根据cocos3.x发布的web项目，生成单个html文件
 */
class SingleBundleHtml {
    /** 执行任务 */
    async startTask() {
        console.time("开始处理 html");
        const currentPath = resolve(".");
        const $ = await this.readHtmlFile(CONST.INPUT_HTML_FILE);
        // 处理css
        await this.processCss($);
        // 处理js
        await this.processScript($);
        // 处理zip压缩文件
        await this.addZipScript($);
        shell.cd(G_Root_Path);
        await this.addZipAssets($);
        await this.addZipSource($);
        shell.cd(currentPath);
        await this.addScriptMain($);

        // 增加body script
        await this.addAppScript($);
        await this.addIndexScript($);

        // 最后启动的脚本
        await this.addScriptStart($);

        fs.writeFileSync(CONST.OUTPUT_INDEX_HTML, $.html());
    }

    private async processCss($: cheerio.CheerioAPI) {
        const cssLinks = $("head>link");
        for (let i = 0; i < cssLinks.length; i++) {
            const filePath = cssLinks[i].attribs["href"];
            const cssText = await this.readTextFile(`${G_Root_Path}${filePath}`);
            $(cssLinks[i]).remove();
            $("head").append(`<style>${new CleanCSS({}).minify(cssText).styles}</style>`);
        }
    }
    private async processScript($: cheerio.CheerioAPI) {
        const list = $("body>script");
        for (let i = 0; i < list.length; i++) {
            $(list[i]).remove();
        }
        const jsPolyFills = await this.readTextFile(`bundle/polyfills.bundle.js`);
        $("head").append(`<script>${jsPolyFills}</script>`);
        const systemJs = await this.readTextFile(`bundle/system.bundle.js`);
        $("head").append(`<script>${systemJs}</script>`);

        const jsZip = await this.readTextFile(`bundle/fflate.min.js`);
        $("head").append(`<script>${jsZip}</script>`);

        const base64js = await this.readTextFile(`bundle/base64.min.js`);
        $("head").append(`<script>${base64js}</script>`);
    }
    private async addZipScript($: cheerio.CheerioAPI) {
        const scriptText = await this.readTextFile(`bundle/cc.js`);
        const zipCC = fflate.zipSync({ "cc.js": fflate.strToU8(scriptText) });
        const base64String = base64js.fromByteArray(zipCC);
        $("head").append(`<script>var Global_CC_File = "${base64String}";</script>`);
    }
    private async addZipAssets($: cheerio.CheerioAPI) {
        const filePathFull = `assets.zip`;
        if (fs.existsSync(filePathFull)) shell.rm("-f", filePathFull);
        return Promise.resolve().then(() => {
            shell.exec(`"${G_7z_exe}" a -tzip assets.zip assets`);
            const blobAssets = fs.readFileSync("assets.zip");
            const base64String = base64js.fromByteArray(blobAssets);
            $("head").append(`<script>var assets_file="${base64String}";</script>`);
        });
    }
    private async addZipSource($: cheerio.CheerioAPI) {
        const filePathFull = `src.zip`;
        if (fs.existsSync(filePathFull)) shell.rm("-f", filePathFull);
        return Promise.resolve().then(() => {
            fs.writeFileSync("filelist.txt", "src/polyfills.bundle.js\nsrc/system.bundle.js\n");
            shell.exec(`"${G_7z_exe}" a -tzip -x@filelist.txt src.zip src`);
            const blobSrc = fs.readFileSync("src.zip");
            const base64String = base64js.fromByteArray(blobSrc);
            $("head").append(`<script>var src_file="${base64String}";</script>`);
        });
    }
    private async addScriptMain($: cheerio.CheerioAPI) {
        const scriptText = await this.readTextFile(`bundle/main.js`);
        $("head").append(`<script>${scriptText}</script>`);
    }
    private async addAppScript($: cheerio.CheerioAPI) {
        const scriptApp = await this.readTextFile(`${G_Root_Path}application.js`);
        const zipCC = fflate.zipSync({ "application.js": fflate.strToU8(scriptApp) });
        const base64String = base64js.fromByteArray(zipCC);
        $("body").append(`<script>var Global_APP_File = "${base64String}";</script>`);
    }
    private async addIndexScript($: cheerio.CheerioAPI) {
        let scriptApp = await this.readTextFile(`${G_Root_Path}index.js`);
        scriptApp = scriptApp.replace(`function topLevelImport(url) {\n    return System["import"](url);\n  }`, "");
        const zipCC = fflate.zipSync({ "index.js": fflate.strToU8(scriptApp) });
        const base64String = base64js.fromByteArray(zipCC);
        $("body").append(`<script>var Global_Index_File = "${base64String}";</script>`);
    }
    private async addScriptStart($: cheerio.CheerioAPI) {
        const scriptText = await this.readTextFile(`bundle/start.js`);
        $("body").append(`<script async>${scriptText}</script>`);
    }
    /**
     * 读取HTMl文件
     */
    private async readHtmlFile(filePath: string) {
        return new Promise<cheerio.CheerioAPI>((resolve, reject) => {
            fs.readFile(filePath, (err, data) => {
                if (err) reject(err);
                const htmlString = data.toString();
                const $ = cheerio.load(htmlString);

                resolve($);
            });
        });
    }

    /**
     * 读取TEXT文件
     */
    private async readTextFile(filePath: string) {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(filePath, (err, data) => {
                if (err) reject(err);
                resolve(data.toString());
            });
        });
    }
}

new SingleBundleHtml().startTask().then(ret => {
    console.log("处理完毕 ret = ", ret);
});
