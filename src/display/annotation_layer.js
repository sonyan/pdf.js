/* Copyright 2014 Mozilla Foundation
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
/* globals PDFJS */

'use strict';

(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define('pdfjs/display/annotation_layer', ['exports', 'pdfjs/shared/util',
			'pdfjs/display/dom_utils'], factory);
	} else if (typeof exports !== 'undefined') {
		factory(exports, require('../shared/util.js'), require('./dom_utils.js'));
	} else {
		factory((root.pdfjsDisplayAnnotationLayer = {}), root.pdfjsSharedUtil,
			root.pdfjsDisplayDOMUtils);
	}
}(this, function (exports, sharedUtil, displayDOMUtils) {


/* InputCreateParameters
   @isHidden: indicates if the form element in question is a hidden field. Defaults to false.
	 @backgroundColor: background color for the container element. Defaults to white. 
	 @scale: the desired scale of the container. Defaults to 1.
 	 parameter structure for creating the container that holds the input form elements 
*/
/**
 * @typedef {Object} InputCreateParameters
 * @property {boolean} isHidden
 * @property {string} backgroundColor
 * @property {number} scale
 */
function InputCreateParameters(isHidden, backgroundColor, scale){
	return {
		isHidden: isHidden || false,
		backgroundColor: backgroundColor || 'RGB(255,255,255)',
		scale: 'scale(1)' || 'scale(' + scale + ')'
	}
};

var AnnotationBorderStyleType = sharedUtil.AnnotationBorderStyleType;
var AnnotationType = sharedUtil.AnnotationType;
var Util = sharedUtil.Util;
var addLinkAttributes = sharedUtil.addLinkAttributes;
var getFilenameFromUrl = sharedUtil.getFilenameFromUrl;
var warn = sharedUtil.warn;
var CustomStyle = displayDOMUtils.CustomStyle;

/**
 * @typedef {Object} AnnotationElementParameters
 * @property {Object} data
 * @property {HTMLDivElement} layer
 * @property {PDFPage} page
 * @property {PageViewport} viewport
 * @property {IPDFLinkService} linkService
 * @property {DownloadManager} downloadManager
 */

/**
 * @class
 * @alias AnnotationElementFactory
 */
function AnnotationElementFactory() {}
AnnotationElementFactory.prototype =
		/** @lends AnnotationElementFactory.prototype */ {
	/**
	 * @param {AnnotationElementParameters} parameters
	 * @returns {AnnotationElement}
	 */
	create: function AnnotationElementFactory_create(parameters) {
		var subtype = parameters.data.annotationType;

		switch (subtype) {
			case AnnotationType.LINK:
				return new LinkAnnotationElement(parameters);

			case AnnotationType.TEXT:
				return new TextAnnotationElement(parameters);

			case AnnotationType.WIDGET:
				return new WidgetAnnotationElement(parameters);

			case AnnotationType.POPUP:
				return new PopupAnnotationElement(parameters);

			case AnnotationType.HIGHLIGHT:
				return new HighlightAnnotationElement(parameters);

			case AnnotationType.UNDERLINE:
				return new UnderlineAnnotationElement(parameters);

			case AnnotationType.SQUIGGLY:
				return new SquigglyAnnotationElement(parameters);

			case AnnotationType.STRIKEOUT:
				return new StrikeOutAnnotationElement(parameters);

			case AnnotationType.FILEATTACHMENT:
				return new FileAttachmentAnnotationElement(parameters);

			default:
				return new AnnotationElement(parameters);
		}
	}
};

/**
 * @class
 * @alias AnnotationElement
 */
var AnnotationElement = (function AnnotationElementClosure() {
	function AnnotationElement(parameters, isRenderable) {
		this.isRenderable = isRenderable || false;
		this.data = parameters.data;
		this.layer = parameters.layer;
		this.page = parameters.page;
		this.viewport = parameters.viewport;
		this.linkService = parameters.linkService;
		this.downloadManager = parameters.downloadManager;

		if (isRenderable) {
			this.container = this._createContainer();
		}
	}

	AnnotationElement.prototype = /** @lends AnnotationElement.prototype */ {
		/**
		 * Create an empty container for the annotation's HTML element.
		 *
		 * @private
		 * @memberof AnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		_createContainer: function AnnotationElement_createContainer() {
			var data = this.data, page = this.page, viewport = this.viewport;
			var container = document.createElement('section');
			var width = data.rect[2] - data.rect[0];
			var height = data.rect[3] - data.rect[1];

			container.setAttribute('data-annotation-id', data.id);

			// Do *not* modify `data.rect`, since that will corrupt the annotation
			// position on subsequent calls to `_createContainer` (see issue 6804).
			var rect = Util.normalizeRect([
				data.rect[0],
				page.view[3] - data.rect[1] + page.view[1],
				data.rect[2],
				page.view[3] - data.rect[3] + page.view[1]
			]);

			CustomStyle.setProp('transform', container,
													'matrix(' + viewport.transform.join(',') + ')');
			CustomStyle.setProp('transformOrigin', container,
													-rect[0] + 'px ' + -rect[1] + 'px');

			if (data.borderStyle.width > 0) {
				container.style.borderWidth = data.borderStyle.width + 'px';
				if (data.borderStyle.style !== AnnotationBorderStyleType.UNDERLINE) {
					// Underline styles only have a bottom border, so we do not need
					// to adjust for all borders. This yields a similar result as
					// Adobe Acrobat/Reader.
					width = width - 2 * data.borderStyle.width;
					height = height - 2 * data.borderStyle.width;
				}

				var horizontalRadius = data.borderStyle.horizontalCornerRadius;
				var verticalRadius = data.borderStyle.verticalCornerRadius;
				if (horizontalRadius > 0 || verticalRadius > 0) {
					var radius = horizontalRadius + 'px / ' + verticalRadius + 'px';
					CustomStyle.setProp('borderRadius', container, radius);
				}

				switch (data.borderStyle.style) {
					case AnnotationBorderStyleType.SOLID:
						container.style.borderStyle = 'solid';
						break;

					case AnnotationBorderStyleType.DASHED:
						container.style.borderStyle = 'dashed';
						break;

					case AnnotationBorderStyleType.BEVELED:
						warn('Unimplemented border style: beveled');
						break;

					case AnnotationBorderStyleType.INSET:
						warn('Unimplemented border style: inset');
						break;

					case AnnotationBorderStyleType.UNDERLINE:
						container.style.borderBottomStyle = 'solid';
						break;

					default:
						break;
				}
				
				if (data.color) {
					container.style.borderColor =
						Util.makeCssRgb(data.color[0] | 0,
														data.color[1] | 0,
														data.color[2] | 0);
				} else {
					// Transparent (invisible) border, so do not draw it at all.
					container.style.borderWidth = 0;
				}
			}

			container.style.left = rect[0] + 'px';
			container.style.top = rect[1] + 'px';

			container.style.width = width + 'px';
			container.style.height = height + 'px';

			return container;
		},

		/**
		 * Create a popup for the annotation's HTML element. This is used for
		 * annotations that do not have a Popup entry in the dictionary, but
		 * are of a type that works with popups (such as Highlight annotations).
		 *
		 * @private
		 * @param {HTMLSectionElement} container
		 * @param {HTMLDivElement|HTMLImageElement|null} trigger
		 * @param {Object} data
		 * @memberof AnnotationElement
		 */
		_createPopup:
				function AnnotationElement_createPopup(container, trigger, data) {
			// If no trigger element is specified, create it.
			if (!trigger) {
				trigger = document.createElement('div');
				trigger.style.height = container.style.height;
				trigger.style.width = container.style.width;
				container.appendChild(trigger);
			}

			var popupElement = new PopupElement({
				container: container,
				trigger: trigger,
				color: data.color,
				title: data.title,
				contents: data.contents,
				hideWrapper: true
			});
			var popup = popupElement.render();

			// Position the popup next to the annotation's container.
			popup.style.left = container.style.width;

			container.appendChild(popup);
		},

		/**
		 * Render the annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof AnnotationElement
		 */
		render: function AnnotationElement_render() {
			throw new Error('Abstract method AnnotationElement.render called');
		}
	};

	return AnnotationElement;
})();

/**
 * @class
 * @alias LinkAnnotationElement
 */
var LinkAnnotationElement = (function LinkAnnotationElementClosure() {
	function LinkAnnotationElement(parameters) {
		AnnotationElement.call(this, parameters, true);
	}

	Util.inherit(LinkAnnotationElement, AnnotationElement, {
		/**
		 * Render the link annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof LinkAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function LinkAnnotationElement_render() {
			this.container.className = 'linkAnnotation';

			var link = document.createElement('a');
			addLinkAttributes(link, { url: this.data.url });

			if (!this.data.url) {
				if (this.data.action) {
					this._bindNamedAction(link, this.data.action);
				} else {
					this._bindLink(link, ('dest' in this.data) ? this.data.dest : null);
				}
			}

			this.container.appendChild(link);
			return this.container;
		},

		/**
		 * Bind internal links to the link element.
		 *
		 * @private
		 * @param {Object} link
		 * @param {Object} destination
		 * @memberof LinkAnnotationElement
		 */
		_bindLink: function LinkAnnotationElement_bindLink(link, destination) {
			var self = this;

			link.href = this.linkService.getDestinationHash(destination);
			link.onclick = function() {
				if (destination) {
					self.linkService.navigateTo(destination);
				}
				return false;
			};
			if (destination) {
				link.className = 'internalLink';
			}
		},

		/**
		 * Bind named actions to the link element.
		 *
		 * @private
		 * @param {Object} link
		 * @param {Object} action
		 * @memberof LinkAnnotationElement
		 */
		_bindNamedAction:
				function LinkAnnotationElement_bindNamedAction(link, action) {
			var self = this;

			link.href = this.linkService.getAnchorUrl('');
			link.onclick = function() {
				self.linkService.executeNamedAction(action);
				return false;
			};
			link.className = 'internalLink';
		}
	});

	return LinkAnnotationElement;
})();

/**
 * @class
 * @alias TextAnnotationElement
 */
var TextAnnotationElement = (function TextAnnotationElementClosure() {
	function TextAnnotationElement(parameters) {
		var isRenderable = !!(parameters.data.hasPopup ||
													parameters.data.title || parameters.data.contents);
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(TextAnnotationElement, AnnotationElement, {
		/**
		 * Render the text annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof TextAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function TextAnnotationElement_render() {
			this.container.className = 'textAnnotation';
			var image = document.createElement('img');
			image.style.height = this.container.style.height;
			image.style.width = this.container.style.width;
			image.src = PDFJS.imageResourcesPath + 'annotation-' +
				this.data.name.toLowerCase() + '.svg';
			image.alt = '[{{type}} Annotation]';
			image.dataset.l10nId = 'text_annotation_type';
			image.dataset.l10nArgs = JSON.stringify({type: this.data.name});

			if (!this.data.hasPopup) {
				this._createPopup(this.container, image, this.data);
			}

			this.container.appendChild(image);
			return this.container;
		}
	});

	return TextAnnotationElement;
})();

/**
 * @class
 * @alias WidgetAnnotationElement
 */
var WidgetAnnotationElement = (function WidgetAnnotationElementClosure() {
	function WidgetAnnotationElement(parameters) {
		var isRenderable = !parameters.data.hasAppearance &&
											 !!parameters.data.fieldValue;
											 isRenderable = true;
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(WidgetAnnotationElement, AnnotationElement, {
		/**
		 * Render the widget annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof WidgetAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function WidgetAnnotationElement_render() {
			var content;
			var fieldType = this.data.fieldType;
			var fieldFlags = this.data.fieldFlags;
			
			this._injectCommonScripts();
			
			if(fieldType == 'Tx' && !this.data.paperMetaData) {// PaperMetaData means a qrcode, datamatrix or similar... ignored
				content = this._createInputTextElement();
			} else if(fieldType == 'Btn') {
				if ((fieldFlags & 32768) || (fieldFlags & 49152)) {
					content = this._createRadioButtonElement(); //radio button
				} else if (fieldFlags & 65536) {
					content = this._createPushButtonElement(); //push button
				} else {
					content = this._createCheckboxElement();  //checkbox
				}
			} else if(fieldType == 'Ch') { // choice
				content = this._createDropdownElement();
			} else if(fieldType == 'Sig') {
				content = this._createSignatureElement();
			} else {
				content = this._createDefaultContent();
			}
						
			this.container.appendChild(content);
			
			return this.container;
		},

		_createDefaultContent: function() {
			var content = document.createElement('div');
			content.textContent = this.data.fieldValue;
			var textAlignment = this.data.textAlignment;
			content.style.textAlign = ['left', 'center', 'right'][textAlignment];
			content.style.verticalAlign = 'middle';
			content.style.display = 'table-cell';
			this._setTextStyle(content);

			return content;
		},

		_createInputTextElement: function() {
			var control;
			var parameters = new InputCreateParameters(false, 'transparent', 1) ;
			
			var container = this._createInputContainer(parameters);
			container.style.transform = 'scale(1)';
			if (this.data.multiLine && this.data.hasAppearance) {
				control = document.createElement('textarea');
				control.style.resize = "none";
				// if(!this.data.hasAppearance){
				// 	control.style.display = 'none';
				// }
			} else {
				control = document.createElement('input');
				if (this.data.fileUpload) {
					control.type='file';
				} else if (this.data.password) {
					control.type='password';
				}else if (!this.data.hasAppearance){
					control.type = 'text';
				//}else if(this.data.op)
				} else {
					control.type='text';
				}
			}

			control.id = this.data.fullName;
			control.name = this.data.fullName;
			control.value = this.data.fieldValue;
			this._setTextStyle(control);
			this._setDimension(control);
			
			if(!this.data.hasAppearance && this.data.hiddenField){
				control.style.display = 'none';
				//container.style.display = 'none';
			}else{
				container.style.display = 'block';
			}
			if (this.data.maxlen) {
				control.maxLength = this.data.maxlen; // not currently support
			}
			if (this.data.readOnly) {
				control.readOnly = true;
				control.style.cursor = "not-allowed";
			}

			// execute any action javascript
			this._applyActionScripts(control);
			
			
			container.appendChild(control);
			return container;
		},
		parseInputName: function(n){
                var name = '';
                var dot = n.indexOf('.');
                if(dot >= 0){
                    name = n.substring(0, dot);
                }
                name = name.split(' ').join(' ', '_');
                
                return name;
            },
	 
	  _createInputContainer: function(parameters){
			
			var transform = '1.1';
			var container = document.createElement('div');
			this._setDimension(container);
			container.style.backgroundColor = parameters.backgroundColor;
			container.style.transform = parameters.scale;
			
			container.style['-webkit-transform'] = parameters.scale;  /* Saf3.1+, Chrome */
     container.style['-moz-transform'] = parameters.scale; /* FF3.5+ */
		 container.style['-ms-transform'] = parameters.scale; /* IE9 */
		 container.style['-o-transform'] = parameters.scale; /* Opera 10.5+ */
		 
			return container;			
		},
						
		_createRadioButtonElement: function() {
				var container = this._createInputContainer( new InputCreateParameters() );
				
				var input = document.createElement('input');
				input.type = 'radio';
				input.name = this.parseInputName(this.data.fullName);
				input.id = this.data.fullName;
				input.value = this.data.fieldValue;
				input.style.padding = '0';
				input.style.margin = '0';
				input.style.border = '1px solid #E6E6E6 ';
				input.style.display = 'block';
				input.style.boxSizing = 'border-box';
				input.style.fontSize = '9px';
				input.style.fontWeight = 'normal';
				
				this._setDimension(input);
				
				this._applyActionScripts(input);
				
				container.appendChild(input);
				return container;
		},

		_createPushButtonElement: function() {
			var control = document.createElement('button');
			
			control.id = this.parseInputName(this.data.fullName);
			control.name = this.parseInputName(this.data.fullName);
			control.innerHTML = this.data.label;
			this._setDimension(control);
			this._setTextStyle(control);
			this._applyActionScripts(control);
			return control;
		},

		_createCheckboxElement: function() {
												
			var container = this._createInputContainer( new InputCreateParameters() );														
			var input = document.createElement('input');
			input.type = 'checkbox';
			input.name = this.data.fullName;
			input.id = this.parseInputName(this.data.fullName);
			input.value = this.data.fieldValue;
			
			input.style.margin = '0';
			input.style.border = '1px solid #E6E6E6 ';
			input.style.display = 'block';
			input.style.boxSizing = 'border-box';
			input.style.fontSize = '9px';
			input.style.fontWeight = 'normal';
			
			this._setDimension(input);
			
			this._applyActionScripts(input);
			
			container.appendChild(input);
			return container;
		},

		_createDropdownElement: function() {
			
			var control = document.createElement('input');
			control.type = 'text';
			
			var datalist = document.createElement('datalist');
			datalist.id = this.data.fullName + '.datalist';
			
			control.id = this.data.fullName;
			control.setAttribute('list', datalist.id);
			
			if (this.data.multiSelect) {
				control.multiple = true;
			}
			this._setDimension(control);
			this._setTextStyle(control);
			if (this.data.options) {
				for (var key in this.data.options) {
					var optionElement = document.createElement('option');
					var option = this.data.options[key];
					optionElement.value = option.value;
					optionElement.text = option.text;
					optionElement.selected = option.selected || false;
					datalist.appendChild(optionElement);
				}
			}
			control.appendChild(datalist);
			if (this.data.readOnly) {
				control.disabled = 'disabled';
				control.style.cursor = "not-allowed";
			}

			// execute any action javascript
			this._applyActionScripts(control);

			return control;
		},
		
		_scriptMap: [],
		
		_createSignatureElement: function() {
			var control = document.createElement('div');
			var image = document.createElement('img');
			var button = document.createElement('button');

			this._setDimension(control);
			this._setDimension(image);
			image.id = this.data.fullName;
			image.style.display = 'none';
			this.signatureImage = image;
			control.appendChild(image);
			button.innerHTML = 'Click here to sign';
			button.addEventListener('click', function() {
				// use signature pad to sign
				SignaturePrompt.onSave = this._handleSignatureSave.bind(this);
				SignaturePrompt.open();
			}.bind(this));
			this.signatureButton = button;
			control.appendChild(button);

			this._applyActionScripts(control);

			return control;
		},

		_handleSignatureSave: function(dataUrl) {
			this.signatureImage.src = dataUrl;
			this.signatureImage.style.display = 'block';
			this.signatureButton.style.display = 'none';
		},

		_applyActionScripts: function(element) {
			
			if(element === undefined){
				return;
			}
			// Create a script node for this control
			 var scriptId = element.id + '_js';
			 var node = document.getElementById(scriptId) || document.createElement('script');
			 node.type = "text/javascript";
			 node.id = scriptId; // some arbitrary identifier to make it easy to find
			 var hasScript = false;
			
			if(this.data.A && this.data.A.JS) {
				 hasScript = true;
				 node.text += "document.querySelector(\"[id='" + element.id + "']\").addEventListener('click', function(){ " + this.data.A.JS + "; onStyleChanged()}, false);";
				// element.addEventListener('click', function() {
				// 	eval(this.data.A.JS);
				// }.bind(this));
			}

			if (this.data.AA) {
				
				// the function onStyleChanged() is added to the page when the document is rendered.
				  
				if(this.data.AA.Fo && this.data.AA.Fo.JS) {
					hasScript = true;
					node.text += "document.querySelector(\"[id='" + element.id + "']\").addEventListener('focus', function(){   " + this.data.AA.Fo.JS + "; onStyleChanged()}, false);";
					// element.addEventListener('focus', function() {
					// 	eval(this.data.AA.Fo.JS);
					// }.bind(this));
				}
				if(this.data.AA.Bl && this.data.AA.Bl.JS) {
					hasScript = true;
					node.text += "document.querySelector(\"[id='" + element.id + "']\").addEventListener('blur', function(){ " + this.data.AA.Bl.JS + "; onStyleChanged()}, false);";
					// element.addEventListener('blur', function() {
					// 	eval(this.data.AA.Bl.JS);
					// }.bind(this));
				}
				if(this.data.AA && this.data.AA.V && this.data.AA.V.JS) {
					hasScript = true;
					node.text += "document.querySelector(\"[id='" + element.id + "']\").addEventListener('change', function(){ " + this.data.AA.V.JS + "; onStyleChanged()}, false);";
					// element.addEventListener('change', function() {
					// 	eval(this.data.AA.V.JS);
					// }.bind(this));
				}
				
			}
	
			if(hasScript){
					this._scriptMap.push(node);
				}
		},
		
		sdCommonScriptID: 'sdCommonScripts',
		
		_injectCommonScripts: function(){
			
			if(document.getElementById(this.sdCommonScriptID)) return;						
			
			var node = document.createElement('script');
			node.innerText += 'window.getField = function(el){return document.getElementById(el);}; '; 
			node.innerText += "window.onStyleChanged = function(){ var inputs = document.querySelectorAll('input[type=\"text\"]'); for(var i=0; i< inputs.length; i++){   var input = inputs[i]; if(!input.parentElement) continue; input.parentElement.style.backgroundColor = (input.style.display == 'none') ? '#ffffff' : 'transparent'; } ; };";
			
			node.id = this.sdCommonScriptID;
			document.head.appendChild(node);
		},
		
		_setDimension: function(element) {
			element.style.width = '100%';
			element.style.height = '100%';
			element.style.padding = '0';
			element.style.margin = '0';
			element.style.display = 'block';
			element.style.boxSizing = 'border-box';
		},

		/**
		 * Apply text styles to the text in the element.
		 *
		 * @private
		 * @param {HTMLDivElement} element
		 * @param {Object} font
		 * @memberof WidgetAnnotationElement
		 */
		_setTextStyle:
				function WidgetAnnotationElement_setTextStyle(element) {
			// TODO: This duplicates some of the logic in CanvasGraphics.setFont().
			var font = (this.data.fontRefName ?
				this.page.commonObjs.getData(this.data.fontRefName) : null);
			var style = element.style;
			style.fontSize = this.data.fontSize + 'px';
			style.direction = (this.data.fontDirection < 0 ? 'rtl': 'ltr');

			if (!font) {
				return;
			}

			style.fontWeight = (font.black ?
				(font.bold ? '900' : 'bold') :
				(font.bold ? 'bold' : 'normal'));
			style.fontStyle = (font.italic ? 'italic' : 'normal');

			// Use a reasonable default font if the font doesn't specify a fallback.
			var fontFamily = font.loadedName ? '"' + font.loadedName + '", ' : '';
			var fallbackName = font.fallbackName || 'Helvetica, sans-serif';
			style.fontFamily = fontFamily + fallbackName;
		}
	});

	return WidgetAnnotationElement;
})();

/**
 * @class
 * @alias PopupAnnotationElement
 */
var PopupAnnotationElement = (function PopupAnnotationElementClosure() {
	function PopupAnnotationElement(parameters) {
		var isRenderable = !!(parameters.data.title || parameters.data.contents);
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(PopupAnnotationElement, AnnotationElement, {
		/**
		 * Render the popup annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof PopupAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function PopupAnnotationElement_render() {
			this.container.className = 'popupAnnotation';

			var selector = '[data-annotation-id="' + this.data.parentId + '"]';
			var parentElement = this.layer.querySelector(selector);
			if (!parentElement) {
				return this.container;
			}

			var popup = new PopupElement({
				container: this.container,
				trigger: parentElement,
				color: this.data.color,
				title: this.data.title,
				contents: this.data.contents
			});

			// Position the popup next to the parent annotation's container.
			// PDF viewers ignore a popup annotation's rectangle.
			var parentLeft = parseFloat(parentElement.style.left);
			var parentWidth = parseFloat(parentElement.style.width);
			CustomStyle.setProp('transformOrigin', this.container,
													-(parentLeft + parentWidth) + 'px -' +
													parentElement.style.top);
			this.container.style.left = (parentLeft + parentWidth) + 'px';

			this.container.appendChild(popup.render());
			return this.container;
		}
	});

	return PopupAnnotationElement;
})();

/**
 * @class
 * @alias PopupElement
 */
var PopupElement = (function PopupElementClosure() {
	var BACKGROUND_ENLIGHT = 0.7;

	function PopupElement(parameters) {
		this.container = parameters.container;
		this.trigger = parameters.trigger;
		this.color = parameters.color;
		this.title = parameters.title;
		this.contents = parameters.contents;
		this.hideWrapper = parameters.hideWrapper || false;

		this.pinned = false;
	}

	PopupElement.prototype = /** @lends PopupElement.prototype */ {
		/**
		 * Render the popup's HTML element.
		 *
		 * @public
		 * @memberof PopupElement
		 * @returns {HTMLSectionElement}
		 */
		render: function PopupElement_render() {
			var wrapper = document.createElement('div');
			wrapper.className = 'popupWrapper';

			// For Popup annotations we hide the entire section because it contains
			// only the popup. However, for Text annotations without a separate Popup
			// annotation, we cannot hide the entire container as the image would
			// disappear too. In that special case, hiding the wrapper suffices.
			this.hideElement = (this.hideWrapper ? wrapper : this.container);
			this.hideElement.setAttribute('hidden', true);

			var popup = document.createElement('div');
			popup.className = 'popup';

			var color = this.color;
			if (color) {
				// Enlighten the color.
				var r = BACKGROUND_ENLIGHT * (255 - color[0]) + color[0];
				var g = BACKGROUND_ENLIGHT * (255 - color[1]) + color[1];
				var b = BACKGROUND_ENLIGHT * (255 - color[2]) + color[2];
				popup.style.backgroundColor = Util.makeCssRgb(r | 0, g | 0, b | 0);
			}

			var contents = this._formatContents(this.contents);
			var title = document.createElement('h1');
			title.textContent = this.title;

			// Attach the event listeners to the trigger element.
			this.trigger.addEventListener('click', this._toggle.bind(this));
			this.trigger.addEventListener('mouseover', this._show.bind(this, false));
			this.trigger.addEventListener('mouseout', this._hide.bind(this, false));
			popup.addEventListener('click', this._hide.bind(this, true));

			popup.appendChild(title);
			popup.appendChild(contents);
			wrapper.appendChild(popup);
			return wrapper;
		},

		/**
		 * Format the contents of the popup by adding newlines where necessary.
		 *
		 * @private
		 * @param {string} contents
		 * @memberof PopupElement
		 * @returns {HTMLParagraphElement}
		 */
		_formatContents: function PopupElement_formatContents(contents) {
			var p = document.createElement('p');
			var lines = contents.split(/(?:\r\n?|\n)/);
			for (var i = 0, ii = lines.length; i < ii; ++i) {
				var line = lines[i];
				p.appendChild(document.createTextNode(line));
				if (i < (ii - 1)) {
					p.appendChild(document.createElement('br'));
				}
			}
			return p;
		},

		/**
		 * Toggle the visibility of the popup.
		 *
		 * @private
		 * @memberof PopupElement
		 */
		_toggle: function PopupElement_toggle() {
			if (this.pinned) {
				this._hide(true);
			} else {
				this._show(true);
			}
		},

		/**
		 * Show the popup.
		 *
		 * @private
		 * @param {boolean} pin
		 * @memberof PopupElement
		 */
		_show: function PopupElement_show(pin) {
			if (pin) {
				this.pinned = true;
			}
			if (this.hideElement.hasAttribute('hidden')) {
				this.hideElement.removeAttribute('hidden');
				this.container.style.zIndex += 1;
			}
		},

		/**
		 * Hide the popup.
		 *
		 * @private
		 * @param {boolean} unpin
		 * @memberof PopupElement
		 */
		_hide: function PopupElement_hide(unpin) {
			if (unpin) {
				this.pinned = false;
			}
			if (!this.hideElement.hasAttribute('hidden') && !this.pinned) {
				this.hideElement.setAttribute('hidden', true);
				this.container.style.zIndex -= 1;
			}
		}
	};

	return PopupElement;
})();

/**
 * @class
 * @alias HighlightAnnotationElement
 */
var HighlightAnnotationElement = (
		function HighlightAnnotationElementClosure() {
	function HighlightAnnotationElement(parameters) {
		var isRenderable = !!(parameters.data.hasPopup ||
													parameters.data.title || parameters.data.contents);
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(HighlightAnnotationElement, AnnotationElement, {
		/**
		 * Render the highlight annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof HighlightAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function HighlightAnnotationElement_render() {
			this.container.className = 'highlightAnnotation';

			if (!this.data.hasPopup) {
				this._createPopup(this.container, null, this.data);
			}

			return this.container;
		}
	});

	return HighlightAnnotationElement;
})();

/**
 * @class
 * @alias UnderlineAnnotationElement
 */
var UnderlineAnnotationElement = (
		function UnderlineAnnotationElementClosure() {
	function UnderlineAnnotationElement(parameters) {
		var isRenderable = !!(parameters.data.hasPopup ||
													parameters.data.title || parameters.data.contents);
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(UnderlineAnnotationElement, AnnotationElement, {
		/**
		 * Render the underline annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof UnderlineAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function UnderlineAnnotationElement_render() {
			this.container.className = 'underlineAnnotation';

			if (!this.data.hasPopup) {
				this._createPopup(this.container, null, this.data);
			}

			return this.container;
		}
	});

	return UnderlineAnnotationElement;
})();

/**
 * @class
 * @alias SquigglyAnnotationElement
 */
var SquigglyAnnotationElement = (function SquigglyAnnotationElementClosure() {
	function SquigglyAnnotationElement(parameters) {
		var isRenderable = !!(parameters.data.hasPopup ||
													parameters.data.title || parameters.data.contents);
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(SquigglyAnnotationElement, AnnotationElement, {
		/**
		 * Render the squiggly annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof SquigglyAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function SquigglyAnnotationElement_render() {
			this.container.className = 'squigglyAnnotation';

			if (!this.data.hasPopup) {
				this._createPopup(this.container, null, this.data);
			}

			return this.container;
		}
	});

	return SquigglyAnnotationElement;
})();

/**
 * @class
 * @alias StrikeOutAnnotationElement
 */
var StrikeOutAnnotationElement = (
		function StrikeOutAnnotationElementClosure() {
	function StrikeOutAnnotationElement(parameters) {
		var isRenderable = !!(parameters.data.hasPopup ||
													parameters.data.title || parameters.data.contents);
		AnnotationElement.call(this, parameters, isRenderable);
	}

	Util.inherit(StrikeOutAnnotationElement, AnnotationElement, {
		/**
		 * Render the strikeout annotation's HTML element in the empty container.
		 *
		 * @public
		 * @memberof StrikeOutAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function StrikeOutAnnotationElement_render() {
			this.container.className = 'strikeoutAnnotation';

			if (!this.data.hasPopup) {
				this._createPopup(this.container, null, this.data);
			}

			return this.container;
		}
	});

	return StrikeOutAnnotationElement;
})();

/**
 * @class
 * @alias FileAttachmentAnnotationElement
 */
var FileAttachmentAnnotationElement = (
		function FileAttachmentAnnotationElementClosure() {
	function FileAttachmentAnnotationElement(parameters) {
		AnnotationElement.call(this, parameters, true);

		this.filename = getFilenameFromUrl(parameters.data.file.filename);
		this.content = parameters.data.file.content;
	}

	Util.inherit(FileAttachmentAnnotationElement, AnnotationElement, {
		/**
		 * Render the file attachment annotation's HTML element in the empty
		 * container.
		 *
		 * @public
		 * @memberof FileAttachmentAnnotationElement
		 * @returns {HTMLSectionElement}
		 */
		render: function FileAttachmentAnnotationElement_render() {
			this.container.className = 'fileAttachmentAnnotation';

			var trigger = document.createElement('div');
			trigger.style.height = this.container.style.height;
			trigger.style.width = this.container.style.width;
			trigger.addEventListener('dblclick', this._download.bind(this));

			if (!this.data.hasPopup && (this.data.title || this.data.contents)) {
				this._createPopup(this.container, trigger, this.data);
			}

			this.container.appendChild(trigger);
			return this.container;
		},

		/**
		 * Download the file attachment associated with this annotation.
		 *
		 * @private
		 * @memberof FileAttachmentAnnotationElement
		 */
		_download: function FileAttachmentAnnotationElement_download() {
			if (!this.downloadManager) {
				warn('Download cannot be started due to unavailable download manager');
				return;
			}
			this.downloadManager.downloadData(this.content, this.filename, '');
		}
	});

	return FileAttachmentAnnotationElement;
})();

/**
 * @typedef {Object} AnnotationLayerParameters
 * @property {PageViewport} viewport
 * @property {HTMLDivElement} div
 * @property {Array} annotations
 * @property {PDFPage} page
 * @property {IPDFLinkService} linkService
 */

/**
 * @class
 * @alias AnnotationLayer
 */
var AnnotationLayer = (function AnnotationLayerClosure() {
	return {
		/**
		 * Render a new annotation layer with all annotation elements.
		 *
		 * @public
		 * @param {AnnotationLayerParameters} parameters
		 * @memberof AnnotationLayer
		 */
		render: function AnnotationLayer_render(parameters) {
			var annotationElementFactory = new AnnotationElementFactory();
			
			// Array for gathering script nodes built durrent widget annotation construction
			var scriptMap = [];
			
			for (var i = 0, ii = parameters.annotations.length; i < ii; i++) {
				var data = parameters.annotations[i];
				if (!data) {
					continue;
				}

				var properties = {
					data: data,
					layer: parameters.div,
					page: parameters.page,
					viewport: parameters.viewport,
					linkService: parameters.linkService,
					downloadManager: parameters.downloadManager
				};
				
				var element = annotationElementFactory.create(properties);
				if (element.isRenderable) {
					
					//debugger;
					var node = element.render();
					if(node.childNodes && node.childNodes.length == 1){
						var input = node.childNodes[0].childNodes[0];
						if(input){
					//		debugger;
							// input.junk = 'test';
							// input.addEventListener('DOMAttrModified', function(e){
							// 	if (e.attrName === 'style') {
							// 		console.log('prevValue: ' + e.prevValue, 'newValue: ' + e.newValue);
							// 	}
							// }, false);
						}
					}
					parameters.div.appendChild(node);
				}
				
				// Collect the scripts that were build while building the widget annotations
				if(element._scriptMap){
					for(var j=0; j< element._scriptMap.length; j++){
						scriptMap.push(element._scriptMap[j])						
					}
				}
			}
			
			// Inject the scripts into the DOM
			for(var i=0; i< scriptMap.length; i++){
					document.head.appendChild(scriptMap[i]);
				}
      
		},

		/**
		 * Update the annotation elements on existing annotation layer.
		 *
		 * @public
		 * @param {AnnotationLayerParameters} parameters
		 * @memberof AnnotationLayer
		 */
		update: function AnnotationLayer_update(parameters) {
			for (var i = 0, ii = parameters.annotations.length; i < ii; i++) {
				var data = parameters.annotations[i];
				var element = parameters.div.querySelector(
					'[data-annotation-id="' + data.id + '"]');
				if (element) {
					CustomStyle.setProp('transform', element,
						'matrix(' + parameters.viewport.transform.join(',') + ')');
				}
			}
			parameters.div.removeAttribute('hidden');
		}
	};
})();

PDFJS.AnnotationLayer = AnnotationLayer;

exports.AnnotationLayer = AnnotationLayer;
}));
