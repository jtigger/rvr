// newColorSensor returns a wrapper around the RVR color sensor
//   getColor = the global `getColor()` RVR function
var newColorSensor = function (getColor) {
    function generateColorSpec(colorValues) {
        if (colorValues === undefined) {
            return {
                r: {value: 0, tolerance: 0},
                g: {value: 0, tolerance: 0},
                b: {value: 0, tolerance: 0},
            }
        }
        return {
            r: {value: colorValues[0].r, tolerance: 0},
            g: {value: colorValues[0].g, tolerance: 0},
            b: {value: colorValues[0].b, tolerance: 0}
        };
    }

    return {
        generateColorSpec: generateColorSpec
    }
};

describe('colorSensor', () => {
    let colorSensor;

    describe('when()', () => {
        xtest('given a matcher', () => {
            colorSensor = newColorSensor();
            let blueSpec = {
                r: {value: 0, tolerance: 0},
                g: {value: 0, tolerance: 5},
                b: {value: 100, tolerance: 50}
            };
            let colorMatched = false;

            colorSensor.when(blueSpec, function () {
                colorMatched = true;
            });
        })
    });

    describe('startRecording()', () => {
    });
    describe('stopRecording()', () => {
    });
    describe('generateColorSpec()', () => {
        test('given no data, returns black/off spec.', () => {
            colorSensor = newColorSensor();
            let spec = colorSensor.generateColorSpec();
            expect(spec).toStrictEqual({
                r: {value: 0, tolerance: 0},
                g: {value: 0, tolerance: 0},
                b: {value: 0, tolerance: 0}
            });
        });
        test('given a single value, reports that value, including 0 plus/minuses', () => {
            let values = [
                {r: 1, g: 10, b: 100}
            ];
            colorSensor = newColorSensor();
            let spec = colorSensor.generateColorSpec(values);
            expect(spec).toStrictEqual({
                r: {value: 1, tolerance: 0},
                g: {value: 10, tolerance: 0},
                b: {value: 100, tolerance: 0}
            });
        });
        test.todo('given a set of values, returns the average values and tolerance');
    });
});

