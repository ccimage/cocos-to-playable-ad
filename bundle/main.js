let compressed = base64js.toByteArray(assets_file);
window.Total_Assets = fflate.unzipSync(compressed);
compressed = base64js.toByteArray(src_file);
window.Total_Src = fflate.unzipSync(compressed);
