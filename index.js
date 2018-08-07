const fs = require("fs");
const Path = require("path");
const glob = require("glob");
const prettier = require("prettier");
const mustache = require("mustache");

const getRootAndroidPath = initialPath => {
  if (!initialPath) initialPath = process.cwd();
  else initialPath = Path.resolve(process.cwd(), initialPath);
  const fp = Path.join(initialPath, "android");
  if (fs.existsSync(fp)) return fp;
  return null;
};
const getKTClassFiles = initialPath => {
  const rootPath = getRootAndroidPath(initialPath);
  if (!rootPath) return false;
  //Let's spelunk for .kt files
  const searchPath = Path.join(rootPath, "**", "*.kt");
  const globs = glob.sync(searchPath);
  return globs;
};

const getPackageName = initialPath => {
  const outfiles = {};
  const files = getKTClassFiles(initialPath);
  //iterate through the files to get the package names

  files.forEach(path => {
    const text = fs.readFileSync(path, { encoding: "UTF8" });
    const lines = text.split("\n");
    const packageLine = lines.find(l => {
      return l.trim().indexOf("package") === 0;
    });
    if (packageLine) {
      package = packageLine
        .substring("package ".length, packageLine.length)
        .trim();
      if (package) {
        outfiles[package] = outfiles[package] ? outfiles[package] + 1 : 1;
      }
    }
  });
  const top = Object.keys(outfiles)
    .sort((a, b) => {
      if (outfiles[a] > outfiles[b]) return 1;
      if (outfiles[b] < outfiles[a]) return -1;
      return 0;
    })
    .shift();
  return top;
};

const getClassesFromPath = thisPath => {
  //Let's get all my KTClassFiles
  const files = getKTClassFiles(thisPath);
  var out = {};
  files.forEach(path => {
    let classes = getKTClassesFromFile(path);
    if (classes) {
      out = { ...out, ...classes };
      //   classes.forEach(c => {
      //     out.append(c);
      //   });
    }
  });
  return out;
};

const getKTClassesFromFile = thisPath => {
  //Load file into memory
  const origText = fs.readFileSync(thisPath, { encoding: "UTF8" });
  const origLines = origText.split("\n");
  var currentMode = null;
  var currentLines = null;
  var currentClass = null;
  var currentReactClass = null;
  var currentPackage = null;
  var classes = {};
  origLines.forEach((line, index) => {
    const trimmedline = line.trim();
    if (!currentMode) {
      if (trimmedline.indexOf("@React") === 0) {
        //I'm headed into a mode!
        currentMode = trimmedline;
        return;
      } else if (trimmedline.indexOf("//@ReactClassName") === 0) {
        //Next line is the hint!
        currentReactClass = trimmedline
          .split("=")
          .pop()
          .trim();
        if (currentClass) classes[currentClass].reactName = currentReactClass;
      } else if (trimmedline.indexOf("class") === 0) {
        //We are in a class!
        const words = trimmedline.split(" ");
        var baseClass = "";
        for (var i = 1; i < words.length; i++) {
          const lastword = words[i - 1];
          if (lastword === "class") {
            const parensPos = words[i].indexOf("(");
            const word = words[i].substring(
              0,
              parensPos > -1 ? parensPos : words[i].length
            );
            currentClass = word;
          } else if (lastword == ":") {
            //next word is my base class
            const parensPos = words[i].indexOf("(");
            const word = words[i].substring(
              0,
              parensPos > -1 ? parensPos : words[i].length
            );
            baseClass = word;
          }
        }

        classes[currentClass] = {
          raw: {},
          reactName: currentReactClass,
          rawClass: trimmedline,
          baseClass,
          package: currentPackage
        };
      } else if (
        trimmedline.indexOf("package") === 0 &&
        currentPackage === null
      ) {
        console.log("I am be working with a package!!", trimmedline);
        currentPackage = trimmedline.substring(
          "package ".length,
          trimmedline.length
        );
      }
    } else {
      if (!currentLines) {
        currentLines = [trimmedline];
      } else {
        currentLines.push(trimmedline);
      }
      if (trimmedline.indexOf("{") > -1) {
        classes[currentClass].raw[currentLines[0]] = {
          lines: currentLines,
          attribute: currentMode
        };
        currentMode = null;
        currentLines = null;
      }
    }
  });
  Object.keys(classes).forEach(className => {
    const classInfo = classes[className];
    const raws = classInfo.raw;
    classes[className].methods = {};
    Object.keys(raws).forEach(rawKey => {
      const raw = raws[rawKey].lines;
      if (raws[rawKey].attribute.trim() == "@ReactMethod") {
        if (raw[0].indexOf("fun ") > -1) {
          //This is a function to expose
          //Extract the function name
          const funPos = raw[0].indexOf("fun ");
          const methodPos = funPos + 4;
          const argsPos = raw[0].indexOf("(") + 1;
          const method = raw[0].substring(methodPos, argsPos - 1).trim();
          const args = raw[0]
            .substring(argsPos, raw[0].indexOf("{"))
            .split(",")
            .map(argval => {
              const argpieces = argval.split(":");
              const key = argpieces[0];
              const val = argpieces[1]
                .trim()
                .replace(/[)]+$/g, "")
                .trim();
              return { key, val };
            });
          classes[className].methods[method] = {
            args: args.filter(arg => {
              return arg.val != "Promise";
            }),
            isPromise: args.find(arg => {
              return arg.val == "Promise";
            })
              ? true
              : false
          };
        }
      }
    });
    delete classes[className].raw;
  });
  return classes;
};
function getReactPackageFromPath(thisPath) {
  const classes = getClassesFromPath(thisPath);
  const interior = getReactPackageInteriorFromClasses(classes);
  const packageName = getPackageName();
  const fullpackage = getReactPackageFromInterior(
    packageName,
    interior,
    getImports(packageName, classes)
  );
  return fullpackage;
}
function getReactPackageFromClasses(classes) {
  const interior = getReactPackageInteriorFromClasses(classes);
  const packageName = getPackageName();
  const imps = getImports(packageName, classes);
  const fullpackage = getReactPackageFromInterior(packageName, interior, imps);
  return fullpackage;
}
function getReactPackageInteriorFromClasses(classes) {
  //Build out classes
  //Look For modules
  const moduleLines = [];
  const viewManagerLines = [];
  Object.keys(classes).forEach(k => {
    obj = classes[k];
    if (getBaseClass(obj, classes) == "ViewManager") {
      viewManagerLines.push("    viewManagers.add(" + k + +"(reactContext))");
    } else if (getBaseClass(obj, classes) == "ReactContextBaseJavaModule") {
      moduleLines.push("    modules.add(" + k + "(reactContext))");
    }
  });
  const moduleText =
    moduleLines.length > 0
      ? "    val modules = ArrayList<NativeModule>()\n" +
        moduleLines.join("\n    ") +
        "\n    return modules"
      : "    return emptyList<NativeModule>()";
  const viewManagerText =
    viewManagerLines.length > 0
      ? "    val viewManagers = ArrayList<ViewManager<*,*>>()\n" +
        viewManagerLines.join("\n    ") +
        "\n    return viewManagers"
      : "     return emptyList<ViewManager<*,*>>()";
  const out =
    "  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> { \n" +
    moduleText +
    "\n  }\n" +
    "  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*,*>> {\n" +
    viewManagerText +
    "\n  }";
  return out;
}

function getBaseClass(obj, classes) {
  if (!obj) return null;
  const baseClass = getBaseClass(classes[obj.baseClass], classes);
  return baseClass ? baseClass : obj.baseClass;
}
function getReactPackageFromInterior(packageName, interior, imps) {
  const obj = {
    packageName,
    interior,
    imports: imps,
    className: packageName.replace(/\./g, "_")
  };
  console.log("Wroking with imports of ", imps);
  const template = fs.readFileSync(__dirname + "/templates/reactpackage.kt", {
    encoding: "UTF8"
  });

  const out = mustache.render(template, obj);
  return out;
}
function getImports(packageName, classes) {
  var imports = [];
  Object.keys(classes).forEach(k => {
    obj = classes[k];
    if (
      ["ViewManager", "ReactContextBaseJavaModule"].indexOf(
        getBaseClass(obj, classes)
      ) > -1 &&
      obj.package != packageName
    ) {
      imports.push(obj.package + "." + k);
    }
  });
  const out =
    imports.length > 0 ? "import " + imports.join(";\nimport ") + ";\n" : "";
  return out;
}
function getJSFromPath(thisPath) {
  const classes = getClassesFromPath(thisPath);
  return getJSFromClasses(classes);
}
function getJSFromClasses(classes) {
  var outlines = ['import { NativeModules } from "react-native"'];
  var exportables = [];
  Object.keys(classes).forEach(k => {
    const obj = classes[k];
    const reactName = obj.reactName;
    if (!reactName) return;
    const NativeObj = "Native" + reactName;
    if (obj.methods) {
      outlines.push("//#region Code for object " + reactName);
      outlines.push("const " + NativeObj + "= NativeModules." + reactName);
      Object.keys(obj.methods).forEach(m => {
        const mobj = obj.methods[m];
        const JSm = exportables.indexOf(m) > -1 ? reactName + m : m;
        const async = mobj.isPromise ? "async " : "";
        const isAwait = async ? "await " : "";
        const filteredKeys = mobj.args
          .filter(arg => {
            return !arg || ["Promise"].indexOf(arg.type) == -1;
          })
          .map(arg => {
            return arg ? arg.name : null;
          });
        var line =
          "const " +
          JSm +
          " = " +
          async +
          "(" +
          filteredKeys.join(", ") +
          ") => {\n  return " +
          isAwait +
          NativeObj +
          "." +
          m +
          "(" +
          filteredKeys.join(", ") +
          ");\n}";
        outlines.push(line);
        exportables.push(JSm);
      });
      outlines.push("//#endregion");
    }
  });
  outlines.push("//#region Exports");
  outlines.push("export {\n  " + exportables.join(",\n  ") + "\n}");
  outlines.push("//#endregion");
  const out = prettier.format(outlines.join("\n"), { parser: "babylon" });

  return out;
}
function writeJSFile(js, initialPath) {
  if (!initialPath) initialPath = process.cwd();
  if (!js) return null;
  fs.writeFileSync(Path.join(initialPath, "react-kotlin-bridge.js"), js);
  return true;
}
function writeKTFile(kt, initialPath) {
  if (!kt) return null;
  const paths = getKTClassFiles(initialPath);
  const base = Path.dirname(paths[0]);
  fs.writeFileSync(Path.join(base, "ReactNativePackage.kt"), kt);
  return true;
}
module.exports = {
  getJSFromClasses,
  getClassesFromPath,
  getReactPackageFromClasses,
  getClassesFromPath,
  getKTClassesFromFile,
  writeJSFile,
  writeKTFile
};
