#!/usr/bin/env node
const core = require("./index.js");
const commander = require("commander");
const fs = require("fs");
const watch = require("node-watch");
const Path = require("path");
const cp = require("child_process");
commander.usage("[options] [targetpath]");
commander.option("-o --out <outfile>");
commander.option("-w --watch");
commander.parse(process.argv);
var thisPath = commander.args[0] ? commander.args[0] : process.cwd();
var outfile = commander.out;
if (commander.watch) {
  try {
    console.log("Watching for kotlin changes on " + thisPath);
    watch(thisPath, { recursive: true, filter: /\.kt$/ }, () => {
      if (core.makeJSandKT(thisPath)) {
        console.log("Updated KT and JS");
      } else {
        console.log("Did not update because they are the same");
      }
    });
  } catch (e) {
    console.log("Hit error ", e);
  }
} else {
  try {
    if (core.makeJSandKT(thisPath)) {
      console.log("Updated KT and JS");
    } else {
      console.log("Did not update because no changes");
    }
  } catch (e) {
    console.log("Hit error ", e);
  }
}
