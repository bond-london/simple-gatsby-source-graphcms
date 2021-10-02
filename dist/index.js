"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _gatsbyNode = require("./gatsby-node");

Object.keys(_gatsbyNode).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _gatsbyNode[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _gatsbyNode[key];
    }
  });
});