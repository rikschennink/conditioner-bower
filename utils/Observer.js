(function (win, undefined) {

    'use strict';

    var _uid = 1,
        // start at 1 because !uid returns false when uid===0
        _db = {};

    /***
     * Used for inter-object communication.
     *
     * @name Observer
     */
    var exports = {

        _setEntry: function (obj, prop) {

            var uid = obj.__pubSubUID;
            if (!uid) {
                uid = _uid++;
                obj.__pubSubUID = uid;
                _db[uid] = {
                    'obj': obj
                };
            }

            if (!_db[uid][prop]) {
                _db[uid][prop] = [];
            }

            return _db[uid];
        },

        _getEntryProp: function (obj, prop) {
            var entry = _db[obj.__pubSubUID];
            return entry ? _db[obj.__pubSubUID][prop] : null;
        },

        /***
         * Subscribe to an event
         *
         * ```js
         * Observer.subscribe(foo,'load',function bar(){
         *
         *     // bar function is called when the foo object
         *     // publishes the load event
         *
         * });
         * ```
         *
         * @method subscribe
         * @memberof Observer
         * @param {Object} obj - Object to subscribe to.
         * @param {String} type - Event type to listen for.
         * @param {Function} fn - Function to call when event published.
         * @static
         */
        subscribe: function (obj, type, fn) {

            var entry = this._setEntry(obj, 'subscriptions');

            // check if already added
            var sub, i = 0,
                subs = entry.subscriptions,
                l = subs.length;
            for (; i < l; i++) {
                sub = subs[i];
                if (sub.type === type && sub.fn === fn) {
                    return;
                }
            }

            // add event
            subs.push({
                'type': type,
                'fn': fn
            });
        },

        /***
         * Unsubscribe from further notifications
         *
         * ```js
         * // Remove the bar function from foo object.
         * Observer.unsubscribe(foo,'load',bar);
         * ```
         *
         * @method unsubscribe
         * @memberof Observer
         * @param {Object} obj - Object to unsubscribe from.
         * @param {String} type - Event type to match.
         * @param {Function} fn - Function to match.
         * @static
         */
        unsubscribe: function (obj, type, fn) {

            var subs = this._getEntryProp(obj, 'subscriptions');
            if (!subs) {
                return;
            }

            // find and remove
            var sub, i = subs.length;
            while (--i >= 0) {
                sub = subs[i];
                if (sub.type === type && (sub.fn === fn || !fn)) {
                    subs.splice(i, 1);
                }
            }
        },

        /***
         * Publishes an async event. This means other waiting (synchronous) code is executed first before the event is published.
         *
         * ```js
         * // Publishes a load event on the foo object. But does it async.
         * Observer.publishAsync(foo,'load');
         * ```
         *
         * @method publishAsync
         * @memberof Observer
         * @param {Object} obj - Object to fire the event on.
         * @param {String} type - Event type to fire.
         * @param {Object=} data - Data carrier.
         * @static
         */
        publishAsync: function (obj, type, data) {
            // http://ejohn.org/blog/how-javascript-timers-work/
            var self = this;
            setTimeout(function () {
                self.publish(obj, type, data);
            }, 0);
        },

        /***
         * Publish an event
         *
         * ```js
         * // Publishes a load event on the foo object.
         * Observer.publish(foo,'load');
         * ```
         *
         * @method publish
         * @memberof Observer
         * @param {Object} obj - Object to fire the event on.
         * @param {String} type - Event type to fire.
         * @param {Object=} data - Data carrier.
         * @static
         */
        publish: function (obj, type, data) {

            var entry = this._setEntry(obj, 'subscriptions');

            // find and execute callback
            var matches = [],
                i = 0,
                subs = entry.subscriptions,
                l = subs.length,
                receivers = entry.receivers,
                sub;
            for (; i < l; i++) {
                sub = subs[i];
                if (sub.type === type) {
                    matches.push(sub);
                }
            }

            // execute matched callbacks
            l = matches.length;
            for (i = 0; i < l; i++) {
                matches[i].fn(data);
            }

            // see if any receivers should be informed
            if (!receivers) {
                return;
            }

            l = receivers.length;
            for (i = 0; i < l; i++) {
                this.publish(receivers[i], type, data);
            }
        },

        /***
         * Setup propagation target for events so they can bubble up the object tree.
         *
         * ```js
         * // When foo publishes its load event baz will republish it.
         * Observer.inform(foo,baz);
         * ```
         *
         * @method inform
         * @memberof Observer
         * @param {Object} informant - Object to set as origin. Events from this object will also be published on receiver.
         * @param {Object} receiver - Object to set as target.
         * @return {Boolean} if setup was successful.
         * @static
         */
        inform: function (informant, receiver) {

            if (!informant || !receiver) {
                return false;
            }

            var entry = this._setEntry(informant, 'receivers');
            entry.receivers.push(receiver);

            return true;
        },

        /***
         * Remove propagation target
         *
         * ```js
         * // Baz will no longer republish events from foo.
         * Observer.conceal(foo,baz);
         * ```
         *
         * @memberof Observer
         * @param {Object} informant - Object previously set as origin.
         * @param {Object} receiver - Object previously set as target.
         * @return {Boolean} if removal was successful
         * @static
         */
        conceal: function (informant, receiver) {

            if (!informant || !receiver) {
                return false;
            }

            var receivers = this._getEntryProp(informant, 'receivers');
            if (!receivers) {
                return false;
            }

            // find and remove
            var i = receivers.length,
                item;
            while (--i >= 0) {
                item = receivers[i];
                if (item === receiver) {
                    receivers.splice(i, 1);
                    return true;
                }
            }

            return false;
        }
    };

    // CommonJS
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exports;
    }
    // AMD
    else if (typeof define === 'function' && define.amd) {
        define(function () {
            return exports;
        });
    }
    // Browser globals
    else {
        win.Observer = exports;
    }

}(this));