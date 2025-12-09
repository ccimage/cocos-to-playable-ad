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
            const styleText = new CleanCSS({}).minify(cssText).styles;
            this.appendElement($, "head", "style", styleText, filePath)
        }
    }
    private async processScript($: cheerio.CheerioAPI) {
        const list = $("body>script");
        for (let i = 0; i < list.length; i++) {
            $(list[i]).remove();
        }
        let jsLink = "bundle/polyfills.bundle.js";
        const jsPolyFills = await this.readTextFile(jsLink);
        this.appendElement($, "head", "script", jsPolyFills, jsLink)
        jsLink = `bundle/system.bundle.js`;
        const systemJs = await this.readTextFile(jsLink);
        let scriptText = uglify.minify(systemJs, {mangle: false, module: true}).code;
        this.appendElement($, "head", "script", scriptText, jsLink)
        jsLink = `bundle/fflate.min.js`;
        const jsZip = await this.readTextFile(jsLink);
        this.appendElement($, "head", "script", jsZip, jsLink)
        jsLink = `bundle/base64.min.js`;
        const base64js = await this.readTextFile(jsLink);
        this.appendElement($, "head", "script", base64js, jsLink)
    }
    private async addZipScript($: cheerio.CheerioAPI) {
        let jsLink = "bundle/cc.js";
        let scriptText = await this.readTextFile(jsLink);
        const miniCode = uglify.minify(scriptText, {mangle: false, module: true}).code;
        const zipCC = fflate.zipSync({ "cc.js": fflate.strToU8(miniCode) });
        const base64String = base64js.fromByteArray(zipCC);
        scriptText = `var Global_CC_File = "${base64String}";`;
        this.appendElement($, "head", "script", scriptText, jsLink)
    }
    private async addZipAssets($: cheerio.CheerioAPI) {
        const filePathFull = `assets.zip`;
        if (fs.existsSync(filePathFull)) shell.rm("-f", filePathFull);
        return Promise.resolve().then(() => {
            shell.exec(`"${G_7z_exe}" a -tzip assets.zip assets`);
            const blobAssets = fs.readFileSync("assets.zip");
            const base64String = base64js.fromByteArray(blobAssets);
            this.appendElement($, "head", "script", `var assets_file="${base64String}";`, "assets.zip")
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
            this.appendElement($, "head", "script", `var src_file="${base64String}";`, "src.zip")
        });
    }
    private async addScriptMain($: cheerio.CheerioAPI) {
        const jsLink = `bundle/main.js`;
        const scriptText = await this.readTextFile(jsLink);
        this.appendElement($, "head", "script", scriptText, jsLink)
    }
    private async addAppScript($: cheerio.CheerioAPI) {
        const jsLink = "application.js";
        const scriptApp = await this.readTextFile(`${G_Root_Path}${jsLink}`);
        const zipCC = fflate.zipSync({ "application.js": fflate.strToU8(scriptApp) });
        const base64String = base64js.fromByteArray(zipCC);
        const scriptText = `var Global_APP_File = "${base64String}";`;
        this.appendElement($, "body", "script", scriptText, jsLink)
    }
    private async addIndexScript($: cheerio.CheerioAPI) {
        const jsLink = "index.js";
        let scriptApp = await this.readTextFile(`${G_Root_Path}${jsLink}`);
        scriptApp = scriptApp.replace(`function topLevelImport(url) {\n    return System["import"](url);\n  }`, "");
        const zipCC = fflate.zipSync({ "index.js": fflate.strToU8(scriptApp) });
        const base64String = base64js.fromByteArray(zipCC);
        const scriptText = `var Global_Index_File = "${base64String}";`;
        this.appendElement($, "body", "script", scriptText, jsLink)
    }
    private async addScriptStart($: cheerio.CheerioAPI) {
        const jsLink = `bundle/start.js`;
        const scriptText = await this.readTextFile(jsLink);
        this.appendElement($, "body", "script", scriptText, jsLink)
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

    private appendElement($: cheerio.CheerioAPI, toElement: string, elementType: string, content: string, originFileName: string) {
        $(toElement).append(`<!-- ${originFileName} -->\n<${elementType}>${content}</${elementType}>\n`);
    }
}

new SingleBundleHtml().startTask().then(ret => {
    console.log("处理完毕 ret = ", ret);
});
