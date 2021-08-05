"use strict";

const SCI = {
    toPolar: require("ndarray-log-polar"),
    scratch: require("ndarray-scratch"),
};

const TRIGGERS = require("./triggers");

const UTILS = require("./utils");


async function handleTrigger({data, trigger} = {}) {

    if (trigger <= TRIGGERS.filtChange) {
        setFilter(data);
        setFilterOutput(data);
    }

    if (trigger === TRIGGERS.zoom || trigger === TRIGGERS.axesChange) {
        setFilterOutput(data);
    }

}


function setFilter(data) {

    const filterLowRaw = data.el.lowPassCutoff.valueAsNumber;
    const filterHighRaw = data.el.highPassCutoff.valueAsNumber;

    const exponent = 4;

    data.filterLow = Math.pow(filterLowRaw / 100, exponent);
    data.filterHigh = Math.pow(filterHighRaw / 100, exponent) * 1.5;

    UTILS.setApertureND(
        data.filterShiftedND, // output
        data.distND, // distance
        data.filterLow, // inner
        data.filterHigh, // outer
    );

    data.filterND = UTILS.calcFFTShift(data.filterShiftedND);

    SCI.toPolar(data.filterPolarND, data.filterShiftedND);

    data.filterPolarND = data.filterPolarND.transpose(1, 0);

}


function setFilterOutput(data) {

    let displayImage;

    if (data.el.specAxes.value === "Cartesian") {

        const zoomFactor = Number(data.el.zoom.value[0]);

        displayImage = UTILS.convertImageNDToImageData(
            SCI.scratch.clone(data.filterShiftedND),
            {normalise: false, toSRGB: false, toLightness: false, zoomFactor: zoomFactor},
        );

    }
    else {
        displayImage = UTILS.convertImageNDToImageData(
            SCI.scratch.clone(data.filterPolarND),
            {normalise: false, toSRGB: false, toLightness: false},
        );
    }

    data.el.context.filter.putImageData(
        displayImage,
        0,
        0,
    );

}


module.exports = handleTrigger;
