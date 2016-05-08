/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/annotation', ['exports', 'pdfjs/shared/util',
      'pdfjs/core/primitives', 'pdfjs/core/stream', 'pdfjs/core/colorspace',
      'pdfjs/core/obj', 'pdfjs/core/evaluator'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./primitives.js'),
      require('./stream.js'), require('./colorspace.js'), require('./obj.js'),
      require('./evaluator.js'));
  } else {
    factory((root.pdfjsCoreAnnotation = {}), root.pdfjsSharedUtil,
      root.pdfjsCorePrimitives, root.pdfjsCoreStream, root.pdfjsCoreColorSpace,
      root.pdfjsCoreObj, root.pdfjsCoreEvaluator);
  }
}(this, function (exports, sharedUtil, corePrimitives, coreStream,
                  coreColorSpace, coreObj, coreEvaluator) {

var AnnotationBorderStyleType = sharedUtil.AnnotationBorderStyleType;
var AnnotationFlag = sharedUtil.AnnotationFlag;
var AnnotationType = sharedUtil.AnnotationType;
var OPS = sharedUtil.OPS;
var Util = sharedUtil.Util;
var isArray = sharedUtil.isArray;
var isInt = sharedUtil.isInt;
var isValidUrl = sharedUtil.isValidUrl;
var stringToBytes = sharedUtil.stringToBytes;
var stringToPDFString = sharedUtil.stringToPDFString;
var stringToUTF8String = sharedUtil.stringToUTF8String;
var warn = sharedUtil.warn;
var Dict = corePrimitives.Dict;
var isDict = corePrimitives.isDict;
var isName = corePrimitives.isName;
var isRef = corePrimitives.isRef;
var Stream = coreStream.Stream;
var ColorSpace = coreColorSpace.ColorSpace;
var ObjectLoader = coreObj.ObjectLoader;
var FileSpec = coreObj.FileSpec;
var OperatorList = coreEvaluator.OperatorList;

/**
 * @class
 * @alias AnnotationFactory
 */
function AnnotationFactory() {}
AnnotationFactory.prototype = /** @lends AnnotationFactory.prototype */ {
  /**
   * @param {XRef} xref
   * @param {Object} ref
   * @returns {Annotation}
   */
  create: function AnnotationFactory_create(xref, ref) {
    var dict = xref.fetchIfRef(ref);
    if (!isDict(dict)) {
      return;
    }

    // Determine the annotation's subtype.
    var subtype = dict.get('Subtype');
    subtype = isName(subtype) ? subtype.name : '';

    // Return the right annotation object based on the subtype and field type.
    var parameters = {
      xref: xref,
      dict: dict,
      ref: ref
    };

    switch (subtype) {
      case 'Link':
        return new LinkAnnotation(parameters);

      case 'Text':
        return new TextAnnotation(parameters);

      case 'Widget':
        var fieldType = Util.getInheritableProperty(dict, 'FT');
        if (isName(fieldType) && fieldType.name === 'Tx') {
          return new TextWidgetAnnotation(parameters);
        }
        return new WidgetAnnotation(parameters);

      case 'Popup':
        return new PopupAnnotation(parameters);

      case 'Highlight':
        return new HighlightAnnotation(parameters);

      case 'Underline':
        return new UnderlineAnnotation(parameters);

      case 'Squiggly':
        return new SquigglyAnnotation(parameters);

      case 'StrikeOut':
        return new StrikeOutAnnotation(parameters);

      case 'FileAttachment':
        return new FileAttachmentAnnotation(parameters);

      default:
        warn('Unimplemented annotation type "' + subtype + '", ' +
             'falling back to base annotation');
        return new Annotation(parameters);
    }
  }
};

var Annotation = (function AnnotationClosure() {
  // 12.5.5: Algorithm: Appearance streams
  function getTransformMatrix(rect, bbox, matrix) {
    var bounds = Util.getAxialAlignedBoundingBox(bbox, matrix);
    var minX = bounds[0];
    var minY = bounds[1];
    var maxX = bounds[2];
    var maxY = bounds[3];

    if (minX === maxX || minY === maxY) {
      // From real-life file, bbox was [0, 0, 0, 0]. In this case,
      // just apply the transform for rect
      return [1, 0, 0, 1, rect[0], rect[1]];
    }

    var xRatio = (rect[2] - rect[0]) / (maxX - minX);
    var yRatio = (rect[3] - rect[1]) / (maxY - minY);
    return [
      xRatio,
      0,
      0,
      yRatio,
      rect[0] - minX * xRatio,
      rect[1] - minY * yRatio
    ];
  }

  function getDefaultAppearance(dict) {
    var appearanceState = dict.get('AP');
    if (!isDict(appearanceState)) {
      return;
    }

    var appearance;
    var appearances = appearanceState.get('N');
    if (isDict(appearances)) {
      var as = dict.get('AS');
      if (as && appearances.has(as.name)) {
        appearance = appearances.get(as.name);
      }
    } else {
      appearance = appearances;
    }
    return appearance;
  }

  function Annotation(params) {
    var dict = params.dict;

    this.setFlags(dict.get('F'));
    this.setRectangle(dict.get('Rect'));
    this.setColor(dict.get('C'));
    this.setBorderStyle(dict);
    this.appearance = getDefaultAppearance(dict);

    // Expose public properties using a data object.
    this.data = {};
    this.data.id = params.ref.toString();
    this.data.subtype = dict.get('Subtype').name;
    this.data.annotationFlags = this.flags;
    this.data.rect = this.rectangle;
    this.data.color = this.color;
    this.data.borderStyle = this.borderStyle;
    this.data.hasAppearance = !!this.appearance;

    // include action dictionary in annotation if exist
    var JS;
    var action = dict.get('A');
    if(action) {
      this.data.A = {
        S: action.get('S').name
      };
      if(action.has('T')) {
        this.data.A.T = action.get('T');
      }
      JS = action.get('JS');
      if(JS) {
        this.data.A.JS = convertJS(JS, this.data.id);
      }
    }

    var additionalActions = dict.get('AA');
    var Fo; // annotation receives input focus
    var Bl; // annotation loses input focus
    var K; // user modifies a character in a text field or combo box or modifies the selection in a scrollable list box
    var V; // run javascript when field value is changed
    var C; // run custom calculation script;
    if(additionalActions) {
      this.data.AA = {};
      if(additionalActions.has('Fo')) {
        Fo = additionalActions.get('Fo');
        this.data.AA.Fo = {
          S: Fo.get('S').name
        };
        if(Fo.has('JS')) {
          this.data.AA.Fo.JS = convertJS(Fo.get('JS'), this.data.id);
        }
      }
      if(additionalActions.has('Bl')) {
        Bl = additionalActions.get('Bl');
        this.data.AA.Bl = {
          S: Bl.get('S').name
        };
        if(Bl.has('JS')) {
          this.data.AA.Bl.JS = convertJS(Bl.get('JS'), this.data.id);
        }
      }
      if(additionalActions.has('K')) {
        K = additionalActions.get('K');
        this.data.AA.K = {
          S: K.get('S').name
        };
        if(K.has('JS')) {
          this.data.AA.K.JS = convertJS(K.get('JS'), this.data.id);
        }
      }
      if(additionalActions.has('V')) {
        V = additionalActions.get('V');
        this.data.AA.V = {
          S: V.get('S').name
        };
        if(V.has('JS')) {
          this.data.AA.V.JS = convertJS(V.get('JS'), this.data.id);
        }
      }
      if(additionalActions.has('C')) {
        C = additionalActions.get('C');
        this.data.AA.C = {
          S: C.get('S').name
        };
        if(C.has('JS')) {
          this.data.AA.C.JS = convertJS(C.get('JS'), this.data.id);
        }
      }
    }

    /**
     * Convert Acrobat JavaScript to browser compatible JavaScript
     */
    function convertJS(str, annotationId) {
      if (typeof str !== 'string') {
        str = sharedUtil.bytesToString(str.getBytes());
      }
      var newStr = '';
      newStr += 'try {';
      str = replaceGetField(str);
      str = replaceTextSize(str);
      str = replaceValueYes(str);
      str = replaceValueNo(str);
      str = replaceDisplayHidden(str);
      str = replaceDisplayVisible(str);
      str = replaceAlert(str);
      str = replaceFillColorRGB(str);
      str = replaceFillColorT(str);
      str = replaceRequired(str);
      str = replaceSetFocus(str);
      newStr += str;
      newStr += '} catch(ex) {console.log("Error executing javascript annotation for ' + annotationId + '"); console.log("Error message: " + ex)}';
      //console.log(newStr);
      return newStr;
    }

    // Replace the getField Property
    function replaceGetField(str) {
      var regexp = /(getField\(\"|this\.getField\(\")([A-Za-z0-9_\-\.\s]*)("\))/g;
      return str.replace(regexp, replace);

      function replace(match, p1, p2, p3) {
        return 'document.querySelector("[name=\'' + p2.trim() + '\']\")';
      }
    }

    // Replace the .textSize property
    function replaceTextSize(str) {
      var regexp = /(\.textSize\s\=\s)([0-9]*)/g;
      return str.replace(regexp, replace);

      function replace(match, p1, p2) {
        return '.setAttribute("maxlength", ' + p2 + ')';
      }
    }

    // Replace the .value=="Yes"
    function replaceValueYes(str) {
      var regexp = /\.value\s*==\s*\"Yes\"/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return '.checked === true';
      }
    }

    // Replace the .value=="No"
    function replaceValueNo(str) {
      var regexp = /\.value\s*==\s*\"No\"/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return '.checked === false';
      }
    }

    // Replace .display = display.hidden;
    function replaceDisplayHidden(str) {
      var regexp = /\.display\s*\=\s*display\.hidden/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return '.style.display = "none"';
      }
    }

    // Replace .display = display.visible;
    function replaceDisplayVisible(str) {
      var regexp = /\.display\s*\=\s*display\.visible/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return '.style.display = "block"';
      }
    }

    // Replace app.alert
    function replaceAlert(str) {
      var regexp = /app\.alert/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return 'window.alert';
      }
    }

    // Replace [field].fillColor = ['RGB'...]
    function replaceFillColorRGB(str) {
      var regexp = /(fillColor\s*\=\s*\[\')(RGB)\'\,\s*([0-9\.]+)\,\s*([0-9\.]+)\,\s*([0-9\.]+)\]/g;
      return str.replace(regexp, replace);

      function replace(match, p1, p2, p3, p4, p5) {
        return 'style["background-color"] = rgb(' + p3 + ', ' + p4 + ', ' + p5 + ')';
      }
    }

    // Replace [field].fillColor = ['T']
    function replaceFillColorT(str) {
      var regexp = /fillColor\s*\=\s*\[\'T\'\]/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return 'style["background-color"] = rgba(0,0,0,0)';
      }
    }

    // Replace [field].required = true/false
    function replaceRequired(str) {
      var regexp = /\.required\s*\=\s*(true|false)/g;
      return str.replace(regexp, replace);

      function replace(match, p1) {
        return '.setAttribute("required", ' + p1 + ')';
      }
    }

    // Replace [field].setFocus()
    function replaceSetFocus(str) {
      var regexp = /\.setFocus\(\)/g;
      return str.replace(regexp, replace);

      function replace(match) {
        return '.focus()';
      }
    }
  }

  Annotation.prototype = {
    /**
     * @return {boolean}
     */
    get viewable() {
      if (this.flags) {
        return !this.hasFlag(AnnotationFlag.INVISIBLE) &&
               !this.hasFlag(AnnotationFlag.HIDDEN) &&
               !this.hasFlag(AnnotationFlag.NOVIEW);
      }
      return true;
    },

    /**
     * @return {boolean}
     */
    get printable() {
      if (this.flags) {
        return this.hasFlag(AnnotationFlag.PRINT) &&
               !this.hasFlag(AnnotationFlag.INVISIBLE) &&
               !this.hasFlag(AnnotationFlag.HIDDEN);
      }
      return false;
    },

    /**
     * Set the flags.
     *
     * @public
     * @memberof Annotation
     * @param {number} flags - Unsigned 32-bit integer specifying annotation
     *                         characteristics
     * @see {@link shared/util.js}
     */
    setFlags: function Annotation_setFlags(flags) {
      if (isInt(flags)) {
        this.flags = flags;
      } else {
        this.flags = 0;
      }
    },

    /**
     * Check if a provided flag is set.
     *
     * @public
     * @memberof Annotation
     * @param {number} flag - Hexadecimal representation for an annotation
     *                        characteristic
     * @return {boolean}
     * @see {@link shared/util.js}
     */
    hasFlag: function Annotation_hasFlag(flag) {
      if (this.flags) {
        return (this.flags & flag) > 0;
      }
      return false;
    },

    /**
     * Set the rectangle.
     *
     * @public
     * @memberof Annotation
     * @param {Array} rectangle - The rectangle array with exactly four entries
     */
    setRectangle: function Annotation_setRectangle(rectangle) {
      if (isArray(rectangle) && rectangle.length === 4) {
        this.rectangle = Util.normalizeRect(rectangle);
      } else {
        this.rectangle = [0, 0, 0, 0];
      }
    },

    /**
     * Set the color and take care of color space conversion.
     *
     * @public
     * @memberof Annotation
     * @param {Array} color - The color array containing either 0
     *                        (transparent), 1 (grayscale), 3 (RGB) or
     *                        4 (CMYK) elements
     */
    setColor: function Annotation_setColor(color) {
      var rgbColor = new Uint8Array(3); // Black in RGB color space (default)
      if (!isArray(color)) {
        this.color = rgbColor;
        return;
      }

      switch (color.length) {
        case 0: // Transparent, which we indicate with a null value
          this.color = null;
          break;

        case 1: // Convert grayscale to RGB
          ColorSpace.singletons.gray.getRgbItem(color, 0, rgbColor, 0);
          this.color = rgbColor;
          break;

        case 3: // Convert RGB percentages to RGB
          ColorSpace.singletons.rgb.getRgbItem(color, 0, rgbColor, 0);
          this.color = rgbColor;
          break;

        case 4: // Convert CMYK to RGB
          ColorSpace.singletons.cmyk.getRgbItem(color, 0, rgbColor, 0);
          this.color = rgbColor;
          break;

        default:
          this.color = rgbColor;
          break;
      }
    },

    /**
     * Set the border style (as AnnotationBorderStyle object).
     *
     * @public
     * @memberof Annotation
     * @param {Dict} borderStyle - The border style dictionary
     */
    setBorderStyle: function Annotation_setBorderStyle(borderStyle) {
      this.borderStyle = new AnnotationBorderStyle();
      if (!isDict(borderStyle)) {
        return;
      }
      if (borderStyle.has('BS')) {
        var dict = borderStyle.get('BS');
        var dictType;

        if (!dict.has('Type') || (isName(dictType = dict.get('Type')) &&
                                  dictType.name === 'Border')) {
          this.borderStyle.setWidth(dict.get('W'));
          this.borderStyle.setStyle(dict.get('S'));
          this.borderStyle.setDashArray(dict.get('D'));
        }
      } else if (borderStyle.has('Border')) {
        var array = borderStyle.get('Border');
        if (isArray(array) && array.length >= 3) {
          this.borderStyle.setHorizontalCornerRadius(array[0]);
          this.borderStyle.setVerticalCornerRadius(array[1]);
          this.borderStyle.setWidth(array[2]);

          if (array.length === 4) { // Dash array available
            this.borderStyle.setDashArray(array[3]);
          }
        }
      } else {
        // There are no border entries in the dictionary. According to the
        // specification, we should draw a solid border of width 1 in that
        // case, but Adobe Reader did not implement that part of the
        // specification and instead draws no border at all, so we do the same.
        // See also https://github.com/mozilla/pdf.js/issues/6179.
        this.borderStyle.setWidth(0);
      }
    },

    /**
     * Prepare the annotation for working with a popup in the display layer.
     *
     * @private
     * @memberof Annotation
     * @param {Dict} dict - The annotation's data dictionary
     */
    _preparePopup: function Annotation_preparePopup(dict) {
      if (!dict.has('C')) {
        // Fall back to the default background color.
        this.data.color = null;
      }

      this.data.hasPopup = dict.has('Popup');
      this.data.title = stringToPDFString(dict.get('T') || '');
      this.data.contents = stringToPDFString(dict.get('Contents') || '');
    },

    loadResources: function Annotation_loadResources(keys) {
      return new Promise(function (resolve, reject) {
        this.appearance.dict.getAsync('Resources').then(function (resources) {
          if (!resources) {
            resolve();
            return;
          }
          var objectLoader = new ObjectLoader(resources.map,
                                              keys,
                                              resources.xref);
          objectLoader.load().then(function() {
            resolve(resources);
          }, reject);
        }, reject);
      }.bind(this));
    },

    getOperatorList: function Annotation_getOperatorList(evaluator, task) {
      if (!this.appearance) {
        return Promise.resolve(new OperatorList());
      }

      var data = this.data;
      var appearanceDict = this.appearance.dict;
      var resourcesPromise = this.loadResources([
        'ExtGState',
        'ColorSpace',
        'Pattern',
        'Shading',
        'XObject',
        'Font'
        // ProcSet
        // Properties
      ]);
      var bbox = appearanceDict.get('BBox') || [0, 0, 1, 1];
      var matrix = appearanceDict.get('Matrix') || [1, 0, 0, 1, 0 ,0];
      var transform = getTransformMatrix(data.rect, bbox, matrix);
      var self = this;

      return resourcesPromise.then(function(resources) {
          var opList = new OperatorList();
          opList.addOp(OPS.beginAnnotation, [data.rect, transform, matrix]);
          return evaluator.getOperatorList(self.appearance, task,
                                           resources, opList).
            then(function () {
              opList.addOp(OPS.endAnnotation, []);
              self.appearance.reset();
              return opList;
            });
        });
    }
  };

  Annotation.appendToOperatorList = function Annotation_appendToOperatorList(
      annotations, opList, partialEvaluator, task, intent) {
    var annotationPromises = [];
    for (var i = 0, n = annotations.length; i < n; ++i) {
      if ((intent === 'display' && annotations[i].viewable) ||
          (intent === 'print' && annotations[i].printable)) {
        annotationPromises.push(
          annotations[i].getOperatorList(partialEvaluator, task));
      }
    }
    return Promise.all(annotationPromises).then(function(operatorLists) {
      opList.addOp(OPS.beginAnnotations, []);
      for (var i = 0, n = operatorLists.length; i < n; ++i) {
        opList.addOpList(operatorLists[i]);
      }
      opList.addOp(OPS.endAnnotations, []);
    });
  };

  return Annotation;
})();

/**
 * Contains all data regarding an annotation's border style.
 *
 * @class
 */
var AnnotationBorderStyle = (function AnnotationBorderStyleClosure() {
  /**
   * @constructor
   * @private
   */
  function AnnotationBorderStyle() {
    this.width = 1;
    this.style = AnnotationBorderStyleType.SOLID;
    this.dashArray = [3];
    this.horizontalCornerRadius = 0;
    this.verticalCornerRadius = 0;
  }

  AnnotationBorderStyle.prototype = {
    /**
     * Set the width.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param {integer} width - The width
     */
    setWidth: function AnnotationBorderStyle_setWidth(width) {
      if (width === (width | 0)) {
        this.width = width;
      }
    },

    /**
     * Set the style.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param {Object} style - The style object
     * @see {@link shared/util.js}
     */
    setStyle: function AnnotationBorderStyle_setStyle(style) {
      if (!style) {
        return;
      }
      switch (style.name) {
        case 'S':
          this.style = AnnotationBorderStyleType.SOLID;
          break;

        case 'D':
          this.style = AnnotationBorderStyleType.DASHED;
          break;

        case 'B':
          this.style = AnnotationBorderStyleType.BEVELED;
          break;

        case 'I':
          this.style = AnnotationBorderStyleType.INSET;
          break;

        case 'U':
          this.style = AnnotationBorderStyleType.UNDERLINE;
          break;

        default:
          break;
      }
    },

    /**
     * Set the dash array.
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param {Array} dashArray - The dash array with at least one element
     */
    setDashArray: function AnnotationBorderStyle_setDashArray(dashArray) {
      // We validate the dash array, but we do not use it because CSS does not
      // allow us to change spacing of dashes. For more information, visit
      // http://www.w3.org/TR/css3-background/#the-border-style.
      if (isArray(dashArray) && dashArray.length > 0) {
        // According to the PDF specification: the elements in a dashArray
        // shall be numbers that are nonnegative and not all equal to zero.
        var isValid = true;
        var allZeros = true;
        for (var i = 0, len = dashArray.length; i < len; i++) {
          var element = dashArray[i];
          var validNumber = (+element >= 0);
          if (!validNumber) {
            isValid = false;
            break;
          } else if (element > 0) {
            allZeros = false;
          }
        }
        if (isValid && !allZeros) {
          this.dashArray = dashArray;
        } else {
          this.width = 0; // Adobe behavior when the array is invalid.
        }
      } else if (dashArray) {
        this.width = 0; // Adobe behavior when the array is invalid.
      }
    },

    /**
     * Set the horizontal corner radius (from a Border dictionary).
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param {integer} radius - The horizontal corner radius
     */
    setHorizontalCornerRadius:
        function AnnotationBorderStyle_setHorizontalCornerRadius(radius) {
      if (radius === (radius | 0)) {
        this.horizontalCornerRadius = radius;
      }
    },

    /**
     * Set the vertical corner radius (from a Border dictionary).
     *
     * @public
     * @memberof AnnotationBorderStyle
     * @param {integer} radius - The vertical corner radius
     */
    setVerticalCornerRadius:
        function AnnotationBorderStyle_setVerticalCornerRadius(radius) {
      if (radius === (radius | 0)) {
        this.verticalCornerRadius = radius;
      }
    }
  };

  return AnnotationBorderStyle;
})();

var WidgetAnnotation = (function WidgetAnnotationClosure() {
  function WidgetAnnotation(params) {
    Annotation.call(this, params);

    var dict = params.dict;
    var data = this.data;
    var fieldValue = Util.getInheritableProperty(dict, 'V');
    if(Array.isArray(fieldValue)) {
      data.fieldValue = fieldValue.join(',');
    } else {
      data.fieldValue = stringToPDFString(fieldValue || '');
    }
    data.annotationType = AnnotationType.WIDGET;
    data.alternativeText = stringToPDFString(dict.get('TU') || '');
    data.defaultAppearance = Util.getInheritableProperty(dict, 'DA') || '';
    var fieldType = Util.getInheritableProperty(dict, 'FT');
    data.fieldType = isName(fieldType) ? fieldType.name : '';
    data.fieldFlags = Util.getInheritableProperty(dict, 'Ff') || 0;
    this.fieldResources = Util.getInheritableProperty(dict, 'DR') || Dict.empty;

    // Widget signatures.
    if (data.fieldType === 'Sig') {
      
    }

    // additional entries specific to form fields
    function setButtonProperties() {
      var MK = dict.get('MK');
      data.label = MK.get('CA') || '';
    }
    function setCheckProperties() {
      try {
        // What is the default value?
        var defaultValue = dict.get('V') ? dict.get('V').name : 'Off';
        
        // Method 1 : Checkboxes depend on export_value and not 'Yes' to tell if they are checked, this comes from appearance options
        var appearanceState = dict.get('AP');
        if (appearanceState && isDict(appearanceState)) {
          var appearances = appearanceState.get('N');
          if (appearances && isDict(appearances)) {
            data.options = [];
            for (var key in appearances.map) {
              // Make sure Off is always the first state (by unshifting)
              if (key=='Off') data.options.unshift(key);
              else data.options.push(key);
            }
            if (data.options.length==1) data.options.unshift('Off'); { // Certain files only contain the on appearance
              data.selected = (data.options.length>=2) ? (defaultValue==data.options[1]): false;
            }
          }
        }

        // Method 2 : If the appearances failed, there may be an /AS key with the export_value (if selected)
        if (!data.options) {
          var as = dict.get('AS');
          if (as && as.name!='Off') {
            data.selected = (defaultValue==as.name);
            data.options = ['Off',as.name];
          }
        }
                
        // Method 3 : Give up, default back to the old method if the others didn't work (unlikely)
        if (!data.options) {
          data.selected = (defaultValue!='Off');
          data.options = ['Off','Yes'];
        }

      } catch(e) {
        data.selected = false;
        data.options = ['Off','Yes'];
      }
    }

    function setChoiceProperties() {
      data.allowTextEntry = data.fieldFlags === 393216 ? true : false; // bit position 18 & 19, combo box with editable text box
      data.multiSelect = data.fieldFlags === 2097152 ? true : false; // bit position 22, multiple select list box
      try {
        data.options = {};
        var opt = dict.get('Opt'); // get the dictionary options
        var selectedIndexes;
        for (var key in opt) {
          if (opt.hasOwnProperty(key)) {
            if (typeof(opt[key]) == 'object') {
              data.options[key] = {
                'value': opt[key][0],
                'text': opt[key][1]
              };
            } else {
              data.options[key] = {
                'value': opt[key],
                'text': opt[key]
              };
            }
          }
        }

        // determine selections
        selectedIndexes = dict.get('I');
        selectedIndexes.forEach(function(selectedIndex) {
          data.options[selectedIndex].selected = true;
        });
      } catch(e) {
        data.options=false;
      }
    }

    function setRadioProperties () {
      try {
        // What is the default value?
        var defaultValue = dict.get('AS') ? dict.get('AS').name : 'Off';
                
        // The value for the radio, should be the second key in the appearances map
        var appearanceState = dict.get('AP');
        if (appearanceState && isDict(appearanceState)) {
          var appearances = appearanceState.get('N');
          if (appearances && isDict(appearances)) {
            data.options = [];
            for (var key in appearances.map) {
              // Make sure Off is always the first state (by unshifting)
              if (key=='Off') data.options.unshift(key);
              else data.options.push(key);
            }
            if (data.options.length==1) data.options.unshift('Off'); { // Certain files only contain the on appearance
              data.selected = (data.options.length>=2) ? (defaultValue==data.options[1]): false;
            }
          }
        }
      }
      catch(e) {
        // This shouldn't happen, but if it was to somehow occur, we need a somewhat unique value for Yes
        data.options = ['Off','Yes_'+Math.round(Math.random() * 1000)];
        data.selected = false;
      }
    }

    function setTextProperties() {
      data.multiLine = data.fieldFlags & 4096 ? true : false;
      data.password = data.fieldFlags & 8192 ? true : false;
      data.fileUpload = data.fieldFlags & 1048576 ? true : false;
      data.richText = stringToPDFString(Util.getInheritableProperty(dict,'RV') || '');
      data.maxlen = stringToPDFString(Util.getInheritableProperty(dict,'MaxLen') || '');
      data.textAlignment = Util.getInheritableProperty(dict, 'Q');
    }

    function setSignatureProperties() {
      // get Lock dictionary
      var lock = Util.getInheritableProperty(dict, 'Lock');
      if(lock) {
        data.Lock = {
          Action: lock.get('Action').name
        };

        if(lock.has('Type')) {
          data.Lock.Type = lock.get('Type').name;
        }
        if(data.Lock.Action !== 'All') {
          data.Lock.Fields = lock.get('Fields');
        }
      }
    }

    var regularExp = /\/([\w]+) ([\d]+(\.[\d]+)?) Tf/;
    var fontResults;
    if (fontResults = regularExp.exec(data.defaultAppearance)) {
      if (fontResults[2] > 0) {
        data.fontSize = fontResults[2];
        data.fontFaceIndex = fontResults[1];
      }
    } else {
      data.fontSize = false;
      data.fontFaceIndex = false;
    }
    data.readOnly = data.fieldFlags & 1;
    data.required = data.fieldFlags & 2;
    data.noExport = data.fieldFlags & 4;
    data.originalName = stringToPDFString(Util.getInheritableProperty(dict,'T') || '');

    switch(data.fieldType) {
      case 'Tx':
        if (Util.getInheritableProperty(dict, 'PMD')) {
          data.paperMetaData = true;
          break; // PaperMetaData means this is a qrcode, datamatrix or similar, ignore
        }
        data.formElementType ='TEXT'; //text input
        break;
      case 'Btn':
        if ((data.fieldFlags & 32768)) {
          data.formElementType ='RADIO_BUTTON'; //radio button
        }
        else if (data.fieldFlags & 65536) {
          data.formElementType ='PUSH_BUTTON'; //push button
        }
        else {
          data.formElementType ='CHECK_BOX';  //checkbox
        }
        break;
      case 'Ch': // choice
        data.formElementType ='DROP_DOWN'; //drop down
        break;
      case 'Sig':
        data.formElementType = 'SIGNATURE';
        break;
    }

    switch(data.formElementType) {
      case 'PUSH_BUTTON':
        setButtonProperties();
        break;
      case 'CHECK_BOX':
        setCheckProperties();
        break;
      case 'RADIO_BUTTON':
        setRadioProperties();
        break;
      case 'DROP_DOWN':
        setChoiceProperties();
        break;
      case 'TEXT':
        setTextProperties();
        break;
      case 'SIGNATURE':
        setSignatureProperties();
        break;
    }

    if (typeof(this.data.formElementType)!=='undefined' && !this.hasFlag(AnnotationFlag.HIDDEN)) {
      data.hiddenForForms = true;   // Hidden by the forms rendering, but shown for a "print" intent
    }

    // Building the full field name by collecting the field and
    // its ancestors 'T' data and joining them using '.'.
    var fieldName = [];
    var namedItem = dict;
    var ref = params.ref;
    while (namedItem) {
      var parent = namedItem.get('Parent');
      var parentRef = namedItem.getRaw('Parent');
      var name = namedItem.get('T');
      if (name) {
        fieldName.unshift(stringToPDFString(name));
      } else if (parent && ref) {
        // The field name is absent, that means more than one field
        // with the same name may exist. Replacing the empty name
        // with the '`' plus index in the parent's 'Kids' array.
        // This is not in the PDF spec but necessary to id the
        // the input controls.
        var kids = parent.get('Kids');
        var j, jj;
        for (j = 0, jj = kids.length; j < jj; j++) {
          var kidRef = kids[j];
          if (kidRef.num === ref.num && kidRef.gen === ref.gen) {
            break;
          }
        }
        fieldName.unshift('`' + j);
      }
      namedItem = parent;
      ref = parentRef;
    }
    data.fullName = fieldName.join('.');
  }

  Util.inherit(WidgetAnnotation, Annotation, {});

  return WidgetAnnotation;
})();

var TextWidgetAnnotation = (function TextWidgetAnnotationClosure() {
  function TextWidgetAnnotation(params) {
    WidgetAnnotation.call(this, params);

    this.data.textAlignment = Util.getInheritableProperty(params.dict, 'Q');
  }

  Util.inherit(TextWidgetAnnotation, WidgetAnnotation, {
    getOperatorList: function TextWidgetAnnotation_getOperatorList(evaluator,
                                                                   task) {
      if (this.appearance) {
        return Annotation.prototype.getOperatorList.call(this, evaluator, task);
      }

      var opList = new OperatorList();
      var data = this.data;

      // Even if there is an appearance stream, ignore it. This is the
      // behaviour used by Adobe Reader.
      if (!data.defaultAppearance) {
        return Promise.resolve(opList);
      }

      var stream = new Stream(stringToBytes(data.defaultAppearance));
      return evaluator.getOperatorList(stream, task,
                                       this.fieldResources, opList).
        then(function () {
          return opList;
        });
    }
  });

  return TextWidgetAnnotation;
})();

var TextAnnotation = (function TextAnnotationClosure() {
  var DEFAULT_ICON_SIZE = 22; // px

  function TextAnnotation(parameters) {
    Annotation.call(this, parameters);

    this.data.annotationType = AnnotationType.TEXT;

    if (this.data.hasAppearance) {
      this.data.name = 'NoIcon';
    } else {
      this.data.rect[1] = this.data.rect[3] - DEFAULT_ICON_SIZE;
      this.data.rect[2] = this.data.rect[0] + DEFAULT_ICON_SIZE;
      this.data.name = parameters.dict.has('Name') ?
                       parameters.dict.get('Name').name : 'Note';
    }
    this._preparePopup(parameters.dict);
  }

  Util.inherit(TextAnnotation, Annotation, {});

  return TextAnnotation;
})();

var LinkAnnotation = (function LinkAnnotationClosure() {
  function LinkAnnotation(params) {
    Annotation.call(this, params);

    var dict = params.dict;
    var data = this.data;
    data.annotationType = AnnotationType.LINK;

    var action = dict.get('A');
    if (action && isDict(action)) {
      var linkType = action.get('S').name;
      if (linkType === 'URI') {
        var url = action.get('URI');
        if (isName(url)) {
          // Some bad PDFs do not put parentheses around relative URLs.
          url = '/' + url.name;
        } else if (url) {
          url = addDefaultProtocolToUrl(url);
        }
        // TODO: pdf spec mentions urls can be relative to a Base
        // entry in the dictionary.
        if (!isValidUrl(url, false)) {
          url = '';
        }
        // According to ISO 32000-1:2008, section 12.6.4.7,
        // URI should to be encoded in 7-bit ASCII.
        // Some bad PDFs may have URIs in UTF-8 encoding, see Bugzilla 1122280.
        try {
          data.url = stringToUTF8String(url);
        } catch (e) {
          // Fall back to a simple copy.
          data.url = url;
        }
      } else if (linkType === 'GoTo') {
        data.dest = action.get('D');
      } else if (linkType === 'GoToR') {
        var urlDict = action.get('F');
        if (isDict(urlDict)) {
          // We assume that the 'url' is a Filspec dictionary
          // and fetch the url without checking any further
          url = urlDict.get('F') || '';
        }

        // TODO: pdf reference says that GoToR
        // can also have 'NewWindow' attribute
        if (!isValidUrl(url, false)) {
          url = '';
        }
        data.url = url;
        data.dest = action.get('D');
      } else if (linkType === 'Named') {
        data.action = action.get('N').name;
      } else {
        warn('unrecognized link type: ' + linkType);
      }
    } else if (dict.has('Dest')) {
      // simple destination link
      var dest = dict.get('Dest');
      data.dest = isName(dest) ? dest.name : dest;
    }
  }

  // Lets URLs beginning with 'www.' default to using the 'http://' protocol.
  function addDefaultProtocolToUrl(url) {
    if (url && url.indexOf('www.') === 0) {
      return ('http://' + url);
    }
    return url;
  }

  Util.inherit(LinkAnnotation, Annotation, {});

  return LinkAnnotation;
})();

var PopupAnnotation = (function PopupAnnotationClosure() {
  function PopupAnnotation(parameters) {
    Annotation.call(this, parameters);

    this.data.annotationType = AnnotationType.POPUP;

    var dict = parameters.dict;
    var parentItem = dict.get('Parent');
    if (!parentItem) {
      warn('Popup annotation has a missing or invalid parent annotation.');
      return;
    }

    this.data.parentId = dict.getRaw('Parent').toString();
    this.data.title = stringToPDFString(parentItem.get('T') || '');
    this.data.contents = stringToPDFString(parentItem.get('Contents') || '');

    if (!parentItem.has('C')) {
      // Fall back to the default background color.
      this.data.color = null;
    } else {
      this.setColor(parentItem.get('C'));
      this.data.color = this.color;
    }
  }

  Util.inherit(PopupAnnotation, Annotation, {});

  return PopupAnnotation;
})();

var HighlightAnnotation = (function HighlightAnnotationClosure() {
  function HighlightAnnotation(parameters) {
    Annotation.call(this, parameters);

    this.data.annotationType = AnnotationType.HIGHLIGHT;
    this._preparePopup(parameters.dict);

    // PDF viewers completely ignore any border styles.
    this.data.borderStyle.setWidth(0);
  }

  Util.inherit(HighlightAnnotation, Annotation, {});

  return HighlightAnnotation;
})();

var UnderlineAnnotation = (function UnderlineAnnotationClosure() {
  function UnderlineAnnotation(parameters) {
    Annotation.call(this, parameters);

    this.data.annotationType = AnnotationType.UNDERLINE;
    this._preparePopup(parameters.dict);

    // PDF viewers completely ignore any border styles.
    this.data.borderStyle.setWidth(0);
  }

  Util.inherit(UnderlineAnnotation, Annotation, {});

  return UnderlineAnnotation;
})();

var SquigglyAnnotation = (function SquigglyAnnotationClosure() {
  function SquigglyAnnotation(parameters) {
    Annotation.call(this, parameters);

    this.data.annotationType = AnnotationType.SQUIGGLY;
    this._preparePopup(parameters.dict);

    // PDF viewers completely ignore any border styles.
    this.data.borderStyle.setWidth(0);
  }

  Util.inherit(SquigglyAnnotation, Annotation, {});

  return SquigglyAnnotation;
})();

var StrikeOutAnnotation = (function StrikeOutAnnotationClosure() {
  function StrikeOutAnnotation(parameters) {
    Annotation.call(this, parameters);

    this.data.annotationType = AnnotationType.STRIKEOUT;
    this._preparePopup(parameters.dict);

    // PDF viewers completely ignore any border styles.
    this.data.borderStyle.setWidth(0);
  }

  Util.inherit(StrikeOutAnnotation, Annotation, {});

  return StrikeOutAnnotation;
})();

var FileAttachmentAnnotation = (function FileAttachmentAnnotationClosure() {
  function FileAttachmentAnnotation(parameters) {
    Annotation.call(this, parameters);

    var file = new FileSpec(parameters.dict.get('FS'), parameters.xref);

    this.data.annotationType = AnnotationType.FILEATTACHMENT;
    this.data.file = file.serializable;
    this._preparePopup(parameters.dict);
  }

  Util.inherit(FileAttachmentAnnotation, Annotation, {});

  return FileAttachmentAnnotation;
})();

exports.Annotation = Annotation;
exports.AnnotationBorderStyle = AnnotationBorderStyle;
exports.AnnotationFactory = AnnotationFactory;
}));
