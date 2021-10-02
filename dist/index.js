"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createResolvers = require("./createResolvers");

Object.keys(_createResolvers).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _createResolvers[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _createResolvers[key];
    }
  });
});

var _createSchemaCustomization = require("./createSchemaCustomization");

Object.keys(_createSchemaCustomization).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _createSchemaCustomization[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _createSchemaCustomization[key];
    }
  });
});

var _onCreateNode = require("./onCreateNode");

Object.keys(_onCreateNode).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _onCreateNode[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _onCreateNode[key];
    }
  });
});

var _onPluginInit = require("./onPluginInit");

Object.keys(_onPluginInit).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _onPluginInit[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _onPluginInit[key];
    }
  });
});

var _pluginOptionsSchema = require("./pluginOptionsSchema");

Object.keys(_pluginOptionsSchema).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _pluginOptionsSchema[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _pluginOptionsSchema[key];
    }
  });
});

var _sourceNodes = require("./sourceNodes");

Object.keys(_sourceNodes).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _sourceNodes[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _sourceNodes[key];
    }
  });
});