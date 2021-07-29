"use strict";

const SCI = {
    ndarray: require("ndarray"),
    zeros: require("zeros"),
    cwise: require("cwise"),
    ops: require("ndarray-ops"),
    scratch: require("ndarray-scratch"),
    fft: require("ndarray-fft"),
    cops: require("ndarray-complex"),
    toPolar: require("ndarray-log-polar"),
};

const TRIGGERS = {
    init: 0,
    imgSource: 1,
    imgWindow: 2,
    filtChange: 3,
    zoom: 4,
    filtUpdate: 4,
    filtSet: 5,
    axesChange: 6,
    sfPlot: 7,
};


async function main() {
    pipeline({trigger: TRIGGERS.init});
}

async function pipeline({data, trigger} = {}) {

    if (trigger <= TRIGGERS.init) {
        data = await initialiseData();
        addHandlers(data);
    }

    if (trigger <= TRIGGERS.imgSource) {
        await setImageSource(data);
    }

    if (trigger <= TRIGGERS.imgWindow) {
        setImageWindow(data);
        setImageOutput(data);
        zeroCentreImage(data);
        calcFFT(data);
        setFFTOutput(data);
    }

    if (trigger === TRIGGERS.zoom) {
        setFFTOutput(data);
    }

    if (trigger <= TRIGGERS.filtChange) {
        setFilter(data);
        setFilterOutput(data);
    }

    if (trigger === TRIGGERS.zoom) {
        setFilterOutput(data);
    }

    if (trigger <= TRIGGERS.filtSet && trigger !== TRIGGERS.filtChange) {
        calcOutput(data);
    }

    if (trigger === TRIGGERS.axesChange) {
        setFFTOutput(data);
        setFilterOutput(data);
    }

    if (trigger === TRIGGERS.sfPlot) {
        setFFTOutput(data);
    }

    return data;

}

async function setImageSource(data) {

    const imageSource = data.el.imgSource.value;

    let imageBlob;

    if (imageSource === "Custom") {
        imageBlob = data.customImg;
    }
    else if (imageSource === "Webcam") {
        imageBlob = data.webcamImg;
    }
    else {

        const sourceFilenames = {
            "Dog (Joe)": "joe.jpg",
            Landscape: "landscape.jpg",
            Beach: "ocean.jpg",
        };

        const imagePath = `img/${sourceFilenames[imageSource]}`;

        imageBlob = await (await fetch(imagePath)).blob();
    }

    // we don't know the dimensions or anything yet, so we first create a temporary
    // image bitmap so that we can get that info
    const origImage = await createImageBitmap(imageBlob);

    // want to resize so that the smallest dimension is `imgSize`; the other
    // dimension can then be cropped
    const minDim = Math.min(origImage.width, origImage.height);

    const resizedWidth = origImage.width / minDim * data.imgSize;
    const resizedHeight = origImage.height / minDim * data.imgSize;

    // draw to the (invisible) canvas
    data.el.context.offscreen.drawImage(
        origImage,
        0,
        0,
        origImage.width,
        origImage.height,
        0,
        0,
        resizedWidth,
        resizedHeight,
    );

    // the `data` field will hold the RGBA array
    const resizedImage = data.el.context.offscreen.getImageData(
        0, 0, data.imgSize, data.imgSize
    );

    // now to convert it into an RGB ndarray
    const imgArray = (
        SCI.ndarray(
            new Float64Array(resizedImage.data),
            [data.imgSize, data.imgSize, 4]
        ).hi(null, null, 3)
    );

    // now to [0, 1] range
    SCI.ops.divseq(imgArray, 255);

    // now map to linear
    sRGBtoLinear(imgArray);

    // then convert to luminance
    data.lumND = linearRGBtoLuminance(imgArray);

}

function setImageWindow(data) {

    const applyWindow = data.el.applyWindow.checked;

    if (applyWindow) {
        data.lumWindowedND = blend(data.lumND, data.windowND);
    }
    else {
        data.lumWindowedND = SCI.scratch.clone(data.lumND);
    }

}


function setImageOutput(data) {

    const presImage = arrayToImageData(
        SCI.scratch.clone(data.lumWindowedND),
        {normalise: false, toSRGB: true, toLightness: false},
    );

    data.el.context.image.putImageData(presImage, 0, 0);

}

function zeroCentreImage(data) {

    data.lumMean = calcMean(data.lumWindowedND);

    // centre the luminance array
    SCI.ops.subseq(data.lumWindowedND, data.lumMean);

}

async function handleWebcam(data) {

    const alreadyWebcam = data.webcamImg !== null;

    let webcam;

    try {
        webcam = await navigator.mediaDevices.getUserMedia(
            {video: true, audio: false}
        );
    }
    catch (err) {
        return;
    }

    await new Promise(
        (resolve) => {
            data.el.video.addEventListener("loadeddata", resolve, {once: true});
            data.el.video.srcObject = webcam;
        }
    );

    await new Promise(
        (resolve) => {
            data.el.video.addEventListener("play", resolve, {once: true});
            data.el.video.play();
        }
    );

    data.el.video.pause();

    for (const track of webcam.getTracks()) {
        track.stop();
    }

    if (!alreadyWebcam) {
        const webcamOption = document.createElement("option");
        webcamOption.value = "Webcam";
        webcamOption.innerText = "Webcam";

        data.el.imgSource.appendChild(webcamOption);
    }

    for (const option of data.el.imgSource.options) {
        if (option.text === "Webcam") {
            option.selected = true;
            break;
        }
    }

    data.webcamImg = data.el.video;

    const imgSourceChange = new CustomEvent("change");

    data.el.imgSource.dispatchEvent(imgSourceChange);
}

async function handleUpload(data) {

    const alreadyCustom = data.customImg !== null;

    const filePath = data.el.filePicker.files[0];

    const imgSrc = await new Promise(
        function(resolve, reject) {

            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);

            reader.readAsDataURL(filePath);
        }
    );

    const img = await new Promise(
        function(resolve) {
            const imgElement = new Image();
            imgElement.onload = () => resolve(imgElement);
            imgElement.src = imgSrc;
        }
    );

    data.customImg = img;

    if (!alreadyCustom) {
        const customOption = document.createElement("option");
        customOption.value = "Custom";
        customOption.innerText = "Custom";

        data.el.imgSource.appendChild(customOption);
    }

    for (const option of data.el.imgSource.options) {
        if (option.text === "Custom") {
            option.selected = true;
            break;
        }
    }

    const imgSourceChange = new CustomEvent("change");

    data.el.imgSource.dispatchEvent(imgSourceChange);

}

async function initialiseData() {

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
    data.distND = makeDistanceArray(data.imgSize);

    // holds the aperture that can optionally be applied to the input image
    data.windowND = makeWindow(
        {imgSize: data.imgSize, distArray: data.distND}
    );

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

function addHandlers(data) {

    data.el.fileButton.addEventListener("click", () => data.el.filePicker.click(), false);
    data.el.filePicker.addEventListener("change", () => handleUpload(data), false);

    data.el.webcamButton.addEventListener(
        "click", () => handleWebcam(data), false
    );

    data.el.imgSource.addEventListener(
        "change", () => {pipeline({data: data, trigger: TRIGGERS.imgSource});}
    );

    data.el.applyWindow.addEventListener(
        "change", () => {pipeline({data: data, trigger: TRIGGERS.imgWindow});}
    );

    data.el.zoom.addEventListener(
        "change", () => {pipeline({data: data, trigger: TRIGGERS.zoom});}
    );

    data.el.sfPlotActive.addEventListener(
        "change", () => {pipeline({data: data, trigger: TRIGGERS.sfPlot});}
    );

    data.el.specAxes.addEventListener(
        "change", () => {handleSpecAxesChange(data);}, false
    );

    for (const el of [data.el.lowPassCutoff, data.el.highPassCutoff]) {
        el.addEventListener("input", handleFilterCutoffChange);
        el.addEventListener("change", () => pipeline({data: data, trigger: TRIGGERS.filtSet}));
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

        pipeline({data: data, trigger: TRIGGERS.filtChange});

    }

}


function handleSpecAxesChange(data) {

    const newAxes = data.el.specAxes.value;

    data.el.zoom.disabled = (newAxes === "Log-polar");

    data.el.sfPlotActive.disabled = (newAxes === "Cartesian");

    pipeline({data: data, trigger: TRIGGERS.axesChange});

}


function calcFFT(data) {

    data.fRealND = SCI.scratch.clone(data.lumWindowedND);
    data.fImagND = SCI.zeros(data.imgDim);

    SCI.fft(+1, data.fRealND, data.fImagND);

    SCI.cops.abs(data.fAbsND, data.fRealND, data.fImagND);

    data.fAbsShiftedND = fftshift(data.fAbsND);

    SCI.toPolar(data.fAbsPolarND, data.fAbsShiftedND);

    data.fAbsPolarND = data.fAbsPolarND.transpose(1, 0);

    data.fSFAmpArray = calcColumnMean(data.fAbsPolarND);

}

function setFFTOutput(data) {

    let displayImage;

    if (data.el.specAxes.value === "Cartesian") {

        const zoomFactor = Number(data.el.zoom.value[0]);

        displayImage = arrayToImageData(
            SCI.scratch.clone(data.fAbsShiftedND),
            {normalise: true, toSRGB: true, toLightness: true, zoomFactor: zoomFactor},
        );

    }
    else {

        displayImage = arrayToImageData(
            SCI.scratch.clone(data.fAbsPolarND),
            {normalise: true, toSRGB: true, toLightness: true},
        );

    }

    data.el.context.amp.putImageData(
        displayImage,
        0,
        0,
    );

    if (data.el.specAxes.value === "Log-polar" && data.el.sfPlotActive.checked) {

        const logND = SCI.ndarray(data.fSFAmpArray.map(Math.log));
        normaliseArray(logND);
        SCI.ops.mulseq(logND, data.ampMeanMax);

        data.el.context.amp.beginPath();

        data.el.context.amp.moveTo(0, data.imgSize - logND.get(0) * data.imgSize);

        for (let iCol = 1; iCol < data.imgSize; iCol++) {
            data.el.context.amp.lineTo(
                iCol,
                data.imgSize - logND.get(iCol) * data.imgSize,
            );
        }

        data.el.context.amp.stroke();
        data.el.context.amp.closePath();

    }

}

function setFilter(data) {

    const filterLowRaw = data.el.lowPassCutoff.valueAsNumber;
    const filterHighRaw = data.el.highPassCutoff.valueAsNumber;

    const exponent = 4;

    data.filterLow = Math.pow(filterLowRaw / 100, exponent);
    data.filterHigh = Math.pow(filterHighRaw / 100, exponent) * 1.5;

    prepFilter(data.filterShiftedND, data.distND, data.filterLow, data.filterHigh);

    data.filterND = fftshift(data.filterShiftedND);

    SCI.toPolar(data.filterPolarND, data.filterShiftedND);

    data.filterPolarND = data.filterPolarND.transpose(1, 0);

}

function setFilterOutput(data) {

    let displayImage;

    if (data.el.specAxes.value === "Cartesian") {

        const zoomFactor = Number(data.el.zoom.value[0]);

        displayImage = arrayToImageData(
            SCI.scratch.clone(data.filterShiftedND),
            {normalise: false, toSRGB: false, toLightness: false, zoomFactor: zoomFactor},
        );

    }
    else {
        displayImage = arrayToImageData(
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

function calcOutput(data) {

    const oRealND = SCI.scratch.clone(data.fRealND);
    const oImagND = SCI.scratch.clone(data.fImagND);

    SCI.ops.muleq(oRealND, data.filterND);
    SCI.ops.muleq(oImagND, data.filterND);

    SCI.fft(-1, oRealND, oImagND);

    SCI.ops.addseq(oRealND, data.lumMean);

    const outputImage = arrayToImageData(
        oRealND,
        {normalise: false, toSRGB: true, toLightness: false},
    );

    data.el.context.output.putImageData(
        outputImage,
        0,
        0,
    );

}


const prepFilter = SCI.cwise(
    {
        args: ["array", "array", "scalar", "scalar"],
        body: function(filt, dist, inThresh, outThresh) {
            if (dist >= inThresh && dist <= outThresh) {
                filt = 1;
            }
            else {
                filt = 0;
            }
        },
    },
);


function calcMean(array) {
    return SCI.ops.sum(array) / array.size;
}


function makeDistanceArray(imgSize) {

    const distArray = SCI.zeros([imgSize, imgSize]);

    const halfSize = imgSize / 2;

    for (let iRow = 0; iRow < imgSize; iRow++) {
        for (let iCol = 0; iCol < imgSize; iCol++) {
            const dist = Math.sqrt(
                Math.pow(iRow - halfSize, 2) + Math.pow(iCol - halfSize, 2)
            ) / halfSize;
            distArray.set(iRow, iCol, dist);
        }
    }

    return distArray;

}


function makeWindow(
    {imgSize, innerProp = 0, outerProp = 1, winProp = 0.1, distArray} = {},
) {

    distArray = distArray ?? makeDistanceArray(imgSize);

    const winArray = SCI.zeros([imgSize, imgSize]);

    for (let iRow = 0; iRow < imgSize; iRow++) {
        for (let iCol = 0; iCol < imgSize; iCol++) {

            const dist = distArray.get(iRow, iCol);

            if (dist < outerProp) {
                winArray.set(iRow, iCol, 1);
            }

        }
    }

    return winArray;

}


function fftshift(array) {

    const outArray = SCI.zeros(array.shape);

    const imgSize = array.shape[0];

    const halfSize = imgSize / 2;

    for (let iSrcRow = 0; iSrcRow < imgSize; iSrcRow++) {
        for (let iSrcCol = 0; iSrcCol < imgSize; iSrcCol++) {

            let iDstRow, iDstCol;

            if (iSrcRow < halfSize) {
                iDstRow = halfSize + iSrcRow;
            }
            else {
                iDstRow = iSrcRow - halfSize;
            }

            if (iSrcCol < halfSize) {
                iDstCol = halfSize + iSrcCol;
            }
            else {
                iDstCol = iSrcCol - halfSize;
            }

            outArray.set(iDstRow, iDstCol, array.get(iSrcRow, iSrcCol));

        }
    }

    return outArray;
}


function blend(srcArray, winArray) {

    const outputArray = SCI.zeros(srcArray.shape);

    const _blend = SCI.cwise(
        {
            args: ["array", "array", "array"],
            body: function(output, src, win) {
                output = (src * win) + (0.5 * (1 - win));
            },
        },
    );

    _blend(outputArray, srcArray, winArray);

    return outputArray;

}


function normaliseArray(array, oldMin, oldMax, newMin = 0, newMax = 1) {

    oldMin = oldMin ?? SCI.ops.inf(array);
    oldMax = oldMax ?? SCI.ops.sup(array);

    const _convert = SCI.cwise(
        {
            args: ["array", "scalar", "scalar", "scalar", "scalar"],
            body: function(o, oldMin, oldMax, newMin, newMax) {
                o = (
                    (
                        (o - oldMin) * (newMax - newMin)
                    ) / (oldMax - oldMin)
                ) + newMin;
            },
        },
    );

    _convert(array, oldMin, oldMax, newMin, newMax);

}

const calcColumnMean = SCI.cwise(
    {
        args: ["array", "shape", "index"],
        pre: function() {
            this.mean = null;
        },
        body: function(array, shape, index) {
            if (this.mean === null) {
                this.mean = new Float64Array(shape[1]);
            }
            this.mean[index[1]] += array / shape[1];
        },
        post: function() {
            return this.mean;
        },
    },
);

function clip(array, min, max) {

    const _clip = SCI.cwise(
        {
            args: ["array", "scalar", "scalar"],
            body: function(o, clipMin, clipMax) {
                if (o < clipMin) {
                    o = clipMin;
                }
                else if (o > clipMax) {
                    o = clipMax;
                }
            },
        },
    );

    _clip(array, min, max);

}


function linearToLightness(img) {
    // 'lightness' not really

    const _linearToLightness = SCI.cwise(
        {
            args: ["array"],
            body: function(o) {
                if (o <= 0.008856) {
                    o *= 903.3;
                }
                else {
                    o = Math.pow(o, 1 / 3) * 116 - 16;
                }
                o /= 100.0;
            },
        },
    );

    _linearToLightness(img);
}


function linearRGBtoLuminance(img) {

    // output array to fill
    const outImage = SCI.zeros(img.shape.slice(0, 2));

    const _linearRGBtoLuminance = SCI.cwise(
        {
            args: ["array", "array", "array", "array"],
            body: function(o, r, g, b) {
                o = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            },
        },
    );

    _linearRGBtoLuminance(
        outImage,
        img.pick(null, null, 0),
        img.pick(null, null, 1),
        img.pick(null, null, 2),
    );

    return outImage;

}

function sRGBtoLinear(img) {

    const _sRGBtoLinear = SCI.cwise(
        {
            args: ["array"],
            body: function(v) {
                if (v <= 0.04045) {
                    v /= 12.92;
                }
                else {
                    v = Math.pow((v + 0.055) / 1.055, 2.4);
                }
            },
        },
    );

    return _sRGBtoLinear(img);
}


function linearTosRGB(img) {

    const _linearTosRGB = SCI.cwise(
        {
            args: ["array"],
            body: function(v) {
                if (v <= 0.0031308) {
                    v *= 12.92;
                }
                else {
                    v = 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
                }
            },
        },
    );

    return _linearTosRGB(img);

}


function arrayToImageData(
    imgArray,
    {normalise = false, toSRGB = true, toLightness = false, zoomFactor = 1} = {},
) {

    const imgSize = imgArray.shape[0];

    const needsZoom = zoomFactor !== 1;

    let subImgArray;
    let srcSize;

    if (needsZoom) {

        const halfImgSize = imgSize / 2;

        srcSize = imgSize / zoomFactor;
        const halfSrcSize = srcSize / 2;

        const iStart = halfImgSize - halfSrcSize;
        const iEnd = iStart + srcSize;

        const subImgVec = new Float64Array(srcSize * srcSize);

        let iSubImgVec = 0;

        for (let iRow = iStart; iRow < iEnd; iRow++) {
            for (let iCol = iStart; iCol < iEnd; iCol++) {
                const imgVal = imgArray.get(iRow, iCol);
                subImgVec[iSubImgVec] = imgVal;
                iSubImgVec++;
            }
        }

        subImgArray = SCI.ndarray(subImgVec, [srcSize, srcSize]);

    }
    else {
        subImgArray = imgArray;
    }

    if (normalise) {
        normaliseArray(subImgArray);
    }

    if (toLightness) {
        linearToLightness(subImgArray);
    }

    if (toSRGB) {
        linearTosRGB(subImgArray);
    }

    const outputImage = new ImageData(imgSize, imgSize);

    let iFlat = 0;

    for (let iRow = 0; iRow < imgSize; iRow++) {

        const iSrcRow = needsZoom ? Math.floor(iRow / imgSize * srcSize) : iRow;

        for (let iCol = 0; iCol < imgSize; iCol++) {

            const iSrcCol = needsZoom ? Math.floor(iCol / imgSize * srcSize) : iCol;

            const imgVal = subImgArray.get(iSrcRow, iSrcCol) * 255;

            for (let iRGB = 0; iRGB < 3; iRGB++) {
                outputImage.data[iFlat] = imgVal;
                iFlat++;
            }

            outputImage.data[iFlat] = 255;

            iFlat++;
        }
    }

    return outputImage;

}

window.addEventListener("load", main);