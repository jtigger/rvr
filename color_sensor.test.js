// newColorSensorController returns a wrapper around the RVR color sensor
//   getColor = the global `getColor()` RVR function
//   config = {
//      stability (int; 20) = how consistently the color sensor is reporting a given value until it gets reported
//         by `getColor()`.  Smaller values make the controller more sensitive; larger values makes it more stable.
//      sampleFrequency (number; 10) = approximately how frequently color samples should be asynchronously taken in a
//         second (i.e. in Hz).  If 0, disables automatic sampling -- samples will only be collected during calls to
//         `getColor()`.
//   }
var newColorSensorController = function (getColor, config) {
    config = config || {};
    config.stability = (config.stability === undefined) ? 20 : config.stability;
    config.sampleFrequency = (config.sampleFrequency === undefined) ? 10 : config.sampleFrequency;

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

    function isMatching(spec) {
        var c = getStableColor();
        return c.r >= spec.r.value - spec.r.tolerance &&
            c.r <= spec.r.value + spec.r.tolerance &&
            c.g >= spec.g.value - spec.g.tolerance &&
            c.g <= spec.g.value + spec.g.tolerance &&
            c.b >= spec.b.value - spec.b.tolerance &&
            c.b <= spec.b.value + spec.b.tolerance;
    }

    var rawColorLog = [];
    var avgColorLog = [];
    var stableColor = {r: 0, g: 0, b: 0};

    function getStableColor() {
        if (config.sampleFrequency === 0) {
            collectSample();
        }
        return stableColor;
    }

    function collectSamples(freq) {
        if (freq !== 0) {
            collectSample();
            setTimeout(collectSamples, 1000/freq, freq);
        }
    }

    function collectSample() {
        var color = stableColor;

        rawColorLog.push(getColor());
        var currAvgColor = average(rawColorLog);
        avgColorLog.push(currAvgColor);

        if (avgColorLog.length === config.stability) {
            var stdev = standardDeviation(avgColorLog);

            color.r = (stdev.r < 2.9) ? Math.round(currAvgColor.r) : stableColor.r;
            color.g = (stdev.g < 2.9) ? Math.round(currAvgColor.g) : stableColor.g;
            color.b = (stdev.b < 2.9) ? Math.round(currAvgColor.b) : stableColor.b;
            stableColor = color;

            rawColorLog.shift();
            avgColorLog.shift();
        }

        stableColor = color;
    }

    var scan = {
        r: {min: 255, max: 0},
        g: {min: 255, max: 0},
        b: {min: 255, max: 0},
        enabled: false,
        count: 0
    };

    function takeScan(scanFrequency) {
        if (scan.enabled) {
            c = getStableColor();
            if (!(c.r === 0 && c.g === 0 && c.b === 0)) {
                scan.r.min = Math.min(scan.r.min, c.r);
                scan.g.min = Math.min(scan.g.min, c.g);
                scan.b.min = Math.min(scan.b.min, c.b);
                scan.r.max = Math.max(scan.r.max, c.r);
                scan.g.max = Math.max(scan.g.max, c.g);
                scan.b.max = Math.max(scan.b.max, c.b);
                scan.count++;
            }
            setTimeout(takeScan, 1000/scanFrequency, scanFrequency);
        }
    }

    function startScanning(scanFrequency) {
        if (scanFrequency === undefined) {
            scanFrequency = 10;
        }
        scan.enabled = true;
        scan.count = 0;
        takeScan(scanFrequency);
    }

    function stopScanning() {
        scan.enabled = false;
    }

    function yieldColorSpec() {
        var spec = {
            r: {value: Math.round((scan.r.max + scan.r.min) / 2), tolerance: 0},
            g: {value: Math.round((scan.g.max + scan.g.min) / 2), tolerance: 0},
            b: {value: Math.round((scan.b.max + scan.b.min) / 2), tolerance: 0},
            count: scan.count
        };
        spec.r.tolerance = Math.max(scan.r.max - spec.r.value, spec.r.value - scan.r.min);
        spec.g.tolerance = Math.max(scan.g.max - spec.g.value, spec.g.value - scan.g.min);
        spec.b.tolerance = Math.max(scan.b.max - spec.b.value, spec.b.value - scan.b.min);
        return spec;
    }

    collectSamples(config.sampleFrequency);
    return {
        isMatching: isMatching,
        startScanning: startScanning,
        stopScanning: stopScanning,
        yieldColorSpec: yieldColorSpec,
        getColor: getStableColor
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
    describe('yieldColorSpec()', () => {
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
            controller.startScanning(1000);
            while (idx < data.length) {
                await sleep(1);
            }
            controller.stopScanning();
            let spec = controller.yieldColorSpec();
            expect(spec).toStrictEqual({
                r: {value: 4, tolerance: 3},
                g: {value: 45, tolerance: 5},
                b: {value: 106, tolerance: 5},
                count: 3
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
            controller.startScanning(1000);
            while (scanNum < 4) {
                await sleep(1);
            }
            controller.stopScanning();
            let spec = controller.yieldColorSpec();
            expect(spec.r.value).toBe(100);
            expect(spec.r.tolerance).toBe(0);
            expect(spec.g.value).toBe(120);
            expect(spec.g.tolerance).toBe(0);
            expect(spec.b.value).toBe(140);
            expect(spec.b.tolerance).toBe(0);
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
