var newColorSensor = function(getColor) {
    function calcRange(colorValues) {
       if (colorValues === undefined) {
           return 'No color data has been recorded.  Did your program include a call to start recording?';
       }
       var results = {
           r: {avg: colorValues[0].r, delta: 0},
           g: {avg: colorValues[0].g, delta: 0},
           b: {avg: colorValues[0].b, delta: 0}
       };
       return "red, " + results.r.avg + ", plus or minus " + results.r.delta + "; " +
           "green, " + results.g.avg + ", plus or minus " + results.g.delta + "; " +
           "blue, " + results.b.avg + ", plus or minus " + results.b.delta + ".";
    }

    return {
        calcRange: calcRange
    }
};

describe('colorSensor', () => {
    let colorSensor;

    describe('startRecording()', () => {
    });
    describe('stopRecording()', () => {
    });
    describe('calcRange()', () => {
        test('given no data, returns "no data recorded" message.', () => {
            colorSensor = newColorSensor();
            colorRangeMsg = colorSensor.calcRange();
            expect(colorRangeMsg).toBe('No color data has been recorded.  Did your program include a call to start recording?');
        });
        test('given a single value, reports that value, including 0 plus/minuses', () => {
            let values = [
                {r: 1, g: 10, b: 100}
            ];
            colorSensor = newColorSensor();
            let colorRangeMsg = colorSensor.calcRange(values);
            expect(colorRangeMsg).toBe('red, 1, plus or minus 0; green, 10, plus or minus 0; blue, 100, plus or minus 0.');
        });
        xtest('given a set of colors, reports the averages of each color value, including their deltas', () => {
            let values = [
                {r: 1, g: 10, b: 110},
                {r: 2, g: 20, b: 120},
                {r: 3, g: 30, b: 130},
                {r: 4, g: 40, b: 140},
                {r: 5, g: 40, b: 150},
                {r: 6, g: 50, b: 160}
            ];
            colorSensor = newColorSensor();
            let colorRangeMsg = colorSensor.calcRange(values);
            expect(colorRangeMsg).toBe('red, 3, plus or minus 0; green, 10, plus or minus 0; blue, 100, plus or minus 0.');
        });
    });
});

