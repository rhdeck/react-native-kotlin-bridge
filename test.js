#!/usr/bin/env node

const rnkb = require("./");
const out = rnkb.getClassesFromPath();
const kt = rnkb.getReactPackageFromClasses(out);
console.log("KT: ", kt);
const js = rnkb.getJSFromClasses(out);

console.log("JS:", js);
rnkb.writeJSFile(js);
rnkb.writeKTFile(kt);
