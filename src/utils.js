"use strict";

const SCI = {
    ndarray: require("ndarray"),
    zeros: require("zeros"),
    ops: require("ndarray-ops"),
    cwise: require("cwise"),
};


// circular distance between an array and a scalar
// both are assumed to be in radians
/*
const circDistNDs = SCI.cwise(
    {
        args: ["array", "scalar"],
        pre: function (thetaND, theta) {
            this.aTheta = ops.
        },
        body: function (thetaND, theta) {
            output = 1;
        },
    },
);
*/

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

const setAngleND = SCI.cwise(
    {
        args: ["array", "shape", "index"],
        pre: function(output, imgShape) {
            this.halfSize = imgShape[0] / 2;
        },
        body: function(output, imgShape, index) {
            const iRow = index[0];
            const iCol = index[1];
            const x = iCol - this.halfSize;
            const y = iRow - this.halfSize;
            output = Math.atan2(y, x);
        },
    },
);

// output, distance, angle, inner cutoff, outer cutoff, degree, ori centre, ori width
const setFilterND = SCI.cwise(
    {
        args: ["array", "array", "array", "scalar", "scalar", "scalar", "scalar", "scalar"],
        body: function(output, dist, angle, inner, outer, degree, oriCentre, oriWidth) {

            const cutoffs = [inner, outer];

            const filts = cutoffs.map(
                function(cutoff) {
                    if (cutoff === 0) {
                        return 0;
                    }
                    else {
                        return 1 / (1 + Math.pow(dist / cutoff, 2 * degree));
                    };
                }
            );

            const sfFilt = filts[1] - filts[0];

            // now for the ori
            const oriDist = Math.min(
                angle - oriCentre,
                Math.PI * 2 + oriCentre - angle,
            );

            //const oriDist = Math.abs(
            //   Math.atan2(Math.sin(oriCentre), Math.cos(oriCentre)) +
            //    Math.atan2(Math.sin(angle), Math.cos(angle))
            //);

            //const oriFilt = oriDist <= (oriWidth / 2) ? 1 : 0;

            output = 1; // oriFilt;

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


const setIntervalND = SCI.cwise(
    {
        args: ["array", "scalar", "scalar", "scalar", "scalar"],
        pre: function(o, oldMin, oldMax, newMin, newMax) {
            this.oldRange = oldMax - oldMin;
            this.newRange = newMax - newMin;
        },
        body: function(o, oldMin, oldMax, newMin, newMax) {
            o = (
                (
                    (o - oldMin) * this.newRange
                ) / this.oldRange
            ) + newMin;
        },
    },
);


function setNormaliseND(arrayND, {oldMin, oldMax, newMin = 0, newMax = 1} = {}) {

    oldMin = oldMin ?? SCI.ops.inf(arrayND);
    oldMax = oldMax ?? SCI.ops.sup(arrayND);

    setIntervalND(arrayND, oldMin, oldMax, newMin, newMax);

};


const setLinearRGBToLightness = SCI.cwise(
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


function convertImageNDToImageData(
    imgND,
    {normalise = false, toSRGB = true, toLightness = false, zoomFactor = 1} = {},
) {

    const imgSize = imgND.shape[0];

    const needsZoom = zoomFactor !== 1;

    let subImgND;
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
                const imgVal = imgND.get(iRow, iCol);
                subImgVec[iSubImgVec] = imgVal;
                iSubImgVec++;
            }
        }

        subImgND = SCI.ndarray(subImgVec, [srcSize, srcSize]);

    }
    else {
        subImgND = imgND;
    }

    if (normalise) {
        setNormaliseND(subImgND);
    }

    if (toLightness) {
        setLinearRGBToLightness(subImgND);
    }

    if (toSRGB) {
        setLinearRGBToSRGB(subImgND);
    }

    const outputImage = new ImageData(imgSize, imgSize);

    let iFlat = 0;

    for (let iRow = 0; iRow < imgSize; iRow++) {

        const iSrcRow = needsZoom ? Math.floor(iRow / imgSize * srcSize) : iRow;

        for (let iCol = 0; iCol < imgSize; iCol++) {

            const iSrcCol = needsZoom ? Math.floor(iCol / imgSize * srcSize) : iCol;

            const imgVal = subImgND.get(iSrcRow, iSrcCol) * 255;

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


const setBlendND = SCI.cwise(
    {
        args: ["array", "array", "array", "array"],
        body: function(output, src, dst, alpha) {
            output = (src * alpha) + (dst * (1 - alpha));
        },
    },
);


const setClipND = SCI.cwise(
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


function calcMean(arrayND) {
    return SCI.ops.sum(arrayND) / arrayND.size;
}


function calcFFTShift(arrayND) {

    const outArrayND = SCI.zeros(arrayND.shape);

    const imgSize = arrayND.shape[0];

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

            outArrayND.set(iDstRow, iDstCol, arrayND.get(iSrcRow, iSrcCol));

        }
    }

    return outArrayND;

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


module.exports = {
    setDistanceND: setDistanceND,
    setAngleND: setAngleND,
    setFilterND: setFilterND,
    setLinearRGBToLuminance: setLinearRGBToLuminance,
    setLinearRGBToSRGB: setLinearRGBToSRGB,
    setSRGBToLinearRGB: setSRGBToLinearRGB,
    setBlendND: setBlendND,
    setClipND: setClipND,
    setNormaliseND: setNormaliseND,
    convertImageNDToImageData: convertImageNDToImageData,
    calcMean: calcMean,
    calcColumnMean: calcColumnMean,
    calcFFTShift: calcFFTShift,
};
