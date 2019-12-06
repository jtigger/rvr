// newColorSensorController returns a wrapper around the Sphero RVR RGB sensor (i.e. color sensor).
//
//   This wrapper provides two key features:
//   1. stabilized color values -- the built-in RVR `getColor()` function returns the instantaneous color values.  This
//      wrapper smooths-out these values so they appear more stable (i.e. the color reported only changes when a new
//      color value has been reported for some time.
//   2. color specifications -- in the EDU app, you can register an `onColor()` event to detect when the RVR senses a
//      given color.  However, some surfaces (e.g. carpet, hardwood floors, or tile) vary in their current enough that
//      they do not reliably trigger these color events.
//      events.
//      This wrapper includes a `isMatching()` function that allows you to detect when the current color falls within
//      a range of colors (referred to as a "color specification" or "spec").
//      It also contains a "scanner" that records the range of values observed and yields a specification describing
//      that range.
//
//   Params:
//   getColorFn = the built-in RVR `getColor()` function.
//   config = {
//      stability (int; default: 20) = how consistently the color sensor must report a given value until it gets reflected
//         by this controller's `getColor()` function.  Give a smaller number for stability and the `getColor()`
//         function is more sensitive to color changes.  Give a larger number for stability and the `getColor()`
//         function requires the built-in RGB sensor to report values that are statistically similar before starting to
//         report the new value.
//      sampleFrequency (number; default: 10) = approximately how frequently color samples should be taken.  The
//         value is specified in Hz (i.e. times per second).  Give a smaller number and fewer resources are used to
//         collect color samples.  Give a larger value and the resolution of the color values used in this wrapper is
//         better.  Specify 0 to disable automatic sampling; with this setting, samples will only be collected during
//         calls to `getColor()` (useful for testing this wrapper).
//   }
var getColor = function () {
    throw("Undefined getColorFn.  If a testcase depends on a value from the `getColor()` Sphero builtin, it must " +
        "define a fake of such a function and pass that in as the `getColorFn` parameter to the controller's " +
        "constructor.");
};
var newColorSensorController = function (getColorFn) {
    if (getColorFn === undefined) {
        getColorFn = getColor;
    }

    var config = {
        stability: 1,
        sampleFrequency: 0
    };

    // calculates the average of a list of colors (for each channel).
    //   assumes there is at least one item in the list.
    function average(colors) {
        var avg = {r: 0, g: 0, b: 0};
        for (var idx = 0; idx < colors.length; idx++) {
            avg.r += colors[idx].r;
            avg.g += colors[idx].g;
            avg.b += colors[idx].b;
        }
        avg.r /= colors.length;
        avg.g /= colors.length;
        avg.b /= colors.length;

        return avg;
    }

    // calculates the standard deviation of a list of colors (for each channel).
    //   assumes there is at least one item in the list.
    //   (see also: https://www.mathsisfun.com/data/standard-deviation-formulas.html)
    function standardDeviation(colors) {
        var avg = average(colors);

        var stdev = {r: 0, g: 0, b: 0};
        for (var idx = 0; idx < colors.length; idx++) {
            stdev.r += (avg.r - colors[idx].r) * (avg.r - colors[idx].r);
            stdev.g += (avg.g - colors[idx].g) * (avg.g - colors[idx].g);
            stdev.b += (avg.b - colors[idx].b) * (avg.b - colors[idx].b);
        }
        stdev.r = Math.sqrt(stdev.r / colors.length);
        stdev.g = Math.sqrt(stdev.g / colors.length);
        stdev.b = Math.sqrt(stdev.b / colors.length);

        return stdev;
    }

    function configureSampling(newConfig) {
        config.stability = newConfig.stability !== undefined ? newConfig.stability : 20;
        config.sampleFrequency = newConfig.frequency !== undefined ? newConfig.frequency : 100;
        collectSamples();
    }

    function newSpec(colorWithTolerances) {
        colorWithTolerances.isMatch = function (color) {
            var c = color || getStableColor();
            return c.r >= this.r.value - this.r.tolerance &&
                c.r <= this.r.value + this.r.tolerance &&
                c.g >= this.g.value - this.g.tolerance &&
                c.g <= this.g.value + this.g.tolerance &&
                c.b >= this.b.value - this.b.tolerance &&
                c.b <= this.b.value + this.b.tolerance;
        };

        colorWithTolerances.whenMatches = function (handler) {
            if(typeof handler === "function") {
                var handlers = specsToHandlers.get(this) || [];
                specsToHandlers.set(this, handlers);
                handlers.push({fn: handler, isRunning: false});
            } else {
                specsToHandlers.delete(this);
            }
        };

        return colorWithTolerances;
    }

    // determines whether or not the current "stable" color is within the given "color specification" (i.e. `spec`).
    //   see also: getStableColor()

    function getStableColor() {
        if (config.sampleFrequency === 0) {
            collectSample();
        }
        return latestStableColor;
    }

    function collectSamples() {
        if (config.sampleFrequency !== 0) {
            collectSample();
            setTimeout(collectSamples, 1000 / config.sampleFrequency);
        }
    }

    var rawColors = [];
    var avgColors = [];
    var latestStableColor = {r: 0, g: 0, b: 0};
    var specsToHandlers = new Map();  // from colorSpec to [handlerFns...]

    function collectSample() {
        var color = latestStableColor;

        rawColors.push(getColorFn());
        var currAvgColor = average(rawColors);
        avgColors.push(currAvgColor);

        if (rawColors.length >= config.stability) {
            var stdev = standardDeviation(avgColors);

            // ready to record new stable color?
            if (stdev.r < 3.0 && stdev.g < 3.0 && stdev.b < 3.0) {
                // wait until the last possible moment to round values to minimize error.
                color.r = Math.round(currAvgColor.r);
                color.g = Math.round(currAvgColor.g);
                color.b = Math.round(currAvgColor.b);

                // a color change occurred, time to invoke the matching
                for (var [spec, handlers] of specsToHandlers) {
                    if (spec.isMatch(color)) {
                        for (var idx = 0; idx < handlers.length; idx++) {
                            const handler = handlers[idx];
                            if (!handler.isRunning) {
                                handler.isRunning = true;
                                handler.fn(function () {
                                    handler.isRunning = false;
                                }, color, spec);
                            }
                        }
                    }
                }
            } else {
                color = latestStableColor;
            }
            rawColors = rawColors.slice(rawColors.length - config.stability + 1);
            avgColors = avgColors.slice(avgColors.length - config.stability + 1);
        }

        latestStableColor = color;
    }

    function startScan(scanFrequency) {
        return function (freq) {
            freq = freq || 10;
            var enabled = true;
            var count = 0;
            var values = {
                r: {min: 255, max: 0},
                g: {min: 255, max: 0},
                b: {min: 255, max: 0}
            };

            function sampleColor(freq) {
                if (enabled) {
                    c = getStableColor();

                    // omit off/black; it's a start-up value and would result into artificially large tolerances in the
                    //   yielded color spec.
                    if (!(c.r === 0 && c.g === 0 && c.b === 0)) {
                        values.r.min = Math.min(values.r.min, c.r);
                        values.g.min = Math.min(values.g.min, c.g);
                        values.b.min = Math.min(values.b.min, c.b);
                        values.r.max = Math.max(values.r.max, c.r);
                        values.g.max = Math.max(values.g.max, c.g);
                        values.b.max = Math.max(values.b.max, c.b);
                        count++;
                    }
                    setTimeout(sampleColor, 1000 / freq, freq);
                }
            }

            function stop() {
                enabled = false;
            }

            function getColorSpec() {
                var avg = {
                    r: (values.r.max + values.r.min) / 2,
                    g: (values.g.max + values.g.min) / 2,
                    b: (values.b.max + values.b.min) / 2
                };
                return newSpec({
                    r: {value: Math.round(avg.r), tolerance: Math.round(values.r.max - avg.r)},
                    g: {value: Math.round(avg.g), tolerance: Math.round(values.g.max - avg.g)},
                    b: {value: Math.round(avg.b), tolerance: Math.round(values.b.max - avg.b)}
                });
            }

            function getCount() {
                return count;
            }

            sampleColor(freq);
            return {
                stop: stop,
                getColorSpec: getColorSpec,
                getCount: getCount,
            }
        }(scanFrequency);
    }

    return {
        configureSampling: configureSampling,
        getColor: getStableColor,
        startScan: startScan,
        newSpec: newSpec
    }
};

describe('ColorSensorController', () => {
    let controller;

    describe('getColor()', () => {
        test('reports latest stabilized color', async () => {
            // see https://docs.google.com/spreadsheets/d/1PyqFdtIAGopsrHa5gaVbM-9EZxtakx8EsnYDibyx1Ok
            let data = [
                /* grey */
                {r: 100, g: 101, b: 100},
                {r: 99, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 101, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 99, b: 100},
                {r: 102, g: 100, b: 100},
                {r: 100, g: 100, b: 99},
                {r: 150, g: 150, b: 150},
                {r: 100, g: 101, b: 99},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 99, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 99, b: 101},
                {r: 0, g: 0, b: 0}, /* bits of error */
                {r: 100, g: 100, b: 100},
                {r: 100, g: 99, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 100, g: 100, b: 100},
                {r: 255, g: 0, b: 0},
                {r: 100, g: 100, b: 100},
                /* starting to read red. */
                {r: 255, g: 0, b: 0},
                {r: 255, g: 5, b: 1},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 4, b: 1},
                {r: 253, g: 3, b: 0},
                {r: 255, g: 0, b: 1},
                {r: 254, g: 2, b: 0},
                {r: 253, g: 1, b: 1},
                {r: 255, g: 0, b: 0},
                {r: 0, g: 0, b: 0}, /* ... with bits of error ... */
                {r: 255, g: 0, b: 0},
                {r: 0, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 1, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 2, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 4, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 5, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 3, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 2, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 3, b: 0},
                {r: 253, g: 0, b: 0},
                {r: 255, g: 1, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 253, g: 3, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 5, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 253, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 253, g: 5, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 5, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 6, b: 0},
                {r: 253, g: 0, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 1, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 253, g: 1, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 250, g: 1, b: 2},
                {r: 253, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 254, g: 1, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 253, g: 1, b: 0},
                {r: 250, g: 2, b: 1},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 253, g: 1, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 1, b: 0},
                {r: 254, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 0, b: 0},
                {r: 255, g: 1, b: 0},
            ];
            let idx = 0;

            function getColor() {
                if (idx < data.length) {
                    return data[idx++];
                } else {
                    return data[data.length - 1];
                }
            }

            // the only points at which the color value is expected to change.
            let transitions = new Map([
                [0, {r: 0, g: 0, b: 0}],
                [19, {r: 98, g: 97, b: 97}],
                [74, {r: 254, g: 1, b: 0}],
                [94, {r: 254, g: 0, b: 0}],
            ]);
            controller = newColorSensorController(getColor);
            controller.configureSampling({stability: 20, frequency: 0});

            let expectedColor = {r: 0, g: 0, b: 0};
            while (idx < data.length) {
                if (transitions.get(idx) !== undefined) {
                    expectedColor = transitions.get(idx);
                }
                let actualColor = controller.getColor();
                expect({idx: idx - 1, color: actualColor}).toStrictEqual({idx: idx - 1, color: expectedColor});
            }
        })
    });
    describe('startScan()', () => {
        test('calculates a color spec from the colors scanned', async () => {
            let idx = 0;
            let data = [
                {r: 0, g: 0, b: 0},
                {r: 1, g: 40, b: 101},
                {r: 2, g: 45, b: 101},
                {r: 6, g: 50, b: 111},
            ];
            let getColor = function () {
                idx++;
                if (idx < data.length) {
                    return data[idx];
                } else {
                    return {r: 0, g: 0, b: 0};
                }
            };
            controller = newColorSensorController(getColor);
            var scan = controller.startScan(1000);
            while (idx < data.length) {
                await sleep(1);
            }
            scan.stop();
            expect(scan.getColorSpec()).toMatchObject({
                r: {value: 4, tolerance: 3},
                g: {value: 45, tolerance: 5},
                b: {value: 106, tolerance: 5}
            });
        });
        test('ignores black/off values', async () => {
            let scanNum = 0;
            let getColor = function () {
                scanNum++;
                if (scanNum === 2) {
                    return {r: 100, g: 120, b: 140};
                } else {
                    return {r: 0, g: 0, b: 0};
                }
            };
            controller = newColorSensorController(getColor);
            var scan = controller.startScan(1000);
            while (scanNum < 4) {
                await sleep(1);
            }
            scan.stop();
            var spec = scan.getColorSpec();
            expect(spec.r).toMatchObject({value: 100, tolerance: 0});
            expect(spec.g).toMatchObject({value: 120, tolerance: 0});
            expect(spec.b).toMatchObject({value: 140, tolerance: 0});
        })
    });
    xdescribe('setStrategy()', () => {
        test('when a sensed color matches a registered spec', async () => {
            let getColor = function () {
                return {r: 0, g: 0, b: 0};
            };
            controller = newColorSensorController(getColor);
            let pinkTapeSpec = {
                r: {value: 255, tolerance: 30},
                g: {value: 0, tolerance: 5},
                b: {value: 0, tolerance: 5}
            };
            let blackTapeSpec = {
                r: {value: 0, tolerance: 5},
                g: {value: 0, tolerance: 5},
                b: {value: 0, tolerance: 5}
            };
            let nudgedRight = false;
            let nudgedLeft = false;
            let nudgeRight = function () {
                nudgedRight = true;
            };
            let nudgeLeft = function () {
                nudgedLeft = true;
            };
            let stayBetweenFloorAndBlackTape = [
                {when: {matching: blackTapeSpec}, then: [nudgeLeft]},
                {when: {matching: pinkTapeSpec}, then: [nudgeRight]}
            ];

            controller.setStrategy(stayBetweenFloorAndBlackTape);
            controller.activate();

            expect(nudgedLeft).toBeTruthy();
        })
    });

    describe('Spec', () => {
        describe('isMatch()', () => {
            test('when given color is within tolerances, returns true', async () => {
                controller = newColorSensorController();
                let spec = controller.newSpec({
                    r: {value: 255, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch({r: 255, g: 57, b: 97})).toBeTruthy();
            });
            test('when red is outside tolerances, returns false', async () => {
                controller = newColorSensorController();
                let spec = controller.newSpec({
                    r: {value: 255, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch({r: 235, g: 57, b: 97})).toBeFalsy();
            });
            test('when green is outside tolerances, returns false', async () => {
                controller = newColorSensorController();
                let spec = controller.newSpec({
                    r: {value: 255, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch({r: 255, g: 68, b: 97})).toBeFalsy();
            });
            test('when blue is outside tolerances, returns false', async () => {
                controller = newColorSensorController();
                let spec = controller.newSpec({
                    r: {value: 255, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch({r: 255, g: 57, b: 197})).toBeFalsy();
            });
            test('when given color is at upper tolerances, returns true', async () => {
                controller = newColorSensorController();
                let spec = controller.newSpec({
                    r: {value: 245, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch({r: 255, g: 67, b: 107})).toBeTruthy();
            });
            test('when given color is equal to lower tolerances, returns true', async () => {
                controller = newColorSensorController();
                let spec = controller.newSpec({
                    r: {value: 255, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch({r: 245, g: 47, b: 87})).toBeTruthy();
            });
            test('when no color is specified, defaults to the controller\'s current stable color', async () => {
                let data = [
                    {r: 255, g: 57, b: 97},  // within tolerances
                    {r: 225, g: 57, b: 97},  // red outside tolerances
                    {r: 255, g: 68, b: 97},  // green outside tolerances
                    {r: 255, g: 57, b: 197}, // blue outside tolerances
                    {r: 255, g: 67, b: 107}, // at upper tolerances
                    {r: 235, g: 47, b: 87}   // at lower tolerances
                ];
                let idx = 0;
                let getColor = function () {
                    var c = data[idx];
                    if (idx < data.length - 1) {
                        idx++
                    }
                    return c;
                };
                controller = newColorSensorController(getColor);
                let spec = controller.newSpec({
                    r: {value: 245, tolerance: 10},
                    g: {value: 57, tolerance: 10},
                    b: {value: 97, tolerance: 10}
                });
                expect(spec.isMatch()).toBeTruthy(); // within tolerances
                expect(spec.isMatch()).toBeFalsy();  // red outside tolerances
                expect(spec.isMatch()).toBeFalsy();  // green outside tolerances
                expect(spec.isMatch()).toBeFalsy();  // blue outside tolerances
                expect(spec.isMatch()).toBeTruthy(); // at upper tolerances
                expect(spec.isMatch()).toBeTruthy(); // at lower tolerances

            });
        });
        describe('whenMatches()', () => {
            it('when matching color occurs, invokes the specified handler', () => {
                var triggered = false;
                let getColor = function () {
                    return {r: 15, g: 25, b: 35};
                };
                let controller = newColorSensorController(getColor);
                let spec = controller.newSpec({
                    r: {value: 10, tolerance: 10},
                    g: {value: 20, tolerance: 10},
                    b: {value: 30, tolerance: 10},
                });
                spec.whenMatches((done) => {
                    triggered = true;
                    done();
                });
                controller.getColor(); // cause a sample to be taken that triggers a transition.
                expect(triggered).toBeTruthy();
            });
            it('when matching color does NOT occur, does not invoke the specified handler', () => {
                var triggered = false;
                let getColor = function () {
                    return {r: 255, g: 255, b: 255};
                };
                let controller = newColorSensorController(getColor);
                let spec = controller.newSpec({
                    r: {value: 10, tolerance: 10},
                    g: {value: 20, tolerance: 10},
                    b: {value: 30, tolerance: 10},
                });
                spec.whenMatches((done) => {
                    triggered = true;
                    done();
                });
                controller.getColor(); // cause a sample to be taken that triggers a transition.
                expect(triggered).toBeFalsy();
            });
            it('when called multiple times, invokes all handlers, in the order they were registered', () => {
                var firstTriggered = false;
                var secondTriggered = false;
                let getColor = function () {
                    return {r: 15, g: 25, b: 35};
                };
                let controller = newColorSensorController(getColor);
                let spec = controller.newSpec({
                    r: {value: 10, tolerance: 10},
                    g: {value: 20, tolerance: 10},
                    b: {value: 30, tolerance: 10},
                });
                spec.whenMatches((done) => {
                    firstTriggered = true;
                    done();
                });
                spec.whenMatches((done) => {
                    secondTriggered = true;
                    done();
                });
                controller.getColor(); // cause a sample to be taken that triggers a transition.
                expect(firstTriggered).toBeTruthy();
                expect(secondTriggered).toBeTruthy();
            });
            it('given a handler was previously triggered but has not finished, when color matches again, does NOT invoke again', async () => {
                let data = [
                    {r: 10, g: 20, b: 30},
                    {r: 255, g: 57, b: 97},
                    {r: 10, g: 20, b: 30}
                ];
                let idx = 0;
                let getColor = function () {
                    var c = data[idx];
                    if (idx < data.length - 1) {
                        idx++
                    }
                    return c;
                };
                let controller = newColorSensorController(getColor);
                let timesTriggered = 0;
                controller.newSpec({
                    r: {value: 10, tolerance: 10},
                    g: {value: 20, tolerance: 10},
                    b: {value: 30, tolerance: 10},
                }).whenMatches(async () => {
                    timesTriggered++;
                    // never calls done() ==> never "finishes"
                });
                controller.getColor(); // trigger the first invocation.
                controller.getColor(); // transition to another color.
                controller.getColor(); // transition back
                expect(timesTriggered).toBe(1);
            });
            it('when matches again, after prior invocation, DOES invoke again', async () => {
                let data = [
                    {r: 10, g: 20, b: 30},
                    {r: 255, g: 57, b: 97},
                    {r: 10, g: 20, b: 30}
                ];
                let idx = 0;
                let getColor = function () {
                    var c = data[idx];
                    if (idx < data.length - 1) {
                        idx++
                    }
                    return c;
                };
                let controller = newColorSensorController(getColor);
                let timesTriggered = 0;
                controller.newSpec({
                    r: {value: 10, tolerance: 10},
                    g: {value: 20, tolerance: 10},
                    b: {value: 30, tolerance: 10},
                }).whenMatches(async (done) => {
                    timesTriggered++;
                    done();
                });
                controller.getColor(); // trigger the first invocation.
                controller.getColor(); // transition to another color.
                controller.getColor(); // transition back
                expect(timesTriggered).toBe(2);
            });
            it('given handler is not a function (e.g. undefined), does NOT trigger anymore', () => {
                var triggered = false;
                let getColor = function () {
                    return {r: 15, g: 25, b: 35};
                };
                let controller = newColorSensorController(getColor);
                let spec = controller.newSpec({
                    r: {value: 10, tolerance: 10},
                    g: {value: 20, tolerance: 10},
                    b: {value: 30, tolerance: 10},
                });
                spec.whenMatches((done) => {
                    triggered = true;
                    done();
                });
                spec.whenMatches();
                controller.getColor(); // cause a sample to be taken that triggers a transition.
                expect(triggered).toBeFalsy();
            });
        });
    });
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
