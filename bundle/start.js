function readFromZip(base64string, filename) {
    const scriptBuffer = base64js.toByteArray(base64string);
    const blob = fflate.unzipSync(scriptBuffer)?.[filename];
    return "var System=window.System; " + fflate.strFromU8(blob);
}

function topLevelImport(...args) {
    window.CC_ENGINE_EVAL = readFromZip(Global_CC_File, "cc.js");
    return window.System.import("cc", window.CC_ENGINE_EVAL);
}

var applicationJs = readFromZip(Global_APP_File, "application.js");

var Script_Load_Map = { "./application.js": applicationJs };
var indexJS = readFromZip(Global_Index_File, "index.js");
window.System.import("./index.js", indexJS);
