# 修改记录
- 2025/12/09 v2.0.0
完全修改原有代码，放弃对cocos2.x支持，只支持3.x（本人只在3.8.7的特定项目测试通过）


# cocos-to-playable-ad 生成单个html文件，用于广告平台投放可玩的广告
将 cocos creator 构建出来的 web-mobile 项目打包为 playable-ad 项目，即单 html 文件。

- 设计思路：
    - 厘清脚本调用栈，压缩脚本并生成base64 string， 后来发现调用这样的脚本最好的是eval函数，就用了。 应该可以找到更好的，因为微信不支持eval函数。
    - 资源压缩成zip文件，并生成base64 string

- 开发过程：
    - 资源压缩和使用非常顺利，都是在cc.js里的，所以修改其调用方法就行。同时顺便发现了src文件夹下的脚本也是cc.js调用的。顺利修改。
    - 原先脚本是使用System.js模块化加载的，是变成链式异步调用的，绕开其成本较高。 因此选择修改它的import和register方法，花的时间较多，还好最终成功。

- 功能：
    - 支持 cocos creator 3.8.7,  本项目cc.js是来自cocos3.8.7，并且做了删减。如果项目中使用的了spine和3d的，需要你自己导出后修改cc.js， 后面会说明。
    - 大的js文件都尽量zip压缩了。 图片需要用tinypng能工具压缩后，再zip压缩。这样才能更省空间。

- 本项目不包括对图片，声音资源的压缩，需要自行压缩。
- 本项目不包括使用 cocos creator 打包时的模块选择，需要自行筛选。功能裁剪参考截图screenShot目录中
- 本项目的cocos引擎文件是3.8.7,其他版本需要自行修改后放入bundle/cc.js
- 本项目已经不再支持cocos2.x， 如果有需要找另一个同名的开源项目，就是本项目fork的那个
- 如果使用过程中出现问题，请提交到项目下的 Issues，


## 如何使用？
- 开发环境：
    - windows, linux, macos都可以
    - node.js 20以上
    - cocos creator 3.x
    - 7z

- 前置条件  放入自己的cc.js

- 输入：使用 cocos creator 构建出来的 web-mobile 项目文件夹。路径配置到项目中
- 输出：项目中配置
- 在项目中配置7z文件夹
- 使用方法：
    - cd进入项目中
    - 运行yarn install
    - 运行yarn run build

## cc引擎文件修改
- downloadScript函数内代码都注释，改为
```
    function downloadScript(url, options, onComplete) {
        const blob = url.startsWith("assets") ? Total_Assets[url] : Total_Src[url];
        const scriptText = fflate.strFromU8(blob);
        
        eval("var System=window.System;" + scriptText);
        onComplete && onComplete();
    }
```
- 有多个XMLHttpRequest的地方， 是加载脚本或者json的， 都改掉
  获得_settings的地方改成
```

    return new Promise(function (resolve, reject) {
        {
            const text = fflate.strFromU8(window.Total_Src[path]);
            _this._settings = JSON.parse(text);
            resolve();
        }
    });
```
- downloadFile函数改为
```
    function downloadFile(url, options, onProgress, onComplete) {
        if (options.xhrResponseType === 'json') {
          const text = fflate.strFromU8(window.Total_Assets[url]);
          const data = JSON.parse(text);
          if (onComplete) onComplete(undefined, data);
        }
    }
```
- 读取effectSetting也就是effect.bin的地方改成
```
    return new Promise(function (resolve, reject) {
        {
            // arraybuffer
            const blob = path.startsWith("assets") ? Total_Assets[path] : Total_Src[path];
            _this._data = blob.buffer;
            resolve();
        }
    });
```

- downloadDomImage 修改最后img.src为内嵌
```
    // img.src = url;
    // 图片资源改成base64
    const imageBase64=base64js.fromByteArray(Total_Assets[url]);
    // 最后3位是图片格式, 比如png和jpg， 如有tiff等4位的，可以取最后一个.的位置，再substring
    const imageType=url.substring(url.lastIndexOf("."));
    img.src=`data:image/${imageType};base64,${imageBase64}`;
    return img;
```
- scriptPackages地方把module.import改掉
```
    if (scriptPackages) {
        return Promise.all(scriptPackages.map(function (pack) {
            // 修改前
            // return module.import(pack);
            // 修改后
            const packIndexName = pack.indexOf("../src/chunks") === 0 ? pack.substring(3) : pack
            const textScript = fflate.strFromU8(window.Total_Src[packIndexName]);
            return module.import(pack, textScript);
        }));
    }
```

- AudioPlayerWeb.loadNative 修改成
```
  AudioPlayerWeb.loadNative = function loadNative(url) {
    return new Promise(function (resolve, reject) {
      var cachedAudioBuffer = audioBufferManager.getCache(url);
      if (cachedAudioBuffer) {
        audioBufferManager.retainCache(url);
        resolve(cachedAudioBuffer);
        return;
      }
      const blob = Total_Assets[url];
      audioContextAgent.decodeAudioData(blob.buffer).then(function (decodedAudioBuffer) {
        audioBufferManager.addCache(url, decodedAudioBuffer);
        resolve(decodedAudioBuffer);
      });
    });
  };
```



## system.bundle.js修改
> 这个似乎是cocos修改过的system.js，不是开源的某个版本。（只是放入过开源的system.js不能运行， 未详细考证。）
-   systemJSPrototype$1.import = function (id, parentUrl)  函数修改为：

```
  systemJSPrototype$1.import = function (id, scriptText) {
    var loader = this;
    return Promise.resolve()
    .then(function() {
      if (id.indexOf("virtual") < 0) {
        eval(scriptText);
        return id;
      }
      return loader.prepareImport().then(() => {return loader.resolve(id, scriptText)});
    })
    .then(function (id) {
      var load = getOrCreateLoad(loader, id);
      return load.C || topLevelLoad(loader, load);
    }).catch(err=>{
      console.log(err);
    });
  };
```
-    var instantiatePromise = Promise.resolve() 修改
```
    var instantiatePromise = Promise.resolve()
    .then(function () {
      if (id.indexOf("virtual") < 0 && id.indexOf("chunks") !== 0) {
        return lastRegister;
      }
      return loader.instantiate(id, firstParentUrl);
    })
```
- loader.import 之前插入一点代码
```
    import: function (importId, scriptText) {
        if (scriptText) {
            return loader.import(importId, scriptText);
        }
        return loader.import(importId, id);
    },
    meta: loader.createContext(id)
```
- linkPromise 修改
```
    var linkPromise = instantiatePromise
    .then(function (instantiation) {
      return Promise.all(instantiation[0].map(function (dep, i) {
        var setter = instantiation[1][i];
        return Promise.resolve()
        .then(function() {
          if (Script_Load_Map.hasOwnProperty(dep)) {
            eval(Script_Load_Map[dep]);
            return dep;
          } else if (dep == "cc") {
            eval(window.CC_ENGINE_EVAL); 
            return dep;
          }
          return Promise.resolve(loader.resolve(dep, id));
        })
        .then(function (depId) {
```
- processFirst 注释掉（可能非必须）
```
    var processFirst = hasDocument;
    systemJSPrototype$1.prepareImport = function (doProcessScripts) {
        // if (processFirst || doProcessScripts) {
        //   processScripts();
        //   processFirst = false;
        // }
        return importMapPromise;
    };
```
- document.readyState === 'loading' 也可以注释掉
```
  systemJSPrototype$1.register = function (deps, declare) {
    // if (hasDocument && document.readyState === 'loading' && typeof deps !== 'string') {
    //   var scripts = document.querySelectorAll('script[src]');
    //   var lastScript = scripts[scripts.length - 1];
    //   if (lastScript) {
    //     lastScript.src;
    //     lastAutoImportDeps = deps;
    //     // if this is already a System load, then the instantiate has already begun
    //     // so this re-import has no consequence
    //     var loader = this;
    //     lastAutoImportTimeout = setTimeout(function () {
    //       autoImportCandidates[lastScript.src] = [deps, declare];
    //       loader.import(lastScript.src);
    //     });
    //   }
    // }
    // else {
    //   lastAutoImportDeps = undefined;
    // }
    return systemRegister.call(this, deps, declare);
  };
```


## 依赖模块：
- 参考项目中的package.json
