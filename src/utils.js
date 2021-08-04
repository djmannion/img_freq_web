"use strict";

const SCI = {
    zeros: require("zeros"),
    cwise: require("cwise"),
};


const setDistanceND = SCI.cwise(
    {
        args: ["array", "shape", "index"],
        pre: function(output, imgShape) {
            this.halfSize = imgShape[0] / 2;
        },
        body: function(output, imgShape, index) {
            const iRow = index[0];
            const iCol = index[1];
            output = Math.sqrt(
                Math.pow(iRow - this.halfSize, 2) +
                Math.pow(iCol - this.halfSize, 2)
            ) / this.halfSize;
        },
    },
);


const setApertureND = SCI.cwise(
    {
        args: ["array", "array", "scalar", "scalar"],
        body: function(output, dist, inner, outer) {
            output = (dist >= inner && dist < outer) ? 1 : 0;
        },
    },
);

const setLinearRGBToLuminance = SCI.cwise(
    {
        args: ["array", "array", "array", "array"],
        body: function(output, red, green, blue) {
            output = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        },
    },
);


const setLinearRGBToSRGB = SCI.cwise(
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

const setSRGBToLinearRGB = SCI.cwise(
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


// TODO: up to here
function convertNDToImageData(
    nd,
    {normalise = false, toSRGB = true, toLightness = false, zoomFactor = 1} = {},
) {

    const imgSize = nd.shape[0];

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
module.exports = {
    setDistanceND: setDistanceND,
    setApertureND: setApertureND,
    setLinearRGBToLuminance: setLinearRGBToLuminance,
    setLinearRGBToSRGB: setLinearRGBToSRGB,
    setSRGBToLinearRGB: setSRGBToLinearRGB,
};
