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

    return {
        isMatching: isMatching
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
    describe('beginColorSpec()', () => {
    });
    describe('completeColorSpec()', () => {
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

