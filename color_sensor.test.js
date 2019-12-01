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
//   getColor = the built-in RVR `getColor()` function.
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
var newColorSensorController = function (getColor, config) {
    config = config || {};
    config.stability = (config.stability === undefined) ? 20 : config.stability;
    config.sampleFrequency = (config.sampleFrequency === undefined) ? 10 : config.sampleFrequency;

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

    // determines whether or not the current "stable" color is within the given "color specification" (i.e. `spec`).
    //   see also: getStableColor()
    function isMatching(spec) {
        var c = getStableColor();
        return c.r >= spec.r.value - spec.r.tolerance &&
            c.r <= spec.r.value + spec.r.tolerance &&
            c.g >= spec.g.value - spec.g.tolerance &&
            c.g <= spec.g.value + spec.g.tolerance &&
            c.b >= spec.b.value - spec.b.tolerance &&
            c.b <= spec.b.value + spec.b.tolerance;
    }

    function getStableColor() {
        if (config.sampleFrequency === 0) {
            collectSample();
        }
        return latestStableColor;
    }

    function collectSamples(freq) {
        if (freq !== 0) {
            collectSample();
            setTimeout(collectSamples, 1000 / freq, freq);
        }
    }

    var rawColors = [];
    var avgColors = [];
    var latestStableColor = {r: 0, g: 0, b: 0};

    function collectSample() {
        var color = latestStableColor;

        rawColors.push(getColor());
        var currAvgColor = average(rawColors);
        avgColors.push(currAvgColor);

        if (avgColors.length === config.stability) {
            var stdev = standardDeviation(avgColors);

            // if this latest average is "stable", use that, otherwise stick the last "stable" value.
            color.r = (stdev.r < 2.9) ? Math.round(currAvgColor.r) : latestStableColor.r;
            color.g = (stdev.g < 2.9) ? Math.round(currAvgColor.g) : latestStableColor.g;
            color.b = (stdev.b < 2.9) ? Math.round(currAvgColor.b) : latestStableColor.b;
            // ☝️ wait until the last possible moment to round values to minimize error.
            // ☝️ using stdev of 2.9 because 3.0 yielded significantly more different values.

            // we only keep up to `config.stability` data points; since we added a new value, above, drop the oldest.
            rawColors.shift();
            avgColors.shift();
        }

        latestStableColor = color;
    }

    function startScan(scanFrequency) {
        return function(freq) {
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
                return {
                    r: {value: Math.round(avg.r), tolerance: Math.round(values.r.max - avg.r)},
                    g: {value: Math.round(avg.g), tolerance: Math.round(values.g.max - avg.g)},
                    b: {value: Math.round(avg.b), tolerance: Math.round(values.b.max - avg.b)}
                }
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

    collectSamples(config.sampleFrequency);
    return {
        isMatching: isMatching,
        getColor: getStableColor,
        startScan: startScan,
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
                [60, {r: 98, g: 1, b: 0}],
                [74, {r: 254, g: 1, b: 0}],
                [94, {r: 254, g: 0, b: 0}],
            ]);
            controller = newColorSensorController(getColor, {stability: 20, sampleFrequency: 0});

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
    describe('isMatching()', () => {
        test('when given color is within tolerances, returns true', async () => {
            let spec = {
                r: {value: 255, tolerance: 10},
                g: {value: 57, tolerance: 10},
                b: {value: 97, tolerance: 10}
            };
            let getColor = function () {
                return {r: 255, g: 57, b: 97};
            };
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            expect(controller.isMatching(spec)).toBeTruthy();
        });
        test('when red is outside tolerances, returns false', async () => {
            let spec = {
                r: {value: 255, tolerance: 10},
                g: {value: 57, tolerance: 10},
                b: {value: 97, tolerance: 10}
            };
            let getColor = function () {
                return {r: 235, g: 57, b: 97};
            };
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            expect(controller.isMatching(spec)).toBeFalsy();
        });
        test('when green is outside tolerances, returns false', async () => {
            let spec = {
                r: {value: 255, tolerance: 10},
                g: {value: 57, tolerance: 10},
                b: {value: 97, tolerance: 10}
            };
            let getColor = function () {
                return {r: 255, g: 68, b: 97};
            };
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            expect(controller.isMatching(spec)).toBeFalsy();
        });
        test('when blue is outside tolerances, returns false', async () => {
            let spec = {
                r: {value: 255, tolerance: 10},
                g: {value: 57, tolerance: 10},
                b: {value: 97, tolerance: 10}
            };
            let getColor = function () {
                return {r: 255, g: 57, b: 197};
            };
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            expect(controller.isMatching(spec)).toBeFalsy();
        });
        test('when given color is at upper tolerances, returns true', async () => {
            let spec = {
                r: {value: 100, tolerance: 10},
                g: {value: 50, tolerance: 10},
                b: {value: 90, tolerance: 10}
            };
            let getColor = function () {
                return {r: 110, g: 60, b: 100};
            };
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            expect(controller.isMatching(spec)).toBeTruthy();
        });
        test('when given color is at lower tolerances, returns true', async () => {
            let spec = {
                r: {value: 100, tolerance: 10},
                g: {value: 50, tolerance: 10},
                b: {value: 90, tolerance: 10}
            };
            let getColor = function () {
                return {r: 90, g: 40, b: 80};
            };
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            expect(controller.isMatching(spec)).toBeTruthy();
        });
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
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            var scan = controller.startScan(1000);
            while (idx < data.length) {
                await sleep(1);
            }
            scan.stop();
            expect(scan.getColorSpec()).toStrictEqual({
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
            controller = newColorSensorController(getColor, {stability: 1, sampleFrequency: 0});
            var scan = controller.startScan(1000);
            while (scanNum < 4) {
                await sleep(1);
            }
            scan.stop();
            expect(scan.getColorSpec()).toStrictEqual({
                r: {value: 100, tolerance: 0},
                g: {value: 120, tolerance: 0},
                b: {value: 140, tolerance: 0}
            });
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
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
