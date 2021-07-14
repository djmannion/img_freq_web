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

    return data;

}

async function setImageSource(data) {

    const imageSource = data.el.imgSource.value;

    let imageBlob;

    if (imageSource === "Custom") {
        imageBlob = data.customImg;
    }
    else {

        const sourceFilenames = {
            "Dog (Joe)": "joe.jpg",
            "Landscape": "landscape.jpg",
            "Beach": "ocean.jpg",
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
    let imgArray = (
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

    let applyWindow = data.el.applyWindow.checked;

    if (applyWindow) {
        data.lumWindowedND = blend(data.lumND, data.windowND);
    }
    else {
        data.lumWindowedND = SCI.scratch.clone(data.lumND);
    }

}


function setImageOutput(data) {

    let presImage = arrayToImageData(
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

async function handleUpload(data) {

    const alreadyCustom = data.customImg !== null;

    const filePath = data.el.filePicker.files[0];

    let imgSrc = await new Promise(
        function (resolve, reject) {

            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);

            reader.readAsDataURL(filePath);
        }
    );

    let img = await new Promise(
        function (resolve) {
            let imgElement = new Image();
            imgElement.onload = () => resolve(imgElement);
            imgElement.src = imgSrc;
        }
    );

    data.customImg = img;

    if (!alreadyCustom) {
        let customOption = document.createElement("option");
        customOption.value = "Custom";
        customOption.innerText = "Custom";

        data.el.imgSource.appendChild(customOption);
    }

    data.el.imgSource.options[data.el.imgSource.options.length - 1].selected = true;

    let imgSourceChange = new CustomEvent("change");

    data.el.imgSource.dispatchEvent(imgSourceChange);

}

async function initialiseData() {

    let data = {};

    data.imgSize = 512;
    data.imgDim = [data.imgSize, data.imgSize];

    // will hold a user-uploaded image, if they have done so
    data.customImg = null;

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
    for (let [canvasName, canvas] of Object.entries(data.el.canvas)) {
        data.el.context[canvasName] = canvas.getContext("2d");
    }

    data.el.imgSource = document.getElementById("inputImageSelect");
    data.el.zoom = document.getElementById("specZoom");
    data.el.applyWindow = document.getElementById("windowingActive");
    data.el.lowPassCutoff = document.getElementById("lowPassCutoff");
    data.el.highPassCutoff = document.getElementById("highPassCutoff");
    data.el.filePicker = document.getElementById("filePicker");
    data.el.fileButton = document.getElementById("fileButton");

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

    // holds the filter info
    data.filterLow = null;
    data.filterHigh = null;
    data.filterND = SCI.zeros(data.imgDim);
    data.filterShiftedND = SCI.zeros(data.imgDim);

    return data;

}

function addHandlers(data) {

    data.el.fileButton.addEventListener("click", () => data.el.filePicker.click(), false);
    data.el.filePicker.addEventListener("change", () => handleUpload(data), false);

    data.el.imgSource.addEventListener(
        "change", () => {pipeline({data:data, trigger:TRIGGERS.imgSource});}
    );

    data.el.applyWindow.addEventListener(
        "change", () => {pipeline({data:data, trigger:TRIGGERS.imgWindow});}
    );

    data.el.zoom.addEventListener(
        "change", () => {pipeline({data:data, trigger:TRIGGERS.zoom});}
    );

    for (let el of [data.el.lowPassCutoff, data.el.highPassCutoff]) {
        el.addEventListener("input", handleFilterCutoffChange);
        el.addEventListener("change", () => pipeline({data: data, trigger: TRIGGERS.filtSet}));
    }


    function filterEndFromEvent(evt) {
        return evt.target.id.slice(0, evt.target.id.indexOf("Pass"));
    }

    function handleFilterCutoffChange(evt) {

        // "lowPass" or "highPass"
        let activeFilterEnd = filterEndFromEvent(evt);
        let otherFilterEnd = (activeFilterEnd === "low") ? "high" : "low";

        let activeFilterEl = data.el[activeFilterEnd + "PassCutoff"];
        let activeFilterCutoff = activeFilterEl.valueAsNumber;

        let otherFilterEl = data.el[otherFilterEnd + "PassCutoff"];
        let otherFilterCutoff = otherFilterEl.valueAsNumber;

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


function calcFFT(data) {

    data.fRealND = SCI.scratch.clone(data.lumWindowedND);
    data.fImagND = SCI.zeros(data.imgDim);

    SCI.fft(+1, data.fRealND, data.fImagND);

    SCI.cops.abs(data.fAbsND, data.fRealND, data.fImagND);

    data.fAbsShiftedND = fftshift(data.fAbsND);

}

function setFFTOutput(data) {

    let zoomFactor = Number(data.el.zoom.value[0]);

    let absFreqImage = arrayToImageData(
        SCI.scratch.clone(data.fAbsShiftedND),
        {normalise: true, toSRGB: true, toLightness: true, zoomFactor: zoomFactor},
    );

    data.el.context.amp.putImageData(
        absFreqImage,
        0,
        0,
    );

}

function setFilter(data) {

    let filterLowRaw = data.el.lowPassCutoff.valueAsNumber;
    let filterHighRaw = data.el.highPassCutoff.valueAsNumber;

    const exponent = 4;

    data.filterLow = Math.pow(filterLowRaw / 100, exponent);
    data.filterHigh = Math.pow(filterHighRaw / 100, exponent) * 1.5;

    prepFilter(data.filterShiftedND, data.distND, data.filterLow, data.filterHigh);

    data.filterND = fftshift(data.filterShiftedND);

}

function setFilterOutput(data) {

    let zoomFactor = Number(data.el.zoom.value[0]);

    let filterImage = arrayToImageData(
        SCI.scratch.clone(data.filterShiftedND),
        {normalise: false, toSRGB: false, toLightness: false, zoomFactor: zoomFactor},
    );

    data.el.context.filter.putImageData(
        filterImage,
        0,
        0,
    );

}

function calcOutput(data) {

    let oRealND = SCI.scratch.clone(data.fRealND);
    let oImagND = SCI.scratch.clone(data.fImagND);

    SCI.ops.muleq(oRealND, data.filterND);
    SCI.ops.muleq(oImagND, data.filterND);

    SCI.fft(-1, oRealND, oImagND);

    SCI.ops.addseq(oRealND, data.lumMean);

    let outputImage = arrayToImageData(
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
        body: function (filt, dist, inThresh, outThresh) {
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

    let distArray = SCI.zeros([imgSize, imgSize]);

    let halfSize = imgSize / 2;

    for (let iRow = 0; iRow < imgSize; iRow++) {
        for (let iCol = 0; iCol < imgSize; iCol++) {
            let dist = Math.sqrt(
                Math.pow(iRow - halfSize, 2) +
                Math.pow(iCol - halfSize, 2)
            ) / halfSize;
            distArray.set(iRow, iCol, dist);
        }
    }

    return distArray;

}


function makeWindow(
    {imgSize, innerProp = 0, outerProp = 1, winProp = 0.1, distArray} = {}
) {

    distArray = distArray ?? makeDistanceArray(imgSize);

    let winArray = SCI.zeros([imgSize, imgSize]);

    for (let iRow = 0; iRow < imgSize; iRow++) {
        for (let iCol = 0; iCol < imgSize; iCol++) {

            let dist = distArray.get(iRow, iCol);

            if (dist < outerProp) {
                winArray.set(iRow, iCol, 1);
            }

        }
    }

    return winArray;

}


function fftshift(array) {

    let outArray = SCI.zeros(array.shape);

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

    let outputArray = SCI.zeros(srcArray.shape);

    const _blend = SCI.cwise(
        {
            args: ["array", "array", "array"],
            body: function (output, src, win) {
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
            body: function (o, oldMin, oldMax, newMin, newMax) {
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


function clip(array, min, max) {

    const _clip = SCI.cwise(
        {
            args: ["array", "scalar", "scalar"],
            body: function (o, clipMin, clipMax) {
                if (o < clipMin) {
                    o = clipMin;
                }
                else if (o > clipMax) {
                    o = clipMax;
                }
            }
        },
    );

    _clip(array, min, max);

}


function linearToLightness(img) {
    // 'lightness' not really

    const _linearToLightness = SCI.cwise(
        {
            args: ["array"],
            body: function (o) {
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
    let outImage = SCI.zeros(img.shape.slice(0, 2));

    const _linearRGBtoLuminance = SCI.cwise(
        {
            args: ["array", "array", "array", "array"],
            body: function (o, r, g, b) {
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
            body: function (v) {
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
            body: function (v) {
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

        let subImgVec = new Float64Array(srcSize * srcSize);

        let iSubImgVec = 0;

        for (let iRow = iStart; iRow < iEnd; iRow++) {
            for (let iCol = iStart; iCol < iEnd; iCol++) {
                let imgVal = imgArray.get(iRow, iCol);
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

    let outputImage = new ImageData(imgSize, imgSize);

    let iFlat = 0;

    for (let iRow = 0; iRow < imgSize; iRow++) {

        let iSrcRow = needsZoom ? Math.floor(iRow / imgSize * srcSize) : iRow;

        for (let iCol = 0; iCol < imgSize; iCol++) {

            let iSrcCol = needsZoom ? Math.floor(iCol / imgSize * srcSize) : iCol;

            let imgVal = subImgArray.get(iSrcRow, iSrcCol) * 255;

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
