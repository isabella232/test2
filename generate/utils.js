var pointerRegex = /\s*\*\s*/;
var doublePointerRegex = /\s*\*\*\s*/;
var callbackTypePattern = /\s*_cb/;
var _ = require("lodash");

// TODO: When libgit2's docs include callbacks we should be able to remove this
var callbackDefs = require("./callbacks.json");
var descriptor = require("./descriptor.json");
var version = require("../package.json").libgit2.version;
var libgit2 = require("./v" + version + ".json");
var cTypes = libgit2.groups.map(function(group) { return group[0];});

var cTypeMappings = {
  "char": "String",
  "short": "Number",
  "int": "Number",
  "int16_t": "Number",
  "int32_t": "Number",
  "int64_t": "Number",
  "size_t": "Number",
  "uint16_t": "Number",
  "uint32_t": "Number",
  "uint64_t": "Number"
}

var collisionMappings = {
  "new": "create"
}

var Utils = {
  titleCase: function(str) {
    return str.split(/_|\//).map(function(val, index) {
      if (val.length) {
        return val[0].toUpperCase() + val.slice(1);
      }

      return val;
    }).join("");
  },

  camelCase: function(str) {
    return str.split(/_|\//).map(function(val, index) {
        return (index >= 1
          ? val[0].toUpperCase() + val.slice(1)
          : val[0].toLowerCase() + val.slice(1));
    }).join("");
  },

  isPointer: function(cType) {
    return pointerRegex.test(cType) || doublePointerRegex.test(cType);
  },

  isDoublePointer: function(cType) {
    return doublePointerRegex.test(cType);
  },

  normalizeCtype: function(cType) {
    return (cType || "")
    .toLowerCase()
    .replace("const ", "")
    .replace("unsigned ", "")
    .replace("struct", "")
    .replace(doublePointerRegex, "")
    .replace(pointerRegex, "")
    .trim();
  },

  cTypeToCppName: function(cType, ownerType) {
    var normalizedType = Utils.normalizeCtype(cType);
    if (ownerType && normalizedType != ownerType) {
      normalizedType = normalizedType.replace(ownerType, "");
    }

    return cTypeMappings[normalizedType] || Utils.titleCase(normalizedType);
  },

  cTypeToJsName: function(cType, ownerType) {
    var output = Utils.camelCase(Utils.cTypeToCppName(cType, ownerType).replace(/^Git/, ""));
    var mergedPrefixes = ["from", "by"];

    mergedPrefixes.forEach(function(prefix) {
      var reg = new RegExp("(^" + prefix + "|" + Utils.titleCase(prefix) + ")([a-z]+)$");
      output = output.replace(reg, function(all, prefixMatch, otherWord) {
        return prefixMatch + Utils.titleCase(otherWord);
      });
    });

    output = output.replace(/([a-z])Str$/, "$1String")
    return output;
  },

  isConstructorFunction: function(cType, fnName) {
    var initFnName = cType.split('_');

    initFnName.splice(-1, 0, "init");
    initFnName = initFnName.join('_');

    return initFnName === fnName;
  },

  hasConstructor: function(type, normalizedType) {
    return type.used
      && type.used.needs
      && type.used.needs.some(function (fnName) {
        return Utils.isConstructorFunction(normalizedType, fnName);
      });
  },

  isCallbackFunction: function(cType) {
    return callbackTypePattern.test(cType);
  },

  isPayloadFor: function(cbField, payloadName) {
    return ~payloadName.indexOf("_payload")
      && Utils.isCallbackFunction(cbField.cType)
      && ~cbField.name.indexOf(payloadName.replace("_payload", ""));
  },

  getLibgitType: function(normalizedType, types) {
    var libgitType;

    types.some(function (type) {
      if (type[0] === normalizedType) {
        libgitType = type[1];
        return true;
      }
    });

    return libgitType;
  },

  processCallback: function(field) {
    field.isCallbackFunction = true;

    if (callbackDefs[field.type]) {
      _.merge(field, callbackDefs[field.type]);
    }
    else {
      if (process.env.BUILD_ONLY) {
        console.warn("Couldn't find callback definition for " + field.type);
      }
    }
  },

  processPayload: function(field, allFields) {
    if (field.name === "payload") {
      field.payloadFor = "*";
    }
    else {
      var cbFieldName;

      allFields.some(function (cbField) {
        if (Utils.isPayloadFor(cbField, field.name)) {
          cbFieldName = cbField.name;
          return true;
        }
      });

      if (cbFieldName) {
        field.payloadFor = cbFieldName;
      }
    }
  },

  decorateLibgitType: function(type, types, enums) {
    var normalizedType = Utils.normalizeCtype(type.cType);
    var libgitType = Utils.getLibgitType(normalizedType, types);

    if (libgitType) {
      type.isLibgitType = true;
      type.isEnum = libgitType.type === "enum";
      type.hasConstructor = Utils.hasConstructor(type, normalizedType);

      // there are no enums at the struct level currently, but we still need to override function args
      if (type.isEnum) {
        type.cppClassName = "Number";
        type.jsClassName = "Number";
        if (enums[type.cType]) {
          type.isMask = enums[type.cType].isMask || false
        }
      }
      _.merge(type, descriptor.types[normalizedType.replace("git_", "")] || {});
    }
  },

  decoratePrimaryType: function(typeDef, enums) {
    var typeDefOverrides = descriptor.types[typeDef.typeName] || {};
    var partialOverrides = _.omit(typeDefOverrides, ["fields", "functions"]);

    typeDef.cType = typeDef.cType || null;
    typeDef.cppClassName = Utils.cTypeToCppName(typeDef.cType || "git_" + typeDef.typeName);
    typeDef.jsClassName = Utils.titleCase(Utils.cTypeToJsName(typeDef.cType || "git_" + typeDef.typeName));
    typeDef.filename = typeDef.typeName;
    typeDef.isLibgitType = true;
    typeDef.dependencies = [];

    typeDef.fields = typeDef.fields || [];
    typeDef.fields.forEach(function (field, index, allFields) {
      var fieldOverrides = typeDefOverrides.fields || {};
      Utils.decorateField(field, allFields, fieldOverrides[field.name] || {}, enums);
    });

    typeDef.needsForwardDeclaration = typeDef.decl === typeDef.cType;

    var normalizedType = Utils.normalizeCtype(typeDef.cType);
    typeDef.hasConstructor = Utils.hasConstructor(typeDef, normalizedType);

    typeDef.functions = (typeDef.functions).map(function(fn) {
      var fnDef = libgit2.functions[fn];
      fnDef.cFunctionName = fn;
      return fnDef;
    });

    var typeDefOverrides = descriptor.types[typeDef.typeName] || {};
    var functionOverrides = typeDefOverrides.functions || {};
    typeDef.functions.forEach(function(fnDef) {
      Utils.decorateFunction(fnDef, typeDef, functionOverrides[fnDef.cFunctionName] || {}, enums);
    });

    _.merge(typeDef, partialOverrides);
  },

  decorateField: function(field, allFields, fieldOverrides, enums) {
    var normalizeType = Utils.normalizeCtype(field.type);

    field.cType = field.type;
    field.cppFunctionName = Utils.titleCase(field.name);
    field.jsFunctionName = Utils.camelCase(field.name);
    field.cppClassName = Utils.cTypeToCppName(field.type);
    field.jsClassName = Utils.titleCase(Utils.cTypeToJsName(field.type));

    if (Utils.isCallbackFunction(field.cType)) {
      Utils.processCallback(field);

      var argOverrides = fieldOverrides.args || {};
      field.args = field.args || [];
      field.args.forEach(function (arg) {
        Utils.decorateArg(arg, null, null, argOverrides[arg.name] || {}, enums);
      });
    }
    else {
      field.isCallbackFunction = false;
      Utils.processPayload(field, allFields);
      if (field.payloadFor) {
        return;
      }
    }

    Utils.decorateLibgitType(field, libgit2.types, enums);
    _.merge(field, fieldOverrides);
  },

  decorateArg: function(arg, typeDef, fnDef, argOverrides, enums) {
    var type = arg.cType || arg.type;
    var normalizedType = Utils.normalizeCtype(type);

    arg.cType = type;
    arg.cppClassName = Utils.cTypeToCppName(arg.cType);
    arg.jsClassName = Utils.titleCase(Utils.cTypeToJsName(arg.cType));

    Utils.decorateLibgitType(arg, libgit2.types, enums);

    if (typeDef && fnDef) {
      // Mark all of the args that are either returns or are the object
      // itself and determine if this function goes on the prototype
      // or is a constructor method.
      arg.isReturn = arg.name === "out" || (Utils.isDoublePointer(arg.type) && normalizedType == typeDef.cType);
      arg.isSelf = Utils.isPointer(arg.type) && normalizedType == typeDef.cType;

      if (arg.isReturn && fnDef.return && fnDef.return.type === "int") {
        fnDef.return.isErrorCode = true;
        fnDef.isAsync = true;
      }

      if (arg.isReturn && arg.isSelf) {
        arg.isSelf = false;
        fnDef.isConstructorMethod = true;
      }
      else if (arg.isSelf) {
        fnDef.isPrototypeMethod = true;
      }
    }

    _.merge(arg, argOverrides);
  },

  decorateFunction: function(fnDef, typeDef, fnOverrides, enums) {
    var key = fnDef.cFunctionName;

    // if this is the free function for the class, make the ref on the class
    // and then return since we don't want the free functions publicly
    // available
    if (key == typeDef.cType + "_free") {
      typeDef.freeFunctionName = key;
      fnDef.ignore = true;
      return;
    }

    fnDef.cppFunctionName = Utils.cTypeToCppName(key, "git_" + typeDef.typeName);
    fnDef.jsFunctionName = Utils.cTypeToJsName(key, "git_" + typeDef.typeName);
    //fnDef.isAsync = false; // until proven otherwise

    if (fnDef.cppFunctionName == typeDef.cppClassName) {
      fnDef.cppFunctionName = fnDef.cppFunctionName.replace("Git", "");
    }

    var argOverrides = fnOverrides.args || {};
    fnDef.args.forEach(function(arg) {
      Utils.decorateArg(arg, typeDef, fnDef, argOverrides[arg.name] || {}, enums);
    });

    if (fnDef.return) {
      Utils.decorateArg(fnDef.return, typeDef, fnDef, fnOverrides.return || {}, enums);
    }

    _(collisionMappings).forEach(function(newName, collidingName) {
      if (fnDef.cppFunctionName == Utils.titleCase(collidingName)) {
        fnDef.cppFunctionName = Utils.titleCase(newName);
      }

      if (fnDef.jsFunctionName == Utils.camelCase(collidingName)) {
        fnDef.jsFunctionName = Utils.camelCase(newName);
      }
    });

    _.merge(fnDef, _.omit(fnOverrides, "args", "return"));
  },

  filterIgnored: function (arr, callback) {
    if (!arr) {
      return;
    }
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i].ignore) {
        arr.splice(i, 1);
      }
      else if (callback) {
        callback(arr[i]);
      }
    }
  },

  deleteProperties: function(obj) {
    delete obj.line;
    delete obj.lineto;
    delete obj.block;
    delete obj.description;
    delete obj.comments;
    delete obj.tdef;
    delete obj.decl;
    delete obj.comments;
    delete obj.argline;
    delete obj.sig;
  },

  filterDocumentation: function(idefs) {
    Utils.filterIgnored(idefs, function (idef) {
      Utils.deleteProperties(idef);

      Utils.filterIgnored(idef.fields, Utils.deleteProperties);


      Utils.filterIgnored(idef.functions, function (fn) {
        Utils.deleteProperties(fn);

        Utils.filterIgnored(fn.args, function(arg) {
          Utils.deleteProperties(arg);
          delete arg.functions;
        });
      });
    });
  }
};

module.exports = Utils;
