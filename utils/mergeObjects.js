!function(e,t){"use strict";var n=function(e,t){var o=Array.isArray(t),c=o&&[]||{};return t=t||{},o?c=t.concat():(e&&"object"==typeof e&&Object.keys(e).forEach(function(t){c[t]=e[t]}),Object.keys(t).forEach(function(o){"object"==typeof t[o]&&t[o]&&e[o]?c[o]=n(e[o],t[o]):c[o]=t[o]})),c};"undefined"!=typeof module&&module.exports?module.exports=n:"function"==typeof define&&define.amd?define(function(){return n}):e.mergeObjects=n}(window);