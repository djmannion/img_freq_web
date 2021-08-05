"use strict";

// this defines a set of (semi-)ordered 'trigger' events
const TRIGGERS = require("./triggers");

const PIPELINE = require("./pipeline");

const SCI = {
    zeros: require("zeros"),
};

const UTILS = require("./utils");

const USERINPUT = require("./userInput");


async function main() {
    const data = initialiseData();
    addHandlers({data: data});
    PIPELINE.run({data: data, trigger: TRIGGERS.init});
}

function initialiseData() {

    const data = {};

    data.imgSize = 512;
    data.imgDim = [data.imgSize, data.imgSize];

    // will hold a user-uploaded image, if they have done so
    data.customImg = null;
    data.webcamImg = null;

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = data.imgSize;
    offscreenCanvas.height = data.imgSize;

    // store the references to the important elements
    data.el = {};

    // canvases
    data.el.canvas = {
        offscreen: offscreenCanvas,
        image: document.getElementById("imageCanvas"),
        amp: document.getElementById("ampCanvas"),
        filter: document.getElementById("filterCanvas"),
        output: document.getElementById("outputCanvas"),
    };

    // contexts
    data.el.context = {};
    for (const [canvasName, canvas] of Object.entries(data.el.canvas)) {
        data.el.context[canvasName] = canvas.getContext("2d");
    }

    data.el.context.amp.lineWidth = 2;
    data.el.context.amp.strokeStyle = "orange";

    // relative maximum for the SF amplitude line plot
    data.ampMeanMax = 0.75;

    data.el.imgSource = document.getElementById("inputImageSelect");
    data.el.zoom = document.getElementById("specZoom");
    data.el.applyWindow = document.getElementById("windowingActive");
    data.el.lowPassCutoff = document.getElementById("lowPassCutoff");
    data.el.highPassCutoff = document.getElementById("highPassCutoff");
    data.el.filePicker = document.getElementById("filePicker");
    data.el.fileButton = document.getElementById("fileButton");
    data.el.webcamButton = document.getElementById("webcamButton");
    data.el.specAxes = document.getElementById("specAxes");
    data.el.sfPlotActive = document.getElementById("sfPlotActive");

    data.el.video = document.createElement("video");

    // this will hold the zero-centred luminance image, without any windowing
    data.lumND = SCI.zeros(data.imgDim);
    data.lumWindowedND = SCI.zeros(data.imgDim);
    // this will hold the mean of the luminance image, prior to zero centering
    data.lumMean = null;

    // holds the normalised distance from the centre
    data.distND = SCI.zeros(data.imgDim);
    UTILS.setDistanceND(data.distND);

    data.apertureND = SCI.zeros(data.imgDim);
    UTILS.setApertureND(data.apertureND, data.distND, 0, 0.95);

    // holds the real, imaginary, and abs data from the FFT
    // the 'shifted' version means that `fftshift` has been applied to it
    data.fRealND = SCI.zeros(data.imgDim);
    data.fImagND = SCI.zeros(data.imgDim);
    data.fAbsND = SCI.zeros(data.imgDim);
    data.fAbsShiftedND = SCI.zeros(data.imgDim);

    // the log-polar transformed version of `data.fAbsShiftedND`
    data.fAbsPolarND = SCI.zeros(data.imgDim);

    data.fSFAmpArray = null;

    // holds the filter info
    data.filterLow = null;
    data.filterHigh = null;
    data.filterND = SCI.zeros(data.imgDim);
    data.filterShiftedND = SCI.zeros(data.imgDim);

    data.filterPolarND = SCI.zeros(data.imgDim);

    return data;

}

function addHandlers({data} = {}) {

    data.el.fileButton.addEventListener(
        "click", () => data.el.filePicker.click(), false
    );
    data.el.filePicker.addEventListener(
        "change", () => USERINPUT.handleUpload(data), false
    );

    data.el.webcamButton.addEventListener(
        "click", () => USERINPUT.handleWebcam(data), false
    );

    data.el.imgSource.addEventListener(
        "change",
        () => {PIPELINE.run({data: data, trigger: TRIGGERS.imgSource});}
    );

    data.el.applyWindow.addEventListener(
        "change",
        () => {PIPELINE.run({data: data, trigger: TRIGGERS.imgWindow});}
    );

    data.el.zoom.addEventListener(
        "change",
        () => {PIPELINE.run({data: data, trigger: TRIGGERS.zoom});}
    );

    data.el.sfPlotActive.addEventListener(
        "change",
        () => {PIPELINE.run({data: data, trigger: TRIGGERS.sfPlot});}
    );

    data.el.specAxes.addEventListener(
        "change", () => {handleSpecAxesChange();}, false
    );

    for (const el of [data.el.lowPassCutoff, data.el.highPassCutoff]) {
        el.addEventListener("input", handleFilterCutoffChange);
        el.addEventListener(
            "change",
            () => PIPELINE.run({data: data, trigger: TRIGGERS.filtSet})
        );
    }


    function filterEndFromEvent(evt) {
        return evt.target.id.slice(0, evt.target.id.indexOf("Pass"));
    }

    function handleFilterCutoffChange(evt) {

        // "lowPass" or "highPass"
        const activeFilterEnd = filterEndFromEvent(evt);
        const otherFilterEnd = (activeFilterEnd === "low") ? "high" : "low";

        const activeFilterEl = data.el[activeFilterEnd + "PassCutoff"];
        let activeFilterCutoff = activeFilterEl.valueAsNumber;

        const otherFilterEl = data.el[otherFilterEnd + "PassCutoff"];
        const otherFilterCutoff = otherFilterEl.valueAsNumber;

        if (activeFilterEnd === "low" && activeFilterCutoff >= otherFilterCutoff) {
            activeFilterCutoff = otherFilterCutoff - 1;
            activeFilterEl.value = activeFilterCutoff;
        }
        if (activeFilterEnd === "high" && activeFilterCutoff <= otherFilterCutoff) {
            activeFilterCutoff = otherFilterCutoff + 1;
            activeFilterEl.value = activeFilterCutoff;
        }

        PIPELINE.run({data: data, trigger: TRIGGERS.filtChange});

    }

    function handleSpecAxesChange() {

        const newAxes = data.el.specAxes.value;

        data.el.zoom.disabled = (newAxes === "Log-polar");

        data.el.sfPlotActive.disabled = (newAxes === "Cartesian");

        PIPELINE.run({data: data, trigger: TRIGGERS.axesChange});

    }
}


window.addEventListener("load", main);
