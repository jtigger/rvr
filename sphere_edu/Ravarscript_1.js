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

var colorSensorCtrl = newColorSensorController(getColor);


async function startProgram() {
    //resetAim();
    //setSpeed(20);

    let blackSpec = {
        r: {value: 0, tolerance: 1},
        g: {value: 0, tolerance: 1},
        b: {value: 0, tolerance: 1}
    };
    let pinkTapeSpec = {
        r: {value: 255, tolerance: 10},
        g: {value: 57, tolerance: 10},
        b: {value: 97, tolerance: 10}
    };
    let blueBottleSpec = {
        r: {value: 0, tolerance: 10},
        g: {value: 170, tolerance: 10},
        b: {value: 255, tolerance: 10}
    };
    let greenLidSpec = {
        r: {value: 100, tolerance: 10},
        g: {value: 255, tolerance: 10},
        b: {value: 100, tolerance: 10}
    };
    let purpleBottleSpec = {
        r: {value: 128, tolerance: 10},
        g: {value: 110, tolerance: 10},
        b: {value: 255, tolerance: 10}
    };
    let kitchenTileSpec = {
        r: {value: 191, tolerance: 27},
        g: {value: 174, tolerance: 24},
        b: {value: 146, tolerance: 30}
    };
    let carpetSpec = {
        r: {value: 55, tolerance: 20},
        g: {value: 49, tolerance: 20},
        b: {value: 18, tolerance: 20}
    };
    let woodFloorSpec = {
        r: {value: 48, tolerance: 31},
        g: {value: 10, tolerance: 18},
        b: {value: 0, tolerance: 1}
    };
    let blueSwatchSpec = {
        r: {value: 0, tolerance: 1},
        g: {value: 61, tolerance: 4},
        b: {value: 134, tolerance: 30}
    };
    let redSwatchSpec = {
        r: {value: 181, tolerance: 11},
        g: {value: 18, tolerance: 2},
        b: {value: 1, tolerance: 1}
    };


    while(true) {
        var matched = false;
        if (colorSensorCtrl.isMatching(blackSpec)) {
            matched = true;
        }
        if (colorSensorCtrl.isMatching(pinkTapeSpec)) {
            await speak("Rover is on pink tape");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(woodFloorSpec)) {
            await speak("wood");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(kitchenTileSpec)) {
            await speak("tile");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(carpetSpec)) {
            await speak("carpet");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(blueBottleSpec)) {
            await speak("Dad's blue bottle");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(blueSwatchSpec)) {
            await speak("blue");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(redSwatchSpec)) {
            await speak("red");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(greenLidSpec)) {
            await speak("The green lid of Lily's water bottle");
            matched = true;
        }
        if (colorSensorCtrl.isMatching(purpleBottleSpec)) {
            await speak("Mom's purple water bottle");
            matched = true;
        }
        if(!matched) {
            sayColor(getColor());
        }
        await delay(1);
    }

}

async function sayColor(c) {
    await speak("red: "+c.r+"; green: "+c.g+", blue: "+c.b+".");
}

async function sayComparisons(c, spec) {
    await speak("first: "+ (c.r > spec.r.value - spec.r.tolerance));
    await speak("second: "+ (c.r < spec.r.value + spec.r.tolerance));
    await speak("third: "+ (c.g > spec.g.value - spec.g.tolerance));
    await speak("fourth: "+ (c.g < spec.g.value + spec.g.tolerance));
    await speak("fifth: "+ (c.b > spec.b.value - spec.b.tolerance));
    await speak("sixth: "+ (c.b < spec.b.value + spec.b.tolerance));
}

async function saySpec(s) {
    await speak("red between " + (s.r.value-s.r.tolerance) + " and " + (s.r.value+s.r.tolerance) + ".");
    await speak("green between " + (s.g.value-s.g.tolerance) + " and " + (s.g.value+s.g.tolerance) + ".");
    await speak("blue between " + (s.b.value-s.b.tolerance) + " and " + (s.b.value+s.b.tolerance) + ".");
}

async function blink() {
    var off={r:0, g:0, b:0};
    var on={r:255,g:192,b:203};

    while(true) {
        setFrontLed(on);
        await delay(Math.random()*5);

        var numBlinks=Math.random()*3;
        for(var i = 0; i < numBlinks; i++) {
            setFrontLed(off);
            await delay(0.10)
            setFrontLed(on);
            await delay(0.10)
        }
    }
}

async function goFlashy() {
    var flashDur=0.5;
    var pink={r:255,g:192,b:203};
    var off={r:0, g:0, b:0};
    var color={r:0, g:0, b:255};

    setMainLed({ r:0, g:0, b:255})
    while(true) {
        setBackLed(off);
        setLeftLed(color);
        await delay(flashDur);

        setLeftLed(off);
        setRightLed(color);
        await delay(flashDur);

        setRightLed(off);
        setBackLed(color);
        await delay(flashDur);
    }
    await delay(10);

}