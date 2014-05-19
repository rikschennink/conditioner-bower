// conditioner v1.0.0 - ConditionerJS - Frizz Free, Environment-aware, JavaScript Modules
// Copyright (c) 2014 Rik Schennink - http://conditionerjs.com
// License: MIT - http://www.opensource.org/licenses/mit-license.php
(function (win, undefined) {

    'use strict';

    // returns conditioner API
    var factory = function (require, Observer, Promise, contains, matchesSelector, mergeObjects) {

        // private vars
        var _options, _monitorFactory, _moduleLoader;

        // internal modules
        /**
         * Test
         * @param {String} path to monitor
         * @param {String} expected value
         * @constructor
         */
        var Test = function Test(path, expected) {

            this._path = path;
            this._expected = expected;
            this._watches = [];
            this._count = 0;

        };

        Test.prototype = {

            /**
             * Returns a path to the required monitor
             * @returns {String}
             */
            getPath: function () {
                return this._path;
            },

            /**
             * Returns the expected value
             * @returns {String}
             */
            getExpected: function () {
                return this._expected;
            },

            /**
             * Returns true if none of the watches return a false state
             * @returns {Boolean}
             */
            isTrue: function () {
                var i = 0,
                    l = this._count;
                for (; i < l; i++) {
                    if (!this._watches[i].valid) {
                        return false;
                    }
                }
                return true;
            },

            /**
             * Assigns a new watch for this test
             * @param watches
             */
            assignWatches: function (watches) {
                this._watches = watches;
                this._count = watches.length;
            },

            /**
             * Returns test in path
             * @returns {String}
             */
            toString: function () {
                return this._path + ':{' + this._expected + '}';
            }

        };
        var Condition = function (expression, callback) {

            // get expression
            this._expression = expression;

            // on detect change callback
            this._change = callback;

            // default state is limbo
            this._currentState = null;

        };

        Condition.prototype = {

            /**
             * Evaluate expression, call change method if there's a diff with the last evaluation
             */
            evaluate: function () {
                var state = this._expression.isTrue();
                if (state != this._currentState) {
                    this._currentState = state;
                    this._change(state);
                }
            }

        };
        var MonitorFactory = function () {
            this._monitors = [];
            this._expressions = [];
        };

        MonitorFactory.prototype = {

            /**
             * Parse expression to deduct test names and expected values
             *
             * Splits the expression on a comma and splits the resulting blocks at the semi-colon
             *
             * @param {String} expression
             * @param {Boolean} isSingleTest - is true when only one test is defined, in that case only value can be returned
             * @returns {*}
             */
            _parse: function (expression, isSingleTest) {

                // if earlier parse action found return that one
                if (this._expressions[expression]) {
                    return this._expressions[expression];
                }

                // parse expression
                var i = 0,
                    expressions = expression.split(','),
                    l = expressions.length,
                    result = [],
                    parts, retain, test;
                for (; i < l; i++) {
                    parts = expressions[i].split(':');
                    retain = parts[0].indexOf('was ') === 0;
                    test = retain ? parts[0].substr(4) : parts[0];
                    result.push({

                        // retain when value matched
                        retain: retain,

                        // test name
                        test: test,

                        // expected custom value or expect true by default
                        value: isSingleTest ? test : typeof parts[1] === 'undefined' ? true : parts[1]

                    });
                }

                // remember the resulting array
                this._expressions[expression] = result;
                return result;
            },

            _mergeData: function (base, expected, element) {
                return mergeObjects({
                    element: element,
                    expected: expected
                }, base);
            },

            /**
             * Create a new Monitor based on passed configuration
             * @param {Test} test
             * @param {Element} element
             * @returns {Promise}
             */
            create: function (test, element) {

                // setup promise
                var p = new Promise();

                // path to monitor
                var path = test.getPath();

                // expected value
                var expected = test.getExpected();

                // load monitor configuration
                var self = this;
                _options.loader.require([_options.paths.monitors + path], function (setup) {

                    var i = 0,
                        monitor = self._monitors[path],
                        l, watch, watches, items, event, item, data, isSingleTest;

                    // bind trigger events for this setup if not defined yet
                    if (!monitor) {

                        // setup
                        monitor = {

                            // bound watches (each watch has own data object)
                            watches: [],

                            // change method
                            change: function (event) {
                                i = 0;
                                l = monitor.watches.length;
                                for (; i < l; i++) {
                                    monitor.watches[i].test(event);
                                }
                            }

                        };

                        // data holder
                        data = setup.unique ? self._mergeData(setup.data, expected, element) : setup.data;

                        // setup trigger events manually
                        if (typeof setup.trigger === 'function') {
                            setup.trigger(monitor.change, data);
                        }

                        // auto bind trigger events
                        else {
                            for (event in setup.trigger) {
                                if (!setup.trigger.hasOwnProperty(event)) {
                                    continue;
                                }
                                setup.trigger[event].addEventListener(event, monitor.change, false);
                            }
                        }

                        // test if should remember this monitor or should create a new one on each match
                        if (!setup.unique) {
                            self._monitors[path] = monitor;
                        }
                    }

                    // add watches
                    watches = [];

                    // deduce if this setup contains a single test or has a mutiple test setup
                    // this is useful to determine parsing setup and watch configuration later on
                    isSingleTest = typeof setup.test === 'function';

                    // does the monitor have an own custom parse method or should we use the default parse method
                    items = setup.parse ? setup.parse(expected, isSingleTest) : self._parse(expected, isSingleTest);

                    // cache the amount of items
                    l = items.length;

                    for (; i < l; i++) {

                        item = items[i];

                        watch = {

                            // retain when valid
                            retain: item.retain,
                            retained: null,

                            // default limbo state before we've done any tests
                            valid: null,

                            // setup data holder for this watcher
                            data: setup.unique ? data : self._mergeData(setup.data, item.value, element),

                            // setup test method to use
                            // jshint -W083
                            test: (function (fn) {
                                // @ifdef DEV
                                if (!fn) {
                                    throw new Error('Conditioner: Test "' + item.test + '" not found on "' + path + '" Monitor.');
                                }
                                // @endif
                                return function (event) {
                                    if (this.retained) {
                                        return;
                                    }
                                    var state = fn(this.data, event);
                                    if (this.valid != state) {
                                        this.valid = state;
                                        Observer.publish(this, 'change');
                                    }
                                    if (this.valid && this.retain) {
                                        this.retained = true;
                                    }
                                };
                            }(isSingleTest ? setup.test : setup.test[item.test]))

                        };

                        // run initial test so we have start state
                        watch.test();

                        // we need to return it for later binding
                        watches.push(watch);
                    }

                    // add these new watches to the already existing watches so they receive trigger updates
                    monitor.watches = monitor.watches.concat(watches);

                    // resolve with the new watches
                    p.resolve(watches);

                });

                return p;

            }
        };
        var WebContext = {

            test: function (query, element, change) {

                var expression, condition, i, tests, l;

                // convert query to expression
                expression = ExpressionParser.parse(query);

                // condition to evaluate on detect changes
                condition = new Condition(expression, change);

                // get found test setups from expression and register
                i = 0;
                tests = expression.getTests();
                l = tests.length;
                for (; i < l; i++) {
                    this._setupMonitor(

                    // test
                    tests[i],

                    // related element
                    element,

                    // re-evaluate this condition on change
                    condition

                    );
                }

            },

            _setupMonitor: function (test, element, condition) {

                var i = 0,
                    l;
                _monitorFactory.create(test, element).then(function (watches) {

                    // multiple watches
                    test.assignWatches(watches);

                    // add value watches
                    l = watches.length;
                    for (; i < l; i++) {

                        // listen to change event on the watchers
                        // jshint -W083
                        Observer.subscribe(watches[i], 'change', function () {
                            condition.evaluate();
                        });

                    }

                    // do initial evaluation
                    condition.evaluate();

                });

            }

        };
        /**
         * @class
         * @constructor
         * @param {UnaryExpression|BinaryExpression|Test} expression
         * @param {Boolean} negate
         */
        var UnaryExpression = function (expression, negate) {

            this._expression = expression;
            this._negate = typeof negate === 'undefined' ? false : negate;

        };

        UnaryExpression.prototype = {

            /**
             * Tests if valid expression
             * @returns {Boolean}
             */
            isTrue: function () {
                return this._expression.isTrue() !== this._negate;
            },

            /**
             * Returns tests contained in this expression
             * @returns Array
             */
            getTests: function () {
                return this._expression instanceof Test ? [this._expression] : this._expression.getTests();
            },

            /**
             * Cast to string
             * @returns {string}
             */
            toString: function () {
                return (this._negate ? 'not ' : '') + this._expression.toString();
            }
        };
        /**
         * @class
         * @constructor
         * @param {UnaryExpression} a
         * @param {String} operator
         * @param {UnaryExpression} b
         */
        var BinaryExpression = function (a, operator, b) {

            this._a = a;
            this._operator = operator;
            this._b = b;

        };

        BinaryExpression.prototype = {

            /**
             * Tests if valid expression
             * @returns {Boolean}
             */
            isTrue: function () {

                return this._operator === 'and' ?

                // is 'and' operator
                this._a.isTrue() && this._b.isTrue() :

                // is 'or' operator
                this._a.isTrue() || this._b.isTrue();

            },

            /**
             * Returns tests contained in this expression
             * @returns Array
             */
            getTests: function () {
                return this._a.getTests().concat(this._b.getTests());
            },

            /**
             * Outputs the expression as a string
             * @returns {String}
             */
            toString: function () {
                return '(' + this._a.toString() + ' ' + this._operator + ' ' + this._b.toString() + ')';
            }

        };
        var ExpressionParser = {

            /**
             * Parses an expression in string format and returns the same expression formatted as an expression tree
             * @memberof ExpressionFormatter
             * @param {String} expression
             * @returns {UnaryExpression|BinaryExpression}
             * @public
             */
            parse: function (expression) {

                var i = 0,
                    path = '',
                    tree = [],
                    value = '',
                    negate = false,
                    isValue = false,
                    target = null,
                    parent = null,
                    parents = [],
                    l = expression.length,
                    lastIndex, index, operator, test, j, c, k, n, op, ol, tl;

                if (!target) {
                    target = tree;
                }

                // read explicit expressions
                for (; i < l; i++) {

                    c = expression.charCodeAt(i);

                    // check if an expression, test for '{'
                    if (c === 123) {

                        // now reading the expression
                        isValue = true;

                        // reset path var
                        path = '';

                        // fetch path
                        k = i - 2;
                        while (k >= 0) {
                            n = expression.charCodeAt(k);

                            // test for ' ' or '('
                            if (n === 32 || n === 40) {
                                break;
                            }
                            path = expression.charAt(k) + path;
                            k--;
                        }

                        // on to the next character
                        continue;

                    }

                    // else if is '}'
                    else if (c === 125) {

                        lastIndex = target.length - 1;
                        index = lastIndex + 1;

                        // negate if last index contains not operator
                        negate = target[lastIndex] === 'not';

                        // if negate overwrite not operator location in array
                        index = negate ? lastIndex : lastIndex + 1;

                        // setup test
                        test = new Test(path, value);

                        // add expression
                        target[index] = new UnaryExpression(
                        test, negate);

                        // reset vars
                        path = '';
                        value = '';

                        negate = false;

                        // no longer a value
                        isValue = false;
                    }

                    // if we are reading an expression add characters to expression
                    if (isValue) {
                        value += expression.charAt(i);
                        continue;
                    }

                    // if not in expression
                    // check if goes up a level, test for '('
                    if (c === 40) {

                        // create new empty array in target
                        target.push([]);

                        // remember current target (is parent)
                        parents.push(target);

                        // set new child slot as new target
                        target = target[target.length - 1];

                    }

                    // find out if next set of characters is a logical operator. Testing for ' ' or '('
                    if (c === 32 || i === 0 || c === 40) {

                        operator = expression.substr(i, 5).match(/and |or |not /g);
                        if (!operator) {
                            continue;
                        }

                        // get reference and calculate length
                        op = operator[0];
                        ol = op.length - 1;

                        // add operator
                        target.push(op.substring(0, ol));

                        // skip over operator
                        i += ol;
                    }

                    // expression or level finished, time to clean up. Testing for ')'
                    if (c === 41 || i === l - 1) {

                        do {

                            // get parent reference
                            parent = parents.pop();

                            // if contains zero elements = ()
                            if (target.length === 0) {

                                // zero elements added revert to parent
                                target = parent;

                                continue;
                            }

                            // if more elements start the grouping process
                            j = 0;
                            tl = target.length;

                            for (; j < tl; j++) {

                                if (typeof target[j] !== 'string') {
                                    continue;
                                }

                                // handle not expressions first
                                if (target[j] === 'not') {
                                    target.splice(j, 2, new UnaryExpression(target[j + 1], true));

                                    // rewind
                                    j = -1;
                                    tl = target.length;
                                }
                                // handle binary expression
                                else if (target[j + 1] !== 'not') {
                                    target.splice(j - 1, 3, new BinaryExpression(target[j - 1], target[j], target[j + 1]));

                                    // rewind
                                    j = -1;
                                    tl = target.length;
                                }

                            }

                            // if contains only one element
                            if (target.length === 1 && parent) {

                                // overwrite target index with target content
                                parent[parent.length - 1] = target[0];

                                // set target to parent array
                                target = parent;

                            }

                        }
                        while (i === l - 1 && parent);

                    }
                    // end of ')' character or last index
                }

                return tree.length === 1 ? tree[0] : tree;

            }

        };
        /**
         * Static Module Agent, will always load the module
         * @type {Object}
         */
        var StaticModuleAgent = {

            /**
             * Initialize, resolved immediately
             * @returns {Promise}
             */
            init: function (ready) {
                ready();
            },

            /**
             * Is activation currently allowed, will always return true for static module agent
             * @returns {boolean}
             */
            allowsActivation: function () {
                return true;
            },

            /**
             * Clean up
             * As we have not attached any event listeners there's nothing to clean
             */
            destroy: function () {}

        };
        var ConditionModuleAgent = function (conditions, element) {

            // if no conditions, conditions will always be suitable
            if (typeof conditions !== 'string' || !conditions.length) {
                return;
            }

            this._conditions = conditions;
            this._element = element;
            this._state = false;

        };

        ConditionModuleAgent.prototype = {

            /**
             * Initialize, resolve on first test results
             * @returns {Promise}
             */
            init: function (ready) {

                var self = this,
                    init = false;
                WebContext.test(this._conditions, this._element, function (valid) {

                    // something changed
                    self._state = valid;

                    // notify others of this state change
                    Observer.publish(self, 'change');

                    // call ready
                    if (!init) {
                        init = true;
                        ready();
                    }

                });

            },

            /**
             * Returns true if the current conditions allow module activation
             * @return {Boolean}
             * @public
             */
            allowsActivation: function () {
                return this._state;
            },

            /**
             * Cleans up event listeners and readies object for removal
             */
            destroy: function () {

                // destroy
            }

        };
        var ModuleRegistry = {

            _options: {},
            _redirects: {},

            /**
             * Register a module
             * @param {String} path - path to module
             * @param {Object} options - configuration to setup for module
             * @param {String} alias - alias name for module
             * @static
             */
            registerModule: function (path, options, alias) {

                // remember options for absolute path
                this._options[_options.loader.toUrl(path)] = options;

                // setup redirect from alias
                if (alias) {
                    this._redirects[alias] = path;
                }

                // pass configuration to loader
                _options.loader.config(path, options);
            },

            /**
             * Returns the actual path if the path turns out to be a redirect
             * @param path
             * @returns {*}
             */
            getRedirect: function (path) {
                return this._redirects[path] || path;
            },

            /**
             * Get a registered module by path
             * @param {String} path - path to module
             * @return {Object} - module specification object
             * @static
             */
            getModule: function (path) {

                // @ifdef DEV
                // if no id supplied throw error
                if (!path) {
                    throw new Error('ModuleRegistry.getModule(path): "path" is a required parameter.');
                }
                // @endif
                return this._options[path] || this._options[_options.loader.toUrl(path)];

            }

        };
        /***
         * The ModuleController loads and unloads the contained Module based on the conditions received. It propagates events from the contained Module so you can safely subscribe to them.
         *
         * @exports ModuleController
         * @class
         * @constructor
         * @param {String} path - reference to module
         * @param {Element} element - reference to element
         * @param {(Object|String)=} options - options for this ModuleController
         * @param {Object=} agent - module activation agent
         */
        var ModuleController = function (path, element, options, agent) {

            // @ifdef DEV
            // if no path supplied, throw error
            if (!path || !element) {
                throw new Error('ModuleController(path,element,options,agent): "path" and "element" are required parameters.');
            }
            // @endif
            // path to module
            this._path = ModuleRegistry.getRedirect(path);
            this._alias = path;

            // reference to element
            this._element = element;

            // options for module controller
            this._options = options;

            // set loader
            this._agent = agent || StaticModuleAgent;

            // module definition reference
            this._Module = null;

            // module instance reference
            this._module = null;

            // default init state
            this._initialized = false;

            // agent binds
            this._onAgentStateChangeBind = this._onAgentStateChange.bind(this);

            // wait for init to complete
            var self = this;
            this._agent.init(function () {
                self._initialize();
            });

        };

        ModuleController.prototype = {

            /**
             * returns true if the module controller has initialized
             * @returns {Boolean}
             */
            hasInitialized: function () {
                return this._initialized;
            },

            /***
             * Returns the module path
             *
             * @method getModulePath
             * @memberof ModuleController
             * @returns {String}
             * @public
             */
            getModulePath: function () {
                return this._path;
            },

            /***
             * Returns true if the module is currently waiting for load
             *
             * @method isModuleAvailable
             * @memberof ModuleController
             * @returns {Boolean}
             * @public
             */
            isModuleAvailable: function () {
                return this._agent.allowsActivation() && !this._module;
            },

            /***
             * Returns true if module is currently active and loaded
             *
             * @method isModuleActive
             * @memberof ModuleController
             * @returns {Boolean}
             * @public
             */
            isModuleActive: function () {
                return this._module !== null;
            },

            /***
             * Checks if it wraps a module with the supplied path
             *
             * @method wrapsModuleWithPath
             * @memberof ModuleController
             * @param {String} path - Path of module to test for.
             * @return {Boolean}
             * @public
             */
            wrapsModuleWithPath: function (path) {
                return this._path === path || this._alias === path;
            },

            /**
             * Called to initialize the module
             * @private
             * @fires init
             */
            _initialize: function () {

                // now in initialized state
                this._initialized = true;

                // listen to behavior changes
                Observer.subscribe(this._agent, 'change', this._onAgentStateChangeBind);

                // let others know we have initialized
                Observer.publishAsync(this, 'init', this);

                // if activation is allowed, we are directly available
                if (this._agent.allowsActivation()) {
                    this._onBecameAvailable();
                }

            },

            /**
             * Called when the module became available, this is when it's suitable for load
             * @private
             * @fires available
             */
            _onBecameAvailable: function () {

                // we are now available
                Observer.publishAsync(this, 'available', this);

                // let's load the module
                this._load();

            },

            /**
             * Called when the agent state changes
             * @private
             */
            _onAgentStateChange: function () {

                // check if module is available
                var shouldLoadModule = this._agent.allowsActivation();

                // determine what action to take basted on availability of module
                if (this._module && !shouldLoadModule) {
                    this._unload();
                }
                else if (!this._module && shouldLoadModule) {
                    this._onBecameAvailable();
                }

            },

            /**
             * Load the module contained in this ModuleController
             * @public
             */
            _load: function () {

                // if module available no need to require it
                if (this._Module) {
                    this._onLoad();
                    return;
                }

                // load module, and remember reference
                var self = this;
                _options.loader.require([this._path], function (Module) {

                    // @ifdef DEV
                    // if module does not export a module quit here
                    if (!Module) {
                        throw new Error('ModuleController: A module needs to export an object.');
                    }
                    // @endif
                    // set reference to Module
                    self._Module = Module;

                    // module is now ready to be loaded
                    self._onLoad();

                });

            },

            _applyOverrides: function (options, overrides) {

                // test if object is string
                if (typeof overrides === 'string') {

                    // test if overrides is json string (is first char a '{'
                    if (overrides.charCodeAt(0) == 123) {
                        // @ifdef DEV
                        try {
                            // @endif
                            overrides = JSON.parse(overrides);
                            // @ifdef DEV
                        }
                        catch (e) {
                            throw new Error('ModuleController.load(): "options" is not a valid JSON string.');
                        }
                        // @endif
                    }
                    else {
                        // no json object, must be options string
                        var i = 0,
                            opts = overrides.split(', '),
                            l = opts.length;
                        for (; i < l; i++) {
                            this._overrideObjectWithUri(options, opts[i]);
                        }
                        return options;
                    }

                }

                // directly merge objects
                return mergeObjects(options, overrides);
            },

            /**
             * Overrides options in the passed object based on the uri string
             *
             * number
             * foo:1
             *
             * string
             * foo.bar:baz
             *
             * array
             * foo.baz:1,2,3
             *
             * @param {Object} options - The options to override
             * @param {String} uri - uri to override the options with
             * @private
             */
            _overrideObjectWithUri: function (options, uri) {

                var level = options,
                    prop = '',
                    i = 0,
                    l = uri.length,
                    c;
                while (i < l) {
                    c = uri.charCodeAt(i);
                    if (c != 46 && c != 58) {
                        prop += uri.charAt(i);
                    }
                    else {

                        if (c == 58) {
                            level[prop] = this._castValueToType(uri.substr(i + 1));
                            break;
                        }

                        level = level[prop];
                        prop = '';
                    }
                    i++;
                }

            },

            /**
             * Parses the value and returns it in the right type
             * @param value
             * @returns {*}
             * @private
             */
            _castValueToType: function (value) {
                // if first character is a single quote
                if (value.charCodeAt(0) == 39) {
                    return value.substring(1, value.length - 1);
                }
                // if is a number
                else if (!isNaN(value)) {
                    return parseFloat(value);
                }
                // if is boolean
                else if (value == 'true' || value == 'false') {
                    return value === 'true';
                }
                // if is an array
                else if (value.indexOf(',') !== -1) {
                    return value.split(',').map(this._castValueToType);
                }
                return value;
            },

            /**
             * Parses options for given url and module also
             * @param {String} url - url to module
             * @param {Object} Module - Module definition
             * @param {(Object|String)} overrides - page level options to override default options with
             * @returns {Object}
             * @private
             */
            _parseOptions: function (url, Module, overrides) {

                var stack = [],
                    pageOptions = {},
                    moduleOptions = {},
                    options, i;
                do {

                    // get settings
                    options = ModuleRegistry.getModule(url);

                    // create a stack of options
                    stack.push({
                        'page': options,
                        'module': Module.options
                    });

                    // fetch super path, if this module has a super module load that modules options aswell
                    url = Module.__superUrl;

                    // jshint -W084
                } while (Module = Module.__super);

                // reverse loop over stack and merge all entries to create the final options objects
                i = stack.length;
                while (i--) {
                    pageOptions = mergeObjects(pageOptions, stack[i].page);
                    moduleOptions = mergeObjects(moduleOptions, stack[i].module);
                }

                // merge page and module options
                options = mergeObjects(moduleOptions, pageOptions);

                // apply overrides
                if (overrides) {
                    options = this._applyOverrides(options, overrides);
                }

                return options;
            },

            /**
             * Method called when module loaded
             * @fires load
             * @private
             */
            _onLoad: function () {

                // if activation is no longer allowed, stop here
                if (!this._agent.allowsActivation()) {
                    return;
                }

                // parse and merge options for this module
                var options = this._parseOptions(this._path, this._Module, this._options);

                // set reference
                if (typeof this._Module === 'function') {

                    // is of function type so try to create instance
                    this._module = new this._Module(this._element, options);
                }
                else {

                    // is of other type, expect load method to be defined
                    this._module = this._Module.load ? this._Module.load(this._element, options) : null;

                    // if module not defined we are probably dealing with a static class
                    if (!this._module) {
                        this._module = this._Module;
                    }
                }

                // @ifdef DEV
                // if no module defined throw error
                if (!this._module) {
                    throw new Error('ModuleController.load(): could not initialize module, missing constructor or "load" method.');
                }
                // @endif
                // watch for events on target
                // this way it is possible to listen to events on the controller which is always there
                Observer.inform(this._module, this);

                // publish load event
                Observer.publishAsync(this, 'load', this);
            },


            /**
             * Unloads the wrapped module
             * @fires unload
             * @return {Boolean}
             */
            _unload: function () {

                // if no module, module has already been unloaded or was never loaded
                if (!this._module) {
                    return false;
                }

                // stop watching target
                Observer.conceal(this._module, this);

                // unload module if possible
                if (this._module.unload) {
                    this._module.unload();
                }

                // reset property
                this._module = null;

                // publish unload event
                Observer.publishAsync(this, 'unload', this);

                return true;
            },

            /**
             * Cleans up the module and module controller and all bound events
             * @public
             */
            destroy: function () {

                // unload module
                this._unload();

                // unbind events
                Observer.unsubscribe(this._agent, 'change', this._onAgentStateChangeBind);

                // call destroy on agent
                this._agent.destroy();

            },

            /***
             * Executes a methods on the wrapped module.
             *
             * @method execute
             * @memberof ModuleController
             * @param {String} method - Method name.
             * @param {Array=} params - Array containing the method parameters.
             * @return {Object} response - containing return of executed method and a status code
             * @public
             */
            execute: function (method, params) {

                // if module not loaded
                if (!this._module) {
                    return {
                        'status': 404,
                        'response': null
                    };
                }

                // get function reference
                var F = this._module[method];

                // @ifdef DEV
                if (!F) {
                    throw new Error('ModuleController.execute(method,params): function specified in "method" not found on module.');
                }
                // @endif
                // if no params supplied set to empty array,
                // ie8 falls to it's knees when it receives an undefined parameter object in the apply method
                params = params || [];

                // once loaded call method and pass parameters
                return {
                    'status': 200,
                    'response': F.apply(this._module, params)
                };

            }

        };
        var NodeController = (function () {

            var _filterIsActiveModule = function (item) {
                return item.isModuleActive();
            };
            var _filterIsAvailableModule = function (item) {
                return item.isModuleAvailable();
            };
            var _mapModuleToPath = function (item) {
                return item.getModulePath();
            };

            /***
             * For each element found having a `data-module` attribute an object of type NodeController is made. The node object can then be queried for the [ModuleControllers](#modulecontroller) it contains.
             *
             * @exports NodeController
             * @class
             * @constructor
             * @param {Object} element
             * @param {Number} priority
             */
            var exports = function NodeController(element, priority) {

                // @ifdef DEV
                if (!element) {
                    throw new Error('NodeController(element): "element" is a required parameter.');
                }
                // @endif
                // set element reference
                this._element = element;

                // has been processed
                this._element.setAttribute(_options.attr.processed, 'true');

                // set priority
                this._priority = !priority ? 0 : parseInt(priority, 10);

                // contains references to all module controllers
                this._moduleControllers = [];

                // binds
                this._moduleAvailableBind = this._onModuleAvailable.bind(this);
                this._moduleLoadBind = this._onModuleLoad.bind(this);
                this._moduleUnloadBind = this._onModuleUnload.bind(this);

            };

            /**
             * Static method testing if the current element has been processed already
             * @param {Element} element
             * @static
             */
            exports.hasProcessed = function (element) {
                return element.getAttribute(_options.attr.processed) === 'true';
            };

            exports.prototype = {

                /**
                 * Loads the passed ModuleControllers to the node
                 * @param {Array} moduleControllers
                 * @public
                 */
                load: function (moduleControllers) {

                    // @ifdef DEV
                    // if no module controllers found
                    if (!moduleControllers || !moduleControllers.length) {
                        throw new Error('NodeController.load(): Expects an Array of module controllers as parameters.');
                    }
                    // @endif
                    // turn into array
                    this._moduleControllers = moduleControllers;

                    // listen to load events on module controllers
                    var i = 0,
                        l = this._moduleControllers.length,
                        mc;
                    for (; i < l; i++) {
                        mc = this._moduleControllers[i];
                        Observer.subscribe(mc, 'available', this._moduleAvailableBind);
                        Observer.subscribe(mc, 'load', this._moduleLoadBind);
                    }

                },

                /**
                 * Unload all attached modules and restore node in original state
                 * @public
                 */
                destroy: function () {

                    var i = 0,
                        l = this._moduleControllers.length;
                    for (; i < l; i++) {
                        this._destroyModule(this._moduleControllers[i]);
                    }

                    // reset array
                    this._moduleControllers = [];

                    // update initialized state
                    this._updateAttribute(_options.attr.initialized, this._moduleControllers);

                    // reset processed state
                    this._element.removeAttribute(_options.attr.processed);

                    // clear reference
                    this._element = null;
                },

                /**
                 * Call destroy method on module controller and clean up listeners
                 * @param moduleController
                 * @private
                 */
                _destroyModule: function (moduleController) {

                    // unsubscribe from module events
                    Observer.unsubscribe(moduleController, 'available', this._moduleAvailableBind);
                    Observer.unsubscribe(moduleController, 'load', this._moduleLoadBind);
                    Observer.unsubscribe(moduleController, 'unload', this._moduleUnloadBind);

                    // conceal events from module controller
                    Observer.conceal(moduleController, this);

                    // unload the controller
                    moduleController.destroy();

                },

                /**
                 * Returns the set priority for this node
                 * @public
                 */
                getPriority: function () {
                    return this._priority;
                },

                /***
                 * Returns the element linked to this node
                 *
                 * @method getElement
                 * @memberof NodeController
                 * @returns {Element} element - A reference to the element wrapped by this NodeController
                 * @public
                 */
                getElement: function () {
                    return this._element;
                },

                /***
                 * Tests if the element contained in the NodeController object matches the supplied CSS selector.
                 *
                 * @method matchesSelector
                 * @memberof NodeController
                 * @param {String} selector - CSS selector to match element to.
                 * @param {Element=} context - Context to search in.
                 * @return {Boolean} match - Result of matchs
                 * @public
                 */
                matchesSelector: function (selector, context) {
                    if (context && !contains(context, this._element)) {
                        return false;
                    }
                    return matchesSelector(this._element, selector, context);
                },

                /***
                 * Returns true if all [ModuleControllers](#modulecontroller) are active
                 *
                 * @method areAllModulesActive
                 * @memberof NodeController
                 * @returns {Boolean} state - All modules loaded state
                 * @public
                 */
                areAllModulesActive: function () {
                    return this.getActiveModules().length === this._moduleControllers.length;
                },

                /***
                 * Returns an array containing all active [ModuleControllers](#modulecontroller)
                 *
                 * @method getActiveModules
                 * @memberof NodeController
                 * @returns {Array} modules - An Array of active ModuleControllers
                 * @public
                 */
                getActiveModules: function () {
                    return this._moduleControllers.filter(_filterIsActiveModule);
                },

                /***
                 * Returns the first [ModuleController](#modulecontroller) matching the given path
                 *
                 * @method getModule
                 * @memberof NodeController
                 * @param {String=} path - The module id to search for.
                 * @returns {(ModuleController|null)} module - A [ModuleController](#modulecontroller) or null if none found
                 * @public
                 */
                getModule: function (path) {
                    return this._getModules(path, true);
                },

                /***
                 * Returns an Array of [ModuleControllers](#modulecontroller) matching the given path
                 *
                 * @method getModules
                 * @memberof NodeController
                 * @param {String=} path - The module id to search for.
                 * @returns {Array} modules - An Array of [ModuleControllers](#modulecontroller)
                 * @public
                 */
                getModules: function (path) {
                    return this._getModules(path);
                },

                /**
                 * Returns one or multiple [ModuleControllers](#modulecontroller) matching the supplied path
                 *
                 * @param {String=} path - Path to match the nodes to
                 * @param {Boolean=} singleResult - Boolean to only ask for one result
                 * @returns {(Array|ModuleController|null)}
                 * @private
                 */
                _getModules: function (path, singleResult) {

                    // if no path supplied return all module controllers (or one if single result mode)
                    if (typeof path === 'undefined') {
                        if (singleResult) {
                            return this._moduleControllers[0];
                        }
                        return this._moduleControllers.concat();
                    }

                    // loop over module controllers matching the path, if single result is enabled, return on first hit, else collect
                    var i = 0,
                        l = this._moduleControllers.length,
                        results = [],
                        mc;
                    for (; i < l; i++) {
                        mc = this._moduleControllers[i];
                        if (!mc.wrapsModuleWithPath(path)) {
                            continue;
                        }
                        if (singleResult) {
                            return mc;
                        }
                        results.push(mc);
                    }
                    return singleResult ? null : results;
                },

                /***
                 * Safely tries to executes a method on the currently active Module. Always returns an object containing a status code and a response data property.
                 *
                 * @method execute
                 * @memberof NodeController
                 * @param {String} method - Method name.
                 * @param {Array=} params - Array containing the method parameters.
                 * @returns {Array} results - An object containing status code and possible response data.
                 * @public
                 */
                execute: function (method, params) {
                    return this._moduleControllers.map(function (item) {
                        return {
                            controller: item,
                            result: item.execute(method, params)
                        };
                    });
                },

                /**
                 * Called when a module becomes available for load
                 * @param moduleController
                 * @private
                 */
                _onModuleAvailable: function (moduleController) {

                    // propagate events from the module controller to the node so people can subscribe to events on the node
                    Observer.inform(moduleController, this);

                    // update loading attribute with currently loading module controllers list
                    this._updateAttribute(_options.attr.loading, this._moduleControllers.filter(_filterIsAvailableModule));
                },

                /**
                 * Called when module has loaded
                 * @param moduleController
                 * @private
                 */
                _onModuleLoad: function (moduleController) {

                    // listen to unload event
                    Observer.unsubscribe(moduleController, 'load', this._moduleLoadBind);
                    Observer.subscribe(moduleController, 'unload', this._moduleUnloadBind);

                    // update loading attribute with currently loading module controllers list
                    this._updateAttribute(_options.attr.loading, this._moduleControllers.filter(_filterIsAvailableModule));

                    // update initialized attribute with currently active module controllers list
                    this._updateAttribute(_options.attr.initialized, this.getActiveModules());
                },

                /**
                 * Called when module has unloaded
                 * @param moduleController
                 * @private
                 */
                _onModuleUnload: function (moduleController) {

                    // stop listening to unload
                    Observer.subscribe(moduleController, 'load', this._moduleLoadBind);
                    Observer.unsubscribe(moduleController, 'unload', this._moduleUnloadBind);

                    // conceal events from module controller
                    Observer.conceal(moduleController, this);

                    // update initialized attribute with now active module controllers list
                    this._updateAttribute(_options.attr.initialized, this.getActiveModules());
                },

                /**
                 * Updates the given attribute with paths of the supplied controllers
                 * @private
                 */
                _updateAttribute: function (attr, controllers) {
                    var modules = controllers.map(_mapModuleToPath);
                    if (modules.length) {
                        this._element.setAttribute(attr, modules.join(','));
                    }
                    else {
                        this._element.removeAttribute(attr);
                    }
                }

            };

            return exports;

        }());
        /**
         * Creates a controller group to sync [ModuleControllers](#modulecontroller).
         *
         * @name SyncedControllerGroup
         * @constructor
         */
        var SyncedControllerGroup = function () {

            // @ifdef DEV
            // if no node controllers passed, no go
            if (!arguments || !arguments.length) {
                throw new Error('SyncedControllerGroup(controllers): Expects an array of node controllers as parameters.');
            }
            // @endif
            // by default modules are expected to not be in sync
            this._inSync = false;

            // turn arguments into an array
            this._controllers = arguments.length === 1 ? arguments[0] : Array.prototype.slice.call(arguments, 0);
            this._controllerLoadedBind = this._onLoad.bind(this);
            this._controllerUnloadedBind = this._onUnload.bind(this);

            var i = 0,
                controller, l = this._controllers.length;
            for (; i < l; i++) {
                controller = this._controllers[i];

                // @ifdef DEV
                // if controller is undefined
                if (!controller) {
                    throw new Error('SyncedControllerGroup(controllers): Stumbled upon an undefined controller is undefined.');
                }
                // @endif
                // listen to load and unload events so we can pass them on if appropriate
                Observer.subscribe(controller, 'load', this._controllerLoadedBind);
                Observer.subscribe(controller, 'unload', this._controllerUnloadedBind);
            }

            // test now to see if modules might already be in sync
            this._test();
        };

        SyncedControllerGroup.prototype = {

            /***
             * Destroy sync group, stops listening and cleans up
             *
             * @method destroy
             * @memberof SyncedControllerGroup
             * @public
             */
            destroy: function () {

                // unsubscribe
                var i = 0,
                    controller, l = this._controllers.length;
                for (; i < l; i++) {
                    controller = this._controllers[i];

                    // listen to load and unload events so we can pass them on if appropriate
                    Observer.unsubscribe(controller, 'load', this._controllerLoadedBind);
                    Observer.unsubscribe(controller, 'unload', this._controllerUnloadedBind);
                }

                // reset array
                this._controllers = [];

            },

            /***
             * Returns true if all modules have loaded
             *
             * @method areAllModulesActive
             * @memberof SyncedControllerGroup
             * @returns {Boolean}
             */
            areAllModulesActive: function () {
                var i = 0,
                    l = this._controllers.length,
                    controller;
                for (; i < l; i++) {
                    controller = this._controllers[i];
                    if (!this._isActiveController(controller)) {
                        return false;
                    }
                }
                return true;
            },

            /**
             * Called when a module loads
             * @private
             */
            _onLoad: function () {
                this._test();
            },

            /**
             * Called when a module unloads
             * @private
             */
            _onUnload: function () {
                this._unload();
            },

            /**
             * Tests if the node or module controller has loaded their modules
             * @param controller
             * @returns {Boolean}
             * @private
             */
            _isActiveController: function (controller) {
                return ((controller.isModuleActive && controller.isModuleActive()) || (controller.areAllModulesActive && controller.areAllModulesActive()));
            },

            /**
             * Tests if all controllers have loaded, if so calls the _load method
             * @private
             */
            _test: function () {

                // loop over modules testing their active state, if one is inactive we stop immediately
                if (!this.areAllModulesActive()) {
                    return;
                }

                // if all modules loaded fire load event
                this._load();

            },

            /***
             * Fires a load event when all controllers have indicated they have loaded and we have not loaded yet
             *
             * @memberof SyncedControllerGroup
             * @fires load
             * @private
             */
            _load: function () {
                if (this._inSync) {
                    return;
                }
                this._inSync = true;
                Observer.publishAsync(this, 'load', this._controllers);
            },

            /***
             * Fires an unload event once we are in loaded state and one of the controllers unloads
             *
             * @memberof SyncedControllerGroup
             * @fires unload
             * @private
             */
            _unload: function () {
                if (!this._inSync) {
                    return;
                }
                this._inSync = false;
                Observer.publish(this, 'unload', this._controllers);
            }

        };
        /**
         * @exports ModuleLoader
         * @class
         * @constructor
         */
        var ModuleLoader = function () {

            // array of all parsed nodes
            this._nodes = [];

        };

        ModuleLoader.prototype = {

            /**
             * Loads all modules within the supplied dom tree
             * @param {Document|Element} context - Context to find modules in
             * @return {Array} - Array of found Nodes
             */
            parse: function (context) {

                // @ifdef DEV
                // if no context supplied, throw error
                if (!context) {
                    throw new Error('ModuleLoader.loadModules(context): "context" is a required parameter.');
                }
                // @endif
                // register vars and get elements
                var elements = context.querySelectorAll('[data-module]'),
                    l = elements.length,
                    i = 0,
                    nodes = [],
                    node, element;

                // if no elements do nothing
                if (!elements) {
                    return [];
                }

                // process elements
                for (; i < l; i++) {

                    // set element reference
                    element = elements[i];

                    // test if already processed
                    if (NodeController.hasProcessed(element)) {
                        continue;
                    }

                    // create new node
                    nodes.push(new NodeController(element, element.getAttribute(_options.attr.priority)));
                }

                // sort nodes by priority:
                // higher numbers go first,
                // then 0 (a.k.a. no priority assigned),
                // then negative numbers
                // note: it's actually the other way around but that's because of the reversed while loop coming next
                nodes.sort(function (a, b) {
                    return a.getPriority() - b.getPriority();
                });

                // initialize modules depending on assigned priority (in reverse, but priority is reversed as well so all is okay)
                i = nodes.length;
                while (--i >= 0) {
                    node = nodes[i];
                    node.load.call(node, this._getModuleControllersByElement(node.getElement()));
                }

                // merge new nodes with currently active nodes list
                this._nodes = this._nodes.concat(nodes);

                // returns nodes so it is possible to later unload nodes manually if necessary
                return nodes;
            },

            /**
             * Setup the given element with the passed module controller(s)
             * [
             *     {
             *         path: 'path/to/module',
             *         conditions: 'config',
             *         options: {
             *             foo: 'bar'
             *         }
             *     }
             * ]
             * @param {Element} element - Element to bind the controllers to
             * @param {Array|Object} controllers - ModuleController configurations
             * @return {NodeController|null} - The newly created node or null if something went wrong
             */
            load: function (element, controllers) {

                // @ifdef DEV
                if (!controllers) {
                    throw new Error('ModuleLoader.load(element,controllers): "controllers" is a required parameter.');
                }
                // @endif
                // if controllers is object put in array
                controllers = controllers.length ? controllers : [controllers];

                // vars
                var node, i = 0,
                    l = controllers.length,
                    moduleControllers = [],
                    controller;

                // create node
                node = new NodeController(element);

                // create controllers
                for (; i < l; i++) {
                    controller = controllers[i];
                    moduleControllers.push(
                    this._getModuleController(controller.path, element, controller.options, controller.conditions));
                }

                // create initialize
                node.load(moduleControllers);

                // remember so can later be retrieved through getNode methodes
                this._nodes.push(node);

                // return the loaded Node
                return node;
            },

            /**
             * Returns one or multiple nodes matching the selector
             * @param {String} [selector] - Optional selector to match the nodes to
             * @param {Document|Element} [context] - Context to search in
             * @param {Boolean} [singleResult] - Optional boolean to only ask one result
             * @returns {Array|Node|null}
             * @public
             */
            getNodes: function (selector, context, singleResult) {

                // if no query supplied return all nodes
                if (typeof selector === 'undefined' && typeof context === 'undefined') {
                    if (singleResult) {
                        return this._nodes[0];
                    }
                    return this._nodes.concat();
                }

                // find matches (done by querying the node for a match)
                var i = 0,
                    l = this._nodes.length,
                    results = [],
                    node;
                for (; i < l; i++) {
                    node = this._nodes[i];
                    if (node.matchesSelector(selector, context)) {
                        if (singleResult) {
                            return node;
                        }
                        results.push(node);
                    }
                }

                return singleResult ? null : results;
            },

            /**
             * Destroy the passed node reference
             * @param {Array} nodes
             * @return {Boolean}
             * @public
             */
            destroy: function (nodes) {

                var i = nodes.length,
                    destroyed = 0,
                    hit;

                while (i--) {

                    hit = this._nodes.indexOf(nodes[i]);
                    if (hit === -1) {
                        continue;
                    }

                    this._nodes.splice(hit, 1);
                    nodes[i].destroy();
                    destroyed++;

                }

                return nodes.length === destroyed;
            },

            /**
             * Parses module controller configuration on element and returns array of module controllers
             * @param {Element} element
             * @returns {Array}
             * @private
             */
            _getModuleControllersByElement: function (element) {

                var config = element.getAttribute(_options.attr.module) || '';

                // test if first character is a '[', if so multiple modules have been defined
                // double comparison is faster than triple in this case
                if (config.charCodeAt(0) == 91) {

                    var controllers = [],
                        i = 0,
                        specs, spec, l;

                    // add multiple module adapters
                    try {
                        specs = JSON.parse(config);
                    }
                    catch (e) {
                        // @ifdef DEV
                        throw new Error('ModuleLoader.load(context): "data-module" attribute contains a malformed JSON string.');
                        // @endif
                    }

                    // no specification found or specification parsing failed
                    if (!specs) {
                        return [];
                    }

                    // setup vars
                    l = specs.length;

                    // test if second character is a '{' if so, json format
                    if (config.charCodeAt(1) == 123) {
                        for (; i < l; i++) {
                            spec = specs[i];
                            controllers[i] = this._getModuleController(
                            spec.path, element, spec.options, spec.conditions);
                        }
                        return controllers;
                    }

                    // array format
                    for (; i < l; i++) {
                        spec = specs[i];
                        if (typeof spec == 'string') {
                            controllers[i] = this._getModuleController(spec, element);
                        }
                        else {
                            controllers[i] = this._getModuleController(
                            spec[0], element, typeof spec[1] == 'string' ? spec[2] : spec[1], typeof spec[1] == 'string' ? spec[1] : spec[2]);
                        }
                    }
                    return controllers;

                }

                return [this._getModuleController(
                config, element, element.getAttribute(_options.attr.options), element.getAttribute(_options.attr.conditions))];
            },

            /**
             * Module Controller factory method, creates different ModuleControllers based on params
             * @param path - path of module
             * @param element - element to attach module to
             * @param options - options for module
             * @param conditions - conditions required for module to be loaded
             * @returns {ModuleController}
             * @private
             */
            _getModuleController: function (path, element, options, conditions) {
                return new ModuleController(
                path, element, options, conditions ? new ConditionModuleAgent(conditions, element) : StaticModuleAgent);
            }
        };

        // conditioner options object
        _options = {
            'paths': {
                'monitors': './monitors/'
            },
            'attr': {
                'options': 'data-options',
                'module': 'data-module',
                'conditions': 'data-conditions',
                'priority': 'data-priority',
                'initialized': 'data-initialized',
                'processed': 'data-processed',
                'loading': 'data-loading'
            },
            'loader': {
                'require': function (paths, callback) {
                    require(paths, callback);
                },
                'config': function (path, options) {
                    var config = {};
                    config[path] = options;
                    requirejs.config({
                        config: config
                    });
                },
                'toUrl': function (path) {
                    return requirejs.toUrl(path);
                }
            },
            'modules': {}
        };

        // setup monitor factory
        _monitorFactory = new MonitorFactory();

        // setup loader instance
        _moduleLoader = new ModuleLoader();

        /***
         * Call `[init](#conditioner-init)` on the `conditioner` object to start loading the referenced modules in the HTML document. Once this is done the conditioner will return the nodes it found as an Array and will initialize them automatically once they are ready.
         *
         * Each node is wrapped in a [NodeController](#nodecontroller) which contains one or more [ModuleControllers](#modulecontroller).
         *
         * @exports Conditioner
         */
        return {

            /***
             * Call this method to start parsing the document for modules. Conditioner will initialize all found modules and return an Array containing the newly found nodes.
             *
             * ```js
             * require(['conditioner'],function(conditioner){
             *
             *     conditioner.init();
             *
             * });
             * ```
             *
             * @method init
             * @memberof Conditioner
             * @param {Object=} options - Options to override.
             * @returns {Array} nodes - Array of initialized nodes.
             * @public
             */
            init: function (options) {

                if (options) {
                    this.setOptions(options);
                }

                return _moduleLoader.parse(win.document);

            },

            /***
             * Allows defining page level Module options, shortcuts to modules, and overrides for conditioners inner workings.
             *
             * Passing the default options object.
             * ```js
             * require(['conditioner'],function(conditioner){
             *
             *     conditioner.setOptions({
             *
             *         // Page level module options
             *         modules:{},
             *
             *         // Path overrides
             *         paths:{
             *             monitors:'./monitors/'
             *         },
             *
             *         // Attribute overrides
             *         attr:{
             *             options:'data-options',
             *             module:'data-module',
             *             conditions:'data-conditions',
             *             priority:'data-priority',
             *             initialized:'data-initialized',
             *             processed:'data-processed',
             *             loading:'data-loading'
             *         },
             *
             *         // AMD loader overrides
             *         loader:{
             *             require:function(paths,callback){
             *                 require(paths,callback)
             *             },
             *             config:function(path,options){
             *                 var config = {};
             *                 config[path] = options;
             *                 requirejs.config({
             *                     config:config
             *                 });
             *             },
             *             toUrl:function(path){
             *                 return requirejs.toUrl(path)
             *             }
             *         }
             *     });
             *
             * });
             * ```
             *
             * @method setOptions
             * @memberof Conditioner
             * @param {Object} options - Options to override.
             * @public
             */
            setOptions: function (options) {

                // @ifdef DEV
                if (!options) {
                    throw new Error('Conditioner.setOptions(options): "options" is a required parameter.');
                }
                // @endif
                var config, path, mod, alias;

                // update options
                _options = mergeObjects(_options, options);

                // fix paths if not ending with slash
                for (path in _options.paths) {

                    if (!_options.paths.hasOwnProperty(path)) {
                        continue;
                    }

                    // add slash if path does not end on slash already
                    _options.paths[path] += _options.paths[path].slice(-1) !== '/' ? '/' : '';
                }

                // loop over modules
                for (path in _options.modules) {

                    if (!_options.modules.hasOwnProperty(path)) {
                        continue;
                    }

                    // get module reference
                    mod = _options.modules[path];

                    // get alias
                    alias = typeof mod === 'string' ? mod : mod.alias;

                    // get config
                    config = typeof mod === 'string' ? null : mod.options || {};

                    // register this module
                    ModuleRegistry.registerModule(path, config, alias);

                }

            },

            /***
             * Finds and loads all Modules defined on child elements of the supplied context. Returns an Array of found Nodes.
             *
             * @method parse
             * @memberof Conditioner
             * @param {Element} context - Context to find modules in.
             * @returns {Array} nodes - Array of initialized nodes.
             */
            parse: function (context) {

                // @ifdef DEV
                if (!context) {
                    throw new Error('Conditioner.parse(context): "context" is a required parameter.');
                }
                // @endif
                return _moduleLoader.parse(context);

            },

            /***
             * Creates a [NodeController](#nodecontroller) based on the passed element and set of controllers.
             *
             * ```js
             * require(['conditioner'],function(conditioner){
             *
             *     // find a suitable element
             *     var foo = document.getElementById('foo');
             *
             *     // load Clock module to foo element
             *     conditioner.load(foo,[
             *         {
             *             path: 'ui/Clock',
             *             conditions: 'media:{(min-width:30em)}',
             *             options: {
             *                 time:false
             *             }
             *         }
             *     ]);
             *
             * });
             * ```
             *
             * @method load
             * @memberof Conditioner
             * @param {Element} element - Element to bind the controllers to.
             * @param {(Array|ModuleController)} controllers - [ModuleController](#modulecontroller) configurations.
             * @returns {(NodeController|null)} node - The newly created node or null if something went wrong.
             */
            load: function (element, controllers) {

                return _moduleLoader.load(element, controllers);

            },

            /***
             * Wraps the supplied controllers in a [SyncedControllerGroup](#syncedcontrollergroup) which will fire a load event when all of the supplied modules have loaded.
             *
             * ```js
             * require(['conditioner','Observer'],function(conditioner,Observer){
             *
             *     // Find period element on the page
             *     var periodElement = document.querySelector('.peroid');
             *
             *     // Initialize all datepicker modules
             *     // within the period element
             *     var datePickerNodes = conditioner.parse(periodElement);
             *
             *     // Synchronize load events, we only want to work
             *     // with these modules if they are all loaded
             *     var syncGroup = conditioner.sync(datePickerNodes);
             *
             *     // Wait for load event to fire
             *     Observer.subscribe(syncGroup,'load',function(nodes){
             *
             *         // All modules now loaded
             *
             *     });
             *
             *     // Also listen for unload event
             *     Observer.subscribe(syncGroup,'unload',function(nodes){
             *
             *         // One of the modules has unloaded
             *
             *     });
             *
             * });
             * ```
             *
             * @method sync
             * @memberof Conditioner
             * @param {(ModuleController|NodeController)} arguments - List of [ModuleControllers](#modulecontroller) or [NodeControllers](#nodecontroller) to synchronize.
             * @returns {SyncedControllerGroup} syncedControllerGroup - A [SyncedControllerGroup](#syncedcontrollergroup).
             */
            sync: function () {

                var group = Object.create(SyncedControllerGroup.prototype);

                // create synced controller group using passed arguments
                // test if user passed an array instead of separate arguments
                SyncedControllerGroup.apply(group, arguments.length === 1 && !arguments.slice ? arguments[0] : arguments);

                return group;

            },

            /***
             * Returns the first [NodeController](#nodecontroller) matching the given selector within the passed context
             *
             * @method getNode
             * @memberof Conditioner
             * @param {String=} selector - Selector to match the nodes to.
             * @param {Element=} context - Context to search in.
             * @returns {(NodeController|null)} node - First matched node or null.
             */
            getNode: function (selector, context) {

                return _moduleLoader.getNodes(selector, context, true);

            },

            /***
             * Returns all [NodeControllers](#nodecontroller) matching the given selector with the passed context
             *
             * @method getNodes
             * @memberof Conditioner
             * @param {String=} selector - Selector to match the nodes to.
             * @param {Element=} context - Context to search in.
             * @returns {Array} nodes -  Array containing matched nodes or empty .
             Array
             */
            getNodes: function (selector, context) {

                return _moduleLoader.getNodes(selector, context, false);

            },

            /***
             * Destroy matched [NodeControllers](#nodecontroller) based on the supplied parameters.
             *
             * @method destroy
             * @memberof Conditioner
             * @param {(NodeController|String|Array)} arguments - Destroy a single node controller, matched elements or an Array of NodeControllers.
             * @returns {Boolean} state - Were all nodes destroyed successfuly
             * @public
             */
            destroy: function () {

                var nodes = [],
                    arg = arguments[0];

                // @ifdef DEV
                // first argument is required
                if (!arg) {
                    throw new Error('Conditioner.destroy(...): A DOM node, Array, String or NodeController is required as the first argument.');
                }
                // @endif
                // test if is an array
                if (Array.isArray(arg)) {
                    nodes = arg;
                }

                // test if is query selector
                if (typeof arg === 'string') {
                    nodes = _moduleLoader.getNodes(arg, arguments[1]);
                }

                // test if is single NodeController instance
                else if (arg instanceof NodeController) {
                    nodes.push(arg);
                }

                // test if is DOMNode
                else if (arg.nodeName) {
                    nodes = _moduleLoader.getNodes().filter(function (node) {
                        return contains(arg, node.getElement());
                    });
                }

                // if we don't have any nodes to destroy let's stop here
                if (nodes.length === 0) {
                    return false;
                }

                return _moduleLoader.destroy(nodes);
            },

            /***
             * Returns the first [ModuleController](#modulecontroller) matching the given selector within the supplied context.
             *
             * @method getModule
             * @memberof Conditioner
             * @param {String=} path - Path to match the modules to.
             * @param {String=} selector - Selector to match the nodes to.
             * @param {Element=} context - Context to search in.
             * @returns {(ModuleController|null)} module - The found module.
             * @public
             */
            getModule: function (path, selector, context) {

                var i = 0,
                    results = this.getNodes(selector, context),
                    l = results.length,
                    module;
                for (; i < l; i++) {
                    module = results[i].getModule(path);
                    if (module) {
                        return module;
                    }
                }
                return null;

            },

            /***
             * Returns all [ModuleControllers](#modulecontroller) matching the given path within the supplied context.
             *
             * @method getModules
             * @memberof Conditioner
             * @param {String=} path - Path to match the modules to
             * @param {String=} selector - Selector to match the nodes to
             * @param {Element=} context - Context to search in
             * @returns {(Array|null)} modules - The found modules.
             * @public
             */
            getModules: function (path, selector, context) {

                var i = 0,
                    results = this.getNodes(selector, context),
                    l = results.length,
                    filtered = [],
                    modules;
                for (; i < l; i++) {
                    modules = results[i].getModules(path);
                    if (modules.length) {
                        filtered = filtered.concat(modules);
                    }
                }
                return filtered;

            },

            /***
             * Manually test an expression, only returns once via promise with a `true` or `false` state
             *
             * ```js
             * require(['conditioner'],function(conditioner){
             *
             *     // Test if supplied condition is valid
             *     conditioner.is('window:{min-width:500}').then(function(state){
             *
             *         // State equals true if window has a
             *         // minimum width of 500 pixels.
             *
             *     });
             *
             * });
             * ```
             *
             * @method is
             * @memberof Conditioner
             * @param {String} condition - Expression to test.
             * @param {Element=} element - Element to run the test on.
             * @returns {Promise}
             */
            is: function (condition, element) {

                // @ifdef DEV
                if (!condition) {
                    throw new Error('Conditioner.is(condition,[element]): "condition" is a required parameter.');
                }
                // @endif
                // run test and resolve with first received state
                var p = new Promise();
                WebContext.test(condition, element, function (valid) {
                    p.resolve(valid);
                });
                return p;

            },

            /***
             * Manually test an expression, bind a callback method to be executed once something changes.
             *
             * ```js
             * require(['conditioner'],function(conditioner){
             *
             *     // Test if supplied condition is valid
             *     conditioner.on('window:{min-width:500}',function(state){
             *
             *         // State equals true if window a
             *         // has minimum width of 500 pixels.
             *
             *         // If the window is resized this method
             *         // is called with the new state.
             *
             *     });
             *
             * });
             * ```
             *
             * @method on
             * @memberof Conditioner
             * @param {String} condition - Expression to test.
             * @param {(Element|Function)=} element - Optional element to run the test on.
             * @param {Function=} callback - Callback method.
             */
            on: function (condition, element, callback) {

                // @ifdef DEV
                if (!condition) {
                    throw new Error('Conditioner.on(condition,[element],callback): "condition" and "callback" are required parameter.');
                }
                // @endif
                // handle optional element parameter
                callback = typeof element === 'function' ? element : callback;

                // run test and execute callback on change
                WebContext.test(condition, element, function (valid) {
                    callback(valid);
                });

            }

        };

    };

    // CommonJS
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(
        require, require('./utils/Observer'), require('./utils/Promise'), require('./utils/contains'), require('./utils/matchesSelector'), require('./utils/mergeObjects'));
    }
    // AMD
    else if (typeof define === 'function' && define.amd) {
        define(['require', './utils/Observer', './utils/Promise', './utils/contains', './utils/matchesSelector', './utils/mergeObjects'], factory);
    }
    // Browser globals
    else {
        // @ifdef DEV
        throw new Error('To use ConditionerJS you need to setup an AMD module loader or use something like Browserify.');
        // @endif
    }

}(this));