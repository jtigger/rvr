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
var newColorSensorController = function (getColor) {
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

    function collectSamples() {
        if (config.sampleFrequency !== 0) {
            collectSample();
            setTimeout(collectSamples, 1000 / config.sampleFrequency);
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

        if (rawColors.length >= config.stability) {
            var stdev = standardDeviation(avgColors);

            // if this latest average is "stable", use that, otherwise stick the last "stable" value.
            color.r = (stdev.r < 2.9) ? Math.round(currAvgColor.r) : latestStableColor.r;
            color.g = (stdev.g < 2.9) ? Math.round(currAvgColor.g) : latestStableColor.g;
            color.b = (stdev.b < 2.9) ? Math.round(currAvgColor.b) : latestStableColor.b;
            // ☝️ wait until the last possible moment to round values to minimize error.
            // ☝️ using stdev of 2.9 because 3.0 yielded significantly more different values.

            rawColors = rawColors.slice(rawColors.length - config.stability + 1);
            avgColors = avgColors.slice(avgColors.length - config.stability + 1);
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

    return {
        configureSampling: configureSampling,
        isMatching: isMatching,
        getColor: getStableColor,
        startScan: startScan,
    }
};


var kitchenTileSpec = {
    r: {value: 236, tolerance: 20},
    g: {value: 220, tolerance: 20},
    b: {value: 202, tolerance: 20}
};

var woodFloorSpec = {
    r: {value: 86, tolerance: 35},
    g: {value: 68, tolerance: 30},
    b: {value: 22, tolerance: 20}
};

var carpetSpec = {
    r: {value: 98, tolerance: 14},
    g: {value: 91, tolerance: 13},
    b: {value: 65, tolerance: 15}
};

var orangePaperSpec = {
    r: {value: 255, tolerance: 5},
    g: {value: 100, tolerance: 5},
    b: {value: 40, tolerance: 5}
};

var greenPaperSpec = {
    r: {value: 64, tolerance: 5},
    g: {value: 194, tolerance: 5},
    b: {value: 92, tolerance: 5}
};

var yellowSwatchSpec = {
    r: {value: 255, tolerance: 5},
    g: {value: 240, tolerance: 5},
    b: {value: 26, tolerance: 5}
};


var colorSensorCtrl = newColorSensorController(getColor);

async function startProgram() {
    colorSensorCtrl.configureSampling({stability: 5, sampleFrequency: 250});

    resetAim();
    openEyes();
    await delay(5);
    lookForGold();
    wanderOnWood();
    scanForColor(async function() {
       await delay(10);
    });
}

var eyeState = {
    lids: "closed",
    mode: "looking",
    targetBlinks: 0,
    blinks: 0
};

function openEyes() {
    setFrontLed({r: 255, g: 255, b: 255});
    eyeState.lids = "opened";
    setTimeout(closeEyes, (eyeState.mode === "looking") ? (3 + Math.random() * 3) * 1000 : 190);
}

function closeEyes() {
    setFrontLed({r: 0, g: 0, b: 0});
    eyeState.lids = "closed";

    if (eyeState.mode === "looking") {
        eyeState.mode = "blinking";
        eyeState.blinks = 0;
        eyeState.targetBlinks = Math.round(Math.random() * 2);
    } else {
        eyeState.blinks++;
        if (eyeState.blinks >= eyeState.targetBlinks) {
            eyeState.mode = "looking";
        }
    }

    setTimeout(openEyes, 210);
}


function setBodyLed(color) {
    setBackLed(color);
    setLeftLed(color);
    setRightLed(color);
}

var state = "standing";
var running = true;

async function lookForGold() {
    if (colorSensorCtrl.isMatching(yellowSwatchSpec)) {
        running = false;
        setBodyLed({r: 255, g: 240, b: 25});
        await roll(getHeading(), -30, 1);
        await speak("Gold!  I found gold!");
        return;
    }
    setTimeout(lookForGold, 10);
}

async function wanderOnWood() {
    if (!running) {
        return;
    }
    if (colorSensorCtrl.isMatching(woodFloorSpec)) {
        if (state !== "wandering") {
            setBodyLed({r: 0, g: 0, b: 255});
            setSpeed(30);
            state = "wandering";
        }
    } else {
        if (state === "wandering") {
            backOff();
        }
    }
    setTimeout(wanderOnWood, 10);
}

async function backOff() {
    if (!running) {
        return;
    }
    if (!colorSensorCtrl.isMatching(woodFloorSpec)) {
        if (state !== "backing off") {
            setBodyLed({r: 255, g: 0, b: 0});
            setSpeed(-1 * getSpeed());
            state = "backing off";
        }
    } else {
        if (state === "backing off") {
            setBodyLed({r: 255, g: 240, b: 25});
            setHeading((getHeading() + 180) +
                (-45 + (Math.random() * 90)) %
                360);
            setSpeed(-1 * getSpeed());
            state = "about face";
            wanderOnWood();
        }
    }

    setTimeout(backOff, 10);
}


function showColor() {
    setMainLed(colorSensorCtrl.getColor());
    setTimeout(showColor, 10);
}


async function speakSpaces() {

    while (true) {
        if (colorSensorCtrl.isMatching(carpetSpec)) {
            await speak("carpet");
        }
        if (colorSensorCtrl.isMatching(woodFloorSpec)) {
            await speak("wood");
        }
        if (colorSensorCtrl.isMatching(kitchenTileSpec)) {
            await speak("tile");
        }
        await delay(0.1);
    }
}

async function scanForColor(movementFn) {
    var scan = colorSensorCtrl.startScan();

    await movementFn();

    scan.stop();
    var count = scan.getCount();
    var spec = scan.getColorSpec();
    while (true) {
        setMainLed({r: 255, g: 255, b: 255});
        await speak("From " + count + " samples.");

        setMainLed({r: spec.r.value, g: 0, b: 0});
        await speak("red: " + spec.r.value + "; delta " + spec.r.tolerance + "..");

        setMainLed({r: 0, g: spec.g.value, b: 0});
        await speak("green: " + spec.g.value + "; delta " + spec.g.tolerance + "..");

        setMainLed({r: 0, g: 0, b: spec.b.value});
        await speak("blue: " + spec.b.value + "; delta " + spec.b.tolerance + "..");

        setMainLed({r: 0, g: 0, b: 0});
        await delay(5);
    }
}

async function walkTheLine() {
    resetAim();
    await roll(0, 40, 3);
    await delay(2);
    await roll(1, -40, 3);
}

async function wiggleOverSwatch() {
    resetAim();
    for (var idx = 0; idx < 5; idx++) {
        await roll(0, 10, 2);
        await roll(0, -10, 2);
    }
}

async function rollInARectangle() {
    resetAim();
    await roll(0, 40, 8);
    await roll(90, 40, 4);
    await roll(180, 40, 8);
    await roll(270, 40, 4);
    setHeading(0);
}