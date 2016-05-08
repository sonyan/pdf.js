'use strict';

var SignaturePrompt = {
  overlayName: null,
  canvas: null,
  signaturePad: null,
  cancelButton: null,
  clearButton: null,
  saveButton: null,
  saveCallbacks: [],
  onSave: null,

  initialize: function(options) {
    this.overlayName = options.overlayName;
    this.canvas = options.canvas;
    this.signaturePad = new SignaturePad(options.canvas);
    this.cancelButton = options.cancelButton;
    this.clearButton = options.clearButton;
    this.saveButton = options.saveButton;

    // Attach the event listeners.
    this.cancelButton.addEventListener('click', this.close.bind(this));
    this.clearButton.addEventListener('click', this.clear.bind(this));
    this.saveButton.addEventListener('click', this.save.bind(this));

    OverlayManager.register(this.overlayName, this.close.bind(this), true);
  },

  open: function signaturePromptOpen() {
    OverlayManager.open(this.overlayName).then(function () {});
  },

  close: function signaturePromptClose() {
    OverlayManager.close(this.overlayName).then(function () {
      this.clear();
    }.bind(this));
  },

  clear: function() {
    this.signaturePad.clear();
  },

  save: function() {
    var dataUrl = this.signaturePad.toDataURL();
    if(this.onSave) {
      this.onSave(dataUrl);
    }
    
    this.close();
  }
};
