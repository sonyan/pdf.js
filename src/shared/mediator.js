/**
 * Allow modules at different layer to communicate with each other by remaining loosely coupled.
 * @module mediator
 */
'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/shared/mediator', ['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.pdfjsSharedMediator = {}));
  }
}(this, function (exports) {

  var channels = {}; // keep track of subscriptions
  var fnId = 1; // incremental function id. start with 1

  /**
   * Trigger a core application event.  Additional parameters are passed to
   * the callback.
   * @param {String} channelName - The name of the event channel to publish to.
   */
  function publish( channelName ) {
    var args = Array.prototype.slice.call( arguments, 1 );
    var channel = channels[channelName];

    if ( !channel ) return;
console.log('publish ' + channelName);
    for(var subscriptionId in channel) {
      if(channel.hasOwnProperty(subscriptionId)) {
        
        try {
          channel[subscriptionId].callback.apply(channel[subscriptionId].context, args);
        } catch (e) {
          console.log('mediator: there was a problem executing subscriber callback. See error object below:');
          console.log(e);
        }
      }
    }
  }

  /**
   * Listen to a core application event
   * @param {String} channel - The name of the event channel to subscribe to.
   * @param {Function} fn - The function to call when the event is published.
   * @param {*} [thisArg] - The this binding of fn.
   *     Additional, optional data may also be passed to this callback
   *     function.
   */
  function subscribe( channel, fn, thisArg ) {
    if ( !channels[ channel ] ) {
      channels[ channel ] = {};
    }
    
    // assign an id to fn
    if(!fn.fnId) {
      fn.fnId = fnId++;
    }

    // check if fn is actually new and need to be added.
    if(!channels[channel][fn.fnId]) {
      console.log('subscribed to ' + channel);
      channels[channel][fn.fnId] = { context: thisArg, callback: fn };
    }
  }

  /**
   * Install mediator to the specified object.
   * @param {Object} object - The object would normally be a sandbox instance.
   */
  exports.installTo = function( object ) {
    object.subscribe = subscribe;
    object.publish = publish;
  };

  exports.subscribe = subscribe;
  exports.publish = publish;

}));
