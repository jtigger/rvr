// newColorSensorController returns a wrapper around the RVR color sensor
//   getColor = the global `getColor()` RVR function
var newColorSensorController = function (getColor) {
    function isMatching(spec) {
        var c = getColor();
        return c.r >= spec.r.value - spec.r.tolerance &&
            c.r <= spec.r.value + spec.r.tolerance &&
            c.g >= spec.g.value - spec.g.tolerance &&
            c.g <= spec.g.value + spec.g.tolerance &&
            c.b >= spec.b.value - spec.b.tolerance &&
            c.b <= spec.b.value + spec.b.tolerance;
    }

    var scan = {
        r: {min: 255, max: 0},
        g: {min: 255, max: 0},
        b: {min: 255, max: 0},
        enabled: false,
        count: 0
    };
    function takeScan(scanDelay) {
        if (scan.enabled) {
            c = getColor();
            if (!(c.r === 0 && c.g === 0 && c.b === 0)) {
                scan.r.min = Math.min(scan.r.min, c.r);
                scan.g.min = Math.min(scan.g.min, c.g);
                scan.b.min = Math.min(scan.b.min, c.b);
                scan.r.max = Math.max(scan.r.max, c.r);
                scan.g.max = Math.max(scan.g.max, c.g);
                scan.b.max = Math.max(scan.b.max, c.b);
                scan.count++;
            }
            setTimeout(takeScan, scanDelay, scanDelay);
        }
    }
    function startScanning(scanDelay) {
        if (scanDelay === undefined) {
            scanDelay = 100;
        }
        scan.enabled = true;
        scan.count = 0;
        takeScan(scanDelay);
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

    return {
        isMatching: isMatching,
        startScanning: startScanning,
        stopScanning: stopScanning,
        yieldColorSpec: yieldColorSpec
    }
};

describe('ColorSensorController', () => {
    let controller;

    describe('isMatching', () => {
        test('when given color is within tolerances, returns true', async () => {
            let spec = {
                r: {value: 255, tolerance: 10},
                g: {value: 57, tolerance: 10},
                b: {value: 97, tolerance: 10}
            };
            let getColor = function () {
                return {r: 255, g: 57, b: 97};
            };
            controller = newColorSensorController(getColor);
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
            controller = newColorSensorController(getColor);
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
            controller = newColorSensorController(getColor);
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
            controller = newColorSensorController(getColor);
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
            controller = newColorSensorController(getColor);
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
            controller = newColorSensorController(getColor);
            expect(controller.isMatching(spec)).toBeTruthy();
        });
    });
    describe('color spec generation', () => {
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
            controller.startScanning(1);
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
            controller = newColorSensorController(getColor);
            controller.startScanning(1);
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
